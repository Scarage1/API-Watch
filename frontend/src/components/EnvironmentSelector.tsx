import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  ChevronDown,
  Plus,
  X,
  Loader2,
  Check,
  Pencil,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient from '../lib/api';

interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  is_active: boolean;
}

export default function EnvironmentSelector() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnv, setActiveEnv] = useState<Environment | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorEnv, setEditorEnv] = useState<Environment | null>(null);
  const [newName, setNewName] = useState('');
  const [newVars, setNewVars] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchEnvironments = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/environments');
      setEnvironments(res.data);
      const active = res.data.find((e: Environment) => e.is_active);
      setActiveEnv(active || null);
    } catch {
      setEnvironments([]);
    }
  }, []);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const selectEnvironment = async (env: Environment) => {
    try {
      await apiClient.put(`/api/v1/environments/${env.id}`, {
        name: env.name,
        variables: env.variables,
        is_active: true,
      });
      setIsOpen(false);
      fetchEnvironments();
    } catch {
      // ignore
    }
  };

  const deactivateAll = async () => {
    if (!activeEnv) return;
    try {
      await apiClient.put(`/api/v1/environments/${activeEnv.id}`, {
        name: activeEnv.name,
        variables: activeEnv.variables,
        is_active: false,
      });
      setIsOpen(false);
      fetchEnvironments();
    } catch {
      // ignore
    }
  };

  const openEditor = (env?: Environment) => {
    if (env) {
      setEditorEnv(env);
      setNewName(env.name);
      setNewVars(
        Object.entries(env.variables)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      );
    } else {
      setEditorEnv(null);
      setNewName('');
      setNewVars('');
    }
    setShowEditor(true);
    setIsOpen(false);
  };

  const parseVars = (text: string): Record<string, string> => {
    const vars: Record<string, string> = {};
    text.split('\n').forEach((line) => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });
    return vars;
  };

  const saveEnvironment = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const variables = parseVars(newVars);
      if (editorEnv) {
        await apiClient.put(`/api/v1/environments/${editorEnv.id}`, {
          name: newName.trim(),
          variables,
          is_active: editorEnv.is_active,
        });
      } else {
        await apiClient.post('/api/v1/environments', {
          name: newName.trim(),
          variables,
        });
      }
      setShowEditor(false);
      fetchEnvironments();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const deleteEnvironment = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/environments/${id}`);
      setShowEditor(false);
      fetchEnvironments();
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Dropdown trigger */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border',
            activeEnv
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-surface-100 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-500'
          )}
        >
          <Globe className="w-3 h-3" />
          <span className="max-w-[100px] truncate">{activeEnv?.name || 'No Env'}</span>
          <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg py-1 min-w-[180px]">
              {/* No environment option */}
              <button
                onClick={deactivateAll}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-surface-50 dark:hover:bg-surface-700/50',
                  !activeEnv ? 'text-brand-600 font-medium' : 'text-surface-500'
                )}
              >
                {!activeEnv && <Check className="w-3 h-3" />}
                <span className={!activeEnv ? '' : 'ml-5'}>No Environment</span>
              </button>

              <div className="border-t border-surface-100 dark:border-surface-700/50 my-1" />

              {environments.map((env) => (
                <div key={env.id} className="flex items-center group">
                  <button
                    onClick={() => selectEnvironment(env)}
                    className={cn(
                      'flex-1 px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-surface-50 dark:hover:bg-surface-700/50',
                      env.is_active ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-surface-600 dark:text-surface-300'
                    )}
                  >
                    {env.is_active && <Check className="w-3 h-3" />}
                    <span className={env.is_active ? '' : 'ml-5'}>{env.name}</span>
                    <span className="text-[10px] text-surface-400 ml-auto">
                      {Object.keys(env.variables).length} vars
                    </span>
                  </button>
                  <button
                    onClick={() => openEditor(env)}
                    className="p-1 mr-1 rounded opacity-0 group-hover:opacity-100 text-surface-400 hover:text-brand-500 transition-opacity"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="border-t border-surface-100 dark:border-surface-700/50 my-1" />

              <button
                onClick={() => openEditor()}
                className="w-full px-3 py-1.5 text-left text-xs text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/10 flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                New Environment
              </button>
            </div>
          </>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEditor(false)} />
          <div className="relative bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 dark:border-surface-700/50">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">
                {editorEnv ? 'Edit Environment' : 'New Environment'}
              </h3>
              <button onClick={() => setShowEditor(false)} className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700">
                <X className="w-4 h-4 text-surface-400" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Development"
                  className="input text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">
                  Variables <span className="text-surface-400 font-normal">(KEY=VALUE, one per line)</span>
                </label>
                <textarea
                  value={newVars}
                  onChange={(e) => setNewVars(e.target.value)}
                  placeholder={'BASE_URL=https://api.example.com\nAPI_KEY=your-key-here\nTOKEN=abc123'}
                  className="input font-mono text-xs !rounded-xl"
                  rows={6}
                />
                <p className="text-[10px] text-surface-400 mt-1">
                  {'Use {{VARIABLE_NAME}} in your requests to interpolate'}
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-surface-100 dark:border-surface-700/50 flex items-center justify-between">
              <div>
                {editorEnv && (
                  <button
                    onClick={() => deleteEnvironment(editorEnv.id)}
                    className="btn-ghost !py-1.5 !px-3 !text-xs text-red-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowEditor(false)} className="btn-secondary !py-1.5 !text-xs">
                  Cancel
                </button>
                <button
                  onClick={saveEnvironment}
                  disabled={saving || !newName.trim()}
                  className="btn-primary !py-1.5 !text-xs"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
