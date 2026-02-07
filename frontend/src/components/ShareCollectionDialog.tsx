/**
 * ShareCollectionDialog — share a collection with other workspaces, view shares, fork.
 */
import { useState, useEffect } from 'react';
import {
  X, Share2, GitFork, Trash2, Loader2, Users, Eye, Pencil,
} from 'lucide-react';
import apiClient, { extractDetail } from '../lib/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { toast } from '../store/useToastStore';

interface ShareEntry {
  id: string;
  workspace_id: string;
  workspace_name: string;
  permission: string;
  created_at: string;
}

interface Props {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onForked?: () => void;
}

export default function ShareCollectionDialog({
  collectionId,
  collectionName,
  onClose,
  onForked,
}: Props) {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWsId, setSelectedWsId] = useState('');
  const [permission, setPermission] = useState<'read' | 'write'>('read');
  const [sharing, setSharing] = useState(false);
  const [forking, setForking] = useState(false);

  const availableWorkspaces = workspaces.filter(
    (ws) => ws.id !== activeWorkspaceId && !shares.some((s) => s.workspace_id === ws.id)
  );

  useEffect(() => {
    fetchShares();
  }, [collectionId]);

  const fetchShares = async () => {
    try {
      const res = await apiClient.get(`/api/v1/collections/${collectionId}/shares`);
      setShares(res.data);
    } catch {
      setShares([]);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!selectedWsId) return;
    setSharing(true);
    try {
      await apiClient.post(`/api/v1/collections/${collectionId}/share`, {
        workspace_id: selectedWsId,
        permission,
      });
      toast.success('Collection shared');
      setSelectedWsId('');
      fetchShares();
    } catch (err: any) {
      toast.error(extractDetail(err, 'Failed to share'));
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async (shareId: string) => {
    try {
      await apiClient.delete(`/api/v1/collections/${collectionId}/share/${shareId}`);
      toast.info('Share removed');
      fetchShares();
    } catch {
      toast.error('Failed to remove share');
    }
  };

  const handleFork = async () => {
    setForking(true);
    try {
      const res = await apiClient.post(`/api/v1/collections/${collectionId}/fork`);
      toast.success('Collection forked', res.data.name);
      onForked?.();
      onClose();
    } catch (err: any) {
      toast.error(extractDetail(err, 'Failed to fork'));
    } finally {
      setForking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-800">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Share "{collectionName}"
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800">
            <X className="w-5 h-5 text-surface-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Share with workspace */}
          <div>
            <label className="text-sm font-medium text-surface-700 dark:text-surface-300 block mb-2">
              Share with workspace
            </label>
            <div className="flex gap-2">
              <select
                value={selectedWsId}
                onChange={(e) => setSelectedWsId(e.target.value)}
                className="input flex-1 !py-2 text-sm"
              >
                <option value="">Select workspace...</option>
                {availableWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} {ws.is_personal ? '(Personal)' : ''}
                  </option>
                ))}
              </select>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'read' | 'write')}
                className="input !w-28 !py-2 text-sm"
              >
                <option value="read">Read</option>
                <option value="write">Write</option>
              </select>
              <button
                onClick={handleShare}
                disabled={!selectedWsId || sharing}
                className="btn-primary !py-2 !px-4 text-sm"
              >
                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Share'}
              </button>
            </div>
          </div>

          {/* Current shares */}
          <div>
            <h3 className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              Shared with
            </h3>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 text-surface-400 animate-spin" />
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-surface-400 py-2">Not shared with any workspace yet.</p>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-50 dark:bg-surface-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-surface-400" />
                      <span className="text-sm text-surface-700 dark:text-surface-300">
                        {share.workspace_name}
                      </span>
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400">
                        {share.permission === 'write' ? (
                          <><Pencil className="w-3 h-3" /> Write</>
                        ) : (
                          <><Eye className="w-3 h-3" /> Read</>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnshare(share.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fork */}
          <div className="pt-2 border-t border-surface-100 dark:border-surface-800">
            <button
              onClick={handleFork}
              disabled={forking}
              className="flex items-center gap-2 w-full px-4 py-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-left"
            >
              {forking ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
              ) : (
                <GitFork className="w-5 h-5 text-brand-600" />
              )}
              <div>
                <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                  Fork this collection
                </p>
                <p className="text-xs text-surface-400">
                  Create an independent copy in your current workspace
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
