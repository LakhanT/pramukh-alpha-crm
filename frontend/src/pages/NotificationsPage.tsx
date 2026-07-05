import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Notification } from '../types';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadAlerts = () => {
    api.getNotifications().then((res) => setNotifications(res.data));
  };

  useEffect(() => { loadAlerts(); }, []);

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    loadAlerts();
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    loadAlerts();
  };

  return (
    <Layout>
      <div className="page-header">
        <h1>My alerts</h1>
        <p className="subtitle">Due dates, overdue tasks, mentions, status changes, and reassignments appear here.</p>
      </div>

      {user?.systemRole !== 'ADMIN' && (
        <div className="help-box" style={{ marginBottom: 20 }}>
          Notification preferences (email, SMS, push, digest) are configured by your admin in{' '}
          <strong>Admin → Notifications</strong>. Contact your administrator to change how you receive alerts.
        </div>
      )}

      {user?.systemRole === 'ADMIN' && (
        <div className="help-box" style={{ marginBottom: 20 }}>
          Configure organization and per-user notification rules in{' '}
          <Link to="/admin">Admin → Notifications</Link> (due dates, overdue, escalation, mentions, digests).
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn-secondary" onClick={markAllRead}>Mark all as read</button>
        </div>
        {notifications.length === 0 ? (
          <div className="empty-state"><p>No notifications yet.</p></div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', opacity: n.isRead ? 0.65 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge" style={{ marginRight: 8 }}>{n.type.replace(/_/g, ' ')}</span>
                {n.message}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              {!n.isRead && <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => markRead(n.id)}>Mark read</button>}
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
