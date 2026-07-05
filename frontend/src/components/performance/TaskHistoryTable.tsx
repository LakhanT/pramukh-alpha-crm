import { Link } from 'react-router-dom';
import type { MemberPerformanceData } from '../../types/performance';

interface TaskHistoryTableProps {
  data: MemberPerformanceData;
  statusFilter: string;
  onStatusFilter: (s: string) => void;
}

export default function TaskHistoryTable({ data, statusFilter, onStatusFilter }: TaskHistoryTableProps) {
  const rows = statusFilter
    ? data.taskHistory.filter((t) => t.status === statusFilter)
    : data.taskHistory;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>Task history</div>
        <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
          <option value="">All statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="perf-hint">No tasks in this range yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Due</th><th>Completed</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                  {t.reworkFlag && <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>rework</span>}
                </td>
                <td>{t.project.name}</td>
                <td>{t.status.replace(/_/g, ' ')}</td>
                <td>{t.priority}</td>
                <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
                <td>{t.completedAt ? new Date(t.completedAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
