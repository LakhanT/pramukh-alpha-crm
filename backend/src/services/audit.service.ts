import { Prisma, Task } from '@prisma/client';
import { prisma } from '../config/database';

export const RESTORE_WINDOW_DAYS = 30;

interface LogActivityInput {
  entityType: string;
  entityId: string;
  action: string;
  changedById: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
}

interface LogUserActionInput {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logActivity(input: LogActivityInput) {
  return prisma.activityLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changedById: input.changedById,
      field: input.field,
      oldValue: input.oldValue != null ? String(input.oldValue) : null,
      newValue: input.newValue != null ? String(input.newValue) : null,
    },
  });
}

export async function logUserAction(input: LogUserActionInput) {
  return prisma.userActionLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}

function taskSnapshot(task: Task, extra?: Record<string, unknown>) {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    startDate: task.startDate?.toISOString() ?? null,
    parentId: task.parentId,
    isRecurring: task.isRecurring,
    recurrenceRule: task.recurrenceRule,
    customFields: task.customFields,
    ...extra,
  };
}

export async function createTaskVersion(task: Task, changedById: string, extra?: Record<string, unknown>) {
  const latest = await prisma.taskVersion.findFirst({
    where: { taskId: task.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  return prisma.taskVersion.create({
    data: {
      taskId: task.id,
      version,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      startDate: task.startDate,
      snapshot: taskSnapshot(task, extra) as Prisma.InputJsonValue,
      changedById,
    },
    include: { changedBy: { select: { id: true, name: true, email: true } } },
  });
}

export async function logTaskFieldChanges(
  taskId: string,
  changedById: string,
  oldTask: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  const trackableFields = ['title', 'description', 'status', 'priority', 'dueDate', 'startDate', 'parentId'];

  const logs = trackableFields
    .filter((field) => updates[field] !== undefined && String(oldTask[field] ?? '') !== String(updates[field] ?? ''))
    .map((field) =>
      logActivity({
        entityType: 'task',
        entityId: taskId,
        action: field === 'status' ? 'status_changed' : 'updated',
        changedById,
        field,
        oldValue: oldTask[field] != null ? String(oldTask[field]) : null,
        newValue: updates[field] != null ? String(updates[field]) : null,
      })
    );

  await Promise.all(logs);
}

export async function getTaskActivity(taskId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({
      where: { entityType: 'task', entityId: taskId },
      include: { changedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where: { entityType: 'task', entityId: taskId } }),
  ]);

  return { data, total, page, limit };
}

export async function getTaskVersions(taskId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.taskVersion.findMany({
      where: { taskId },
      include: { changedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { version: 'desc' },
      skip,
      take: limit,
    }),
    prisma.taskVersion.count({ where: { taskId } }),
  ]);

  return { data, total, page, limit };
}

export async function getAuditLog(
  page = 1,
  limit = 50,
  filters?: { entityType?: string; action?: string; userId?: string }
) {
  const skip = (page - 1) * limit;
  const where: Prisma.ActivityLogWhereInput = {
    ...(filters?.entityType && { entityType: filters.entityType }),
    ...(filters?.action && { action: filters.action }),
    ...(filters?.userId && { changedById: filters.userId }),
  };

  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { changedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { data, total, page, limit };
}

export async function getUserActionLogs(
  page = 1,
  limit = 50,
  filters?: { userId?: string; action?: string }
) {
  const skip = (page - 1) * limit;
  const where: Prisma.UserActionLogWhereInput = {
    ...(filters?.userId && { userId: filters.userId }),
    ...(filters?.action && { action: filters.action }),
  };

  const [data, total] = await Promise.all([
    prisma.userActionLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.userActionLog.count({ where }),
  ]);

  return { data, total, page, limit };
}

export function isWithinRestoreWindow(deletedAt: Date): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RESTORE_WINDOW_DAYS);
  return deletedAt >= cutoff;
}

export async function purgeExpiredDeletedTasks() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RESTORE_WINDOW_DAYS);

  const expired = await prisma.task.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, title: true },
  });

  for (const task of expired) {
    await prisma.task.delete({ where: { id: task.id } });
  }

  return expired.length;
}
