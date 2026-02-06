import { useMemo } from 'react';
import {
  BarChart3,
  Gauge,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { cn } from '../lib/utils';

const COLORS = {
  success: '#10b981',
  error: '#ef4444',
  brand: '#6366f1',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};

export default function Analytics() {
  const { testHistory } = useAppStore();

  const analytics = useMemo(() => {
    if (testHistory.length === 0) return null;

    const times = testHistory.map((t) => t.response_time * 1000).sort((a, b) => a - b);
    const successCount = testHistory.filter((t) => t.success).length;
    const failCount = testHistory.length - successCount;

    // Percentiles
    const p50 = times[Math.floor(times.length * 0.5)] || 0;
    const p95 = times[Math.floor(times.length * 0.95)] || 0;
    const p99 = times[Math.floor(times.length * 0.99)] || 0;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = times[0] || 0;
    const max = times[times.length - 1] || 0;

    // Method distribution
    const methodCounts: Record<string, number> = {};
    testHistory.forEach((t) => {
      methodCounts[t.request_method] = (methodCounts[t.request_method] || 0) + 1;
    });
    const methodData = Object.entries(methodCounts).map(([method, count]) => ({
      method,
      count,
    }));

    // Status code distribution
    const statusCounts: Record<string, number> = {};
    testHistory.forEach((t) => {
      const code = t.status_code ? String(t.status_code) : 'Error';
      statusCounts[code] = (statusCounts[code] || 0) + 1;
    });
    const statusData = Object.entries(statusCounts).map(([code, count]) => ({
      code,
      count,
    }));

    // Error type distribution
    const errorTypes: Record<string, number> = {};
    testHistory.forEach((t) => {
      if (!t.success && t.error_type) {
        errorTypes[t.error_type] = (errorTypes[t.error_type] || 0) + 1;
      }
    });
    const errorData = Object.entries(errorTypes).map(([type, count]) => ({
      type: type.replace(/_/g, ' '),
      count,
    }));

    // Response time distribution (histogram buckets)
    const buckets = [
      { label: '<100ms', min: 0, max: 100 },
      { label: '100-300ms', min: 100, max: 300 },
      { label: '300-500ms', min: 300, max: 500 },
      { label: '500ms-1s', min: 500, max: 1000 },
      { label: '1-3s', min: 1000, max: 3000 },
      { label: '>3s', min: 3000, max: Infinity },
    ];
    const histogramData = buckets.map((b) => ({
      label: b.label,
      count: times.filter((t) => t >= b.min && t < b.max).length,
    }));

    // Response time trend (last 30 requests, averaged in groups of 5)
    const recentTimes = testHistory.slice(0, 30).reverse();
    const trendData: { name: string; avg: number; p95: number }[] = [];
    for (let i = 0; i < recentTimes.length; i += 5) {
      const group = recentTimes.slice(i, i + 5);
      const groupTimes = group.map((t) => t.response_time * 1000);
      const groupSorted = [...groupTimes].sort((a, b) => a - b);
      trendData.push({
        name: `${i + 1}-${Math.min(i + 5, recentTimes.length)}`,
        avg: Math.round(groupTimes.reduce((a, b) => a + b, 0) / groupTimes.length),
        p95: Math.round(groupSorted[Math.floor(groupSorted.length * 0.95)] || 0),
      });
    }

    // Pie chart for success/fail
    const pieData = [
      { name: 'Success', value: successCount },
      { name: 'Failed', value: failCount },
    ];

    return {
      total: testHistory.length,
      successCount,
      failCount,
      successRate: (successCount / testHistory.length) * 100,
      avg,
      p50,
      p95,
      p99,
      min,
      max,
      methodData,
      statusData,
      errorData,
      histogramData,
      trendData,
      pieData,
    };
  }, [testHistory]);

  const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(51, 65, 85, 0.5)',
    borderRadius: '12px',
    color: '#f1f5f9',
    fontSize: '12px',
    padding: '8px 12px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
  };

  if (!analytics) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="section-title">Analytics</h1>
          <p className="section-subtitle">Deep dive into your API performance metrics</p>
        </div>
        <div className="card empty-state">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
            <BarChart3 className="w-6 h-6 text-surface-400" />
          </div>
          <h3 className="empty-state-title">No data yet</h3>
          <p className="empty-state-desc">
            Run some API requests to see performance analytics, latency percentiles, and trend analysis
          </p>
        </div>
      </div>
    );
  }

  const metricCards = [
    { label: 'P50 Latency', value: `${analytics.p50.toFixed(0)}ms`, icon: Gauge, color: 'text-brand-600 dark:text-brand-400' },
    { label: 'P95 Latency', value: `${analytics.p95.toFixed(0)}ms`, icon: Gauge, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'P99 Latency', value: `${analytics.p99.toFixed(0)}ms`, icon: Gauge, color: 'text-red-600 dark:text-red-400' },
    { label: 'Success Rate', value: `${analytics.successRate.toFixed(1)}%`, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Avg Response', value: `${analytics.avg.toFixed(0)}ms`, icon: Clock, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Total Requests', value: `${analytics.total}`, icon: Activity, color: 'text-purple-600 dark:text-purple-400' },
  ];

  const methodColors: Record<string, string> = {
    GET: COLORS.success,
    POST: COLORS.blue,
    PUT: COLORS.amber,
    DELETE: COLORS.error,
    PATCH: COLORS.purple,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Analytics</h1>
        <p className="section-subtitle">Deep dive into your API performance metrics</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metricCards.map((m) => (
          <div key={m.label} className="card-hover !p-4">
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={cn('w-3.5 h-3.5', m.color)} />
              <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wide">{m.label}</p>
            </div>
            <p className="text-lg font-bold text-surface-900 dark:text-white tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Response Time Distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">Response Time Distribution</h3>
          <p className="text-xs text-surface-400 mb-4">Histogram of request latencies</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics.histogramData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Requests" radius={[4, 4, 0, 0]} fill={COLORS.brand} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Success / Fail Pie */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">Success vs Failure</h3>
          <p className="text-xs text-surface-400 mb-4">Overall pass/fail ratio</p>
          <div className="flex items-center justify-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={analytics.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  <Cell fill={COLORS.success} />
                  <Cell fill={COLORS.error} />
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs text-surface-600 dark:text-surface-300">
                  Success: {analytics.successCount} ({analytics.successRate.toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-xs text-surface-600 dark:text-surface-300">
                  Failed: {analytics.failCount} ({(100 - analytics.successRate).toFixed(0)}%)
                </span>
              </div>
              <div className="divider my-2" />
              <div className="text-xs text-surface-400">
                Min: {analytics.min.toFixed(0)}ms · Max: {analytics.max.toFixed(0)}ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latency Trend */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">Latency Trend</h3>
          <p className="text-xs text-surface-400 mb-4">Average & P95 over request groups</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={analytics.trendData}>
              <defs>
                <linearGradient id="avgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.brand} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={COLORS.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} unit="ms" />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="avg" name="Avg" stroke={COLORS.brand} strokeWidth={2} fill="url(#avgGradient)" dot={{ fill: COLORS.brand, r: 3 }} />
              <Area type="monotone" dataKey="p95" name="P95" stroke={COLORS.amber} strokeWidth={2} fill="transparent" strokeDasharray="5 3" dot={{ fill: COLORS.amber, r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Method Distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">HTTP Methods</h3>
          <p className="text-xs text-surface-400 mb-4">Request count by method</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics.methodData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="method" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Requests" radius={[4, 4, 0, 0]}>
                {analytics.methodData.map((entry) => (
                  <Cell key={entry.method} fill={methodColors[entry.method] || COLORS.brand} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status codes & Error breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Codes */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-4">Status Codes</h3>
          <div className="space-y-2">
            {analytics.statusData.map((s) => {
              const pct = (s.count / analytics.total) * 100;
              const isSuccess = s.code.startsWith('2');
              const isError = s.code.startsWith('4') || s.code.startsWith('5') || s.code === 'Error';
              return (
                <div key={s.code} className="flex items-center gap-3">
                  <span className={cn(
                    'text-xs font-bold tabular-nums w-12',
                    isSuccess ? 'text-emerald-600 dark:text-emerald-400' :
                    isError ? 'text-red-600 dark:text-red-400' :
                    'text-surface-600 dark:text-surface-400'
                  )}>
                    {s.code}
                  </span>
                  <div className="flex-1 h-2 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', isSuccess ? 'bg-emerald-500' : isError ? 'bg-red-500' : 'bg-brand-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-surface-400 tabular-nums w-12 text-right">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Types */}
        <div className="card">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-4">Error Breakdown</h3>
          {analytics.errorData.length > 0 ? (
            <div className="space-y-2">
              {analytics.errorData.map((e) => (
                <div key={e.type} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-900/10 rounded-xl">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs font-medium text-red-700 dark:text-red-400">{e.type}</span>
                  </div>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">{e.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-6 justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">No errors found!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
