import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout, { ProjectSelector } from '../components/Layout';
import { api } from '../services/api';
import type { Project } from '../types';

export default function ReportsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [completion, setCompletion] = useState<{ userId: string; name: string; total: number; done: number; completionRate: number }[]>([]);
  const [overdue, setOverdue] = useState<unknown[]>([]);
  const [workload, setWorkload] = useState<{ name: string; email: string; taskCount: number; tasks: { title: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const pid = projectId || undefined;
    Promise.all([
      api.getCompletionReport(pid),
      api.getOverdueReport(pid),
      api.getWorkload(pid),
    ])
      .then(([c, o, w]) => {
        setCompletion(c.data as typeof completion);
        setOverdue(o.data);
        setWorkload(w.data as typeof workload);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.getProjects().then((res) => {
      setProjects(res.data);
      if (res.data.length > 0) setProjectId(res.data[0].id);
    });
  }, []);

  useEffect(() => { load(); }, [projectId]);

  return (
    <Layout>
      <div className="page-header">
        <div className="page-header-row" style={{ width: '100%' }}>
          <div>
            <h1>Reports</h1>
            <p className="subtitle">Team performance, overdue work, and workload — export as CSV or print to PDF.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => api.downloadExport('completion', 'csv', projectId || undefined)}>Export completion CSV</button>
            <button className="btn-secondary" onClick={() => api.downloadExport('overdue', 'csv', projectId || undefined)}>Export overdue CSV</button>
            <button className="btn-secondary" onClick={() => api.downloadExport('overdue', 'html', projectId || undefined)}>Print overdue PDF</button>
            <button className="btn-secondary" onClick={() => api.downloadExport('completion', 'html', projectId || undefined)}>Print completion PDF</button>
          </div>
        </div>
      </div>

      {projects.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ProjectSelector projects={projects} selected={projectId} onChange={setProjectId} />
        </div>
      )}

      {loading ? (
        <p className="loading-text">Loading reports…</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Workload per person</div>
            <div className="card-desc">How many active tasks each team member has right now</div>
            <table className="table">
              <thead><tr><th>Person</th><th>Email</th><th>Active tasks</th><th>Task list</th></tr></thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.email}>
                    <td>{w.name}</td>
                    <td>{w.email}</td>
                    <td><strong>{w.taskCount}</strong></td>
                    <td style={{ fontSize: 13 }}>{w.tasks?.map((t) => t.title).join(', ') || '—'}</td>
                  </tr>
                ))}
                {workload.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No active assignments</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-title">Completion rate</div>
              <table className="table">
                <thead><tr><th>Person</th><th>Done</th><th>Total</th><th>Rate</th></tr></thead>
                <tbody>
                  {completion.map((c) => (
                    <tr key={c.userId}><td>{c.name}</td><td>{c.done}</td><td>{c.total}</td><td>{c.completionRate}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="card-title" style={{ color: 'var(--danger)' }}>Overdue tasks</div>
              <table className="table">
                <thead><tr><th>Task</th><th>Due</th></tr></thead>
                <tbody>
                  {(overdue as { id: string; title: string; dueDate: string }[]).map((t) => (
                    <tr key={t.id}>
                      <td><Link to={`/tasks/${t.id}`}>{t.title}</Link></td>
                      <td>{new Date(t.dueDate).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {overdue.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--success)' }}>No overdue tasks</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
