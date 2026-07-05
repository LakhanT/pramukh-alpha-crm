import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import StatCards from '../components/performance/StatCards';
import TrendCharts from '../components/performance/TrendCharts';
import QualityPanel, { EfficiencyPanel, BreakdownPanels } from '../components/performance/QualityPanel';
import TimelineFeed from '../components/performance/TimelineFeed';
import TaskHistoryTable from '../components/performance/TaskHistoryTable';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { MemberPerformanceData, PerformanceRange } from '../types/performance';
import { MOCK_PERFORMANCE } from '../types/performance';
import { Download, User } from 'lucide-react';

const RANGES: { key: PerformanceRange; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'all', label: 'All time' },
];

export default function MemberPerformancePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<MemberPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [range, setRange] = useState<PerformanceRange>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [useMock, setUseMock] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    if (useMock) {
      setData(MOCK_PERFORMANCE);
      setLoading(false);
      return;
    }
    setLoading(true);
    const filters: Record<string, string> = { range };
    if (range === 'custom') {
      if (customFrom) filters.from = customFrom;
      if (customTo) filters.to = customTo;
    }
    if (statusFilter) filters.status = statusFilter;

    api.getMemberPerformance(id, filters)
      .then((res) => { setData(res.data); setForbidden(false); })
      .catch((e) => {
        if (e instanceof Error && e.message.toLowerCase().includes('cannot view')) {
          setForbidden(true);
        }
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id, range, customFrom, customTo, statusFilter, useMock]);

  useEffect(() => { load(); }, [load]);

  if (!id) return <Navigate to="/team" />;
  if (forbidden) return <Layout><div className="card"><h2>Access denied</h2><p>You don&apos;t have permission to view this member&apos;s performance dashboard.</p><Link to="/team">← Back to team</Link></div></Layout>;
  if (loading && !data) return <Layout><p className="loading-text">Loading performance…</p></Layout>;
  if (!data) return <Layout><p className="loading-text">Member not found.</p></Layout>;

  const m = data.member;
  const isSelf = user?.id === id;

  return (
    <Layout>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Link to="/team" style={{ fontSize: 14, color: 'var(--text-muted)' }}>← Back to team</Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {import.meta.env.DEV && (
            <button type="button" className="btn-secondary" onClick={() => setUseMock(!useMock)}>
              {useMock ? 'Live data' : 'Preview mock'}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => api.exportMemberPerformance(id!, { range, from: customFrom, to: customTo, status: statusFilter })}
          >
            <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="perf-header card">
        <div className="perf-header-avatar">
          {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <User size={32} />}
        </div>
        <div className="perf-header-info">
          <h1>{m.name}{isSelf && <span className="badge" style={{ marginLeft: 10 }}>You</span>}</h1>
          <p className="perf-header-sub">
            {m.role} · {m.department || 'Unassigned'}
            {m.reportsTo && <> · Reports to <strong>{m.reportsTo.name}</strong></>}
          </p>
          <p className="perf-header-meta">
            Member since {format(new Date(m.memberSince), 'MMM d, yyyy')} · {m.activeTaskCount} active task{m.activeTaskCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="perf-range-bar card">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Time range</span>
        <div className="perf-range-tabs">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`scope-tab${range === r.key ? ' active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className={`scope-tab${range === 'custom' ? ' active' : ''}`}
            onClick={() => setRange('custom')}
          >
            Custom
          </button>
        </div>
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ width: 'auto' }} />
            <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ width: 'auto' }} />
          </div>
        )}
      </div>

      <StatCards data={data} />
      <TrendCharts data={data} />

      <div className="grid-2 perf-panels-row">
        <QualityPanel data={data} />
        <EfficiencyPanel data={data} />
      </div>

      <BreakdownPanels data={data} />
      <TimelineFeed data={data} />
      <TaskHistoryTable data={data} statusFilter={statusFilter} onStatusFilter={setStatusFilter} />
    </Layout>
  );
}
