import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../services/api';
import type { Role } from '../types';

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<{ name: string; description?: string; members: { id: string; user: { id: string; name: string; email: string }; role: { id: string; name: string } }[] } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [addRoleId, setAddRoleId] = useState('');

  const load = () => {
    if (!id) return;
    api.getProject(id).then((res) => setProject(res.project));
    api.getRoles().then((res) => setRoles(res.data));
    api.getAdminUsers().then((res) => setUsers(res.data));
  };

  useEffect(() => { load(); }, [id]);

  const handleAddMember = async () => {
    if (!id || !addUserId || !addRoleId) return;
    await api.addProjectMember(id, addUserId, addRoleId);
    setAddUserId('');
    load();
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
    if (!id) return;
    await api.updateProjectMemberRole(id, userId, roleId);
    load();
  };

  const handleRemove = async (userId: string) => {
    if (!id || !confirm('Remove this member from the project?')) return;
    await api.removeProjectMember(id, userId);
    load();
  };

  if (!project) return <Layout><p className="loading-text">Loading…</p></Layout>;

  const existingIds = new Set(project.members.map((m) => m.user.id));

  return (
    <Layout>
      <Link to="/board" style={{ fontSize: 14, color: 'var(--text-muted)' }}>← Back to tasks</Link>
      <div className="page-header" style={{ marginTop: 16 }}>
        <h1>{project.name} — Settings</h1>
        <p className="subtitle">Manage who has access to this project and what role they have.</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Team members &amp; roles</div>
        <div className="card-desc">Each person can have a different role in this project (Admin, Manager, Member, etc.)</div>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role in project</th><th></th></tr></thead>
          <tbody>
            {project.members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.name}</td>
                <td>{m.user.email}</td>
                <td>
                  <select value={m.role.id} onChange={(e) => handleRoleChange(m.user.id, e.target.value)}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => handleRemove(m.user.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
          <div className="card-title" style={{ fontSize: 14 }}>Add team member</div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
              <option value="">Select user…</option>
              {users.filter((u) => !existingIds.has(u.id)).map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            <select value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)}>
              <option value="">Select role…</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={handleAddMember} disabled={!addUserId || !addRoleId}>
            Add member
          </button>
        </div>
      </div>
    </Layout>
  );
}
