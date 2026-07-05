import { TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { getAllReporteeIds } from './member.service';
import { hasPermission } from './permission.service';

export type PerformanceRange = 'week' | 'month' | 'quarter' | 'all' | 'custom';

export interface PerformanceFilters {
  range?: PerformanceRange;
  from?: string;
  to?: string;
  projectId?: string;
  status?: string;
}

export function parseDateRange(filters: PerformanceFilters): { start: Date | null; end: Date | null } {
  const now = new Date();
  const end = filters.to ? new Date(filters.to) : now;
  end.setHours(23, 59, 59, 999);

  if (filters.range === 'custom' && filters.from) {
    const start = new Date(filters.from);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (filters.range === 'all' || !filters.range) {
    return { start: null, end: null };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filters.range === 'week') start.setDate(start.getDate() - 7);
  else if (filters.range === 'month') start.setMonth(start.getMonth() - 1);
  else if (filters.range === 'quarter') start.setMonth(start.getMonth() - 3);
  return { start, end };
}

export async function canViewMemberPerformance(
  viewerId: string,
  targetId: string,
  systemRole: string
): Promise<boolean> {
  if (viewerId === targetId) return true;
  if (systemRole === 'ADMIN') return true;

  const reportees = await getAllReporteeIds(viewerId);
  if (reportees.includes(targetId)) return true;

  return hasPermission(viewerId, systemRole, null, 'user', 'read_performance', 'global');
}

function weekKey(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x.toISOString().slice(0, 10);
}

function inRange(date: Date | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!date) return false;
  if (!start && !end) return true;
  const t = date.getTime();
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  return true;
}

function describeActivity(a: {
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  entityType: string;
}, taskTitle?: string): string {
  const title = taskTitle ? `"${taskTitle}"` : 'task';
  switch (a.action) {
    case 'created': return `Task ${title} created`;
    case 'assigned': return `Task ${title} assigned`;
    case 'unassigned': return `Task ${title} unassigned`;
    case 'status_changed':
    case 'updated':
      if (a.field === 'status' && a.newValue) {
        return `Task ${title} moved to ${a.newValue.replace(/_/g, ' ')}`;
      }
      if (a.field === 'status' && a.oldValue === 'DONE') {
        return `Task ${title} reopened for rework`;
      }
      return `Task ${title} updated${a.field ? ` (${a.field})` : ''}`;
    case 'deleted': return `Task ${title} deleted`;
    case 'restored': return `Task ${title} restored`;
    default:
      return `${a.action.replace(/_/g, ' ')} on ${title}`;
  }
}

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  startDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  estimatedMinutes: number | null;
  actualMinutesSpent: number | null;
  qualityRating: number | null;
  reworkFlag: boolean;
  project: { id: string; name: string };
  tags: { tag: { id: string; name: string; color: string } }[];
};

function computeStats(tasks: TaskRow[], start: Date | null, end: Date | null) {
  const now = new Date();
  const scoped = tasks.filter((t) => {
    if (!start && !end) return true;
    return (
      inRange(t.createdAt, start, end) ||
      inRange(t.completedAt, start, end) ||
      inRange(t.dueDate, start, end)
    );
  });

  const completed = scoped.filter((t) => t.status === 'DONE');
  const overdue = scoped.filter(
    (t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.dueDate && t.dueDate < now
  );
  const inProgress = scoped.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW');

  const withDue = completed.filter((t) => t.dueDate && t.completedAt);
  const onTime = withDue.filter((t) => t.completedAt! <= t.dueDate!);
  const late = withDue.filter((t) => t.completedAt! > t.dueDate!);

  const reworked = completed.filter((t) => t.reworkFlag);
  const rated = completed.filter((t) => t.qualityRating != null);
  const avgRating = rated.length
    ? rated.reduce((s, t) => s + (t.qualityRating || 0), 0) / rated.length
    : null;

  const withEst = scoped.filter((t) => t.estimatedMinutes != null && t.actualMinutesSpent != null);
  const avgEstimated = withEst.length
    ? withEst.reduce((s, t) => s + (t.estimatedMinutes || 0), 0) / withEst.length
    : null;
  const avgActual = withEst.length
    ? withEst.reduce((s, t) => s + (t.actualMinutesSpent || 0), 0) / withEst.length
    : null;

  const completionRate = scoped.length ? Math.round((completed.length / scoped.length) * 100) : 0;
  const onTimeRate = withDue.length ? Math.round((onTime.length / withDue.length) * 100) : 0;
  const reworkRate = completed.length ? Math.round((reworked.length / completed.length) * 100) : 0;

  return {
    totalAssigned: scoped.length,
    completed: completed.length,
    overdue: overdue.length,
    inProgress: inProgress.length,
    completionRate,
    onTimeRate,
    onTimeCount: onTime.length,
    lateCount: late.length,
    reworkRate,
    avgQualityRating: avgRating != null ? Math.round(avgRating * 10) / 10 : null,
    avgEstimatedMinutes: avgEstimated != null ? Math.round(avgEstimated) : null,
    avgActualMinutes: avgActual != null ? Math.round(avgActual) : null,
    scoped,
    completedTasks: completed,
  };
}

function buildTrends(tasks: TaskRow[], start: Date | null, end: Date | null) {
  const completionMap = new Map<string, number>();
  const assignedMap = new Map<string, number>();
  const closedMap = new Map<string, number>();

  for (const t of tasks) {
    const aKey = weekKey(t.createdAt);
    assignedMap.set(aKey, (assignedMap.get(aKey) || 0) + 1);
    if (t.completedAt && inRange(t.completedAt, start, end)) {
      const cKey = weekKey(t.completedAt);
      completionMap.set(cKey, (completionMap.get(cKey) || 0) + 1);
      closedMap.set(cKey, (closedMap.get(cKey) || 0) + 1);
    }
  }

  const periods = Array.from(
    new Set([...completionMap.keys(), ...assignedMap.keys()])
  ).sort();

  return {
    completionTrend: periods.map((period) => ({
      period,
      completed: completionMap.get(period) || 0,
    })),
    onTimeVsLate: { onTime: 0, late: 0 }, // filled by caller
    workloadTrend: periods.map((period) => ({
      period,
      assigned: assignedMap.get(period) || 0,
      closed: closedMap.get(period) || 0,
    })),
  };
}

function breakdownByProject(tasks: TaskRow[]) {
  const map = new Map<string, { projectId: string; name: string; count: number; completed: number }>();
  for (const t of tasks) {
    const cur = map.get(t.project.id) || { projectId: t.project.id, name: t.project.name, count: 0, completed: 0 };
    cur.count++;
    if (t.status === 'DONE') cur.completed++;
    map.set(t.project.id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function breakdownByTag(tasks: TaskRow[]) {
  const map = new Map<string, { tagId: string; name: string; color: string; count: number }>();
  for (const t of tasks) {
    for (const tt of t.tags) {
      const cur = map.get(tt.tag.id) || { tagId: tt.tag.id, name: tt.tag.name, color: tt.tag.color, count: 0 };
      cur.count++;
      map.set(tt.tag.id, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function breakdownByPriority(tasks: TaskRow[]) {
  const priorities: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
  return priorities.map((p) => {
    const subset = tasks.filter((t) => t.priority === p);
    const done = subset.filter((t) => t.status === 'DONE' && t.completedAt && t.createdAt);
    const avgDays = done.length
      ? done.reduce((s, t) => {
          const days = (t.completedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return s + days;
        }, 0) / done.length
      : null;
    return {
      priority: p,
      count: subset.length,
      completed: subset.filter((t) => t.status === 'DONE').length,
      avgDaysToComplete: avgDays != null ? Math.round(avgDays * 10) / 10 : null,
    };
  });
}

async function getTeamAverages(memberIds: string[], start: Date | null, end: Date | null) {
  if (memberIds.length === 0) return { completionRate: 0, onTimeRate: 0 };

  let totalRate = 0;
  let totalOnTime = 0;
  let count = 0;

  for (const id of memberIds) {
    const tasks = await fetchMemberTasks(id);
    const stats = computeStats(tasks, start, end);
    if (stats.totalAssigned > 0) {
      totalRate += stats.completionRate;
      totalOnTime += stats.onTimeRate;
      count++;
    }
  }

  return {
    completionRate: count ? Math.round(totalRate / count) : 0,
    onTimeRate: count ? Math.round(totalOnTime / count) : 0,
  };
}

async function fetchMemberTasks(memberId: string, projectId?: string): Promise<TaskRow[]> {
  return prisma.task.findMany({
    where: {
      deletedAt: null,
      assignees: { some: { userId: memberId } },
      ...(projectId && { projectId }),
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      startDate: true,
      completedAt: true,
      createdAt: true,
      estimatedMinutes: true,
      actualMinutesSpent: true,
      qualityRating: true,
      reworkFlag: true,
      project: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getMemberPerformance(memberId: string, filters: PerformanceFilters) {
  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      jobTitle: true,
      avatarUrl: true,
      systemRole: true,
      createdAt: true,
      reportsTo: { select: { id: true, name: true } },
    },
  });
  if (!member) return null;

  const { start, end } = parseDateRange(filters);
  const allTasks = await fetchMemberTasks(memberId, filters.projectId);
  const stats = computeStats(allTasks, start, end);
  const trends = buildTrends(allTasks, start, end);
  trends.onTimeVsLate = { onTime: stats.onTimeCount, late: stats.lateCount };

  const taskIds = allTasks.map((t) => t.id);

  const [activityLogs, assignments, activeCount] = await Promise.all([
    taskIds.length
      ? prisma.activityLog.findMany({
          where: { entityType: 'task', entityId: { in: taskIds } },
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : [],
    prisma.assignmentHistory.findMany({
      where: {
        OR: [{ assignedToId: memberId }, { assignedById: memberId }],
        ...(taskIds.length ? { taskId: { in: taskIds } } : {}),
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.taskAssignee.count({
      where: {
        userId: memberId,
        task: { deletedAt: null, status: { notIn: ['DONE', 'CANCELLED'] } },
      },
    }),
  ]);

  const taskTitleMap = new Map(allTasks.map((t) => [t.id, t.title]));

  const timelineFromActivity = activityLogs
    .filter((a) => inRange(a.createdAt, start, end))
    .map((a) => ({
      id: a.id,
      timestamp: a.createdAt.toISOString(),
      action: a.action,
      description: describeActivity(a, taskTitleMap.get(a.entityId)),
      taskId: a.entityId,
      taskTitle: taskTitleMap.get(a.entityId),
      actorName: a.changedBy.name,
      entityType: a.entityType,
    }));

  const timelineFromAssignments = assignments
    .filter((a) => inRange(a.createdAt, start, end))
    .map((a) => ({
      id: `assign-${a.id}`,
      timestamp: a.createdAt.toISOString(),
      action: a.action,
      description:
        a.action === 'assigned'
          ? `Task assigned to ${a.assignedTo.name}`
          : a.action === 'reassigned'
            ? `Task reassigned to ${a.assignedTo.name}`
            : `Task unassigned from ${a.assignedTo.name}`,
      taskId: a.taskId,
      taskTitle: taskTitleMap.get(a.taskId),
      actorName: a.assignedBy.name,
      entityType: 'assignment',
    }));

  const timeline = [...timelineFromActivity, ...timelineFromAssignments]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 150);

  // Team comparison — same department peers
  const peers = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      department: member.department || undefined,
      id: { not: memberId },
    },
    select: { id: true },
    take: 50,
  });
  const teamAvg = await getTeamAverages(peers.map((p) => p.id), start, end);

  let taskHistory = stats.scoped;
  if (filters.status) {
    taskHistory = taskHistory.filter((t) => t.status === filters.status);
  }

  return {
    member: {
      ...member,
      memberSince: member.createdAt.toISOString(),
      activeTaskCount: activeCount,
      role: member.jobTitle || member.systemRole,
    },
    range: { start: start?.toISOString() || null, end: end?.toISOString() || null, key: filters.range || 'all' },
    stats: {
      totalAssigned: stats.totalAssigned,
      completed: stats.completed,
      overdue: stats.overdue,
      inProgress: stats.inProgress,
      completionRate: stats.completionRate,
      onTimeRate: stats.onTimeRate,
    },
    comparison: {
      completionRateVsTeam: stats.completionRate - teamAvg.completionRate,
      onTimeRateVsTeam: stats.onTimeRate - teamAvg.onTimeRate,
      teamAvgCompletionRate: teamAvg.completionRate,
      teamAvgOnTimeRate: teamAvg.onTimeRate,
    },
    quality: {
      reworkRate: stats.reworkRate,
      avgQualityRating: stats.avgQualityRating,
    },
    efficiency: {
      avgEstimatedMinutes: stats.avgEstimatedMinutes,
      avgActualMinutes: stats.avgActualMinutes,
      byPriority: breakdownByPriority(stats.scoped),
    },
    trends,
    breakdowns: {
      byProject: breakdownByProject(stats.scoped),
      byTag: breakdownByTag(stats.scoped),
      byPriority: breakdownByPriority(stats.scoped),
    },
    timeline,
    taskHistory: taskHistory.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      project: t.project,
      dueDate: t.dueDate?.toISOString() || null,
      completedAt: t.completedAt?.toISOString() || null,
      reworkFlag: t.reworkFlag,
      qualityRating: t.qualityRating,
    })),
  };
}

export function performanceToCsv(data: NonNullable<Awaited<ReturnType<typeof getMemberPerformance>>>) {
  const lines = [
    `Member Performance Report — ${data.member.name}`,
    `Range,${data.range.key}`,
    '',
    'Metric,Value',
    `Total Assigned,${data.stats.totalAssigned}`,
    `Completed,${data.stats.completed}`,
    `Overdue,${data.stats.overdue}`,
    `In Progress,${data.stats.inProgress}`,
    `Completion Rate,${data.stats.completionRate}%`,
    `On-Time Rate,${data.stats.onTimeRate}%`,
    `Rework Rate,${data.quality.reworkRate}%`,
    '',
    'Task,Status,Priority,Project,Due Date,Completed',
    ...data.taskHistory.map(
      (t) =>
        `"${t.title}",${t.status},${t.priority},"${t.project.name}",${t.dueDate || ''},${t.completedAt || ''}`
    ),
  ];
  return lines.join('\n');
}
