import { BarChart3, TrendingUp, Gauge, Globe } from 'lucide-react';

export default function Analytics() {
  const metrics = [
    { label: 'P95 Latency', value: '—', icon: Gauge, desc: 'milliseconds' },
    { label: 'Uptime', value: '—', icon: TrendingUp, desc: 'percentage' },
    { label: 'Regions', value: '—', icon: Globe, desc: 'monitored' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Analytics</h1>
        <p className="section-subtitle">Deep dive into your API performance metrics</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="card-hover">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/10 ring-1 ring-brand-500/10">
                <m.icon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">{m.label}</p>
            </div>
            <p className="text-2xl font-bold text-surface-900 dark:text-white">{m.value}</p>
            <p className="text-xs text-surface-400 mt-1">{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="card empty-state">
        <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
          <BarChart3 className="w-6 h-6 text-surface-400" />
        </div>
        <h3 className="empty-state-title">Analytics Dashboard</h3>
        <p className="empty-state-desc">
          Advanced performance analytics, latency percentiles, and trend analysis will appear here as you run more tests
        </p>
      </div>
    </div>
  );
}
