import { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  FolderPlus,
  X,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient from '../lib/api';
import { useRequestStore } from '../store/useRequestStore';
import type { HttpMethod, KeyValuePair } from '../store/useRequestStore';
import { uid } from '../store/useRequestStore';
import ImportExportPanel from './ImportExportPanel';

interface SavedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: string | null;
  params: string | null;
  body: string | null;
  body_type: string | null;
  timeout: number;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  requests: SavedRequest[];
}

const methodBadgeColors: Record<string, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-amber-600 dark:text-amber-400',
  DELETE: 'text-red-600 dark:text-red-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
};

export default function CollectionsSidebar() {
  const { addTab } = useRequestStore();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/collections');
      setCollections(res.data);
    } catch {
      // Not authenticated or error - show empty
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createCollection = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiClient.post('/api/v1/collections', { name: newName.trim() });
      setNewName('');
      setShowNewCollection(false);
      fetchCollections();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const deleteCollection = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/collections/${id}`);
      fetchCollections();
    } catch {
      // ignore
    }
  };

  const openRequestInTab = (req: SavedRequest, collectionId: string) => {
    let parsedHeaders: KeyValuePair[] = [{ id: uid(), key: '', value: '', enabled: true }];
    let parsedParams: KeyValuePair[] = [{ id: uid(), key: '', value: '', enabled: true }];

    if (req.headers) {
      try {
        const h = JSON.parse(req.headers);
        const entries = Object.entries(h).map(([key, value]) => ({
          id: uid(),
          key,
          value: String(value),
          enabled: true,
        }));
        if (entries.length > 0) {
          parsedHeaders = [...entries, { id: uid(), key: '', value: '', enabled: true }];
        }
      } catch {
        // keep default
      }
    }

    if (req.params) {
      try {
        const p = JSON.parse(req.params);
        const entries = Object.entries(p).map(([key, value]) => ({
          id: uid(),
          key,
          value: String(value),
          enabled: true,
        }));
        if (entries.length > 0) {
          parsedParams = [...entries, { id: uid(), key: '', value: '', enabled: true }];
        }
      } catch {
        // keep default
      }
    }

    addTab({
      name: req.name,
      method: req.method as HttpMethod,
      url: req.url,
      headers: parsedHeaders,
      params: parsedParams,
      bodyType: (req.body_type as any) || 'none',
      bodyRaw: req.body || '',
      timeout: req.timeout || 10,
      savedRequestId: req.id,
      collectionId,
    });
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
          Collections
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowImportExport(true)}
            className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 transition-colors"
            title="Import / Export"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowNewCollection(!showNewCollection)}
            className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 transition-colors"
            title="New collection"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* New collection input */}
      {showNewCollection && (
        <div className="flex items-center gap-1 px-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createCollection(); if (e.key === 'Escape') setShowNewCollection(false); }}
            placeholder="Collection name"
            className="input !py-1 text-xs flex-1"
            autoFocus
          />
          <button
            onClick={createCollection}
            disabled={creating || !newName.trim()}
            className="p-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          </button>
          <button
            onClick={() => { setShowNewCollection(false); setNewName(''); }}
            className="p-1 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Collections list */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-surface-400 animate-spin" />
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-4">
          <FolderOpen className="w-5 h-5 text-surface-300 dark:text-surface-600 mx-auto mb-1" />
          <p className="text-[10px] text-surface-400">No collections yet</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {collections.map((col) => {
            const isExpanded = expandedIds.has(col.id);
            return (
              <div key={col.id}>
                {/* Collection header */}
                <div className="group flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer transition-colors">
                  <button onClick={() => toggleExpand(col.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-surface-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-surface-400 flex-shrink-0" />
                    )}
                    <FolderOpen className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-surface-700 dark:text-surface-300 truncate">
                      {col.name}
                    </span>
                    {col.requests.length > 0 && (
                      <span className="text-[10px] text-surface-400 flex-shrink-0">
                        ({col.requests.length})
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteCollection(col.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 transition-opacity"
                    title="Delete collection"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Requests */}
                {isExpanded && (
                  <div className="ml-4 pl-2 border-l border-surface-200 dark:border-surface-700/50 space-y-0.5 mt-0.5">
                    {col.requests.length === 0 ? (
                      <p className="text-[10px] text-surface-400 px-2 py-1">No requests</p>
                    ) : (
                      col.requests.map((req) => (
                        <button
                          key={req.id}
                          onClick={() => openRequestInTab(req, col.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-left group"
                        >
                          <span className={cn(
                            'text-[9px] font-bold uppercase tracking-wide w-8 flex-shrink-0',
                            methodBadgeColors[req.method] || 'text-surface-500'
                          )}>
                            {req.method}
                          </span>
                          <span className="text-[11px] text-surface-600 dark:text-surface-400 truncate">
                            {req.name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import/Export Modal */}
      {showImportExport && (
        <ImportExportPanel onClose={() => setShowImportExport(false)} />
      )}
    </div>
  );
}
