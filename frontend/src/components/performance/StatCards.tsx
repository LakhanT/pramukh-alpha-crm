import type { MemberPerformanceData } from '../../types/performance';

function VsTeam({ delta }: { delta: number }) {
  if (delta === 0) return <span className="perf-vs neutral">vs team avg</span>;
  const up = delta > 0;
  return (
    <span className={`perf-vs ${up ? 'up' : 'down'}`}>
      {up ? '+' : ''}{delta}% vs team
    </span>
  );
}

export default function StatCards({ data }: { data: MemberPerformanceData }) {
  const cards = [
    { label: 'Total assigned', value: data.stats.totalAssigned },
    { label: 'Completed', value: data.stats.completed },
    { label: 'Overdue', value: data.stats.overdue, warn: data.stats.overdue > 0 },
    { label: 'In progress', value: data.stats.inProgress },
    {
      label: 'Completion rate',
      value: `${data.stats.completionRate}%`,
      extra: <VsTeam delta={data.comparison.completionRateVsTeam} />,
    },
    {
      label: 'On-time rate',
      value: `${data.stats.onTimeRate}%`,
      extra: <VsTeam delta={data.comparison.onTimeRateVsTeam} />,
    },
  ];

  return (
    <div className="perf-stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`perf-stat-card${c.warn ? ' perf-stat-card--warn' : ''}`}>
          <div className="perf-stat-value">{c.value}</div>
          <div className="perf-stat-label">{c.label}</div>
          {c.extra}
        </div>
      ))}
    </div>
  );
}
