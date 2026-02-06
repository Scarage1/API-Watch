import { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '../lib/utils';

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
    }
  }, [testHistory]);

  const recentTests = testHistory.slice(0, 8);

  const statCards = [
    {
      title: 'Total Requests',
      value: stats.total,
      icon: Activity,
      trend: '+12%',
      trendUp: true,
      color: 'brand' as const,
    },
    {
      title: 'Successful',
      value: stats.successful,
      icon: CheckCircle2,
      trend: `${stats.successRate.toFixed(0)}%`,
      trendUp: true,
      color: 'emerald' as const,
    },
    {
      title: 'Failed',
      value: stats.failed,
      icon: XCircle,
      trend: stats.total > 0 ? `${((stats.failed / stats.total) * 100).toFixed(0)}%` : '0%',
      trendUp: false,
      color: 'red' as const,
    },
    {
      title: 'Avg Response',
      value: `${(stats.avgResponseTime * 1000).toFixed(0)}ms`,
      icon: Timer,
      trend: 'avg',
      trendUp: true,
      color: 'amber' as const,
    },
  ];

  const colorMap = {
    brand: {
      bg: 'bg-brand-50 dark:bg-brand-900/10',
      icon: 'text-brand-600 dark:text-brand-400',
      ring: 'ring-brand-500/10',
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/10',
      icon: 'text-emerald-600 dark:text-emerald-400',
      ring: 'ring-emerald-500/10',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/10',
      icon: 'text-red-600 dark:text-red-400',
      ring: 'ring-red-500/10',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/10',
      icon: 'text-amber-600 dark:text-amber-400',
      ring: 'ring-amber-500/10',
    },
  };

  const chartData = testHistory
    .slice(0, 20)
    .reverse()
    .map((test, idx) => ({
      name: `#${idx + 1}`,
      time: Math.round(test.response_time * 1000),
      success: test.success ? 1 : 0,
    }));

  const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(51, 65, 85, 0.5)',
    borderRadius: '12px',
    color: '#f1f5f9',
    fontSize: '12px',
    padding: '8px 12px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="section-title">Dashboard</h1>
        <p className="section-subtitle">Monitor your API testing performance</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const colors = colorMap[stat.color];
          return (
            <div
              key={stat.title}
              className="card-hover group"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold text-surface-900 dark:text-white tracking-tight">
                    {stat.value}
                  </p>
                </div>
                <div className={cn('p-2.5 rounded-xl ring-1', colors.bg, colors.ring)}>
                  <stat.icon className={cn('w-4 h-4', colors.icon)} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs">
                {stat.trendUp ? (
                  <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-500" />
                )}
                <span className={cn('font-medium', stat.trendUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  {stat.trend}
                </span>
                <span className="text-surface-400 dark:text-surface-500 ml-0.5">from tests</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Response Time Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Response Time</h3>
              <p className="text-xs text-surface-400 mt-0.5">Last 20 requests in ms</p>
            </div>
            <div className="badge-info">
              <TrendingUp className="w-3 h-3 mr-1" />
              Trend
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="timeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="time"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#timeGradient)"
                  dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state py-10">
              <TrendingUp className="empty-state-icon !w-10 !h-10" />
              <p className="empty-state-desc">Run some requests to see trends</p>
            </div>
          )}
        </div>

        {/* Success Rate Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Success Rate</h3>
              <p className="text-xs text-surface-400 mt-0.5">Pass/fail per request</p>
            </div>
            <div className="badge-success">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {stats.successRate.toFixed(0)}%
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 1]} ticks={[0, 1]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="success" radius={[4, 4, 0, 0]} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state py-10">
              <CheckCircle2 className="empty-state-icon !w-10 !h-10" />
              <p className="empty-state-desc">Success metrics will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Tests */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-100 dark:border-surface-700/50">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Recent Requests</h3>
            {recentTests.length > 0 && (
              <span className="text-xs text-surface-400">{testHistory.length} total</span>
            )}
          </div>
        </div>

        {recentTests.length === 0 ? (
          <div className="empty-state py-12">
            <Zap className="empty-state-icon" />
            <h3 className="empty-state-title">No requests yet</h3>
            <p className="empty-state-desc">
              Execute your first API request to see results here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {recentTests.map((test, idx) => (
              <div
                key={idx}
                className="px-6 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {test.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
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
                        <span className="font-mono text-xs text-surface-700 dark:text-surface-300 truncate">
                          {test.request_url}
                        </span>
                      </div>
                      <p className="text-[11px] text-surface-400 mt-0.5">
                        {new Date(test.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={cn(
                      'text-xs font-semibold tabular-nums',
                      test.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {test.status_code || 'ERR'}
                    </span>
                    <span className="text-xs text-surface-400 tabular-nums">
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
  );
}
