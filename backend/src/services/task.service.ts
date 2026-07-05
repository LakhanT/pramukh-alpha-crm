import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logActivity, logTaskFieldChanges, createTaskVersion, isWithinRestoreWindow } from './audit.service';
import { getAllReporteeIds } from './member.service';
import { createNotification, notifyTaskWatchers } from './notification.service';
import { toJson } from '../utils/params';
import {
  advanceDueDateIfPast,
  computeNextDueDate,
  normalizeRecurrenceRule,
  resolveRecurringDueDate,
} from '../utils/recurrence';

const taskInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  watchers: { include: { user: { select: { id: true, name: true, email: true } } } },
  tags: { include: { tag: true } },
  subtasks: { select: { id: true, title: true, status: true, priority: true } },
  dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true, dueDate: true, startDate: true } } } },
  comments: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' as const },
    take: 10,
  },
  attachments: { include: { uploadedBy: { select: { id: true, name: true } } } },
};

export type TaskScope = 'mine' | 'team' | 'all';
export type TaskSortBy = 'title' | 'dueDate' | 'priority' | 'status' | 'createdAt' | 'position';

const PRIORITY_ORDER: Record<TaskPriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };

async function buildScopeFilter(
  projectId: string,
  userId: string,
  systemRole: string,
  scope: TaskScope
): Promise<Prisma.TaskWhereInput> {
  if (systemRole === 'ADMIN' && scope === 'all') return {};

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { role: true },
  });

  const isManagerRole = membership && ['Admin', 'Manager', 'Team Lead'].includes(membership.role.name);
  const reporteeIds = await getAllReporteeIds(userId);
  const hasReportees = reporteeIds.length > 0;

  if (scope === 'team' && (isManagerRole || systemRole === 'ADMIN' || hasReportees)) {
    const memberIds = new Set<string>([userId, ...reporteeIds]);

    if (isManagerRole || systemRole === 'ADMIN') {
      const members = await prisma.projectMember.findMany({
        where: { projectId },
        select: { userId: true },
      });
      members.forEach((m) => memberIds.add(m.userId));
    }

    const ids = Array.from(memberIds);
    return {
      OR: [
        { assignees: { some: { userId: { in: ids } } } },
        { createdById: { in: ids } },
      ],
    };
  }

  if (scope === 'all' && systemRole === 'ADMIN') return {};

  return {
    OR: [
      { assignees: { some: { userId } } },
      { createdById: userId },
    ],
  };
}

function sortTasks<T extends { title: string; dueDate: Date | null; priority: TaskPriority; status: TaskStatus; createdAt: Date; position: number }>(
  tasks: T[],
  sortBy: TaskSortBy,
  sortOrder: 'asc' | 'desc'
): T[] {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'dueDate':
        cmp = (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0);
        break;
      case 'priority':
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case 'status':
        cmp = a.status.localeCompare(b.status);
        break;
      case 'createdAt':
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      default:
        cmp = a.position - b.position;
    }
    return cmp * dir;
  });
}

export async function listTasks(
  projectId: string,
  filters: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    tag?: string;
    dueBefore?: string;
    dueAfter?: string;
    page?: number;
    limit?: number;
    scope?: TaskScope;
    sortBy?: TaskSortBy;
    sortOrder?: 'asc' | 'desc';
    viewerUserId?: string;
    viewerSystemRole?: string;
  }
) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 100;
  const skip = (page - 1) * limit;
  const scope = filters.scope ?? 'mine';
  const sortBy = filters.sortBy ?? 'position';
  const sortOrder = filters.sortOrder ?? 'asc';

  const scopeFilter =
    filters.viewerUserId && filters.viewerSystemRole
      ? await buildScopeFilter(projectId, filters.viewerUserId, filters.viewerSystemRole, scope)
      : {};

  const where: Prisma.TaskWhereInput = {
    projectId,
    parentId: null,
    deletedAt: null,
    ...scopeFilter,
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.assigneeId && { assignees: { some: { userId: filters.assigneeId } } }),
    ...(filters.tag && { tags: { some: { tag: { name: filters.tag } } } }),
    ...(filters.dueBefore && { dueDate: { lte: new Date(filters.dueBefore) } }),
    ...(filters.dueAfter && { dueDate: { gte: new Date(filters.dueAfter) } }),
  };

  let data = await prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
  });

  data = sortTasks(data, sortBy, sortOrder);
  const total = data.length;
  data = data.slice(skip, skip + limit);

  return { data, total, page, limit };
}

export async function getTeamTree() {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      systemRole: true,
      jobTitle: true,
      reportsToId: true,
      reportsTo: { select: { id: true, name: true, email: true, jobTitle: true } },
      projectMembers: {
        include: {
          role: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: {
          directReports: true,
          taskAssignments: {
            where: { task: { deletedAt: null, status: { notIn: ['DONE', 'CANCELLED'] } } },
          },
        },
      },
    },
    orderBy: [{ department: 'asc' }, { name: 'asc' }],
  });

  const departments: Record<string, typeof users> = {};
  for (const u of users) {
    const dept = u.department || 'Unassigned';
    if (!departments[dept]) departments[dept] = [];
    departments[dept].push(u);
  }

  return Object.entries(departments).map(([name, members]) => ({
    name,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      systemRole: m.systemRole,
      jobTitle: m.jobTitle,
      reportsTo: m.reportsTo,
      reportsToId: m.reportsToId,
      directReportsCount: m._count.directReports,
      activeTasks: m._count.taskAssignments,
      projects: m.projectMembers.map((pm) => ({
        id: pm.project.id,
        name: pm.project.name,
        role: pm.role.name,
      })),
    })),
  }));
}

export async function getTaskById(id: string, includeDeleted = false) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      ...taskInclude,
      comments: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      deletedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!task || (!includeDeleted && task.deletedAt)) return null;
  return task;
}

export async function createTask(
  projectId: string,
  createdById: string,
  data: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string;
    startDate?: string;
    parentId?: string;
    assigneeIds?: string[];
    tagIds?: string[];
    dependencyIds?: string[];
    isRecurring?: boolean;
    recurrenceRule?: string;
    customFields?: Record<string, unknown>;
  }
) {
  const isRecurring = data.isRecurring ?? false;
  const recurrenceRule = isRecurring ? normalizeRecurrenceRule(data.recurrenceRule) : null;

  let dueDate: Date | null = data.dueDate ? new Date(data.dueDate) : null;
  const startDate = data.startDate ? new Date(data.startDate) : null;

  if (isRecurring && recurrenceRule) {
    dueDate = resolveRecurringDueDate(recurrenceRule, { startDate, baseDate: new Date() });
  }

  const task = await prisma.task.create({
    data: {
      projectId,
      title: data.title,
      description: data.description,
      status: data.status ?? 'TODO',
      priority: data.priority ?? 'MEDIUM',
      dueDate,
      startDate,
      parentId: data.parentId,
      isRecurring,
      recurrenceRule,
      customFields: toJson(data.customFields),
      createdById,
      assignees: data.assigneeIds?.length
        ? { create: data.assigneeIds.map((userId) => ({ userId })) }
        : undefined,
      tags: data.tagIds?.length ? { create: data.tagIds.map((tagId) => ({ tagId })) } : undefined,
      dependencies: data.dependencyIds?.length
        ? { create: data.dependencyIds.map((dependsOnTaskId) => ({ dependsOnTaskId })) }
        : undefined,
    },
    include: taskInclude,
  });

  await logActivity({
    entityType: 'task',
    entityId: task.id,
    action: 'created',
    changedById: createdById,
    newValue: task.title,
  });

  await createTaskVersion(task, createdById, { event: 'created' });

  if (data.assigneeIds?.length) {
    for (const userId of data.assigneeIds) {
      await prisma.assignmentHistory.create({
        data: { taskId: task.id, assignedToId: userId, assignedById: createdById, action: 'assigned' },
      });
      await createNotification({
        userId,
        type: 'REASSIGNMENT',
        message: `You were assigned to task "${task.title}"`,
        relatedTaskId: task.id,
      });
    }
  }

  return task;
}

export async function updateTask(
  id: string,
  changedById: string,
  updates: Partial<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
    startDate: string | null;
    position: number;
    parentId: string | null;
    customFields: Record<string, unknown>;
    isRecurring: boolean;
    recurrenceRule: string | null;
    estimatedMinutes?: number | null;
    actualMinutesSpent?: number | null;
    qualityRating?: number | null;
  }>
) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return null;

  const data: Prisma.TaskUpdateInput = {};
  if (updates.title !== undefined) data.title = updates.title;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.priority !== undefined) data.priority = updates.priority;
  if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
  if (updates.startDate !== undefined) data.startDate = updates.startDate ? new Date(updates.startDate) : null;
  if (updates.position !== undefined) data.position = updates.position;
  if (updates.parentId !== undefined) data.parent = updates.parentId ? { connect: { id: updates.parentId } } : { disconnect: true };
  if (updates.customFields !== undefined) data.customFields = toJson(updates.customFields);
  if (updates.estimatedMinutes !== undefined) data.estimatedMinutes = updates.estimatedMinutes;
  if (updates.actualMinutesSpent !== undefined) data.actualMinutesSpent = updates.actualMinutesSpent;
  if (updates.qualityRating !== undefined) data.qualityRating = updates.qualityRating;

  const nextRecurring = updates.isRecurring !== undefined ? updates.isRecurring : existing.isRecurring;
  const nextRule =
    updates.recurrenceRule !== undefined
      ? updates.recurrenceRule
      : existing.recurrenceRule;

  if (updates.isRecurring !== undefined) data.isRecurring = updates.isRecurring;
  if (updates.recurrenceRule !== undefined) data.recurrenceRule = updates.recurrenceRule;

  const recurrenceToggled = updates.isRecurring !== undefined || updates.recurrenceRule !== undefined;
  const recurrenceEnabled = nextRecurring && nextRule;

  if (recurrenceEnabled && recurrenceToggled) {
    const rule = normalizeRecurrenceRule(nextRule);
    data.recurrenceRule = rule;
    const baseStart = updates.startDate !== undefined
      ? (updates.startDate ? new Date(updates.startDate) : null)
      : existing.startDate;
    data.dueDate = resolveRecurringDueDate(rule, {
      startDate: baseStart,
      existingDueDate: existing.dueDate,
      baseDate: new Date(),
    });
  } else if (updates.isRecurring === false) {
    data.recurrenceRule = null;
  }

  // Completing a recurring task → schedule next occurrence
  let recurringRollover = false;
  if (
    updates.status === 'DONE' &&
    existing.status !== 'DONE' &&
    existing.isRecurring &&
    existing.recurrenceRule
  ) {
    const rule = normalizeRecurrenceRule(existing.recurrenceRule);
    data.dueDate = computeNextDueDate(rule, existing.dueDate ?? new Date());
    data.status = 'TODO';
    recurringRollover = true;
  } else if (updates.status !== undefined) {
    data.status = updates.status;
    if (updates.status === 'DONE' && existing.status !== 'DONE') {
      data.completedAt = new Date();
    } else if (updates.status !== 'DONE' && existing.status === 'DONE') {
      data.completedAt = null;
      if (updates.status !== 'CANCELLED') {
        data.reworkFlag = true;
      }
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data,
    include: taskInclude,
  });

  await logTaskFieldChanges(id, changedById, existing as unknown as Record<string, unknown>, updates);
  await createTaskVersion(task, changedById, { event: 'updated' });

  if (updates.status && updates.status !== existing.status && !recurringRollover) {
    await notifyTaskWatchers(
      id,
      changedById,
      'STATUS_CHANGE',
      `Task "${task.title}" status changed to ${updates.status}`
    );
  }

  return task;
}

export async function deleteTask(id: string, deletedById: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || task.deletedAt) return false;

  await logActivity({
    entityType: 'task',
    entityId: id,
    action: 'deleted',
    changedById: deletedById,
    oldValue: task.title,
  });

  await prisma.task.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById },
  });
  return true;
}

export async function restoreTask(id: string, restoredById: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || !task.deletedAt) return null;
  if (!isWithinRestoreWindow(task.deletedAt)) {
    throw new Error(`Restore window expired (${30} days)`);
  }

  const restored = await prisma.task.update({
    where: { id },
    data: { deletedAt: null, deletedById: null },
    include: taskInclude,
  });

  await logActivity({
    entityType: 'task',
    entityId: id,
    action: 'restored',
    changedById: restoredById,
    newValue: task.title,
  });

  await createTaskVersion(restored, restoredById, { event: 'restored' });
  return restored;
}

export async function listDeletedTasks(projectId?: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  return prisma.task.findMany({
    where: {
      deletedAt: { not: null, gte: cutoff },
      ...(projectId && { projectId }),
    },
    include: {
      deletedBy: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { deletedAt: 'desc' },
  });
}

export async function restoreTaskVersion(taskId: string, version: number, restoredById: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) return null;

  const snapshot = await prisma.taskVersion.findUnique({
    where: { taskId_version: { taskId, version } },
  });
  if (!snapshot) return null;

  const data = snapshot.snapshot as Record<string, unknown>;
  return updateTask(taskId, restoredById, {
    title: snapshot.title,
    description: snapshot.description ?? undefined,
    status: snapshot.status,
    priority: snapshot.priority,
    dueDate: snapshot.dueDate ? snapshot.dueDate.toISOString() : null,
    startDate: snapshot.startDate ? snapshot.startDate.toISOString() : null,
    parentId: (data.parentId as string | null) ?? null,
  });
}

export async function bulkAction(
  taskIds: string[],
  action: string,
  payload: Record<string, unknown>,
  userId: string
) {
  const results = [];

  for (const taskId of taskIds) {
    switch (action) {
      case 'status_change':
        results.push(await updateTask(taskId, userId, { status: payload.status as TaskStatus }));
        break;
      case 'assign':
        for (const assigneeId of payload.assigneeIds as string[]) {
          await assignUser(taskId, assigneeId, userId);
        }
        results.push(await getTaskById(taskId));
        break;
      case 'delete':
        await deleteTask(taskId, userId);
        results.push({ id: taskId, deleted: true });
        break;
    }
  }

  return results;
}

export async function assignUser(taskId: string, assigneeId: string, assignedById: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) return null;

  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
  if (!assignee) return null;

  await prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId: assigneeId } },
    create: { taskId, userId: assigneeId },
    update: {},
  });

  await prisma.assignmentHistory.create({
    data: { taskId, assignedToId: assigneeId, assignedById, action: 'assigned' },
  });

  await logActivity({
    entityType: 'task',
    entityId: taskId,
    action: 'assigned',
    changedById: assignedById,
    field: 'assignee',
    newValue: assignee.name,
  });

  await createNotification({
    userId: assigneeId,
    type: 'REASSIGNMENT',
    message: `You were assigned to task "${task.title}"`,
    relatedTaskId: taskId,
  });

  return getTaskById(taskId);
}

export async function unassignUser(taskId: string, assigneeId: string, unassignedById: string) {
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });

  await prisma.taskAssignee.deleteMany({ where: { taskId, userId: assigneeId } });
  await prisma.assignmentHistory.create({
    data: { taskId, assignedToId: assigneeId, assignedById: unassignedById, action: 'unassigned' },
  });

  if (assignee) {
    await logActivity({
      entityType: 'task',
      entityId: taskId,
      action: 'unassigned',
      changedById: unassignedById,
      field: 'assignee',
      oldValue: assignee.name,
    });
  }

  return getTaskById(taskId);
}

export async function getWorkload(projectId?: string) {
  const taskFilter = {
    ...(projectId && { projectId }),
    status: { notIn: ['DONE' as const, 'CANCELLED' as const] },
  };

  const users = await prisma.user.findMany({
    where: {
      taskAssignments: {
        some: { task: taskFilter },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      taskAssignments: {
        where: { task: taskFilter },
        include: { task: { select: { id: true, title: true, priority: true, dueDate: true } } },
      },
    },
  });

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    email: u.email,
    taskCount: u.taskAssignments.length,
    tasks: u.taskAssignments.map((a) => a.task),
  }));
}

export async function getCompletionReport(projectId?: string) {
  const where = { ...(projectId && { projectId }), deletedAt: null };
  const tasks = await prisma.task.findMany({
    where,
    include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
  });

  const byUser: Record<string, { name: string; total: number; done: number }> = {};

  for (const task of tasks) {
    for (const assignee of task.assignees) {
      const uid = assignee.userId;
      if (!byUser[uid]) byUser[uid] = { name: assignee.user.name, total: 0, done: 0 };
      byUser[uid].total++;
      if (task.status === 'DONE') byUser[uid].done++;
    }
  }

  return Object.entries(byUser).map(([userId, stats]) => ({
    userId,
    ...stats,
    completionRate: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0,
  }));
}

export async function getOverdueReport(projectId?: string) {
  return prisma.task.findMany({
    where: {
      ...(projectId && { projectId }),
      deletedAt: null,
      dueDate: { lt: new Date() },
      status: { notIn: ['DONE', 'CANCELLED'] },
    },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: 'asc' },
  });
}

export async function addTaskTag(taskId: string, tagId: string) {
  await prisma.taskTag.upsert({
    where: { taskId_tagId: { taskId, tagId } },
    create: { taskId, tagId },
    update: {},
  });
  return getTaskById(taskId);
}

export async function removeTaskTag(taskId: string, tagId: string) {
  await prisma.taskTag.deleteMany({ where: { taskId, tagId } });
  return getTaskById(taskId);
}

export async function addDependency(taskId: string, dependsOnTaskId: string) {
  if (taskId === dependsOnTaskId) throw new Error('Task cannot depend on itself');
  await prisma.taskDependency.create({
    data: { taskId, dependsOnTaskId },
  });
  return getTaskById(taskId);
}

export async function removeDependency(taskId: string, dependsOnTaskId: string) {
  await prisma.taskDependency.deleteMany({ where: { taskId, dependsOnTaskId } });
  return getTaskById(taskId);
}

export async function getSubtasks(parentId: string) {
  return prisma.task.findMany({
    where: { parentId, deletedAt: null },
    include: taskInclude,
    orderBy: { position: 'asc' },
  });
}

export async function createSubtask(
  parentId: string,
  createdById: string,
  data: { title: string; status?: TaskStatus; priority?: TaskPriority }
) {
  const parent = await prisma.task.findUnique({ where: { id: parentId } });
  if (!parent) return null;
  return createTask(parent.projectId, createdById, { ...data, parentId });
}

/** Roll forward due dates on recurring tasks that are past due. */
export async function processRecurringTasks() {
  const tasks = await prisma.task.findMany({
    where: {
      isRecurring: true,
      recurrenceRule: { not: null },
      deletedAt: null,
      status: { notIn: ['DONE', 'CANCELLED'] },
      dueDate: { not: null },
    },
    select: { id: true, dueDate: true, recurrenceRule: true },
  });

  let updated = 0;
  for (const task of tasks) {
    if (!task.dueDate || !task.recurrenceRule) continue;
    const nextDue = advanceDueDateIfPast(task.recurrenceRule, task.dueDate);
    if (nextDue.getTime() === new Date(task.dueDate).getTime()) continue;
    await prisma.task.update({ where: { id: task.id }, data: { dueDate: nextDue } });
    updated++;
  }
  return updated;
}
