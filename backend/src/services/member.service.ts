import { v4 as uuidv4 } from 'uuid';
import { SystemRole, UserStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { hashPassword } from './auth.service';
import { sendEmail } from './email.service';
import { logActivity, logUserAction } from './audit.service';
import { config } from '../config';

const DEFAULT_PASSWORD = 'Welcome@123';

const memberSelect = {
  id: true,
  name: true,
  email: true,
  personalEmail: true,
  department: true,
  jobTitle: true,
  avatarUrl: true,
  status: true,
  systemRole: true,
  reportsToId: true,
  reportsTo: { select: { id: true, name: true, email: true, jobTitle: true } },
  _count: { select: { directReports: true, taskAssignments: true } },
} as const;

export async function validateReportsTo(userId: string | null, reportsToId: string | null | undefined) {
  if (!reportsToId) return;
  if (userId && reportsToId === userId) throw new Error('A member cannot report to themselves');

  const manager = await prisma.user.findUnique({ where: { id: reportsToId } });
  if (!manager || manager.status !== 'ACTIVE') throw new Error('Manager must be an active member');

  let current: string | null = reportsToId;
  const seen = new Set<string>();
  while (current) {
    if (userId && current === userId) throw new Error('Circular reporting chain detected');
    if (seen.has(current)) break;
    seen.add(current);
    const u: { reportsToId: string | null } | null = await prisma.user.findUnique({
      where: { id: current },
      select: { reportsToId: true },
    });
    current = u?.reportsToId ?? null;
  }
}

/** All direct and indirect reportees for a manager */
export async function getAllReporteeIds(managerId: string): Promise<string[]> {
  const result: string[] = [];
  const queue = [managerId];
  const seen = new Set<string>([managerId]);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const reports = await prisma.user.findMany({
      where: { reportsToId: id, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const r of reports) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        result.push(r.id);
        queue.push(r.id);
      }
    }
  }
  return result;
}

export async function listMembers() {
  return prisma.user.findMany({
    select: {
      ...memberSelect,
      createdAt: true,
      projectMembers: {
        include: { role: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function createMember(
  adminId: string,
  data: {
    name: string;
    email: string;
    personalEmail?: string | null;
    password?: string;
    department?: string;
    jobTitle?: string;
    avatarUrl?: string;
    systemRole?: SystemRole;
    reportsToId?: string | null;
  }
) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error('Email already registered');

  await validateReportsTo(null, data.reportsToId);

  const passwordHash = await hashPassword(data.password || DEFAULT_PASSWORD);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      personalEmail: data.personalEmail || null,
      passwordHash,
      department: data.department,
      jobTitle: data.jobTitle,
      avatarUrl: data.avatarUrl,
      systemRole: data.systemRole || 'MEMBER',
      reportsToId: data.reportsToId || null,
      notificationPrefs: { create: {} },
    },
    select: memberSelect,
  });

  await logActivity({
    entityType: 'user',
    entityId: user.id,
    action: 'created',
    changedById: adminId,
    newValue: user.email,
  });
  return user;
}

export async function updateMember(
  adminId: string,
  userId: string,
  data: Partial<{
    name: string;
    email: string;
    personalEmail?: string | null;
    department: string;
    jobTitle: string;
    avatarUrl: string;
    systemRole: SystemRole;
    status: UserStatus;
    password: string;
    reportsToId?: string | null;
  }>
) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return null;

  if (data.reportsToId !== undefined) {
    await validateReportsTo(userId, data.reportsToId);
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.personalEmail !== undefined) updateData.personalEmail = data.personalEmail || null;
  if (data.department !== undefined) updateData.department = data.department;
  if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.systemRole !== undefined) updateData.systemRole = data.systemRole;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.reportsToId !== undefined) updateData.reportsToId = data.reportsToId || null;
  if (data.password) updateData.passwordHash = await hashPassword(data.password);

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: memberSelect,
  });

  await logActivity({
    entityType: 'user',
    entityId: userId,
    action: 'updated',
    changedById: adminId,
    field: Object.keys(data).join(','),
    oldValue: existing.email,
    newValue: user.email,
  });
  return user;
}

export async function deactivateMember(adminId: string, userId: string) {
  return updateMember(adminId, userId, { status: 'INACTIVE' });
}

export async function reassignUserTasks(fromUserId: string, toUserId: string) {
  const assignments = await prisma.taskAssignee.findMany({ where: { userId: fromUserId } });
  for (const a of assignments) {
    const exists = await prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: a.taskId, userId: toUserId } },
    });
    if (!exists) {
      await prisma.taskAssignee.create({ data: { taskId: a.taskId, userId: toUserId } });
    }
    await prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId: a.taskId, userId: fromUserId } },
    });
  }
  await prisma.project.updateMany({ where: { ownerId: fromUserId }, data: { ownerId: toUserId } });
}

export async function deleteMember(adminId: string, userId: string, reassignToId: string) {
  if (userId === reassignToId) throw new Error('Cannot reassign to the same user');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.systemRole === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { systemRole: 'ADMIN', status: 'ACTIVE' } });
    if (adminCount <= 1) throw new Error('Cannot delete the last admin');
  }

  const fallback = await prisma.user.findUnique({ where: { id: reassignToId } });
  if (!fallback || fallback.status !== 'ACTIVE') throw new Error('Reassign target must be an active user');

  await reassignUserTasks(userId, reassignToId);

  await prisma.assignmentHistory.updateMany({
    where: { assignedToId: userId },
    data: { assignedToId: reassignToId },
  });
  await prisma.assignmentHistory.updateMany({
    where: { assignedById: userId },
    data: { assignedById: reassignToId },
  });

  await logActivity({
    entityType: 'user',
    entityId: userId,
    action: 'deleted',
    changedById: adminId,
    oldValue: user.email,
    newValue: `reassigned to ${fallback.email}`,
  });

  await prisma.user.delete({ where: { id: userId } });
  return true;
}

export async function inviteMember(
  adminId: string,
  data: { email: string; name?: string; department?: string; systemRole?: SystemRole }
) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error('User already exists');

  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invite = await prisma.memberInvite.create({
    data: {
      email: data.email,
      name: data.name,
      department: data.department,
      systemRole: data.systemRole || 'MEMBER',
      token,
      invitedById: adminId,
      expiresAt,
    },
  });

  const inviteUrl = `${config.frontendUrl}/login?invite=${token}`;
  await sendEmail(
    data.email,
    'Pramukh Alpha — You are invited',
    `Hello${data.name ? ` ${data.name}` : ''},\n\nYou have been invited to Pramukh Alpha Task Management.\n\nOpen this link to accept: ${inviteUrl}\n\nThis invite expires in 7 days.`
  );

  await logUserAction({
    userId: adminId,
    action: 'member_invite',
    entityType: 'user',
    details: { email: data.email },
  });

  return invite;
}

export async function acceptInvite(token: string, password: string, name?: string) {
  const invite = await prisma.memberInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new Error('Invalid or expired invite');
  }

  const user = await createMember(invite.invitedById, {
    name: name || invite.name || invite.email.split('@')[0],
    email: invite.email,
    password,
    department: invite.department || undefined,
    systemRole: invite.systemRole,
  });

  await prisma.memberInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  return user;
}

export async function listPendingInvites() {
  return prisma.memberInvite.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
