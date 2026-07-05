import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isSameDay, getDay } from 'date-fns';
import type { Task } from '../../types';

interface CalendarViewProps {
  tasks: Task[];
}

export default function CalendarView({ tasks }: CalendarViewProps) {
  const [month, setMonth] = useState(new Date());
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const padStart = getDay(start);

  const tasksOnDay = (day: Date) =>
    tasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button type="button" className="btn-secondary" onClick={() => setMonth(subMonths(month, 1))}>← Prev</button>
        <h3>{format(month, 'MMMM yyyy')}</h3>
        <button type="button" className="btn-secondary" onClick={() => setMonth(addMonths(month, 1))}>Next →</button>
      </div>
      <div className="calendar-grid-fit">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="calendar-dow">{d}</div>
        ))}
        {Array.from({ length: padStart }).map((_, i) => (
          <div key={`pad-${i}`} className="calendar-cell calendar-cell-empty" />
        ))}
        {days.map((day) => {
          const dayTasks = tasksOnDay(day);
          return (
            <div key={day.toISOString()} className={`calendar-cell${!isSameMonth(day, month) ? ' muted' : ''}`}>
              <div className="calendar-day-num">{format(day, 'd')}</div>
              {dayTasks.slice(0, 3).map((t) => (
                <Link key={t.id} to={`/tasks/${t.id}`} className={`calendar-task priority-${t.priority.toLowerCase()}`}>
                  {t.title}
                </Link>
              ))}
              {dayTasks.length > 3 && <span className="calendar-more">+{dayTasks.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
