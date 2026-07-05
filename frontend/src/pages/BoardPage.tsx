import { useEffect, useState, useCallback } from 'react';
import Layout, { ProjectSelector } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useSocketEvent } from '../hooks/useSocket';
import { RECURRENCE_OPTIONS, computeNextDueDate, formatDateForInput, recurrenceDueHint } from '../utils/recurrence';
import { addSavedView, loadSavedViews, removeSavedView, type BoardView, type SavedView, type TaskScope } from '../utils/savedViews';
import KanbanBoard from '../components/board/KanbanBoard';
import ListView from '../components/board/ListView';
import CalendarView from '../components/board/CalendarView';
import GanttView from '../components/board/GanttView';
import type { Task, TaskStatus, Project } from '../types';

const COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

export default function BoardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<BoardView>('kanban');
  const [scope, setScope] = useState<TaskScope>('mine');
  const [myProjectRole, setMyProjectRole] = useState('Member');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [sortBy, setSortBy] = useState('position');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('MEDIUM');
  const [newDue, setNewDue] = useState('');
  const [newRecurring, setNewRecurring] = useState(false);
  const [newRecurrence, setNewRecurrence] = useState('weekly');
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [members, setMembers] = useState<{ user: { id: string; name: string } }[]>([]);
  const [newProjectName, setNewProjectName] = useState('');

  const canTeam = user?.systemRole === 'ADMIN'
    || ['Admin', 'Manager', 'Team Lead'].includes(myProjectRole)
    || (user?.directReportsCount ?? 0) > 0;
  const canAll = user?.systemRole === 'ADMIN';

  const loadTasks = useCallback(() => {
    if (!projectId) return;
    const params: Record<string, string> = {
      limit: '200',
      scope,
      sortBy,
      sortOrder,
    };
    if (filterStatus) params.status = filterStatus;
    if (filterPriority) params.priority = filterPriority;
    if (filterAssignee) params.assigneeId = filterAssignee;
    api.getTasks(projectId, params).then((res) => setTasks(res.data));
  }, [projectId, scope, sortBy, sortOrder, filterStatus, filterPriority, filterAssignee]);

  useEffect(() => {
    api.getProjects().then((res) => {
      setProjects(res.data);
      if (res.data.length > 0) setProjectId(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (user) setSavedViews(loadSavedViews(user.id));
  }, [user]);

  useEffect(() => {
    if (!projectId || !user) return;
    api.getProjectMembers(projectId).then((res) => {
      setMembers(res.data);
      const me = res.data.find((m) => m.user.id === user.id);
      setMyProjectRole(me?.role.name || 'Member');
    });
  }, [projectId, user]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!canTeam && scope !== 'mine') setScope('mine');
    if (!canAll && scope === 'all') setScope(canTeam ? 'team' : 'mine');
  }, [canTeam, canAll, scope]);

  useSocketEvent(projectId, 'task:created', () => loadTasks());
  useSocketEvent(projectId, 'task:updated', () => loadTasks());
  useSocketEvent(projectId, 'task:deleted', () => loadTasks());

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await api.updateTask(taskId, { status });
    loadTasks();
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const applySavedView = (sv: SavedView) => {
    setView(sv.view);
    setScope(sv.scope);
    setFilterStatus(sv.filters.status || '');
    setFilterPriority(sv.filters.priority || '');
    setFilterAssignee(sv.filters.assigneeId || '');
    setSortBy(sv.filters.sortBy || 'position');
    setSortOrder(sv.filters.sortOrder || 'asc');
  };

  const handleSaveView = () => {
    if (!user || !saveViewName.trim()) return;
    setSavedViews(addSavedView(user.id, {
      name: saveViewName.trim(),
      view,
      scope,
      filters: { status: filterStatus, priority: filterPriority, assigneeId: filterAssignee, sortBy, sortOrder },
    }));
    setSaveViewName('');
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const res = await api.createProject({ name: newProjectName }) as { project: Project };
    const updated = await api.getProjects();
    setProjects(updated.data);
    setProjectId(res.project.id);
    setNewProjectName('');
    setShowCreateProject(false);
  };

  const applyRecurringDuePreview = (recurring: boolean, rule: string) => {
    if (!recurring) return;
    setNewDue(formatDateForInput(computeNextDueDate(rule)));
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await api.createTask(projectId, {
      title: newTitle,
      description: newDesc || undefined,
      priority: newPriority,
      dueDate: newRecurring ? undefined : (newDue ? new Date(newDue).toISOString() : undefined),
      isRecurring: newRecurring,
      recurrenceRule: newRecurring ? newRecurrence : undefined,
    });
    setNewTitle(''); setNewDesc(''); setNewDue('');
    setNewRecurring(false); setNewRecurrence('weekly');
    setShowCreate(false);
    loadTasks();
  };

  const bulkAssign = async () => {
    if (!bulkAssigneeId) return;
    await api.bulkTasks(Array.from(selected), 'assign', { assigneeIds: [bulkAssigneeId] });
    setSelected(new Set()); setShowBulkAssign(false); loadTasks();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const bulkStatus = async (status: TaskStatus) => {
    await api.bulkTasks(Array.from(selected), 'status_change', { status });
    setSelected(new Set()); loadTasks();
  };

  const bulkDelete = async () => {
    if (!confirm('Delete selected tasks?')) return;
    await api.bulkTasks(Array.from(selected), 'delete', {});
    setSelected(new Set()); loadTasks();
  };

  return (
    <Layout boardMode>
      <div className="board-page">
        <div className="page-header board-page-header">
          <div className="page-header-row" style={{ width: '100%' }}>
            <div>
              <h1>Tasks &amp; board</h1>
              <p className="subtitle">Kanban, list, calendar, and Gantt — filtered by your role.</p>
              {projects.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <ProjectSelector projects={projects} selected={projectId} onChange={setProjectId} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn-secondary" onClick={() => setShowCreateProject(true)}>+ New project</button>
              <button className="btn-primary" onClick={() => setShowCreate(true)} disabled={!projectId}>+ New task</button>
            </div>
          </div>
        </div>

        {projects.length === 0 && (
          <div className="card empty-state">
            <h3>Create your first project</h3>
            <p>A project groups related tasks (e.g. &quot;Website redesign&quot; or &quot;Q3 goals&quot;).</p>
            <button className="btn-primary" onClick={() => setShowCreateProject(true)}>Create project</button>
          </div>
        )}

        {projects.length > 0 && (
          <>
            <div className="board-toolbar">
              <div className="scope-tabs">
                <button type="button" className={`scope-tab ${scope === 'mine' ? 'active' : ''}`} onClick={() => setScope('mine')}>My tasks</button>
                {canTeam && (
                  <button type="button" className={`scope-tab ${scope === 'team' ? 'active' : ''}`} onClick={() => setScope('team')}>Team tasks</button>
                )}
                {canAll && (
                  <button type="button" className={`scope-tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All tasks</button>
                )}
              </div>

              <div className="tabs board-view-tabs">
                {([
                  ['kanban', 'Board'],
                  ['list', 'List'],
                  ['calendar', 'Calendar'],
                  ['gantt', 'Gantt'],
                ] as const).map(([v, label]) => (
                  <button key={v} type="button" className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="board-filters card">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
                <option value="">All statuses</option>
                {COLUMNS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ width: 'auto' }}>
                <option value="">All priorities</option>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} style={{ width: 'auto' }}>
                <option value="">All assignees</option>
                {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
              </select>
              <div className="saved-views">
                <select defaultValue="" onChange={(e) => { const sv = savedViews.find((v) => v.id === e.target.value); if (sv) applySavedView(sv); e.target.value = ''; }} style={{ width: 'auto' }}>
                  <option value="">Saved views…</option>
                  {savedViews.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                </select>
                <input placeholder="View name" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} style={{ width: 120 }} />
                <button type="button" className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }} onClick={handleSaveView}>Save</button>
                {savedViews.length > 0 && (
                  <button type="button" className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }} onClick={() => {
                    const id = savedViews[savedViews.length - 1]?.id;
                    if (user && id && confirm('Remove last saved view?')) setSavedViews(removeSavedView(user.id, id));
                  }}>Clear last</button>
                )}
              </div>
            </div>

            {selected.size > 0 && (
              <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span><strong>{selected.size}</strong> selected</span>
                <button className="btn-secondary" onClick={() => bulkStatus('DONE')}>Mark done</button>
                <button className="btn-secondary" onClick={() => bulkStatus('IN_PROGRESS')}>In progress</button>
                <button className="btn-secondary" onClick={() => setShowBulkAssign(true)}>Assign…</button>
                <button className="btn-danger" onClick={bulkDelete}>Delete</button>
              </div>
            )}

            <div className={`board-workspace board-workspace--${view}`}>
              {view === 'kanban' && (
                <KanbanBoard
                  columns={COLUMNS}
                  tasks={tasks}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onStatusChange={handleStatusChange}
                />
              )}
              {view === 'list' && (
                <ListView tasks={tasks} selected={selected} onToggleSelect={toggleSelect} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              )}
              {view === 'calendar' && <CalendarView tasks={tasks} />}
              {view === 'gantt' && <GanttView tasks={tasks} />}
            </div>
          </>
        )}
      </div>

      {/* modals unchanged structure */}
      {showCreateProject && (
        <div className="modal-overlay" onClick={() => setShowCreateProject(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>New project</h3>
            <div className="form-group">
              <label>Project name</label>
              <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowCreateProject(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateProject}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>New task</h3>
            <div className="form-group"><label>Title *</label><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus /></div>
            <div className="form-group"><label>Description</label><textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} /></div>
            <div className="grid-2">
              <div className="form-group"><label>Priority</label>
                <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                </select>
              </div>
              <div className="form-group">
                <label>Due date{newRecurring ? ' (auto)' : ''}</label>
                <input
                  type="date"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  readOnly={newRecurring}
                  style={newRecurring ? { background: 'var(--bg)', color: 'var(--text-muted)' } : undefined}
                />
              </div>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={newRecurring}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNewRecurring(checked);
                  applyRecurringDuePreview(checked, newRecurrence);
                }}
              />
              <span>Recurring task</span>
            </label>
            {newRecurring && (
              <div className="form-group">
                <label>Repeat</label>
                <select
                  value={newRecurrence}
                  onChange={(e) => {
                    setNewRecurrence(e.target.value);
                    applyRecurringDuePreview(true, e.target.value);
                  }}
                >
                  {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                  {recurrenceDueHint(newRecurrence)}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate}>Create task</button>
            </div>
          </div>
        </div>
      )}

      {showBulkAssign && (
        <div className="modal-overlay" onClick={() => setShowBulkAssign(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Bulk assign</h3>
            <select value={bulkAssigneeId} onChange={(e) => setBulkAssigneeId(e.target.value)}>
              <option value="">Select member…</option>
              {members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setShowBulkAssign(false)}>Cancel</button>
              <button className="btn-primary" onClick={bulkAssign}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
