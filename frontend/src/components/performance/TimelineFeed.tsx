import { Link } from 'react-router-dom';
import { format, parseISO, isSameDay } from 'date-fns';
import type { MemberPerformanceData } from '../../types/performance';

export default function TimelineFeed({ data }: { data: MemberPerformanceData }) {
  if (data.timeline.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Activity timeline</div>
        <p className="perf-hint">No activity recorded for this member in the selected range.</p>
      </div>
    );
  }

  const grouped = data.timeline.reduce<Record<string, typeof data.timeline>>((acc, item) => {
    const day = format(parseISO(item.timestamp), 'yyyy-MM-dd');
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="card">
      <div className="card-title">Activity timeline</div>
      <div className="card-desc">From audit trail — assignments, status changes, and updates</div>
      <div className="perf-timeline">
        {days.map((day) => (
          <div key={day} className="perf-timeline-day">
            <div className="perf-timeline-day-label">
              {isSameDay(parseISO(day), new Date()) ? 'Today' : format(parseISO(day), 'EEE, MMM d, yyyy')}
            </div>
            {grouped[day].map((item) => (
              <div key={item.id} className="perf-timeline-item">
                <div className="perf-timeline-time">{format(parseISO(item.timestamp), 'h:mm a')}</div>
                <div className="perf-timeline-body">
                  <p>{item.description}</p>
                  <span className="perf-timeline-meta">{item.actorName}</span>
                  {item.taskId && (
                    <Link to={`/tasks/${item.taskId}`} className="perf-timeline-link">View task →</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
