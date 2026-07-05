export interface MemberPerformanceData {
  member: {
    id: string;
    name: string;
    email: string;
    department?: string | null;
    jobTitle?: string | null;
    avatarUrl?: string | null;
    systemRole: string;
    role: string;
    memberSince: string;
    activeTaskCount: number;
    reportsTo?: { id: string; name: string } | null;
  };
  range: { start: string | null; end: string | null; key: string };
  stats: {
    totalAssigned: number;
    completed: number;
    overdue: number;
    inProgress: number;
    completionRate: number;
    onTimeRate: number;
  };
  comparison: {
    completionRateVsTeam: number;
    onTimeRateVsTeam: number;
    teamAvgCompletionRate: number;
    teamAvgOnTimeRate: number;
  };
  quality: { reworkRate: number; avgQualityRating: number | null };
  efficiency: {
    avgEstimatedMinutes: number | null;
    avgActualMinutes: number | null;
    byPriority: { priority: string; count: number; completed: number; avgDaysToComplete: number | null }[];
  };
  trends: {
    completionTrend: { period: string; completed: number }[];
    onTimeVsLate: { onTime: number; late: number };
    workloadTrend: { period: string; assigned: number; closed: number }[];
  };
  breakdowns: {
    byProject: { projectId: string; name: string; count: number; completed: number }[];
    byTag: { tagId: string; name: string; color: string; count: number }[];
    byPriority: { priority: string; count: number; completed: number; avgDaysToComplete: number | null }[];
  };
  timeline: {
    id: string;
    timestamp: string;
    action: string;
    description: string;
    taskId?: string;
    taskTitle?: string;
    actorName: string;
    entityType: string;
  }[];
  taskHistory: {
    id: string;
    title: string;
    status: string;
    priority: string;
    project: { id: string; name: string };
    dueDate: string | null;
    completedAt: string | null;
    reworkFlag: boolean;
    qualityRating: number | null;
  }[];
}

export type PerformanceRange = 'week' | 'month' | 'quarter' | 'all' | 'custom';

export const MOCK_PERFORMANCE: MemberPerformanceData = {
  member: {
    id: 'mock',
    name: 'Sample Member',
    email: 'sample@pramukhalpha.com',
    department: 'Marketing',
    jobTitle: 'SMM Intern',
    role: 'SMM Intern',
    systemRole: 'MEMBER',
    memberSince: new Date(Date.now() - 90 * 86400000).toISOString(),
    activeTaskCount: 3,
    reportsTo: { id: '1', name: 'Lakhan Togadiya' },
  },
  range: { start: null, end: null, key: 'all' },
  stats: { totalAssigned: 12, completed: 8, overdue: 1, inProgress: 3, completionRate: 67, onTimeRate: 75 },
  comparison: { completionRateVsTeam: 5, onTimeRateVsTeam: -3, teamAvgCompletionRate: 62, teamAvgOnTimeRate: 78 },
  quality: { reworkRate: 12, avgQualityRating: 4.2 },
  efficiency: {
    avgEstimatedMinutes: 120,
    avgActualMinutes: 135,
    byPriority: [
      { priority: 'URGENT', count: 2, completed: 2, avgDaysToComplete: 1.5 },
      { priority: 'HIGH', count: 3, completed: 2, avgDaysToComplete: 3 },
      { priority: 'MEDIUM', count: 5, completed: 3, avgDaysToComplete: 5 },
      { priority: 'LOW', count: 2, completed: 1, avgDaysToComplete: 7 },
    ],
  },
  trends: {
    completionTrend: [
      { period: '2026-06-08', completed: 2 },
      { period: '2026-06-15', completed: 3 },
      { period: '2026-06-22', completed: 3 },
    ],
    onTimeVsLate: { onTime: 6, late: 2 },
    workloadTrend: [
      { period: '2026-06-08', assigned: 3, closed: 2 },
      { period: '2026-06-15', assigned: 4, closed: 3 },
      { period: '2026-06-22', assigned: 5, closed: 3 },
    ],
  },
  breakdowns: {
    byProject: [{ projectId: '1', name: 'Social Media', count: 8, completed: 6 }],
    byTag: [{ tagId: '1', name: 'content', color: '#2563eb', count: 5 }],
    byPriority: [
      { priority: 'URGENT', count: 2, completed: 2, avgDaysToComplete: 1.5 },
      { priority: 'MEDIUM', count: 5, completed: 3, avgDaysToComplete: 5 },
    ],
  },
  timeline: [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      action: 'status_changed',
      description: 'Task "Post 2 posts on Twitter" moved to IN PROGRESS',
      taskId: 't1',
      taskTitle: 'Post 2 posts on Twitter',
      actorName: 'Sample Member',
      entityType: 'task',
    },
  ],
  taskHistory: [
    {
      id: 't1',
      title: 'Post 2 posts on Twitter',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      project: { id: '1', name: 'Social Media' },
      dueDate: new Date().toISOString(),
      completedAt: null,
      reworkFlag: false,
      qualityRating: null,
    },
  ],
};
