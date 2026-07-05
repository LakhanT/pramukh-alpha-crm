import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../services/api';
import type { Project } from '../types';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [completion, setCompletion] = useState<{ userId: string; name: string; total: number; done: number; completionRate: number }[]>([]);
  const [overdue, setOverdue] = useState<unknown[]>([]);
  const [workload, setWorkload] = useState<{ name: string; taskCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getProjects(),
      api.getCompletionReport(),
      api.getOverdueReport(),
      api.getWorkload(),
    ])
      .then(([projRes, compRes, overdueRes, workloadRes]) => {
        setProjects(projRes.data);
        setCompletion((compRes as { data: typeof completion }).data);
        setOverdue((overdueRes as { data: unknown[] }).data);
        setWorkload((workloadRes as { data: typeof workload }).data);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalTasks = completion.reduce((s, c) => s + c.total, 0);
  const doneTasks = completion.reduce((s, c) => s + c.done, 0);
  const rate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  if (loading) {
    return (
      <Layout>
        <p className="loading-text">Loading your overview…</p>
      </Layout>
    );
  }

  const isEmpty = projects.length === 0 && totalTasks === 0;

  return (
    <Layout>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Home</h1>
            <p className="subtitle">
              See how your team is doing — projects, tasks completed, and what needs attention.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link to="/reports" className="btn-secondary" style={{ textDecoration: 'none' }}>Reports</Link>
            <Link to="/board" className="btn-primary" style={{ textDecoration: 'none' }}>Go to tasks</Link>
          </div>
        </div>
      </div>

      {isEmpty && (
        <div className="card empty-state">
          <h3>Welcome! You&apos;re all set to start.</h3>
          <p>
            Create a project from the task board, then add tasks and assign them to your team.
          </p>
          <Link to="/board" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Open task board
          </Link>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card stat-card">
          <div className="value">{projects.length}</div>
          <div className="label">Projects</div>
        </div>
        <div className="card stat-card">
          <div className="value">{totalTasks}</div>
          <div className="label">Total tasks</div>
        </div>
        <div className="card stat-card">
          <div className="value">{rate}%</div>
          <div className="label">Tasks completed</div>
        </div>
        <div className="card stat-card">
          <div className="value" style={{ color: overdue.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {overdue.length}
          </div>
          <div className="label">Overdue tasks</div>
        </div>
      </div>

      {!isEmpty && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Who finished what</div>
            <div className="card-desc">How many tasks each person has completed</div>
            {completion.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No assigned tasks yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Person</th><th>Done</th><th>Total</th><th>Rate</th></tr>
                </thead>
                <tbody>
                  {completion.map((c) => (
                    <tr key={c.userId}>
                      <td>{c.name}</td>
                      <td>{c.done}</td>
                      <td>{c.total}</td>
                      <td>{c.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-title">Current workload</div>
            <div className="card-desc">Active tasks assigned to each person</div>
            {workload.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No active assignments.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Person</th><th>Active tasks</th></tr>
                </thead>
                <tbody>
                  {workload.map((w) => (
                    <tr key={w.name}>
                      <td>{w.name}</td>
                      <td>{w.taskCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="card" style={{ marginTop: 20, borderColor: '#fecaca' }}>
          <div className="card-title" style={{ color: 'var(--danger)' }}>Needs attention — overdue</div>
          <div className="card-desc">These tasks are past their due date</div>
          <table className="table">
            <thead>
              <tr><th>Task</th><th>Project</th><th>Due date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(overdue as { id: string; title: string; project: { name: string }; dueDate: string; status: string }[]).map((t) => (
                <tr key={t.id}>
                  <td><Link to={`/tasks/${t.id}`}>{t.title}</Link></td>
                  <td>{t.project?.name}</td>
                  <td>{new Date(t.dueDate).toLocaleDateString()}</td>
                  <td><span className={`badge badge-${t.status.toLowerCase()}`}>{t.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
