import { Clock, Filter, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';

export default function History() {
  const { testHistory, clearHistory } = useAppStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">History</h1>
          <p className="section-subtitle">View all past API test executions</p>
        </div>
        <div className="flex items-center gap-2">
          {testHistory.length > 0 && (
            <button onClick={clearHistory} className="btn-ghost text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 !text-xs">
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
          <button className="btn-secondary !text-xs">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
        </div>
      </div>

      {testHistory.length === 0 ? (
        <div className="card empty-state">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-surface-400" />
          </div>
          <h3 className="empty-state-title">No history yet</h3>
          <p className="empty-state-desc">
            Your test execution history will appear here after running requests
          </p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
            <span className="col-span-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Status</span>
            <span className="col-span-5 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Endpoint</span>
            <span className="col-span-2 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Code</span>
            <span className="col-span-2 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Time</span>
            <span className="col-span-2 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Date</span>
          </div>

          <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
            {testHistory.map((test, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-4 px-6 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors items-center"
              >
                <div className="col-span-1">
                  {test.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="col-span-5 flex items-center gap-2 min-w-0">
                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0',
                    test.request_method === 'GET' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                    test.request_method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                    test.request_method === 'PUT' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                    test.request_method === 'DELETE' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                    'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                  )}>
                    {test.request_method}
                  </span>
                  <span className="font-mono text-xs text-surface-600 dark:text-surface-300 truncate">
                    {test.request_url}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className={cn(
                    'text-xs font-semibold tabular-nums',
                    test.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  )}>
                    {test.status_code || 'ERR'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-surface-500 tabular-nums">
                    {(test.response_time * 1000).toFixed(0)}ms
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-surface-400">
                    {new Date(test.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
