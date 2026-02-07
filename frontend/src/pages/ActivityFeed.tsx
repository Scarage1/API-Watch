/**
 * ActivityFeed — workspace activity timeline page.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Loader2, RefreshCw,
  Plus, Pencil, Trash2, Share2, GitFork,
  RotateCcw, UserPlus, LogIn,
  ChevronDown,
} from 'lucide-react';
import apiClient from '../lib/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

interface ActivityEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_name: string;
  user_email: string;
  details: Record<string, any> | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Plus; color: string; label: string }> = {
  created:   { icon: Plus,        color: 'text-green-500 bg-green-50 dark:bg-green-900/20',   label: 'Created' },
  updated:   { icon: Pencil,      color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',   label: 'Updated' },
  deleted:   { icon: Trash2,      color: 'text-red-500 bg-red-50 dark:bg-red-900/20',         label: 'Deleted' },
  shared:    { icon: Share2,      color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',      label: 'Shared' },
  unshared:  { icon: Share2,      color: 'text-surface-400 bg-surface-50 dark:bg-surface-800', label: 'Unshared' },
  forked:    { icon: GitFork,     color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20', label: 'Forked' },
  restored:  { icon: RotateCcw,   color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20',      label: 'Restored' },
  invited:   { icon: UserPlus,    color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20', label: 'Invited' },
  joined:    { icon: LogIn,       color: 'text-teal-500 bg-teal-50 dark:bg-teal-900/20',      label: 'Joined' },
};

const RESOURCE_FILTERS = ['all', 'collection', 'environment', 'workspace', 'invitation'] as const;

export default function ActivityFeed() {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 30;

  const fetchEntries = useCallback(
    async (offset = 0, append = false) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const params: any = { limit: PAGE_SIZE, offset };
        if (resourceFilter !== 'all') params.resource_type = resourceFilter;
        const res = await apiClient.get('/api/v1/activity', { params });
        const data: ActivityEntry[] = res.data;
        setEntries((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } catch {
        if (!append) setEntries([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [resourceFilter]
  );

  useEffect(() => {
    fetchEntries(0, false);
  }, [fetchEntries, activeWorkspaceId]);

  const loadMore = () => fetchEntries(entries.length, true);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getDateGroup = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Group entries by day
  const groups: { label: string; items: ActivityEntry[] }[] = [];
  let currentLabel = '';
  for (const entry of entries) {
    const label = getDateGroup(entry.created_at);
    if (label !== currentLabel) {
      groups.push({ label, items: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].items.push(entry);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            Activity
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Resource filter */}
          <div className="flex bg-surface-100 dark:bg-surface-800 rounded-lg p-0.5 text-xs">
            {RESOURCE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setResourceFilter(f)}
                className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                  resourceFilter === f
                    ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm font-medium'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchEntries(0, false)}
            className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-surface-400 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-surface-300 dark:text-surface-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-surface-600 dark:text-surface-400">
              No activity yet
            </h3>
            <p className="text-sm text-surface-400 mt-1">
              Actions like creating collections and sharing will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto">
            {groups.map((group) => (
              <div key={group.label}>
                <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                  {group.label}
                </h3>
                <div className="relative pl-6 border-l-2 border-surface-100 dark:border-surface-800 space-y-4">
                  {group.items.map((entry) => {
                    const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.created;
                    const Icon = cfg.icon;
                    return (
                      <div key={entry.id} className="relative flex items-start gap-3">
                        {/* Timeline dot */}
                        <div
                          className={`absolute -left-[calc(0.75rem+5px)] p-1.5 rounded-full ${cfg.color}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-surface-700 dark:text-surface-300">
                            <span className="font-medium">{entry.user_email}</span>{' '}
                            <span className="text-surface-500">
                              {cfg.label.toLowerCase()}
                            </span>{' '}
                            <span className="font-medium capitalize">
                              {entry.resource_type}
                            </span>{' '}
                            <span className="text-surface-500">
                              "{entry.resource_name}"
                            </span>
                          </p>
                          {entry.details && Object.keys(entry.details).length > 0 && (
                            <p className="text-xs text-surface-400 mt-0.5">
                              {Object.entries(entry.details)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-surface-400 whitespace-nowrap mt-0.5">
                          {formatTime(entry.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
