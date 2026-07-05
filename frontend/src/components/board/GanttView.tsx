import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays, min, max } from 'date-fns';
import type { Task } from '../../types';

interface GanttViewProps {
  tasks: Task[];
}

export default function GanttView({ tasks }: GanttViewProps) {
  const dated = tasks.filter((t) => t.startDate || t.dueDate);
  if (dated.length === 0) {
    return (
      <div className="card board-scroll-view">
        <p className="loading-text">Add start and due dates to tasks to see the Gantt timeline.</p>
      </div>
    );
  }

  const today = new Date();
  const starts = dated.map((t) => new Date(t.startDate || t.dueDate || today));
  const ends = dated.map((t) => new Date(t.dueDate || t.startDate || today));
  const rangeStart = min(starts);
  const rangeEnd = max(ends);
  const totalDays = Math.max(differenceInCalendarDays(rangeEnd, rangeStart) + 1, 1);
  const dayWidth = 28;

  return (
    <div className="card gantt-wrap board-scroll-view">
      <div className="gantt-header">
        <div className="gantt-label-col">Task</div>
        <div className="gantt-timeline-col" style={{ width: totalDays * dayWidth }}>
          {Array.from({ length: totalDays }).map((_, i) => {
            const d = addDays(rangeStart, i);
            return (
              <div key={i} className="gantt-day" style={{ width: dayWidth }}>
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </div>
      {dated.map((task) => {
        const start = new Date(task.startDate || task.dueDate!);
        const end = new Date(task.dueDate || task.startDate!);
        const offset = differenceInCalendarDays(start, rangeStart);
        const span = Math.max(differenceInCalendarDays(end, start) + 1, 1);
        return (
          <div key={task.id} className="gantt-row">
            <div className="gantt-label-col">
              <Link to={`/tasks/${task.id}`}>{task.title}</Link>
              {task.dependencies && task.dependencies.length > 0 && (
                <span className="gantt-dep">↳ depends on {task.dependencies.length}</span>
              )}
            </div>
            <div className="gantt-timeline-col" style={{ width: totalDays * dayWidth, position: 'relative' }}>
              <div
                className={`gantt-bar priority-${task.priority.toLowerCase()}`}
                style={{ left: offset * dayWidth, width: span * dayWidth }}
                title={`${task.status} · ${task.priority}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
