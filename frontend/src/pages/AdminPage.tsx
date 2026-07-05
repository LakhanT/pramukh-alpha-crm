import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, type CreateMemberInput, type MemberRecord, type PendingInvite } from '../services/api';
import type { Role } from '../types';

interface SystemSettings {
  dueDateEmail: boolean;
  dueDatePush: boolean;
  dueDateSms: boolean;
  dueDateInApp: boolean;
  overdueEmail: boolean;
  overduePush: boolean;
  overdueSms: boolean;
  overdueInApp: boolean;
  statusChangeEnabled: boolean;
  mentionsEnabled: boolean;
  reassignmentEnabled: boolean;
  escalationEnabled: boolean;
  defaultEscalationDays: number;
  digestEnabled: boolean;
  digestFrequency: string;
}

interface UserWithPrefs {
  id: string;
  name: string;
  email: string;
  notificationPrefs?: Record<string, boolean | number | string> | null;
}

const defaultSystem: SystemSettings = {
  dueDateEmail: true,
  dueDatePush: true,
  dueDateSms: false,
  dueDateInApp: true,
  overdueEmail: true,
  overduePush: true,
  overdueSms: false,
  overdueInApp: true,
  statusChangeEnabled: true,
  mentionsEnabled: true,
  reassignmentEnabled: true,
  escalationEnabled: true,
  defaultEscalationDays: 3,
  digestEnabled: true,
  digestFrequency: 'WEEKLY',
};

export default function AdminPage() {
  const [tab, setTab] = useState<'members' | 'roles' | 'audit' | 'notifications'>('members');
  const [auditView, setAuditView] = useState<'trail' | 'user-actions' | 'deleted'>('trail');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<{ id: string; resource: string; action: string; scope: string }[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [auditLog, setAuditLog] = useState<unknown[]>([]);
  const [userActions, setUserActions] = useState<unknown[]>([]);
  const [deletedTasks, setDeletedTasks] = useState<unknown[]>([]);
  const [auditFilter, setAuditFilter] = useState({ entityType: '', action: '' });
  const [newRoleName, setNewRoleName] = useState('');

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [memberForm, setMemberForm] = useState<CreateMemberInput>({ name: '', email: '', personalEmail: '', systemRole: 'MEMBER' });
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', department: '', systemRole: 'MEMBER' });
  const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateMemberInput & { status: string }>>({});
  const [deleteReassignId, setDeleteReassignId] = useState('');
  const [memberMsg, setMemberMsg] = useState('');

  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystem);
  const [teamMembers, setTeamMembers] = useState<UserWithPrefs[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberPrefs, setMemberPrefs] = useState<Record<string, boolean | number | string>>({});

  const reload = () => {
    api.getRoles().then((res) => setRoles(res.data));
    api.getPermissions().then((res) => setPermissions(res.data));
    api.getAuditLog(1, {
      entityType: auditFilter.entityType || undefined,
      action: auditFilter.action || undefined,
    }).then((res) => setAuditLog(res.data));
    api.getUserActionLogs().then((res) => setUserActions(res.data));
    api.getDeletedTasks().then((res) => setDeletedTasks(res.data));
    api.getAdminNotificationSettings().then((res) => setSystemSettings(res.settings as SystemSettings));
    api.getAdminUsers().then((res) => setTeamMembers(res.data as UserWithPrefs[]));
    api.getMembers().then((res) => setMembers(res.data));
    api.getPendingInvites().then((res) => setInvites(res.data));
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (tab !== 'audit') return;
    api.getAuditLog(1, {
      entityType: auditFilter.entityType || undefined,
      action: auditFilter.action || undefined,
    }).then((res) => setAuditLog(res.data));
  }, [auditFilter, tab]);

  useEffect(() => {
    if (!selectedMemberId) return;
    const member = teamMembers.find((m) => m.id === selectedMemberId);
    if (member?.notificationPrefs) {
      setMemberPrefs(member.notificationPrefs as Record<string, boolean | number | string>);
    } else {
      api.getAdminUserNotificationPrefs(selectedMemberId).then((res) => {
        setMemberPrefs((res.preferences || {}) as Record<string, boolean | number | string>);
      });
    }
  }, [selectedMemberId, teamMembers]);

  const openRole = (role: Role) => {
    setSelectedRole(role);
    setSelectedPerms(new Set(role.permissions.map((p) => p.permission.id)));
  };

  const togglePerm = (permId: string) => {
    const next = new Set(selectedPerms);
    next.has(permId) ? next.delete(permId) : next.add(permId);
    setSelectedPerms(next);
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    await api.updateRolePermissions(selectedRole.id, Array.from(selectedPerms));
    reload();
    setSelectedRole(null);
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    await api.createRole(newRoleName);
    setNewRoleName('');
    reload();
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.isSystem || !confirm(`Delete role "${role.name}"?`)) return;
    await api.deleteRole(role.id);
    reload();
  };

  const saveSystemSettings = async () => {
    await api.updateAdminNotificationSettings(systemSettings);
    alert('Organization notification settings saved.');
  };

  const handleRestoreDeleted = async (taskId: string, title: string) => {
    if (!confirm(`Restore deleted task "${title}"?`)) return;
    await api.restoreDeletedTask(taskId);
    reload();
    alert('Task restored.');
  };

  const saveMemberPrefs = async () => {
    if (!selectedMemberId) return;
    await api.updateAdminUserNotificationPrefs(selectedMemberId, memberPrefs);
    alert('User notification preferences saved.');
    reload();
  };

  const handleCreateMember = async () => {
    setMemberMsg('');
    try {
      await api.createMember(memberForm);
      setMemberForm({ name: '', email: '', personalEmail: '', systemRole: 'MEMBER', reportsToId: null });
      setMemberMsg('Member created.');
      reload();
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleInvite = async () => {
    setMemberMsg('');
    try {
      await api.inviteMember(inviteForm);
      setInviteForm({ email: '', name: '', department: '', systemRole: 'MEMBER' });
      setMemberMsg('Invite sent.');
      reload();
    } catch (e) {
      setMemberMsg(e instanceof Error ? e.message : 'Failed');
    }
  };

  const openEditMember = (m: MemberRecord) => {
    setEditingMember(m);
    setEditForm({
      name: m.name,
      email: m.email,
      personalEmail: m.personalEmail || '',
      department: m.department || '',
      jobTitle: m.jobTitle || '',
      avatarUrl: m.avatarUrl || '',
      systemRole: m.systemRole,
      status: m.status,
      reportsToId: m.reportsToId || null,
    });
    setDeleteReassignId('');
  };

  const saveEditMember = async () => {
    if (!editingMember) return;
    await api.updateMember(editingMember.id, editForm);
    setEditingMember(null);
    reload();
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this member? They will not be able to sign in.')) return;
    await api.deactivateMember(id);
    reload();
  };

  const handleDeleteMember = async () => {
    if (!editingMember || !deleteReassignId) return;
    if (!confirm(`Delete ${editingMember.name} and reassign their tasks?`)) return;
    await api.deleteMember(editingMember.id, deleteReassignId);
    setEditingMember(null);
    reload();
  };

  const permMatrix = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    if (!acc[p.resource]) acc[p.resource] = [];
    acc[p.resource].push(p);
    return acc;
  }, {});

  const ChannelRow = ({
    label,
    emailKey,
    pushKey,
    smsKey,
    inAppKey,
  }: {
    label: string;
    emailKey: keyof SystemSettings;
    pushKey: keyof SystemSettings;
    smsKey: keyof SystemSettings;
    inAppKey: keyof SystemSettings;
  }) => (
    <tr>
      <td><strong>{label}</strong></td>
      <td><input type="checkbox" checked={!!systemSettings[emailKey]} onChange={(e) => setSystemSettings({ ...systemSettings, [emailKey]: e.target.checked })} /></td>
      <td><input type="checkbox" checked={!!systemSettings[pushKey]} onChange={(e) => setSystemSettings({ ...systemSettings, [pushKey]: e.target.checked })} /></td>
      <td><input type="checkbox" checked={!!systemSettings[smsKey]} onChange={(e) => setSystemSettings({ ...systemSettings, [smsKey]: e.target.checked })} /></td>
      <td><input type="checkbox" checked={!!systemSettings[inAppKey]} onChange={(e) => setSystemSettings({ ...systemSettings, [inAppKey]: e.target.checked })} /></td>
    </tr>
  );

  return (
    <Layout>
      <div className="page-header">
        <h1>Admin — Pramukh Alpha</h1>
        <p className="subtitle">Manage members, roles, permissions, compliance audit trail, and notification rules.</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Members</button>
        <button className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>Roles &amp; Permissions</button>
        <button className={`tab ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}>Notifications</button>
        <button className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>History &amp; Audit</button>
      </div>

      {tab === 'members' && (
        <>
          {memberMsg && <p className="loading-text" style={{ marginBottom: 12 }}>{memberMsg}</p>}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-title">Add member</div>
              <div className="card-desc">Create a profile with name, role, department, and optional avatar URL.</div>
              <div className="form-group">
                <label>Name</label>
                <input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Company email (login)</label>
                <input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} placeholder="name@pramukhalpha.com" />
              </div>
              <div className="form-group">
                <label>Personal email (notifications)</label>
                <input type="email" value={memberForm.personalEmail || ''} onChange={(e) => setMemberForm({ ...memberForm, personalEmail: e.target.value })} placeholder="you@gmail.com" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Department</label>
                  <input value={memberForm.department || ''} onChange={(e) => setMemberForm({ ...memberForm, department: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Job title</label>
                  <input value={memberForm.jobTitle || ''} onChange={(e) => setMemberForm({ ...memberForm, jobTitle: e.target.value })} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>System role</label>
                  <select value={memberForm.systemRole || 'MEMBER'} onChange={(e) => setMemberForm({ ...memberForm, systemRole: e.target.value })}>
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Avatar URL</label>
                  <input value={memberForm.avatarUrl || ''} onChange={(e) => setMemberForm({ ...memberForm, avatarUrl: e.target.value })} placeholder="https://…" />
                </div>
              </div>
              <div className="form-group">
                <label>Password (optional)</label>
                <input type="password" value={memberForm.password || ''} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} placeholder="Default: Welcome@123" />
              </div>
              <div className="form-group">
                <label>Reports to</label>
                <select
                  value={memberForm.reportsToId || ''}
                  onChange={(e) => setMemberForm({ ...memberForm, reportsToId: e.target.value || null })}
                >
                  <option value="">No manager (top level)</option>
                  {members.filter((m) => m.status === 'ACTIVE').map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.jobTitle ? ` — ${m.jobTitle}` : ''}</option>
                  ))}
                </select>
              </div>
              <button className="btn-primary" onClick={handleCreateMember}>Create member</button>
            </div>

            <div className="card">
              <div className="card-title">Invite by email</div>
              <div className="card-desc">Sends an invite link valid for 7 days.</div>
              <div className="form-group">
                <label>Company email (invite login)</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="name@pramukhalpha.com" />
              </div>
              <div className="form-group">
                <label>Name (optional)</label>
                <input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Department</label>
                  <input value={inviteForm.department} onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>System role</label>
                  <select value={inviteForm.systemRole} onChange={(e) => setInviteForm({ ...inviteForm, systemRole: e.target.value })}>
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <button className="btn-primary" onClick={handleInvite}>Send invite</button>

              {invites.length > 0 && (
                <>
                  <p style={{ marginTop: 20, fontSize: 13, fontWeight: 600 }}>Pending invites</p>
                  <table className="table" style={{ marginTop: 8 }}>
                    <thead><tr><th>Email</th><th>Expires</th><th>By</th></tr></thead>
                    <tbody>
                      {invites.map((inv) => (
                        <tr key={inv.id}>
                          <td>{inv.email}</td>
                          <td>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                          <td>{inv.invitedBy.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">All members</div>
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Company email</th><th>Personal email</th><th>Department</th><th>Reports to</th><th>Role</th><th>Status</th><th>Tasks</th><th></th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.avatarUrl ? <img src={m.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' }} /> : null}
                      {m.name}
                    </td>
                    <td>{m.email}</td>
                    <td>{m.personalEmail || '—'}</td>
                    <td>{m.department || '—'}</td>
                    <td>{m.reportsTo ? m.reportsTo.name : '—'}</td>
                    <td>{m.systemRole}</td>
                    <td><span className={`badge ${m.status === 'ACTIVE' ? '' : 'badge-muted'}`}>{m.status}</span></td>
                    <td>{m._count.taskAssignments}</td>
                    <td>
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEditMember(m)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingMember && (
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ marginBottom: 16 }}>Edit: {editingMember.name}</h3>
              <div className="grid-2">
                <div className="form-group">
                  <label>Name</label>
                  <input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Company email (login)</label>
                  <input value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Personal email (notifications)</label>
                  <input type="email" value={editForm.personalEmail || ''} onChange={(e) => setEditForm({ ...editForm, personalEmail: e.target.value })} placeholder="you@gmail.com" />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input value={editForm.department || ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Job title</label>
                  <input value={editForm.jobTitle || ''} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Avatar URL</label>
                  <input value={editForm.avatarUrl || ''} onChange={(e) => setEditForm({ ...editForm, avatarUrl: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>System role</label>
                  <select value={editForm.systemRole || 'MEMBER'} onChange={(e) => setEditForm({ ...editForm, systemRole: e.target.value })}>
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={editForm.status || 'ACTIVE'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>New password (optional)</label>
                  <input type="password" value={editForm.password || ''} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Reports to</label>
                  <select
                    value={editForm.reportsToId || ''}
                    onChange={(e) => setEditForm({ ...editForm, reportsToId: e.target.value || null })}
                  >
                    <option value="">No manager (top level)</option>
                    {members.filter((m) => m.status === 'ACTIVE' && m.id !== editingMember.id).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.jobTitle ? ` — ${m.jobTitle}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={saveEditMember}>Save changes</button>
                {editingMember.status === 'ACTIVE' && (
                  <button className="btn-secondary" onClick={() => handleDeactivate(editingMember.id)}>Deactivate</button>
                )}
                <button className="btn-secondary" onClick={() => setEditingMember(null)}>Cancel</button>
              </div>

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>Delete member — tasks will be reassigned, not orphaned.</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Reassign tasks to</label>
                    <select value={deleteReassignId} onChange={(e) => setDeleteReassignId(e.target.value)} style={{ minWidth: 220 }}>
                      <option value="">Select member…</option>
                      {members.filter((m) => m.id !== editingMember.id && m.status === 'ACTIVE').map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-danger" disabled={!deleteReassignId} onClick={handleDeleteMember}>Delete member</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'roles' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Roles</div>
            <div className="card-desc">Each role has a set of permissions (create tasks, assign, delete, etc.)</div>
            <table className="table">
              <thead><tr><th>Name</th><th>Permissions</th><th>Actions</th></tr></thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td>{role.name} {role.isSystem && <span className="badge">built-in</span>}</td>
                    <td>{role.permissions.length}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-secondary" onClick={() => openRole(role)}>Edit permissions</button>
                      {!role.isSystem && <button className="btn-danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleDeleteRole(role)}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input placeholder="New role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} style={{ maxWidth: 240 }} />
              <button className="btn-primary" onClick={handleCreateRole}>Add role</button>
            </div>
          </div>

          {selectedRole && (
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Permissions matrix: {selectedRole.name}</h3>
              <p className="card-desc" style={{ marginBottom: 16 }}>Toggle capabilities for this role without code changes.</p>
              <table className="table perm-matrix">
                <thead>
                  <tr><th>Resource</th><th>Action</th><th>Scope</th><th>Enabled</th></tr>
                </thead>
                <tbody>
                  {Object.entries(permMatrix).map(([resource, perms]) =>
                    perms.map((p, i) => (
                      <tr key={p.id}>
                        {i === 0 ? <td rowSpan={perms.length}><strong>{resource}</strong></td> : null}
                        <td>{p.action}</td>
                        <td>{p.scope}</td>
                        <td>
                          <input type="checkbox" checked={selectedPerms.has(p.id)} onChange={() => togglePerm(p.id)} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-primary" onClick={savePermissions}>Save</button>
                <button className="btn-secondary" onClick={() => setSelectedRole(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Organization notification channels</div>
            <div className="card-desc">Default channels for Pramukh Alpha. Users can override individually below.</div>
            <table className="table">
              <thead>
                <tr><th>Alert type</th><th>Email</th><th>Push</th><th>SMS</th><th>In-app</th></tr>
              </thead>
              <tbody>
                <ChannelRow label="Due date reminders" emailKey="dueDateEmail" pushKey="dueDatePush" smsKey="dueDateSms" inAppKey="dueDateInApp" />
                <ChannelRow label="Overdue task alerts" emailKey="overdueEmail" pushKey="overduePush" smsKey="overdueSms" inAppKey="overdueInApp" />
              </tbody>
            </table>

            <div className="grid-2" style={{ marginTop: 20 }}>
              <label className="checkbox-row">
                <input type="checkbox" checked={systemSettings.statusChangeEnabled} onChange={(e) => setSystemSettings({ ...systemSettings, statusChangeEnabled: e.target.checked })} />
                Status change notifications
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={systemSettings.mentionsEnabled} onChange={(e) => setSystemSettings({ ...systemSettings, mentionsEnabled: e.target.checked })} />
                @mention notifications in comments
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={systemSettings.reassignmentEnabled} onChange={(e) => setSystemSettings({ ...systemSettings, reassignmentEnabled: e.target.checked })} />
                Task reassignment notifications
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={systemSettings.escalationEnabled} onChange={(e) => setSystemSettings({ ...systemSettings, escalationEnabled: e.target.checked })} />
                Escalation to manager when overdue
              </label>
            </div>

            <div className="grid-2" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label>Default escalation after (days overdue)</label>
                <input type="number" min={1} max={30} value={systemSettings.defaultEscalationDays} onChange={(e) => setSystemSettings({ ...systemSettings, defaultEscalationDays: parseInt(e.target.value, 10) })} style={{ width: 120 }} />
              </div>
              <div className="form-group">
                <label>Digest emails (daily/weekly summary)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label className="checkbox-row" style={{ margin: 0 }}>
                    <input type="checkbox" checked={systemSettings.digestEnabled} onChange={(e) => setSystemSettings({ ...systemSettings, digestEnabled: e.target.checked })} />
                    Enabled
                  </label>
                  <select value={systemSettings.digestFrequency} onChange={(e) => setSystemSettings({ ...systemSettings, digestFrequency: e.target.value })} style={{ width: 'auto' }}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </div>
              </div>
            </div>

            <button className="btn-primary" style={{ marginTop: 16 }} onClick={saveSystemSettings}>Save organization settings</button>
          </div>

          <div className="card">
            <div className="card-title">Per-user notification preferences</div>
            <div className="card-desc">Configure how each Pramukh Alpha team member receives alerts.</div>

            <div className="form-group">
              <label>Select team member</label>
              <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} style={{ maxWidth: 400 }}>
                <option value="">Choose a user…</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </select>
            </div>

            {selectedMemberId && (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Channels</p>
                <div className="grid-2">
                  {[
                    { key: 'emailEnabled', label: 'Email' },
                    { key: 'pushEnabled', label: 'Push notifications' },
                    { key: 'smsEnabled', label: 'SMS' },
                    { key: 'inAppEnabled', label: 'In-app alerts' },
                  ].map((f) => (
                    <label key={f.key} className="checkbox-row">
                      <input type="checkbox" checked={!!memberPrefs[f.key]} onChange={(e) => setMemberPrefs({ ...memberPrefs, [f.key]: e.target.checked })} />
                      {f.label}
                    </label>
                  ))}
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '16px 0 8px' }}>Alert types</p>
                <div className="grid-2">
                  {[
                    { key: 'dueDateReminder', label: 'Due date reminders' },
                    { key: 'overdueAlert', label: 'Overdue task alerts' },
                    { key: 'statusChange', label: 'Status changes' },
                    { key: 'mentions', label: '@mentions in comments' },
                    { key: 'reassignment', label: 'Task reassignment' },
                  ].map((f) => (
                    <label key={f.key} className="checkbox-row">
                      <input type="checkbox" checked={!!memberPrefs[f.key]} onChange={(e) => setMemberPrefs({ ...memberPrefs, [f.key]: e.target.checked })} />
                      {f.label}
                    </label>
                  ))}
                </div>

                <div className="grid-2" style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label>Personal escalation days (overdue → notify manager)</label>
                    <input type="number" min={1} max={30} value={Number(memberPrefs.escalationDays || 3)} onChange={(e) => setMemberPrefs({ ...memberPrefs, escalationDays: parseInt(e.target.value, 10) })} style={{ width: 120 }} />
                  </div>
                  <div className="form-group">
                    <label>Digest frequency</label>
                    <select value={String(memberPrefs.digestFrequency || 'WEEKLY')} onChange={(e) => setMemberPrefs({ ...memberPrefs, digestFrequency: e.target.value })}>
                      <option value="NONE">None</option>
                      <option value="DAILY">Daily summary</option>
                      <option value="WEEKLY">Weekly summary</option>
                    </select>
                  </div>
                </div>

                <label className="checkbox-row" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={!!memberPrefs.digestEnabled} onChange={(e) => setMemberPrefs({ ...memberPrefs, digestEnabled: e.target.checked })} />
                  Receive digest emails
                </label>

                <button className="btn-primary" style={{ marginTop: 16 }} onClick={saveMemberPrefs}>Save user preferences</button>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'audit' && (
        <>
          <div className="tabs" style={{ marginBottom: 16 }}>
            <button className={`tab ${auditView === 'trail' ? 'active' : ''}`} onClick={() => setAuditView('trail')}>Full audit trail</button>
            <button className={`tab ${auditView === 'user-actions' ? 'active' : ''}`} onClick={() => setAuditView('user-actions')}>User action logs</button>
            <button className={`tab ${auditView === 'deleted' ? 'active' : ''}`} onClick={() => setAuditView('deleted')}>Deleted tasks (restore)</button>
          </div>

          {auditView === 'trail' && (
            <div className="card">
              <div className="card-title">Compliance audit trail</div>
              <div className="card-desc">Every entity change — tasks, projects, comments — who changed what and when.</div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label>Entity type</label>
                  <select value={auditFilter.entityType} onChange={(e) => setAuditFilter({ ...auditFilter, entityType: e.target.value })}>
                    <option value="">All</option>
                    <option value="task">Task</option>
                    <option value="project">Project</option>
                    <option value="comment">Comment</option>
                    <option value="user">User</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Action</label>
                  <select value={auditFilter.action} onChange={(e) => setAuditFilter({ ...auditFilter, action: e.target.value })}>
                    <option value="">All</option>
                    <option value="created">Created</option>
                    <option value="updated">Updated</option>
                    <option value="status_changed">Status changed</option>
                    <option value="assigned">Assigned</option>
                    <option value="deleted">Deleted</option>
                    <option value="restored">Restored</option>
                  </select>
                </div>
              </div>
              <table className="table">
                <thead>
                  <tr><th>Time</th><th>User</th><th>Entity</th><th>Action</th><th>Change</th></tr>
                </thead>
                <tbody>
                  {(auditLog as { id: string; createdAt: string; changedBy: { name: string }; entityType: string; entityId: string; action: string; field?: string; oldValue?: string; newValue?: string }[]).map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.createdAt).toLocaleString()}</td>
                      <td>{a.changedBy.name}</td>
                      <td>{a.entityType}/{a.entityId.slice(0, 8)}</td>
                      <td>{a.action.replace(/_/g, ' ')}</td>
                      <td>{a.field ? `${a.field}: ${a.oldValue ?? '—'} → ${a.newValue ?? '—'}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {auditView === 'user-actions' && (
            <div className="card">
              <div className="card-title">User action logs</div>
              <div className="card-desc">Login history, permission changes, notification updates, and task deletions.</div>
              <table className="table">
                <thead>
                  <tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {(userActions as { id: string; createdAt: string; user?: { name: string; email: string }; action: string; entityType?: string; entityId?: string; details?: Record<string, unknown> }[]).map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.createdAt).toLocaleString()}</td>
                      <td>{a.user?.name || '—'}{a.user?.email ? ` (${a.user.email})` : ''}</td>
                      <td>{a.action.replace(/_/g, ' ')}</td>
                      <td>{a.entityType ? `${a.entityType}/${a.entityId?.slice(0, 8) ?? ''}` : '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.details ? JSON.stringify(a.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {auditView === 'deleted' && (
            <div className="card">
              <div className="card-title">Restore deleted tasks</div>
              <div className="card-desc">Soft-deleted tasks can be recovered within 30 days. After that they are permanently removed.</div>
              <table className="table">
                <thead>
                  <tr><th>Task</th><th>Project</th><th>Deleted by</th><th>Deleted at</th><th></th></tr>
                </thead>
                <tbody>
                  {(deletedTasks as { id: string; title: string; deletedAt: string; project: { name: string }; deletedBy?: { name: string } }[]).map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>{t.project.name}</td>
                      <td>{t.deletedBy?.name || '—'}</td>
                      <td>{new Date(t.deletedAt).toLocaleString()}</td>
                      <td>
                        <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleRestoreDeleted(t.id, t.title)}>
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {deletedTasks.length === 0 && <p className="loading-text">No deleted tasks in the restore window.</p>}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
