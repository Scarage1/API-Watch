/**
 * Teams & Workspace management page.
 * Shows workspace members, pending invitations, and team management.
 */
import { useEffect, useState } from 'react';
import {
  Users, UserPlus, Trash2, Mail, X,
} from 'lucide-react';
import apiClient, { extractDetail } from '../lib/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { toast } from '../store/useToastStore';
import { cn } from '../lib/utils';

interface Member {
  id: string;
  user_id: string;
  username: string;
  email: string;
  role: string;
  joined_at: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
  editor: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
  viewer: 'text-surface-500 bg-surface-100 dark:text-surface-400 dark:bg-surface-800',
};

export default function TeamSettings() {
  const { activeWorkspaceId, getActiveWorkspace } = useWorkspaceStore();
  const activeWs = getActiveWorkspace();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer' | 'admin'>('editor');
  const [inviting, setInviting] = useState(false);

  const fetchData = async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        apiClient.get(`/api/v1/workspaces/${activeWorkspaceId}/members`),
        apiClient.get(`/api/v1/invitations/workspace/${activeWorkspaceId}`).catch(() => ({ data: [] })),
      ]);
      setMembers(membersRes.data);
      setInvites(invitesRes.data.filter((i: PendingInvite) => i.status === 'pending'));
    } catch {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !activeWorkspaceId) return;
    setInviting(true);
    try {
      await apiClient.post('/api/v1/invitations', {
        email: inviteEmail.trim().toLowerCase(),
        workspace_id: activeWorkspaceId,
        role: inviteRole,
      });
      toast.success('Invitation sent', `Invited ${inviteEmail}`);
      setInviteEmail('');
      fetchData();
    } catch (err: any) {
      toast.error('Invite failed', extractDetail(err, 'Unknown error'));
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activeWorkspaceId) return;
    try {
      await apiClient.delete(`/api/v1/workspaces/${activeWorkspaceId}/members/${memberId}`);
      toast.success('Member removed');
      fetchData();
    } catch (err: any) {
      toast.error('Failed', extractDetail(err, 'Unknown error'));
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await apiClient.delete(`/api/v1/invitations/${inviteId}`);
      toast.success('Invitation revoked');
      fetchData();
    } catch {
      toast.error('Failed to revoke invitation');
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    if (!activeWorkspaceId) return;
    try {
      await apiClient.put(`/api/v1/workspaces/${activeWorkspaceId}/members/${memberId}`, {
        role: newRole,
      });
      toast.success('Role updated');
      fetchData();
    } catch (err: any) {
      toast.error('Failed', extractDetail(err, 'Unknown error'));
    }
  };

  if (!activeWorkspaceId) {
    return (
      <div className="flex items-center justify-center h-full text-surface-500">
        <p>Select a workspace to manage team settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/20">
          <Users className="w-6 h-6 text-brand-600 dark:text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            Team & Members
          </h1>
          <p className="text-sm text-surface-500">
            {activeWs?.name || 'Workspace'} · {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Invite Section */}
      <div className="bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
            Invite Member
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="user@example.com"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-600 bg-transparent outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
            />
          </div>

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as any)}
            className="px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-600 bg-transparent outline-none focus:border-brand-400"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>

          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="px-4 py-2.5 text-sm font-medium rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {inviting ? 'Sending…' : 'Invite'}
          </button>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700">
        <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-700">
          <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
            Members ({members.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-surface-400 text-sm">Loading…</div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {members.map((m) => {
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-sm font-semibold text-brand-700 dark:text-brand-300">
                    {m.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                      {m.username}
                    </p>
                    <p className="text-xs text-surface-400 truncate">{m.email}</p>
                  </div>

                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.id, e.target.value)}
                    className={cn(
                      'px-2 py-1 text-[11px] font-medium rounded-lg border-none outline-none cursor-pointer',
                      ROLE_COLORS[m.role] || ROLE_COLORS.viewer
                    )}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remove member"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {invites.length > 0 && (
        <div className="bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-700">
          <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-700">
            <h2 className="text-sm font-semibold text-surface-800 dark:text-surface-200">
              Pending Invitations ({invites.length})
            </h2>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-5 py-3">
                <Mail className="w-4 h-4 text-surface-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-700 dark:text-surface-300 truncate">
                    {inv.email}
                  </p>
                  <p className="text-xs text-surface-400">
                    Invited as {inv.role} · Expires{' '}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeInvite(inv.id)}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Revoke invitation"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
