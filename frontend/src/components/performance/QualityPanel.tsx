import type { MemberPerformanceData } from '../../types/performance';

export default function QualityPanel({ data }: { data: MemberPerformanceData }) {
  return (
    <div className="card">
      <div className="card-title">Quality &amp; accuracy</div>
      <div className="perf-metric-rows">
        <div className="perf-metric-row">
          <span>Rework rate</span>
          <strong>{data.quality.reworkRate}%</strong>
        </div>
        <p className="perf-hint">Tasks reopened after being marked done</p>
        <div className="perf-metric-row">
          <span>Avg. quality rating</span>
          <strong>{data.quality.avgQualityRating != null ? `${data.quality.avgQualityRating} / 5` : '—'}</strong>
        </div>
      </div>
    </div>
  );
}

export function EfficiencyPanel({ data }: { data: MemberPerformanceData }) {
  return (
    <div className="card">
      <div className="card-title">Efficiency</div>
      <div className="perf-metric-rows">
        <div className="perf-metric-row">
          <span>Avg. estimated time</span>
          <strong>{data.efficiency.avgEstimatedMinutes != null ? `${data.efficiency.avgEstimatedMinutes} min` : '—'}</strong>
        </div>
        <div className="perf-metric-row">
          <span>Avg. actual time</span>
          <strong>{data.efficiency.avgActualMinutes != null ? `${data.efficiency.avgActualMinutes} min` : '—'}</strong>
        </div>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>Avg. days to complete by priority</p>
      <table className="table">
        <thead><tr><th>Priority</th><th>Tasks</th><th>Done</th><th>Avg days</th></tr></thead>
        <tbody>
          {data.efficiency.byPriority.map((p) => (
            <tr key={p.priority}>
              <td>{p.priority}</td>
              <td>{p.count}</td>
              <td>{p.completed}</td>
              <td>{p.avgDaysToComplete ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BreakdownPanels({ data }: { data: MemberPerformanceData }) {
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-title">By project</div>
        {data.breakdowns.byProject.length === 0 ? (
          <p className="perf-hint">No project data in this range.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Project</th><th>Tasks</th><th>Done</th></tr></thead>
            <tbody>
              {data.breakdowns.byProject.map((p) => (
                <tr key={p.projectId}><td>{p.name}</td><td>{p.count}</td><td>{p.completed}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <div className="card-title">By tag</div>
        {data.breakdowns.byTag.length === 0 ? (
          <p className="perf-hint">No tags on tasks in this range.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.breakdowns.byTag.map((t) => (
              <span key={t.tagId} className="badge" style={{ background: t.color + '22', color: t.color }}>
                {t.name} ({t.count})
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
