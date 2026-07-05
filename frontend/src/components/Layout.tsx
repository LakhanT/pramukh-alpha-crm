import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Kanban, Shield, Bell, LogOut, FolderKanban, BarChart3, Settings, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCan } from '../context/PermissionsContext';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useDeviceNotifications } from '../hooks/useDeviceNotifications';

export default function Layout({ children, boardMode }: { children: React.ReactNode; boardMode?: boolean }) {
  const { user, logout } = useAuth();
  const { can } = useCan();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const socketRef = useSocket();

  useDeviceNotifications(socketRef);

  const refreshUnread = useCallback(() => {
    api.getNotifications(true).then((res) => setUnread(res.pagination.total)).catch(() => {});
  }, []);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = () => refreshUnread();
    socket.on('notification:created', handler);
    return () => { socket.off('notification:created', handler); };
  }, [socketRef, refreshUnread]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">Pramukh Alpha</div>
        <div className="sidebar-tagline">Task Management</div>

        <div className="nav-section">Menu</div>
        <NavLink to="/" end><LayoutDashboard size={18} /> Home</NavLink>
        {(can('task', 'read') || user?.systemRole === 'ADMIN') && (
          <NavLink to="/board"><Kanban size={18} /> Tasks &amp; Board</NavLink>
        )}
        {(can('user', 'read', 'global') || user?.systemRole === 'ADMIN') && (
          <NavLink to="/team"><Users size={18} /> Team</NavLink>
        )}
        {(can('task', 'read') || user?.systemRole === 'ADMIN') && (
          <NavLink to="/reports"><BarChart3 size={18} /> Reports</NavLink>
        )}
        <NavLink to="/notifications">
          <Bell size={18} /> Alerts
          {unread > 0 && <span className="notification-dot" />}
        </NavLink>

        {user?.systemRole === 'ADMIN' && (
          <>
            <div className="nav-section">Admin</div>
            <NavLink to="/admin"><Shield size={18} /> Admin settings</NavLink>
          </>
        )}

        <div className="user-card">
          <div className="name">{user?.name}</div>
          <div className="email">{user?.email}</div>
          {user?.personalEmail && user.personalEmail !== user.email && (
            <div className="email-personal">{user.personalEmail}</div>
          )}
          {user?.systemRole === 'ADMIN' && <span className="role-badge">Administrator</span>}
        </div>

        <button className="nav-link" onClick={handleLogout} style={{ marginTop: 12 }}>
          <LogOut size={18} /> Sign out
        </button>
      </aside>
      <main className={`main${boardMode ? ' main--board' : ''}`}>{children}</main>
    </div>
  );
}

export function ProjectSelector({
  projects,
  selected,
  onChange,
}: {
  projects: { id: string; name: string }[];
  selected: string;
  onChange: (id: string) => void;
}) {
  if (projects.length === 0) {
    return <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>No projects yet</span>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
        <FolderKanban size={18} color="var(--text-muted)" />
        <span style={{ fontWeight: 600 }}>Project:</span>
        <select value={selected} onChange={(e) => onChange(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {selected && (
        <NavLink to={`/projects/${selected}/settings`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Settings size={14} /> Project settings
        </NavLink>
      )}
    </div>
  );
}
