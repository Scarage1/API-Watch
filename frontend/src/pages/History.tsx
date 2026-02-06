import { useState, useMemo } from 'react';
import {
  Clock,
  Filter,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';

type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type StatusFilter = 'all' | 'success' | 'failed';

export default function History() {
  const { testHistory, clearHistory } = useAppStore();
  const [showFilters, setShowFilters] = useState(false);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHistory = useMemo(() => {
    return testHistory.filter((test) => {
      // Method filter
      if (methodFilter !== 'ALL' && test.request_method !== methodFilter) return false;
      // Status filter
      if (statusFilter === 'success' && !test.success) return false;
      if (statusFilter === 'failed' && test.success) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUrl = test.request_url.toLowerCase().includes(q);
        const matchCode = test.status_code?.toString().includes(q);
        const matchError = test.error?.toLowerCase().includes(q);
        if (!matchUrl && !matchCode && !matchError) return false;
      }
      return true;
    });
  }, [testHistory, methodFilter, statusFilter, searchQuery]);

  const activeFilterCount = [
    methodFilter !== 'ALL',
    statusFilter !== 'all',
    searchQuery.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setMethodFilter('ALL');
    setStatusFilter('all');
    setSearchQuery('');
  };

  const methods: MethodFilter[] = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const statuses: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All Status' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
  ];

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
              Clear All
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn('btn-secondary !text-xs', showFilters && 'ring-2 ring-brand-500/30')}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card !p-4 animate-slide-up space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-300 uppercase tracking-wide">Filters</h3>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by URL, status code, or error..."
              className="input !pl-9 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-200 dark:hover:bg-surface-700"
              >
                <X className="w-3 h-3 text-surface-400" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Method filter */}
            <div>
              <label className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1 block">Method</label>
              <div className="flex gap-1">
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(m)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors',
                      methodFilter === m
                        ? m === 'GET' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          m === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          m === 'PUT' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          m === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          m === 'PATCH' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                          'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div>
              <label className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-1 block">Status</label>
              <div className="flex gap-1">
                {statuses.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatusFilter(s.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors',
                      statusFilter === s.value
                        ? s.value === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          s.value === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Active filter summary */}
          {activeFilterCount > 0 && (
            <p className="text-xs text-surface-400">
              Showing {filteredHistory.length} of {testHistory.length} results
            </p>
          )}
        </div>
      )}

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
      ) : filteredHistory.length === 0 ? (
        <div className="card empty-state">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-surface-400" />
          </div>
          <h3 className="empty-state-title">No matching results</h3>
          <p className="empty-state-desc mb-4">
            No requests match your current filters
          </p>
          <button onClick={clearFilters} className="btn-secondary !text-xs">
            <X className="w-3 h-3" />
            Clear filters
          </button>
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
            {filteredHistory.map((test, idx) => (
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
