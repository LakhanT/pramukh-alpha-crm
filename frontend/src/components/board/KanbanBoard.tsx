import { Link } from 'react-router-dom';
import type { Task, TaskStatus } from '../types';

const COLUMN_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', DONE: 'Done', CANCELLED: 'Cancelled',
};

interface KanbanBoardProps {
  columns: TaskStatus[];
  tasks: Task[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

export default function KanbanBoard({ columns, tasks, selected, onToggleSelect, onStatusChange }: KanbanBoardProps) {
  const tasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/task-id', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/task-id');
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) onStatusChange(taskId, status);
  };

  return (
    <div className="kanban kanban-fit">
      {columns.map((status) => (
        <div
          key={status}
          className="kanban-column"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, status)}
        >
          <h3>{COLUMN_LABELS[status]} <span className="kanban-count">{tasksByStatus(status).length}</span></h3>
          <div className="kanban-column-cards">
            {tasksByStatus(status).map((task) => (
              <div
                key={task.id}
                className="kanban-card"
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onClick={() => { window.location.href = `/tasks/${task.id}`; }}
              >
                <div className="kanban-card-row">
                  <input
                    type="checkbox"
                    className="kanban-card-check"
                    checked={selected.has(task.id)}
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="kanban-card-body">
                    <h4 className="kanban-card-title">{task.title}</h4>
                    <div className="kanban-card-meta">
                      <span className={`priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                      {task.dueDate && (
                        <span className="kanban-card-due">
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {task.assignees.map((a) => (
                        <span key={a.user.id} className="kanban-avatar">{a.user.name.split(' ')[0]}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { COLUMN_LABELS };
