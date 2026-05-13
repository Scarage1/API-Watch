import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, CheckCircle2, TrendingUp,
  Clock, Send, Braces, Plug, Radio, Globe, ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { cn } from '../lib/utils';

// ── Counter animation ─────────────────────────────────────────────────────────
function AnimatedValue({ value, suffix = '' }: { value: number | string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;

  useEffect(() => {
    if (numVal === 0) { setTimeout(() => setDisplay(0), 0); return; }
    const steps = 24; const duration = 500;
    const inc = numVal / steps; let cur = 0;
    const t = setInterval(() => {
      cur += inc;
      if (cur >= numVal) { setDisplay(numVal); clearInterval(t); }
      else setDisplay(Math.floor(cur));
    }, duration / steps);
    return () => clearInterval(t);
  }, [numVal]);

  return (
    <span className="font-tabular">
      {typeof value === 'string' && value.includes('ms') ? `${Math.round(display)}ms` : display}
      {suffix}
    </span>
  );
}

// ── Status indicator ──────────────────────────────────────────────────────────
function SystemBadge({ status }: { status: 'healthy' | 'warning' | 'error' }) {
  const map = {
    healthy: { dot: 'conn-dot-ok conn-dot-pulse', label: 'All Systems Operational', color: '#16a34a' },
    warning: { dot: 'conn-dot-warn conn-dot-pulse', label: 'Degraded Performance', color: '#d97706' },
    error:   { dot: 'conn-dot-err', label: 'Issues Detected', color: '#dc2626' },
  }[status];
  return (
    <div className="flex items-center gap-2">
      <span className={cn('conn-dot', map.dot)} />
      <span className="text-[11px] font-medium" style={{ color: map.color }}>{map.label}</span>
    </div>
  );
}

export default function Dashboard() {
  const { testHistory } = useAppStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0, successful: 0, failed: 0, successRate: 0, avgResponseTime: 0,
  });

  useEffect(() => {
    if (testHistory.length > 0) {
      const successful = testHistory.filter((t) => t.success).length;
      const failed = testHistory.length - successful;
      const avgTime = testHistory.reduce((acc, t) => acc + t.response_time, 0) / testHistory.length;
      setStats({ total: testHistory.length, successful, failed, successRate: (successful / testHistory.length) * 100, avgResponseTime: avgTime });
    } else {
      setStats({ total: 0, successful: 0, failed: 0, successRate: 0, avgResponseTime: 0 });
    }
  }, [testHistory]);

  const recentTests = testHistory.slice(0, 8);
  const systemStatus = stats.total === 0 ? 'healthy' : stats.successRate >= 95 ? 'healthy' : stats.successRate >= 80 ? 'warning' : 'error';

  const statCards = [
    { title: 'Total Requests', value: stats.total,             dotClass: 'status-dot-blue',  trend: `${stats.total} run` },
    { title: 'Successful',     value: stats.successful,        dotClass: 'status-dot-green', trend: `${stats.successRate.toFixed(0)}% rate` },
    { title: 'Failed',         value: stats.failed,            dotClass: 'status-dot-red',   trend: stats.total > 0 ? `${((stats.failed / stats.total) * 100).toFixed(0)}% of total` : '0%' },
    { title: 'Avg Response',   value: `${(stats.avgResponseTime * 1000).toFixed(0)}ms`, dotClass: 'status-dot-amber', trend: 'latency' },
  ];

  const responseTimeData = useMemo(() =>
    testHistory.slice(0, 20).reverse().map((t, i) => ({ name: `#${i + 1}`, time: Math.round(t.response_time * 1000) })),
    [testHistory]
  );

  const successRateData = useMemo(() => {
    const reversed = testHistory.slice(0, 20).reverse();
    let ok = 0;
    return reversed.map((t, i) => {
      if (t.success) ok++;
      return { name: `#${i + 1}`, rate: Math.round((ok / (i + 1)) * 100), status: t.success ? 'pass' : 'fail' };
    });
  }, [testHistory]);

  const methodDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    testHistory.slice(0, 50).forEach((t) => { const m = t.request_method || 'GET'; counts[m] = (counts[m] || 0) + 1; });
    const colors: Record<string, string> = { GET: '#0f766e', POST: '#15803d', PUT: '#b45309', PATCH: '#7c3aed', DELETE: '#b91c1c', OPTIONS: '#4b5563' };
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([method, count]) => ({ method, count, fill: colors[method] || '#6b7280' }));
  }, [testHistory]);

  const quickActions = [
    { label: 'HTTP Request', icon: Send,   to: '/request',   desc: 'REST & HTTP',    color: '#6366f1' },
    { label: 'WebSocket',    icon: Plug,   to: '/websocket', desc: 'Real-time WS',   color: '#7c3aed' },
    { label: 'GraphQL',      icon: Braces, to: '/graphql',   desc: 'Query & Mutate', color: '#ec4899' },
    { label: 'SSE Client',   icon: Radio,  to: '/sse',       desc: 'Event streams',  color: '#0891b2' },
  ];

  const tooltipStyle = {
    backgroundColor: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '6px 10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  };

  return (
    <div className="space-y-5 page-enter">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900 dark:text-white tracking-tight">
            Dashboard
          </h1>
          <div className="mt-1.5">
            <SystemBadge status={systemStatus} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/request')} className="btn-primary gap-1.5">
            <Send className="w-3.5 h-3.5" />
            New Request
          </button>
          <button onClick={() => navigate('/monitors')} className="btn-secondary gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Monitors
          </button>
        </div>
      </div>

      {/* ── Quick actions ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {quickActions.map((qa) => (
          <button
            key={qa.to}
            onClick={() => navigate(qa.to)}
            className="group flex items-center gap-3 px-3.5 py-3 text-left transition-colors"
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = qa.color;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 2px 8px ${qa.color}22`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
            }}
          >
            <div
              className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0"
              style={{ background: `${qa.color}18` }}
            >
              <qa.icon className="w-3.5 h-3.5" style={{ color: qa.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate leading-tight">{qa.label}</p>
              <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{qa.desc}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto flex-shrink-0 group-hover:text-gray-500 transition-colors" />
          </button>
        ))}
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => (
          <div key={stat.title} className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-gray-400">{stat.title}</p>
              <span className={cn('status-dot', stat.dotClass)} />
            </div>
            <p className="text-3xl font-semibold text-gray-900 dark:text-white font-tabular leading-none">
              {typeof stat.value === 'number' ? <AnimatedValue value={stat.value} /> : stat.value}
            </p>
            <p className="text-[11px] text-gray-400 mt-2">{stat.trend}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Response time */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Response Time
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Last 20 requests (ms)</p>
            </div>
            {responseTimeData.length > 0 && (
              <span className="tag font-tabular">
                avg {stats.avgResponseTime > 0 ? `${(stats.avgResponseTime * 1000).toFixed(0)}ms` : '—'}
              </span>
            )}
          </div>
          {responseTimeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={responseTimeData}>
                <defs>
                  <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} unit="ms" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}ms`, 'Response Time']} />
                <Area type="monotone" dataKey="time" stroke="#6366f1" strokeWidth={2} fill="url(#tGrad)"
                  dot={{ fill: '#6366f1', r: 2.5, strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state h-[200px]">
              <TrendingUp className="w-8 h-8 empty-state-icon" />
              <p className="text-sm">Run requests to see latency trends</p>
            </div>
          )}
        </div>

        {/* Success rate */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Success Rate
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Cumulative % over requests</p>
            </div>
            {successRateData.length > 0 && (
              <span className={cn('tag font-tabular', stats.successRate >= 95 ? 'text-green-600' : stats.successRate >= 80 ? 'text-amber-600' : 'text-red-600')}>
                {stats.successRate.toFixed(0)}%
              </span>
            )}
          </div>
          {successRateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={successRateData}>
                <defs>
                  <linearGradient id="sGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Success Rate']} />
                <Area type="monotone" dataKey="rate" stroke="#16a34a" strokeWidth={2} fill="url(#sGrad)"
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { status: string } };
                    return <circle key={`d-${cx}`} cx={cx} cy={cy} r={3} fill={payload.status === 'pass' ? '#16a34a' : '#dc2626'} stroke="#fff" strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state h-[200px]">
              <CheckCircle2 className="w-8 h-8 empty-state-icon" />
              <p className="text-sm">Success metrics appear after requests</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Method distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-indigo-400" />
            Method Distribution
          </h3>
          {methodDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={methodDistribution} barCategoryGap="24%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="method" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {methodDistribution.map((e, i) => <Cell key={i} fill={e.fill} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {methodDistribution.map((m) => (
                  <span key={m.method} className="method-badge" style={{ background: `${m.fill}18`, color: m.fill }}>
                    {m.method} {m.count}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state h-[140px]">
              <Globe className="w-7 h-7 empty-state-icon" />
              <p className="text-[13px]">No method data yet</p>
            </div>
          )}
        </div>

        {/* Recent requests */}
        <div className="lg:col-span-2" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Recent Requests
            </h3>
            {recentTests.length > 0 && (
              <span className="tag">{testHistory.length} total</span>
            )}
          </div>

          {recentTests.length === 0 ? (
            <div className="empty-state py-10">
              <Send className="w-8 h-8 empty-state-icon" />
              <p className="text-sm font-medium text-gray-600">No requests yet</p>
              <p className="text-[12px] text-gray-400">Send your first API request to see results here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentTests.map((test, idx) => {
                const m = test.request_method || 'GET';
                const sc = test.status_code;
                const scClass = !sc ? '' : sc < 300 ? 'status-2xx' : sc < 400 ? 'status-3xx' : sc < 500 ? 'status-4xx' : 'status-5xx';
                return (
                  <div key={idx} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <span className={cn('method-badge', `method-${m}`)}>{m}</span>
                    <span className="font-mono text-[12.5px] text-gray-700 truncate flex-1 min-w-0" title={test.request_url}>
                      {test.request_url}
                    </span>
                    <span className={cn('font-mono text-[12.5px] font-semibold font-tabular flex-shrink-0', scClass)}>
                      {sc || 'ERR'}
                    </span>
                    <span className="text-[11px] text-gray-400 font-tabular flex-shrink-0 w-14 text-right">
                      {(test.response_time * 1000).toFixed(0)}ms
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
