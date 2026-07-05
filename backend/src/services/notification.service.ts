import { prisma } from '../config/database';
import { NotificationType } from '@prisma/client';
import { sendEmail } from './email.service';

/** Personal email for notifications; company email is login-only */
function contactEmail(user: { email: string; personalEmail?: string | null }) {
  return user.personalEmail || user.email;
}
import { toJson } from '../utils/params';
import { Server } from 'socket.io';

let socketIo: Server | null = null;

export function setSocketServer(io: Server) {
  socketIo = io;
}

export async function getSystemNotificationSettings() {
  let settings = await prisma.systemNotificationSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.systemNotificationSettings.create({ data: { id: 'default' } });
  }
  return settings;
}

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  message: string;
  relatedTaskId?: string;
  metadata?: Record<string, unknown>;
}

async function sendPush(userId: string, title: string, body: string, relatedTaskId?: string) {
  socketIo?.to(`user:${userId}`).emit('notification:push', { title, body, relatedTaskId });
  if (process.env.NODE_ENV === 'development') {
    console.log(`[PUSH] user:${userId} | ${title}: ${body}`);
  }
}

async function sendSms(phone: string, message: string) {
  // SMS provider integration point — logs in dev
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SMS] ${phone} | ${message}`);
  }
}

function typeAllowedBySystem(
  type: NotificationType,
  sys: Awaited<ReturnType<typeof getSystemNotificationSettings>>
): boolean {
  switch (type) {
    case 'DUE_DATE_APPROACHING':
      return sys.dueDateInApp || sys.dueDateEmail || sys.dueDatePush || sys.dueDateSms;
    case 'OVERDUE':
      return sys.overdueInApp || sys.overdueEmail || sys.overduePush || sys.overdueSms;
    case 'ESCALATION':
      return sys.escalationEnabled;
    case 'STATUS_CHANGE':
      return sys.statusChangeEnabled;
    case 'MENTION':
      return sys.mentionsEnabled;
    case 'REASSIGNMENT':
      return sys.reassignmentEnabled;
    default:
      return true;
  }
}

function userWantsType(
  type: NotificationType,
  prefs: {
    dueDateReminder: boolean;
    overdueAlert: boolean;
    statusChange: boolean;
    mentions: boolean;
    reassignment: boolean;
  }
): boolean {
  switch (type) {
    case 'DUE_DATE_APPROACHING':
      return prefs.dueDateReminder;
    case 'OVERDUE':
    case 'ESCALATION':
      return prefs.overdueAlert;
    case 'STATUS_CHANGE':
      return prefs.statusChange;
    case 'MENTION':
      return prefs.mentions;
    case 'REASSIGNMENT':
      return prefs.reassignment;
    default:
      return true;
  }
}

export async function createNotification(input: CreateNotificationInput) {
  const sys = await getSystemNotificationSettings();
  if (!typeAllowedBySystem(input.type, sys)) return null;

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
  });
  if (!prefs || !userWantsType(input.type, prefs)) return null;

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) return null;

  let notification = null;

  const inAppOk =
    (input.type === 'DUE_DATE_APPROACHING' && sys.dueDateInApp) ||
    ((input.type === 'OVERDUE' || input.type === 'ESCALATION') && sys.overdueInApp) ||
    (input.type === 'STATUS_CHANGE' && sys.statusChangeEnabled) ||
    (input.type === 'MENTION' && sys.mentionsEnabled) ||
    (input.type === 'REASSIGNMENT' && sys.reassignmentEnabled) ||
    !['DUE_DATE_APPROACHING', 'OVERDUE', 'ESCALATION', 'STATUS_CHANGE', 'MENTION', 'REASSIGNMENT'].includes(input.type);

  if (prefs.inAppEnabled && inAppOk) {
    notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        relatedTaskId: input.relatedTaskId,
        metadata: toJson(input.metadata),
      },
    });
    socketIo?.to(`user:${input.userId}`).emit('notification:created', notification);
  }

  const subject = `Pramukh Alpha: ${input.type.replace(/_/g, ' ')}`;

  if (prefs.emailEnabled) {
    const emailOk =
      (input.type === 'DUE_DATE_APPROACHING' && sys.dueDateEmail) ||
      ((input.type === 'OVERDUE' || input.type === 'ESCALATION') && sys.overdueEmail) ||
      (input.type === 'STATUS_CHANGE' && sys.statusChangeEnabled) ||
      (input.type === 'MENTION' && sys.mentionsEnabled) ||
      (input.type === 'REASSIGNMENT' && sys.reassignmentEnabled) ||
      !['DUE_DATE_APPROACHING', 'OVERDUE', 'ESCALATION', 'STATUS_CHANGE', 'MENTION', 'REASSIGNMENT'].includes(input.type);

    if (emailOk) await sendEmail(contactEmail(user), subject, input.message);
  }

  if (prefs.pushEnabled) {
    const pushOk =
      (input.type === 'DUE_DATE_APPROACHING' && sys.dueDatePush) ||
      ((input.type === 'OVERDUE' || input.type === 'ESCALATION') && sys.overduePush) ||
      input.type === 'STATUS_CHANGE' ||
      input.type === 'MENTION' ||
      input.type === 'REASSIGNMENT';
    if (pushOk) await sendPush(input.userId, subject, input.message, input.relatedTaskId);
  }

  if (prefs.smsEnabled) {
    const smsOk =
      (input.type === 'DUE_DATE_APPROACHING' && sys.dueDateSms) ||
      ((input.type === 'OVERDUE' || input.type === 'ESCALATION') && sys.overdueSms);
    if (smsOk) await sendSms(contactEmail(user), input.message);
  }

  return notification;
}

export async function notifyTaskWatchers(
  taskId: string,
  excludeUserId: string,
  type: NotificationType,
  message: string
) {
  const watchers = await prisma.taskWatcher.findMany({
    where: { taskId, userId: { not: excludeUserId } },
  });
  const assignees = await prisma.taskAssignee.findMany({
    where: { taskId, userId: { not: excludeUserId } },
  });
  const userIds = new Set([...watchers.map((w) => w.userId), ...assignees.map((a) => a.userId)]);
  await Promise.all(
    Array.from(userIds).map((userId) =>
      createNotification({ userId, type, message, relatedTaskId: taskId })
    )
  );
}

export async function processDueDateReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const approaching = await prisma.task.findMany({
    where: { dueDate: { gte: today, lte: tomorrow }, status: { notIn: ['DONE', 'CANCELLED'] }, deletedAt: null },
    include: { assignees: true },
  });

  for (const task of approaching) {
    for (const assignee of task.assignees) {
      await createNotification({
        userId: assignee.userId,
        type: 'DUE_DATE_APPROACHING',
        message: `Task "${task.title}" is due soon`,
        relatedTaskId: task.id,
      });
    }
  }
}

export async function processOverdueTasks() {
  const now = new Date();
  const sys = await getSystemNotificationSettings();

  const overdue = await prisma.task.findMany({
    where: { dueDate: { lt: now }, status: { notIn: ['DONE', 'CANCELLED'] }, deletedAt: null },
    include: {
      assignees: true,
      project: { include: { members: { include: { role: true, user: true } } } },
    },
  });

  for (const task of overdue) {
    for (const assignee of task.assignees) {
      await createNotification({
        userId: assignee.userId,
        type: 'OVERDUE',
        message: `Task "${task.title}" is overdue`,
        relatedTaskId: task.id,
      });
    }

    if (!sys.escalationEnabled) continue;

    const daysOverdue = Math.floor((now.getTime() - (task.dueDate?.getTime() ?? 0)) / 86400000);
    const managers = task.project.members.filter((m) => m.role.name === 'Manager');

    for (const manager of managers) {
      const prefs = await prisma.notificationPreference.findUnique({
        where: { userId: manager.userId },
      });
      const escalationDays = prefs?.escalationDays ?? sys.defaultEscalationDays;

      if (daysOverdue >= escalationDays) {
        await createNotification({
          userId: manager.userId,
          type: 'ESCALATION',
          message: `Task "${task.title}" is ${daysOverdue} days overdue — escalation alert`,
          relatedTaskId: task.id,
          metadata: { daysOverdue },
        });
      }
    }
  }
}

export async function processDigestEmails() {
  const sys = await getSystemNotificationSettings();
  if (!sys.digestEnabled) return;

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', notificationPrefs: { digestEnabled: true, digestFrequency: { not: 'NONE' } } },
    include: {
      notificationPrefs: true,
      taskAssignments: {
        where: { task: { status: { notIn: ['DONE', 'CANCELLED'] } } },
        include: { task: { select: { title: true, dueDate: true, status: true } } },
      },
    },
  });

  for (const user of users) {
    const prefs = user.notificationPrefs;
    if (!prefs) continue;
    const freq = prefs.digestFrequency || sys.digestFrequency;
    if (freq === 'NONE') continue;

    const tasks = user.taskAssignments.map((a) => a.task);
    if (tasks.length === 0) continue;

    const lines = tasks.map((t) => `- ${t.title} (${t.status})${t.dueDate ? ` due ${new Date(t.dueDate).toLocaleDateString()}` : ''}`);
    const body = `Your ${freq.toLowerCase()} Pramukh Alpha task summary:\n\n${lines.join('\n')}\n\n${tasks.length} active task(s).`;

    if (prefs.emailEnabled) {
      await sendEmail(contactEmail(user), `Pramukh Alpha — ${freq} digest`, body);
    }
    if (prefs.inAppEnabled) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'GENERAL',
          message: `${freq} digest: ${tasks.length} active task(s)`,
        },
      });
    }
  }
}
