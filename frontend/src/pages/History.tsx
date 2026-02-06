import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Clock,
  Filter,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Download,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useRequestStore } from '../store/useRequestStore';
import { cn, formatDuration, formatBytes } from '../lib/utils';
import { apiClient } from '../lib/api';
import RequestDetailModal, { type HistoryDetail } from '../components/RequestDetailModal';

type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type StatusFilter = 'all' | 'success' | 'failed';

const PAGE_SIZE = 25;

interface HistoryListItem {
  id: string;
  request_method: string;
  request_url: string;
  success: boolean;
  status_code: number | null;
  response_time: number;
  response_size: number;
  error: string | null;
  timestamp: string;
}

export default function History() {
  const { testHistory, clearHistory } = useAppStore();
  const addTab = useRequestStore((s) => s.addTab);

  const [showFilters, setShowFilters] = useState(false);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  // Server-backed history
  const [serverItems, setServerItems] = useState<HistoryListItem[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [useServer, setUseServer] = useState(false);

  // Detail modal
  const [selectedDetail, setSelectedDetail] = useState<HistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchServerHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (methodFilter !== 'ALL') params.method = methodFilter;
      if (statusFilter === 'success') params.success = 1;
      if (statusFilter === 'failed') params.success = 0;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await apiClient.get('/api/v1/history', { params });
      setServerItems(res.data.items || []);
      setServerTotal(res.data.total || 0);
      setUseServer(true);
    } catch {
      setUseServer(false);
    } finally {
      setLoading(false);
    }
  }, [methodFilter, statusFilter, searchQuery, page]);

  // Attempt to load from server on mount
  useEffect(() => {
    fetchServerHistory();
  }, [fetchServerHistory]);

  // Client-side filtered history (fallback)
  const filteredLocalHistory = useMemo(() => {
    return testHistory.filter((test) => {
      if (methodFilter !== 'ALL' && test.request_method !== methodFilter) return false;
      if (statusFilter === 'success' && !test.success) return false;
      if (statusFilter === 'failed' && test.success) return false;
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

  const displayItems: HistoryListItem[] = useServer
    ? serverItems
    : filteredLocalHistory.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((t, i) => ({
        id: `local-${i}`,
        request_method: t.request_method,
        request_url: t.request_url,
        success: t.success,
        status_code: t.status_code,
        response_time: t.response_time,
        response_size: t.response_size ?? 0,
        error: t.error,
        timestamp: t.timestamp,
      }));

  const totalItems = useServer ? serverTotal : filteredLocalHistory.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const activeFilterCount = [
    methodFilter !== 'ALL',
    statusFilter !== 'all',
    searchQuery.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setMethodFilter('ALL');
    setStatusFilter('all');
    setSearchQuery('');
    setPage(0);
  };

  // Open detail modal
  const openDetail = async (item: HistoryListItem) => {
    if (useServer && item.id && !item.id.startsWith('local-')) {
      try {
        setDetailLoading(true);
        const res = await apiClient.get(`/api/v1/history/${item.id}`);
        setSelectedDetail(res.data);
      } catch {
        setSelectedDetail({
          ...item,
          request_headers: null,
          request_body: null,
          response_body: null,
          response_headers: null,
          error_type: null,
          retry_count: 0,
        });
      } finally {
        setDetailLoading(false);
      }
    } else {
      setSelectedDetail({
        ...item,
        request_headers: null,
        request_body: null,
        response_body: null,
        response_headers: null,
        error_type: null,
        retry_count: 0,
      });
    }
  };

  // Replay — open history entry in a new request tab
  const handleReplay = (detail: HistoryDetail) => {
    const headers: { key: string; value: string; enabled: boolean }[] = [];
    if (detail.request_headers) {
      try {
        const parsed = JSON.parse(detail.request_headers);
        Object.entries(parsed).forEach(([key, value]) => {
          headers.push({ key, value: String(value), enabled: true });
        });
      } catch { /* ignore */ }
    }

    const tabId = addTab({
      name: `${detail.request_method} ${new URL(detail.request_url).pathname}`.slice(0, 40),
      method: detail.request_method as 'GET',
      url: detail.request_url,
      headers,
      body: detail.request_body || '',
    });

    useRequestStore.getState().setActiveTab(tabId);
    setSelectedDetail(null);
  };

  // Export history to JSON
  const exportHistory = () => {
    const data = useServer ? serverItems : filteredLocalHistory;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-watch-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const methods: MethodFilter[] = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const statuses: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All Status' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
  ];

  const isEmpty = useServer ? serverTotal === 0 && activeFilterCount === 0 : testHistory.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">History</h1>
          <p className="section-subtitle">
            View all past API test executions
            {totalItems > 0 && (
              <span className="text-surface-400 ml-1">({totalItems} total)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <>
              <button onClick={exportHistory} className="btn-ghost !text-xs">
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <button onClick={clearHistory} className="btn-ghost text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 !text-xs">
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            </>
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
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search by URL, status code, or error..."
              className="input !pl-9 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setPage(0); }}
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
                    onClick={() => { setMethodFilter(m); setPage(0); }}
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
                    onClick={() => { setStatusFilter(s.value); setPage(0); }}
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
              Showing {totalItems} result{totalItems !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 text-brand-500 animate-spin" />
        </div>
      )}

      {!loading && isEmpty ? (
        <div className="card empty-state">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-surface-400" />
          </div>
          <h3 className="empty-state-title">No history yet</h3>
          <p className="empty-state-desc">
            Your test execution history will appear here after running requests
          </p>
        </div>
      ) : !loading && totalItems === 0 && activeFilterCount > 0 ? (
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
      ) : !loading && (
        <>
          <div className="card !p-0 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-100 dark:border-surface-800">
              <span className="col-span-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Status</span>
              <span className="col-span-4 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Endpoint</span>
              <span className="col-span-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Code</span>
              <span className="col-span-2 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Time</span>
              <span className="col-span-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Size</span>
              <span className="col-span-2 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Date</span>
              <span className="col-span-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider text-right">Actions</span>
            </div>

            <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
              {displayItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  onClick={() => openDetail(item)}
                  className="grid grid-cols-12 gap-4 px-6 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors items-center cursor-pointer group"
                >
                  <div className="col-span-1">
                    {item.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0',
                      item.request_method === 'GET' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                      item.request_method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                      item.request_method === 'PUT' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                      item.request_method === 'DELETE' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                      'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                    )}>
                      {item.request_method}
                    </span>
                    <span className="font-mono text-xs text-surface-600 dark:text-surface-300 truncate">
                      {item.request_url}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <span className={cn(
                      'text-xs font-semibold tabular-nums',
                      item.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {item.status_code || 'ERR'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-surface-500 tabular-nums">
                      {formatDuration(item.response_time * 1000)}
                    </span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs text-surface-500 tabular-nums">
                      {formatBytes(item.response_size)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-surface-400">
                      {new Date(item.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDetail(item); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-all"
                      title="View details"
                    >
                      <Eye className="w-3.5 h-3.5 text-surface-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-surface-400">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-ghost !p-1.5 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 5 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                        page === pageNum
                          ? 'bg-brand-600 text-white'
                          : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'
                      )}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-ghost !p-1.5 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail loading overlay */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <RefreshCw className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Detail modal */}
      {selectedDetail && (
        <RequestDetailModal
          detail={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onReplay={handleReplay}
        />
      )}
    </div>
  );
}
