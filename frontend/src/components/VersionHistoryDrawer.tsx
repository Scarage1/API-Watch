/**
 * VersionHistoryDrawer — slide-over panel showing collection snapshots + restore.
 */
import { useState, useEffect } from 'react';
import {
  X, History, Plus, RotateCcw, Loader2, ChevronRight,
  Package, Clock,
} from 'lucide-react';
import apiClient, { extractDetail } from '../lib/api';
import { toast } from '../store/useToastStore';

interface Snapshot {
  id: string;
  version: number;
  label: string;
  request_count: number;
  created_at: string;
  created_by_email: string;
}

interface Props {
  collectionId: string;
  collectionName: string;
  open: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

export default function VersionHistoryDrawer({
  collectionId,
  collectionName: _collectionName,
  open,
  onClose,
  onRestored,
}: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  useEffect(() => {
    if (open) fetchSnapshots();
  }, [open, collectionId]);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/v1/collections/${collectionId}/snapshots`);
      setSnapshots(res.data);
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiClient.post(`/api/v1/collections/${collectionId}/snapshots`, {
        label: label || undefined,
      });
      toast.success('Snapshot created');
      setLabel('');
      setShowCreate(false);
      fetchSnapshots();
    } catch (err: any) {
      toast.error(extractDetail(err, 'Failed to create snapshot'));
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snapId: string) => {
    if (!confirm('Restoring will replace all current requests. A safety backup will be created first. Continue?')) return;
    setRestoringId(snapId);
    try {
      await apiClient.post(`/api/v1/collections/${collectionId}/snapshots/${snapId}/restore`);
      toast.success('Snapshot restored');
      onRestored?.();
      fetchSnapshots();
    } catch (err: any) {
      toast.error(extractDetail(err, 'Failed to restore'));
    } finally {
      setRestoringId(null);
    }
  };

  const handlePreview = async (snapId: string) => {
    if (previewId === snapId) {
      setPreviewId(null);
      setPreviewData(null);
      return;
    }
    try {
      const res = await apiClient.get(`/api/v1/collections/${collectionId}/snapshots/${snapId}`);
      setPreviewId(snapId);
      setPreviewData(res.data.snapshot_data);
    } catch {
      toast.error('Failed to load snapshot preview');
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white dark:bg-surface-900 shadow-2xl flex flex-col animate-slide-left">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Versions
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800">
            <X className="w-5 h-5 text-surface-400" />
          </button>
        </div>

        {/* Create snapshot */}
        <div className="px-6 py-3 border-b border-surface-100 dark:border-surface-800">
          {showCreate ? (
            <div className="flex gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Snapshot label (optional)"
                className="input flex-1 !py-2 text-sm"
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary !py-2 !px-3 text-sm"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="btn-secondary !py-2 !px-3 text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Create snapshot
            </button>
          )}
        </div>

        {/* Snapshots list */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-surface-400 animate-spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-10 h-10 text-surface-300 dark:text-surface-600 mx-auto mb-2" />
              <p className="text-sm text-surface-400">No snapshots yet</p>
              <p className="text-xs text-surface-400 mt-1">
                Create a snapshot to save the current state
              </p>
            </div>
          ) : (
            snapshots.map((snap) => (
              <div key={snap.id}>
                <div
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer transition-colors"
                  onClick={() => handlePreview(snap.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                        v{snap.version}
                      </span>
                      <span className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                        {snap.label || `Snapshot v${snap.version}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {snap.request_count} requests
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(snap.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(snap.id);
                      }}
                      disabled={restoringId === snap.id}
                      className="p-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 text-surface-400 hover:text-brand-600"
                      title="Restore this version"
                    >
                      {restoringId === snap.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                    </button>
                    <ChevronRight
                      className={`w-4 h-4 text-surface-400 transition-transform ${
                        previewId === snap.id ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Preview */}
                {previewId === snap.id && previewData && (
                  <div className="ml-4 mt-1 mb-2 p-3 rounded-lg bg-surface-100 dark:bg-surface-800 text-xs">
                    <p className="font-medium text-surface-600 dark:text-surface-400 mb-1">
                      Saved Requests:
                    </p>
                    {previewData.requests?.length > 0 ? (
                      <ul className="space-y-1">
                        {previewData.requests.map((r: any, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-surface-500 dark:text-surface-400">
                            <span className={`font-mono text-[10px] px-1 py-0.5 rounded ${
                              r.method === 'GET' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              r.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              r.method === 'PUT' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              r.method === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
                            }`}>
                              {r.method}
                            </span>
                            <span className="truncate">{r.name || r.url}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-surface-400 italic">No requests in this snapshot</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
