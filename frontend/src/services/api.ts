import type { User, Paginated, Project, Task, Comment, Notification, Role } from '../types';

const API_BASE = '/api/v1';

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  getAccessToken() {
    return this.accessToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const detail = err.details?.[0]?.message;
      throw new Error(detail || err.error || 'Request failed');
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) {
        this.clearTokens();
        return false;
      }
      const { accessToken } = await res.json();
      this.accessToken = accessToken;
      localStorage.setItem('accessToken', accessToken);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  login(email: string, password: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
  }

  getMe() {
    return this.request<{ user: User & { notificationPrefs?: unknown; jobTitle?: string; avatarUrl?: string }; permissions: string[] }>('/auth/me');
  }

  acceptInvite(token: string, password: string, name?: string) {
    return this.request<{ user: User; message: string }>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token, password, name }),
    });
  }

  logout() {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
  }

  getProjects(page = 1) {
    return this.request<Paginated<Project>>(`/projects?page=${page}`);
  }

  getProject(id: string) {
    return this.request<{
      project: Project & {
        members: { id: string; user: User; role: { id: string; name: string } }[];
        tags: { id: string; name: string; color: string }[];
      };
    }>(`/projects/${id}`);
  }

  createProject(data: { name: string; description?: string; visibility?: string }) {
    return this.request<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  getProjectMembers(projectId: string) {
    return this.request<{ data: { id: string; user: User; role: { id: string; name: string } }[] }>(
      `/projects/${projectId}/members`
    );
  }

  addProjectMember(projectId: string, userId: string, roleId: string) {
    return this.request(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, roleId }),
    });
  }

  updateProjectMemberRole(projectId: string, userId: string, roleId: string) {
    return this.request(`/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ roleId }),
    });
  }

  removeProjectMember(projectId: string, userId: string) {
    return this.request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
  }

  getTasks(projectId: string, params?: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    return this.request<Paginated<Task>>(`/projects/${projectId}/tasks?${qs}`);
  }

  getTask(id: string) {
    return this.request<{ task: Task }>(`/tasks/${id}`);
  }

  createTask(projectId: string, data: Record<string, unknown>) {
    return this.request<{ task: Task }>(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateTask(id: string, data: Record<string, unknown>) {
    return this.request<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  deleteTask(id: string) {
    return this.request(`/tasks/${id}`, { method: 'DELETE' });
  }

  bulkTasks(taskIds: string[], action: string, payload: Record<string, unknown>) {
    return this.request('/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify({ taskIds, action, payload }),
    });
  }

  getTaskActivity(id: string) {
    return this.request<Paginated<unknown>>(`/tasks/${id}/activity`);
  }

  getTaskVersions(id: string) {
    return this.request<Paginated<unknown>>(`/tasks/${id}/versions`);
  }

  restoreTaskVersion(taskId: string, version: number) {
    return this.request<{ task: Task }>(`/tasks/${taskId}/versions/${version}/restore`, { method: 'POST' });
  }

  restoreTask(taskId: string) {
    return this.request<{ task: Task }>(`/tasks/${taskId}/restore`, { method: 'POST' });
  }

  assignUsers(taskId: string, userIds: string[]) {
    return this.request(`/tasks/${taskId}/assignees`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  unassignUser(taskId: string, userId: string) {
    return this.request(`/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' });
  }

  getAssignmentHistory(taskId: string) {
    return this.request<{ data: unknown[] }>(`/tasks/${taskId}/assignments`);
  }

  getSubtasks(taskId: string) {
    return this.request<{ data: Task[] }>(`/tasks/${taskId}/subtasks`);
  }

  createSubtask(taskId: string, data: { title: string; status?: string; priority?: string }) {
    return this.request(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify(data) });
  }

  addTaskTag(taskId: string, tagId: string) {
    return this.request(`/tasks/${taskId}/tags`, { method: 'POST', body: JSON.stringify({ tagId }) });
  }

  removeTaskTag(taskId: string, tagId: string) {
    return this.request(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' });
  }

  addDependency(taskId: string, dependsOnTaskId: string) {
    return this.request(`/tasks/${taskId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ dependsOnTaskId }),
    });
  }

  removeDependency(taskId: string, dependsOnTaskId: string) {
    return this.request(`/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { method: 'DELETE' });
  }

  getProjectTags(projectId: string) {
    return this.request<{ data: { id: string; name: string; color: string }[] }>(
      `/projects/${projectId}/tags`
    );
  }

  createTag(projectId: string, name: string, color?: string) {
    return this.request(`/projects/${projectId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
  }

  deleteTag(tagId: string) {
    return this.request(`/tags/${tagId}`, { method: 'DELETE' });
  }

  getComments(taskId: string) {
    return this.request<{ data: Comment[] }>(`/tasks/${taskId}/comments`);
  }

  addComment(taskId: string, content: string) {
    return this.request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  getAttachments(taskId: string) {
    return this.request<{ data: { id: string; fileName: string; fileUrl: string; fileSize: number; uploadedBy: { name: string } }[] }>(
      `/tasks/${taskId}/attachments`
    );
  }

  uploadAttachment(taskId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request(`/tasks/${taskId}/attachments`, { method: 'POST', body: form });
  }

  addProofLink(taskId: string, url: string, title?: string) {
    return this.request(`/tasks/${taskId}/attachments/link`, {
      method: 'POST',
      body: JSON.stringify({ url, title }),
    });
  }

  addProofText(taskId: string, content: string, title?: string) {
    return this.request(`/tasks/${taskId}/attachments/text`, {
      method: 'POST',
      body: JSON.stringify({ content, title }),
    });
  }

  deleteAttachment(id: string) {
    return this.request(`/attachments/${id}`, { method: 'DELETE' });
  }

  getNotifications(unreadOnly = false) {
    return this.request<Paginated<Notification>>(`/notifications?unread=${unreadOnly}`);
  }

  markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PATCH' });
  }

  getNotificationPreferences() {
    return this.request<{ preferences: Record<string, unknown> }>('/notifications/preferences');
  }

  updateNotificationPreferences(prefs: Record<string, unknown>) {
    return this.request('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(prefs) });
  }

  getCompletionReport(projectId?: string) {
    const qs = projectId ? `?projectId=${projectId}` : '';
    return this.request<{ data: unknown[] }>(`/reports/completion${qs}`);
  }

  getOverdueReport(projectId?: string) {
    const qs = projectId ? `?projectId=${projectId}` : '';
    return this.request<{ data: unknown[] }>(`/reports/overdue${qs}`);
  }

  getWorkload(projectId?: string) {
    const qs = projectId ? `?projectId=${projectId}` : '';
    return this.request<{ data: unknown[] }>(`/reports/workload${qs}`);
  }

  exportReport(type: 'overdue' | 'completion', format: 'csv' | 'html', projectId?: string) {
    const params = new URLSearchParams({ type, format });
    if (projectId) params.set('projectId', projectId);
    window.open(`${API_BASE}/reports/export?${params}&token=${this.accessToken}`, '_blank');
  }

  async downloadExport(type: 'overdue' | 'completion', format: 'csv' | 'html', projectId?: string) {
    const params = new URLSearchParams({ type, format });
    if (projectId) params.set('projectId', projectId);
    const res = await fetch(`${API_BASE}/reports/export?${params}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.${format === 'csv' ? 'csv' : 'html'}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getTeamTree() {
    return this.request<{ data: unknown[] }>('/users/team-tree');
  }

  getAssignableUsers() {
    return this.request<{ data: { id: string; name: string; email: string; department?: string; jobTitle?: string }[] }>('/users/assignable');
  }

  getMemberPerformance(
    userId: string,
    filters?: { range?: string; from?: string; to?: string; projectId?: string; status?: string }
  ) {
    const params = new URLSearchParams();
    if (filters?.range) params.set('range', filters.range);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString() ? `?${params}` : '';
    return this.request<{ data: import('../types/performance').MemberPerformanceData }>(`/users/${userId}/performance${qs}`);
  }

  async exportMemberPerformance(
    userId: string,
    filters?: { range?: string; from?: string; to?: string; projectId?: string; status?: string }
  ) {
    const params = new URLSearchParams({ format: 'csv' });
    if (filters?.range) params.set('range', filters.range);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    const res = await fetch(`${API_BASE}/users/${userId}/performance/export?${params}`, {
      headers: { Authorization: `Bearer ${this.getAccessToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `member-performance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getRoles() {
    return this.request<{ data: Role[] }>('/admin/roles');
  }

  createRole(name: string, description?: string) {
    return this.request('/admin/roles', { method: 'POST', body: JSON.stringify({ name, description }) });
  }

  deleteRole(id: string) {
    return this.request(`/admin/roles/${id}`, { method: 'DELETE' });
  }

  getPermissions() {
    return this.request<{ data: { id: string; resource: string; action: string; scope: string }[] }>(
      '/admin/permissions'
    );
  }

  updateRolePermissions(roleId: string, permissionIds: string[]) {
    return this.request(`/admin/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds }),
    });
  }

  getAuditLog(page = 1, filters?: { entityType?: string; action?: string; userId?: string }) {
    const params = new URLSearchParams({ page: String(page) });
    if (filters?.entityType) params.set('entityType', filters.entityType);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.userId) params.set('userId', filters.userId);
    return this.request<Paginated<unknown>>(`/admin/audit-log?${params}`);
  }

  getUserActionLogs(page = 1, filters?: { userId?: string; action?: string }) {
    const params = new URLSearchParams({ page: String(page) });
    if (filters?.userId) params.set('userId', filters.userId);
    if (filters?.action) params.set('action', filters.action);
    return this.request<Paginated<unknown>>(`/admin/user-actions?${params}`);
  }

  getDeletedTasks(projectId?: string) {
    const qs = projectId ? `?projectId=${projectId}` : '';
    return this.request<{ data: unknown[] }>(`/admin/deleted-tasks${qs}`);
  }

  restoreDeletedTask(taskId: string) {
    return this.request<{ task: Task }>(`/admin/deleted-tasks/${taskId}/restore`, { method: 'POST' });
  }

  getAdminUsers() {
    return this.request<Paginated<User & { status: string; department?: string; notificationPrefs?: Record<string, unknown> }>>('/admin/users');
  }

  getAdminNotificationSettings() {
    return this.request<{ settings: Record<string, unknown> }>('/admin/notification-settings');
  }

  updateAdminNotificationSettings(settings: Record<string, unknown>) {
    return this.request('/admin/notification-settings', { method: 'PATCH', body: JSON.stringify(settings) });
  }

  getAdminUserNotificationPrefs(userId: string) {
    return this.request<{ preferences: Record<string, unknown> }>(`/admin/users/${userId}/notification-preferences`);
  }

  updateAdminUserNotificationPrefs(userId: string, prefs: Record<string, unknown>) {
    return this.request(`/admin/users/${userId}/notification-preferences`, { method: 'PATCH', body: JSON.stringify(prefs) });
  }

  getMembers() {
    return this.request<{ data: MemberRecord[] }>('/admin/members');
  }

  createMember(data: CreateMemberInput) {
    return this.request<{ user: User }>('/admin/members', { method: 'POST', body: JSON.stringify(data) });
  }

  updateMember(id: string, data: Partial<CreateMemberInput & { status: string }>) {
    return this.request<{ user: User }>(`/admin/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  deactivateMember(id: string) {
    return this.request<{ user: User }>(`/admin/members/${id}/deactivate`, { method: 'POST' });
  }

  deleteMember(id: string, reassignToId: string) {
    return this.request(`/admin/members/${id}`, { method: 'DELETE', body: JSON.stringify({ reassignToId }) });
  }

  inviteMember(data: { email: string; name?: string; department?: string; systemRole?: string }) {
    return this.request('/admin/members/invite', { method: 'POST', body: JSON.stringify(data) });
  }

  getPendingInvites() {
    return this.request<{ data: PendingInvite[] }>('/admin/invites');
  }
}

export interface CreateMemberInput {
  name: string;
  email: string;
  personalEmail?: string | null;
  password?: string;
  department?: string;
  jobTitle?: string;
  avatarUrl?: string;
  systemRole?: string;
  reportsToId?: string | null;
}

export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  personalEmail?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  status: string;
  systemRole: string;
  reportsToId?: string | null;
  reportsTo?: { id: string; name: string; email: string; jobTitle?: string | null } | null;
  createdAt: string;
  _count: { taskAssignments: number; directReports: number };
  projectMembers: { role: { id: string; name: string }; project: { id: string; name: string } }[];
}

export interface PendingInvite {
  id: string;
  email: string;
  name?: string | null;
  department?: string | null;
  systemRole: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string; email: string };
}

export const api = new ApiClient();
