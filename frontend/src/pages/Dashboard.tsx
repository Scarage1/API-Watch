import { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Layers,
  Globe,
  Sparkles,
  Clock,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { cn } from '../lib/utils';

// ── Animated number counter ───────────────────────────────────
function AnimatedValue({ value, suffix = '' }: { value: number | string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const numVal = typeof value === 'string' ? parseFloat(value) || 0 : value;

  useEffect(() => {
    if (numVal === 0) { setDisplay(0); return; }
    const duration = 600;
    const steps = 30;
    const increment = numVal / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= numVal) {
        setDisplay(numVal);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [numVal]);

  return (
    <span className="tabular-nums">
      {typeof value === 'string' && value.includes('ms')
        ? `${Math.round(display)}ms`
        : display}
      {suffix}
    </span>
  );
}

// ── Status pulse dot ──────────────────────────────────────────
function StatusDot({ status }: { status: 'healthy' | 'warning' | 'error' }) {
  const colors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', colors[status])} />
      <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', colors[status])} />
    </span>
  );
}

export default function Dashboard() {
  const { testHistory } = useAppStore();
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0,
    avgResponseTime: 0,
  });

  useEffect(() => {
    if (testHistory.length > 0) {
      const successful = testHistory.filter((t) => t.success).length;
      const failed = testHistory.length - successful;
      const avgTime =
        testHistory.reduce((acc, t) => acc + t.response_time, 0) /
        testHistory.length;

      setStats({
        total: testHistory.length,
        successful,
        failed,
        successRate: (successful / testHistory.length) * 100,
        avgResponseTime: avgTime,
      });
    } else {
      setStats({ total: 0, successful: 0, failed: 0, successRate: 0, avgResponseTime: 0 });
    }
  }, [testHistory]);

  const recentTests = testHistory.slice(0, 8);

  const systemStatus = stats.total === 0
    ? 'healthy'
    : stats.successRate >= 95
      ? 'healthy'
      : stats.successRate >= 80
        ? 'warning'
        : 'error';

  const statCards = [
    {
      title: 'Total Requests',
      value: stats.total,
      icon: Activity,
      trend: `${stats.total}`,
      trendUp: true,
      gradient: 'from-indigo-500 to-blue-600',
      bgGlow: 'bg-indigo-500/10',
    },
    {
      title: 'Successful',
      value: stats.successful,
      icon: CheckCircle2,
      trend: `${stats.successRate.toFixed(0)}%`,
      trendUp: true,
      gradient: 'from-emerald-500 to-teal-600',
      bgGlow: 'bg-emerald-500/10',
    },
    {
      title: 'Failed',
      value: stats.failed,
      icon: XCircle,
      trend: stats.total > 0 ? `${((stats.failed / stats.total) * 100).toFixed(0)}%` : '0%',
      trendUp: false,
      gradient: 'from-rose-500 to-red-600',
      bgGlow: 'bg-rose-500/10',
    },
    {
      title: 'Avg Response',
      value: `${(stats.avgResponseTime * 1000).toFixed(0)}ms`,
      icon: Timer,
      trend: 'latency',
      trendUp: stats.avgResponseTime < 0.5,
      gradient: 'from-amber-500 to-orange-600',
      bgGlow: 'bg-amber-500/10',
    },
  ];

  // ── Chart data ────────────────────────────────────────────
  const responseTimeData = useMemo(() => {
    return testHistory
      .slice(0, 20)
      .reverse()
      .map((test, idx) => ({
        name: `#${idx + 1}`,
        time: Math.round(test.response_time * 1000),
      }));
  }, [testHistory]);

  const successRateData = useMemo(() => {
    const reversed = testHistory.slice(0, 20).reverse();
    let successCount = 0;
    return reversed.map((test, idx) => {
      if (test.success) successCount++;
      const rate = Math.round((successCount / (idx + 1)) * 100);
      return {
        name: `#${idx + 1}`,
        rate,
        status: test.success ? 'pass' : 'fail',
      };
    });
  }, [testHistory]);

  // Method distribution for the mini bar chart
  const methodDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    testHistory.slice(0, 50).forEach((t) => {
      const m = t.request_method || 'GET';
      counts[m] = (counts[m] || 0) + 1;
    });
    const methodColors: Record<string, string> = {
      GET: '#10b981', POST: '#3b82f6', PUT: '#f59e0b',
      PATCH: '#8b5cf6', DELETE: '#ef4444', OPTIONS: '#6b7280',
    };
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({
        method,
        count,
        fill: methodColors[method] || '#6b7280',
      }));
  }, [testHistory]);

  const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(51, 65, 85, 0.5)',
    borderRadius: '12px',
    color: '#f1f5f9',
    fontSize: '12px',
    padding: '8px 12px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(8px)',
  };

  return (
    <div className="space-y-6 page-enter">
      {/* ── Header with status ──────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 dark:text-white tracking-tight">
                Dashboard
              </h1>
              <p className="text-sm text-surface-500 dark:text-surface-400">
                Real-time API performance overview
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-100 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/50">
          <StatusDot status={systemStatus} />
          <span className="text-xs font-medium text-surface-600 dark:text-surface-300 capitalize">
            {systemStatus === 'healthy' ? 'All Systems Operational' : systemStatus === 'warning' ? 'Degraded Performance' : 'Issues Detected'}
          </span>
        </div>
      </div>

      {/* ── Stats Grid with gradients ──────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <div
            key={stat.title}
            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/50 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-surface-900/5 dark:hover:shadow-black/20 hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {/* Gradient glow on hover */}
            <div className={cn(
              'absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500',
              stat.bgGlow
            )} />

            <div className="relative flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                  {stat.title}
                </p>
                <p className="text-3xl font-extrabold text-surface-900 dark:text-white tracking-tight">
                  {typeof stat.value === 'number' ? (
                    <AnimatedValue value={stat.value} />
                  ) : (
                    stat.value
                  )}
                </p>
              </div>
              <div className={cn('p-2.5 rounded-xl bg-gradient-to-br shadow-lg', stat.gradient)}>
                <stat.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="relative mt-3 flex items-center gap-1 text-xs">
              {stat.trendUp ? (
                <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-red-500" />
              )}
              <span className={cn('font-semibold', stat.trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {stat.trend}
              </span>
              <span className="text-surface-400 dark:text-surface-500 ml-0.5">from tests</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Response Time Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Response Time
              </h3>
              <p className="text-xs text-surface-400 mt-0.5">Last 20 requests in ms</p>
            </div>
            {responseTimeData.length > 0 && (
              <div className="text-xs font-mono px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                avg {stats.avgResponseTime > 0 ? `${(stats.avgResponseTime * 1000).toFixed(0)}ms` : '—'}
              </div>
            )}
          </div>
          {responseTimeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={responseTimeData}>
                <defs>
                  <linearGradient id="timeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="50%" stopColor="#818cf8" stopOpacity={0.1} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} unit="ms" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value}ms`, 'Response Time']}
                />
                <Area
                  type="monotone"
                  dataKey="time"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#timeGradient)"
                  dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state py-10">
              <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 mb-3">
                <TrendingUp className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-surface-500 dark:text-surface-400">Run some requests to see trends</p>
            </div>
          )}
        </div>

        {/* Success Rate Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Success Rate
              </h3>
              <p className="text-xs text-surface-400 mt-0.5">Cumulative success % over requests</p>
            </div>
            {successRateData.length > 0 && (
              <div className={cn(
                'text-xs font-bold px-2.5 py-1 rounded-lg',
                stats.successRate >= 95
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                  : stats.successRate >= 80
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              )}>
                {stats.successRate.toFixed(0)}%
              </div>
            )}
          </div>
          {successRateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={successRateData}>
                <defs>
                  <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="50%" stopColor="#34d399" stopOpacity={0.1} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value}%`, 'Success Rate']}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#successGradient)"
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { status: string } };
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={payload.status === 'pass' ? '#10b981' : '#ef4444'}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state py-10">
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-surface-500 dark:text-surface-400">Success metrics will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Method Distribution + Recent Requests ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Method Distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-purple-500" />
            Method Distribution
          </h3>
          {methodDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={methodDistribution} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="method" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {methodDistribution.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-3">
                {methodDistribution.map((m) => (
                  <span
                    key={m.method}
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: `${m.fill}15`, color: m.fill }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.fill }} />
                    {m.method} ({m.count})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state py-8">
              <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-900/20 mb-3">
                <Globe className="w-8 h-8 text-purple-400" />
              </div>
              <p className="text-sm font-medium text-surface-500 dark:text-surface-400">No method data yet</p>
            </div>
          )}
        </div>

        {/* Recent Requests */}
        <div className="card !p-0 overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50/50 dark:bg-surface-800/30">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                Recent Requests
              </h3>
              {recentTests.length > 0 && (
                <span className="text-[10px] font-medium text-surface-400 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded-full">
                  {testHistory.length} total
                </span>
              )}
            </div>
          </div>

          {recentTests.length === 0 ? (
            <div className="empty-state py-12">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 mb-4">
                <Zap className="w-10 h-10 text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">No requests yet</h3>
              <p className="text-xs text-surface-400 mt-1 max-w-[200px] mx-auto">
                Execute your first API request to see results here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
              {recentTests.map((test, idx) => (
                <div
                  key={idx}
                  className="px-6 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-all duration-200 group/row"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {test.success ? (
                        <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                      ) : (
                        <div className="p-1 rounded-lg bg-red-50 dark:bg-red-900/20">
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                            test.request_method === 'GET' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                            test.request_method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                            test.request_method === 'PUT' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                            test.request_method === 'DELETE' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                            'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                          )}>
                            {test.request_method}
                          </span>
                          <span className="font-mono text-xs text-surface-700 dark:text-surface-300 truncate group-hover/row:text-surface-900 dark:group-hover/row:text-white transition-colors">
                            {test.request_url}
                          </span>
                        </div>
                        <p className="text-[10px] text-surface-400 mt-0.5 tabular-nums">
                          {new Date(test.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={cn(
                        'text-xs font-bold tabular-nums px-2 py-0.5 rounded-md',
                        test.success
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      )}>
                        {test.status_code || 'ERR'}
                      </span>
                      <span className="text-xs text-surface-400 tabular-nums font-mono">
                        {(test.response_time * 1000).toFixed(0)}ms
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
