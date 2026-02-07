/**
 * WorkspaceSwitcher — dropdown in sidebar to switch active workspace.
 */
import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Plus, Check, Building2 } from 'lucide-react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { cn } from '../lib/utils';

export default function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspaceId,
    loading,
    fetchWorkspaces,
    switchWorkspace,
    createWorkspace,
  } = useWorkspaceStore();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createWorkspace(newName.trim());
      setNewName('');
      setCreating(false);
    } catch {
      // ignore
    }
  };

  return (
    <div ref={ref} className="relative mb-2">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all',
          'bg-surface-50 dark:bg-surface-800/50 hover:bg-surface-100 dark:hover:bg-surface-800',
          'text-surface-700 dark:text-surface-300'
        )}
      >
        <Building2 className="w-4 h-4 text-brand-500 flex-shrink-0" />
        <span className="truncate flex-1 text-left">
          {loading ? 'Loading…' : active?.name || 'No Workspace'}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-surface-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  switchWorkspace(ws.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors',
                  ws.id === activeWorkspaceId
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-700/50'
                )}
              >
                <span className="truncate flex-1 text-left">{ws.name}</span>
                {ws.is_personal && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400">
                    Personal
                  </span>
                )}
                {ws.id === activeWorkspaceId && (
                  <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-surface-100 dark:border-surface-700 p-2">
            {creating ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Workspace name…"
                  className="flex-1 px-2 py-1.5 text-[12px] rounded-lg border border-surface-200 dark:border-surface-600 bg-transparent outline-none focus:border-brand-400"
                />
                <button
                  onClick={handleCreate}
                  className="px-2 py-1.5 text-[12px] font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-surface-500 dark:text-surface-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors rounded-lg hover:bg-surface-50 dark:hover:bg-surface-700/50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Workspace</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
