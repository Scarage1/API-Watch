import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Check, Shield, Clock, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

const AVAILABLE_SCOPES = ['read', 'write', 'admin', 'monitors', 'collections'];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read', 'write']);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api-keys');
      setKeys(res.data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const payload: Record<string, unknown> = { name, scopes };
      if (expiresInDays) {
        const d = new Date();
        d.setDate(d.getDate() + expiresInDays);
        payload.expires_at = d.toISOString();
      }
      const res = await api.post('/api-keys', payload);
      setNewKeyValue(res.data.raw_key);
      setName('');
      setScopes(['read', 'write']);
      setExpiresInDays(90);
      setShowCreate(false);
      fetchKeys();
    } catch {
      // silently handle
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await api.delete(`/api-keys/${id}`);
      fetchKeys();
    } catch {
      // silently handle
    }
  };

  const copyKey = () => {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const activeKeys = keys.filter((k) => k.is_active);
  const revokedKeys = keys.filter((k) => !k.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            API Keys
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Manage API keys for CI/CD pipelines and programmatic access
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate Key
        </button>
      </div>

      {/* New key reveal banner */}
      {newKeyValue && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Save your API key now — it won't be shown again
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white dark:bg-surface-900 rounded-lg text-xs font-mono text-surface-800 dark:text-surface-200 border border-surface-200 dark:border-surface-700 break-all">
                  {newKeyValue}
                </code>
                <button
                  onClick={copyKey}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewKeyValue(null)}
              className="text-amber-500 hover:text-amber-700 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
              <Key className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                {activeKeys.length}
              </p>
              <p className="text-xs text-surface-500">Active Keys</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                {revokedKeys.length}
              </p>
              <p className="text-xs text-surface-500">Revoked</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                {keys.length}
              </p>
              <p className="text-xs text-surface-500">Total Keys</p>
            </div>
          </div>
        </div>
      </div>

      {/* Keys list */}
      <div className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
        <div className="p-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
            Active Keys
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-surface-400">Loading...</div>
        ) : activeKeys.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No API keys yet</p>
            <p className="text-xs mt-1">Generate a key to get started with CI/CD integration</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {activeKeys.map((key) => (
              <div key={key.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 bg-surface-100 dark:bg-surface-800 rounded-lg">
                    <Key className="w-4 h-4 text-surface-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100">
                      {key.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs text-surface-500 font-mono">
                        {key.key_prefix}••••••••
                      </code>
                      <span className="text-surface-300 dark:text-surface-600">·</span>
                      <span className="text-xs text-surface-400">
                        {key.scopes.join(', ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {key.last_used_at && (
                        <span className="text-xs text-surface-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last used {new Date(key.last_used_at).toLocaleDateString()}
                        </span>
                      )}
                      {key.expires_at && (
                        <span className={cn(
                          'text-xs flex items-center gap-1',
                          new Date(key.expires_at) < new Date()
                            ? 'text-red-500'
                            : 'text-surface-400'
                        )}>
                          {new Date(key.expires_at) < new Date() ? 'Expired' : `Expires ${new Date(key.expires_at).toLocaleDateString()}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Revoke key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 opacity-60">
          <div className="p-4 border-b border-surface-100 dark:border-surface-800">
            <h2 className="text-sm font-semibold text-surface-500">Revoked Keys</h2>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {revokedKeys.map((key) => (
              <div key={key.id} className="p-4 flex items-center gap-3">
                <Key className="w-4 h-4 text-surface-400" />
                <div>
                  <p className="text-sm text-surface-500 line-through">{key.name}</p>
                  <code className="text-xs text-surface-400 font-mono">{key.key_prefix}••••••••</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-md border border-surface-200 dark:border-surface-800 shadow-xl">
            <div className="p-6 border-b border-surface-100 dark:border-surface-800">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                Generate API Key
              </h2>
              <p className="text-sm text-surface-500 mt-1">
                Create a new key for programmatic access
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. GitHub Actions CI"
                  className="w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Scopes */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                  Scopes
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <button
                      key={scope}
                      onClick={() => toggleScope(scope)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        scopes.includes(scope)
                          ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800'
                          : 'bg-surface-50 dark:bg-surface-800 text-surface-500 border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700'
                      )}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Expiration
                </label>
                <select
                  value={expiresInDays ?? 'never'}
                  onChange={(e) =>
                    setExpiresInDays(e.target.value === 'never' ? null : Number(e.target.value))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                  <option value="never">No expiration</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-surface-100 dark:border-surface-800 flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim()}
                className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
