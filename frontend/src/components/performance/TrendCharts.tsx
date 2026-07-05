import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { MemberPerformanceData } from '../../types/performance';

const PIE_COLORS = ['#22c55e', '#ef4444'];

export default function TrendCharts({ data }: { data: MemberPerformanceData }) {
  const onTimeData = [
    { name: 'On time', value: data.trends.onTimeVsLate.onTime },
    { name: 'Late', value: data.trends.onTimeVsLate.late },
  ];

  const hasTrends = data.trends.completionTrend.length > 0;

  if (!hasTrends && data.stats.completed === 0) {
    return (
      <div className="card perf-empty-chart">
        <p>Complete a few tasks to see trend charts.</p>
      </div>
    );
  }

  return (
    <div className="perf-charts-grid">
      <div className="card">
        <div className="card-title">Completion trend</div>
        <div className="card-desc">Tasks completed per week</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.trends.completionTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="completed" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title">On-time vs late</div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={onTimeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
              {onTimeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="card perf-chart-wide">
        <div className="card-title">Workload over time</div>
        <div className="card-desc">Assigned vs closed per week</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.trends.workloadTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="assigned" fill="#93c5fd" name="Assigned" />
            <Bar dataKey="closed" fill="var(--primary)" name="Closed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
