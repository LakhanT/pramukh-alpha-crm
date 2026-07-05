export interface User {
  id: string;
  name: string;
  email: string;
  personalEmail?: string | null;
  systemRole: 'ADMIN' | 'MEMBER';
  department?: string;
  jobTitle?: string;
  reportsToId?: string | null;
  reportsTo?: { id: string; name: string; email: string; jobTitle?: string | null } | null;
  directReportsCount?: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  visibility: string;
  owner: { id: string; name: string };
  _count?: { tasks: number; members: number };
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  startDate?: string;
  parentId?: string;
  position: number;
  isRecurring?: boolean;
  recurrenceRule?: string;
  assignees: { user: { id: string; name: string; email: string } }[];
  watchers?: { user: { id: string; name: string } }[];
  tags: { tag: { id: string; name: string; color: string } }[];
  subtasks?: { id: string; title: string; status: TaskStatus; priority?: TaskPriority }[];
  dependencies?: { id: string; dependsOn: { id: string; title: string; status: TaskStatus } }[];
  attachments?: TaskProof[];
  comments?: Comment[];
}

export type ProofType = 'FILE' | 'LINK' | 'TEXT';

export interface TaskProof {
  id: string;
  proofType: ProofType;
  fileName: string;
  fileUrl?: string | null;
  textContent?: string | null;
  fileSize: number;
  mimeType?: string;
  createdAt?: string;
  uploadedBy?: { id: string; name: string };
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Comment {
  id: string;
  content: string;
  mentions: string[];
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedTask?: { id: string; title: string };
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: { permission: { id: string; resource: string; action: string; scope: string } }[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface AssignmentHistory {
  id: string;
  action: string;
  createdAt: string;
  assignedTo: { id: string; name: string };
  assignedBy: { id: string; name: string };
}
