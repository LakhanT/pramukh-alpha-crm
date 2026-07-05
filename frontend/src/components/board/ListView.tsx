import { Link } from 'react-router-dom';
import type { Task } from '../../types';

interface ListViewProps {
  tasks: Task[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (col: string) => void;
}

function SortHeader({ label, col, sortBy, sortOrder, onSort }: { label: string; col: string; sortBy: string; sortOrder: string; onSort: (c: string) => void }) {
  const active = sortBy === col;
  return (
    <th>
      <button type="button" className="sort-header" onClick={() => onSort(col)}>
        {label} {active ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
      </button>
    </th>
  );
}

export default function ListView({ tasks, selected, onToggleSelect, sortBy, sortOrder, onSort }: ListViewProps) {
  return (
    <div className="card board-scroll-view">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 36 }}></th>
            <SortHeader label="Title" col="title" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <SortHeader label="Status" col="status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <SortHeader label="Priority" col="priority" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <SortHeader label="Due" col="dueDate" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
            <th>Assignees</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td><input type="checkbox" checked={selected.has(task.id)} onChange={() => onToggleSelect(task.id)} /></td>
              <td><Link to={`/tasks/${task.id}`}>{task.title}</Link></td>
              <td><span className={`badge badge-${task.status.toLowerCase()}`}>{task.status.replace('_', ' ')}</span></td>
              <td className={`priority-${task.priority.toLowerCase()}`}>{task.priority}</td>
              <td>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}</td>
              <td>{task.assignees.map((a) => a.user.name).join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.length === 0 && <p className="loading-text">No tasks match your filters.</p>}
    </div>
  );
}
