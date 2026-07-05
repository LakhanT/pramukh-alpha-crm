import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import MentionTextarea from '../components/MentionTextarea';
import ProofSection from '../components/ProofSection';
import { api } from '../services/api';
import { RECURRENCE_OPTIONS, normalizeRecurrenceRule, recurrenceDueHint } from '../utils/recurrence';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import type { Task, TaskStatus, TaskPriority, Comment, Tag, AssignmentHistory } from '../types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Title', description: 'Description', status: 'Status', priority: 'Priority',
  dueDate: 'Due date', startDate: 'Start date', assignee: 'Assignee',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'created this task',
  updated: 'updated',
  status_changed: 'changed status',
  deleted: 'deleted this task',
  restored: 'restored this task',
  assigned: 'assigned',
  unassigned: 'unassigned',
};

function formatActivityLine(a: { action: string; field?: string; oldValue?: string; newValue?: string }) {
  const base = ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ');
  if (!a.field) return base;
  const label = FIELD_LABELS[a.field] || a.field;
  if (a.oldValue && a.newValue) return `${base} ${label}: "${a.oldValue}" → "${a.newValue}"`;
  if (a.newValue) return `${base} ${label} to "${a.newValue}"`;
  if (a.oldValue) return `${base} ${label} (was "${a.oldValue}")`;
  return `${base} ${label}`;
}

interface TaskVersionRow {
  id: string;
  version: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  createdAt: string;
  changedBy: { name: string };
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<unknown[]>([]);
  const [versions, setVersions] = useState<TaskVersionRow[]>([]);
  const [assignHistory, setAssignHistory] = useState<AssignmentHistory[]>([]);
  const [projectTags, setProjectTags] = useState<Tag[]>([]);
  const [projectMembers, setProjectMembers] = useState<{ user: { id: string; name: string; email: string } }[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [newComment, setNewComment] = useState('');
  const [tab, setTab] = useState<'comments' | 'history' | 'assignments' | 'versions'>('comments');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [depTaskId, setDepTaskId] = useState('');

  const loadTask = useCallback(() => {
    if (!id) return;
    api.getTask(id).then((res) => {
      setTask(res.task);
      setEditTitle(res.task.title);
      setEditDesc(res.task.description || '');
      api.getProjectTags(res.task.projectId).then((t) => setProjectTags(t.data));
      api.getProjectMembers(res.task.projectId).then((m) => setProjectMembers(m.data));
      api.getAssignableUsers().then((r) => setAssignableUsers(r.data));
      api.getTasks(res.task.projectId, { limit: '200' }).then((t) => setProjectTasks(t.data));
    });
    api.getComments(id).then((res) => setComments(res.data));
    api.getTaskActivity(id).then((res) => setActivity(res.data));
    api.getTaskVersions(id).then((res) => setVersions(res.data as TaskVersionRow[]));
    api.getAssignmentHistory(id).then((res) => setAssignHistory(res.data as AssignmentHistory[]));
  }, [id]);

  useEffect(() => { loadTask(); }, [loadTask]);

  useSocket(task?.projectId, id);
  useSocketEvent(task?.projectId, 'task:updated', (data) => {
    if ((data as Task).id === id) setTask(data as Task);
  });
  useSocketEvent(task?.projectId, 'comment:created', () => {
    if (id) api.getComments(id).then((res) => setComments(res.data));
  });

  const handleSave = async () => {
    if (!id) return;
    await api.updateTask(id, { title: editTitle, description: editDesc });
    setEditing(false);
    loadTask();
  };

  const handleFieldUpdate = async (fields: Record<string, unknown>) => {
    if (!id) return;
    await api.updateTask(id, fields);
    loadTask();
  };

  const handleComment = async () => {
    if (!id || !newComment.trim()) return;
    await api.addComment(id, newComment);
    setNewComment('');
    loadTask();
  };

  const handleRestoreVersion = async (version: number) => {
    if (!id || !confirm(`Restore task to version ${version}? Current changes will be saved as a new version.`)) return;
    await api.restoreTaskVersion(id, version);
    loadTask();
  };

  const handleAssign = async (userId: string) => {
    if (!id || task?.assignees.some((a) => a.user.id === userId)) return;
    await api.assignUsers(id, [userId]);
    loadTask();
  };

  const handleUnassign = async (userId: string) => {
    if (!id) return;
    await api.unassignUser(id, userId);
    loadTask();
  };

  const handleAddSubtask = async () => {
    if (!id || !newSubtask.trim()) return;
    await api.createSubtask(id, { title: newSubtask });
    setNewSubtask('');
    loadTask();
  };

  const handleAddTag = async (tagId: string) => {
    if (!id) return;
    await api.addTaskTag(id, tagId);
    loadTask();
  };

  const handleCreateTag = async () => {
    if (!task || !newTagName.trim()) return;
    const res = await api.createTag(task.projectId, newTagName) as { tag: Tag };
    setNewTagName('');
    await api.addTaskTag(id!, res.tag.id);
    loadTask();
  };

  const handleAddDep = async () => {
    if (!id || !depTaskId) return;
    await api.addDependency(id, depTaskId);
    setDepTaskId('');
    loadTask();
  };

  const renderMentions = (text: string) => {
    return text.split(/(@[\w.@+-]+)/g).map((part, i) =>
      part.startsWith('@') ? <strong key={i} style={{ color: 'var(--primary)' }}>{part}</strong> : part
    );
  };

  const mentionUsers = projectMembers.length > 0
    ? projectMembers.map((m) => m.user)
    : assignableUsers;
  const recurrenceValue = normalizeRecurrenceRule(task?.recurrenceRule);

  if (!task) return <Layout><p className="loading-text">Loading task…</p></Layout>;

  const unassignedUsers = assignableUsers.filter(
    (u) => !task.assignees.some((a) => a.user.id === u.id)
  );

  return (
    <Layout>
      <div style={{ marginBottom: 16 }}>
        <Link to="/board" style={{ fontSize: 14, color: 'var(--text-muted)' }}>← Back to tasks</Link>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            {editing ? (
              <>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }} />
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} style={{ marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary" onClick={handleSave}>Save</button>
                  <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <h1 style={{ fontSize: 22 }}>{task.title}</h1>
                  <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>
                </div>
                {task.description && <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>{task.description}</p>}
              </>
            )}

            <div className="grid-2" style={{ marginTop: 20, gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Status</label>
                <select value={task.status} onChange={(e) => handleFieldUpdate({ status: e.target.value })}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Priority</label>
                <select value={task.priority} onChange={(e) => handleFieldUpdate({ priority: e.target.value })}>
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Due date{task.isRecurring ? ' (auto)' : ''}</label>
                <input
                  type="date"
                  value={task.dueDate?.slice(0, 10) || ''}
                  readOnly={!!task.isRecurring}
                  style={task.isRecurring ? { background: 'var(--bg)' } : undefined}
                  onChange={(e) => handleFieldUpdate({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Start date</label>
                <input type="date" value={task.startDate?.slice(0, 10) || ''} onChange={(e) => handleFieldUpdate({ startDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
            </div>

            <div className="task-recurring-box">
              <label className="checkbox-row" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={task.isRecurring || false}
                  onChange={(e) => handleFieldUpdate({
                    isRecurring: e.target.checked,
                    recurrenceRule: e.target.checked ? (task.recurrenceRule || 'weekly') : null,
                  })}
                />
                <span>Recurring task</span>
              </label>
              {task.isRecurring && (
                <div className="form-group">
                  <label>How often should this repeat?</label>
                  <select
                    value={recurrenceValue}
                    onChange={(e) => handleFieldUpdate({ recurrenceRule: e.target.value })}
                  >
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                    Due date is set automatically. {recurrenceDueHint(recurrenceValue, task.startDate ? new Date(task.startDate) : new Date())}
                    {task.dueDate && (
                      <> Current due: <strong>{new Date(task.dueDate).toLocaleDateString()}</strong>.</>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Subtasks */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Subtasks</div>
            <div className="card-desc">Break this task into smaller steps</div>
            {task.subtasks?.map((st) => (
              <div key={st.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className={`badge badge-${st.status.toLowerCase()}`}>{STATUS_LABELS[st.status]}</span>
                <Link to={`/tasks/${st.id}`}>{st.title}</Link>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input placeholder="New subtask title" value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} />
              <button className="btn-primary" onClick={handleAddSubtask}>Add</button>
            </div>
          </div>

          {/* Dependencies */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Dependencies</div>
            <div className="card-desc">Tasks that must be completed before this one</div>
            {task.dependencies?.map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Link to={`/tasks/${d.dependsOn.id}`}>{d.dependsOn.title}</Link>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => api.removeDependency(id!, d.dependsOn.id).then(loadTask)}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <select value={depTaskId} onChange={(e) => setDepTaskId(e.target.value)}>
                <option value="">Select blocking task…</option>
                {projectTasks.filter((t) => t.id !== id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <button className="btn-primary" onClick={handleAddDep} disabled={!depTaskId}>Add</button>
            </div>
          </div>

          <ProofSection taskId={id!} proofs={task.attachments || []} onChange={loadTask} />

          {/* Comments & Activity */}
          <div className="card">
            <div className="tabs">
              <button className={`tab ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>Comments</button>
              <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Activity log</button>
              <button className={`tab ${tab === 'versions' ? 'active' : ''}`} onClick={() => setTab('versions')}>Version history</button>
              <button className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Reassignments</button>
            </div>

            {tab === 'comments' && (
              <>
                {comments.map((c) => (
                  <div key={c.id} className="comment">
                    <span className="comment-author">{c.user.name}</span>
                    <span className="comment-time">{new Date(c.createdAt).toLocaleString()}</span>
                    <div className="comment-body">{renderMentions(c.content)}</div>
                  </div>
                ))}
                <div style={{ marginTop: 16 }}>
                  <MentionTextarea
                    value={newComment}
                    onChange={setNewComment}
                    users={mentionUsers}
                    placeholder="Write a comment… Type @ to mention a teammate"
                    rows={3}
                  />
                  <button className="btn-primary" style={{ marginTop: 8 }} onClick={handleComment}>Post comment</button>
                </div>
              </>
            )}

            {tab === 'history' && (
              <div>
                {(activity as { id: string; action: string; field?: string; oldValue?: string; newValue?: string; createdAt: string; changedBy: { name: string } }[]).map((a) => (
                  <div key={a.id} className="activity-item">
                    <span className="who">{a.changedBy.name}</span> {formatActivityLine(a)}
                    <div className="when">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {activity.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No changes recorded yet.</p>}
              </div>
            )}

            {tab === 'versions' && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Previous snapshots of this task. Restore an older version to undo changes.
                </p>
                {versions.map((v) => (
                  <div key={v.id} className="activity-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <strong>v{v.version}</strong> — {v.title}
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                        {STATUS_LABELS[v.status as TaskStatus] || v.status} · {v.priority}
                        {v.description && <> · {v.description.slice(0, 80)}{v.description.length > 80 ? '…' : ''}</>}
                      </div>
                      <div className="when">{v.changedBy.name} · {new Date(v.createdAt).toLocaleString()}</div>
                    </div>
                    {v.version < (versions[0]?.version ?? v.version) && (
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }} onClick={() => handleRestoreVersion(v.version)}>
                        Restore
                      </button>
                    )}
                  </div>
                ))}
                {versions.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No versions saved yet.</p>}
              </div>
            )}

            {tab === 'assignments' && (
              <div>
                {assignHistory.map((h) => (
                  <div key={h.id} className="activity-item">
                    <span className="who">{h.assignedBy.name}</span> {h.action} <strong>{h.assignedTo.name}</strong>
                    <div className="when">{new Date(h.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {assignHistory.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No assignment history.</p>}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Assignees */}
          <div className="card">
            <div className="card-title">Assigned to</div>
            {task.assignees.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No one assigned yet.</p>
            )}
            {task.assignees.map((a) => (
              <div key={a.user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{a.user.name}</span>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => handleUnassign(a.user.id)}>Remove</button>
              </div>
            ))}
            <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
              <label>Assign member</label>
              <select
                value=""
                onChange={(e) => { if (e.target.value) handleAssign(e.target.value); }}
              >
                <option value="">Select a team member…</option>
                {unassignedUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.email ? ` (${u.email})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="card">
            <div className="card-title">Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {task.tags.map((t) => (
                <span key={t.tag.id} className="badge" style={{ background: t.tag.color + '22', color: t.tag.color, cursor: 'pointer' }} onClick={() => api.removeTaskTag(id!, t.tag.id).then(loadTask)}>
                  {t.tag.name} ×
                </span>
              ))}
            </div>
            <select defaultValue="" onChange={(e) => { if (e.target.value) { handleAddTag(e.target.value); e.target.value = ''; } }}>
              <option value="">Add existing tag…</option>
              {projectTags.filter((t) => !task.tags.some((tt) => tt.tag.id === t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input placeholder="New tag name" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} />
              <button className="btn-secondary" onClick={handleCreateTag}>Create</button>
            </div>
          </div>

          <div className="card">
            <Link to={`/projects/${task.projectId}/settings`} className="btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Project settings
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
