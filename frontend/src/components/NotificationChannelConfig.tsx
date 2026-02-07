import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Settings2,
  Mail,
  Globe,
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../lib/api';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface Channel {
  id: string;
  name: string;
  channel_type: 'email' | 'webhook' | 'slack';
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const TYPE_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  webhook: Globe,
  slack: MessageSquare,
};

/* ── Component ───────────────────────────────────────────────────────────── */

export default function NotificationChannelConfig() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | null>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'email' | 'webhook' | 'slack'>('webhook');
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/v1/notifications');
      setChannels(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  /* ── Handlers ────────────────────────────────────────────────────────── */

  const resetForm = () => {
    setFormName('');
    setFormType('webhook');
    setFormConfig({});
    setEditing(null);
  };

  const buildConfig = () => {
    if (formType === 'email') return { recipients: (formConfig.recipients || '').split(',').map(s => s.trim()).filter(Boolean) };
    if (formType === 'webhook') return { url: formConfig.url || '', method: formConfig.method || 'POST', headers: {} };
    if (formType === 'slack') return { webhook_url: formConfig.webhook_url || '' };
    return {};
  };

  const handleCreate = async () => {
    try {
      await api.post('/api/v1/notifications', {
        name: formName,
        channel_type: formType,
        config: buildConfig(),
      });
      setShowCreate(false);
      resetForm();
      fetch();
    } catch {
      /* ignore */
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    try {
      await api.put(`/api/v1/notifications/${editing}`, {
        name: formName,
        config: buildConfig(),
      });
      setShowCreate(false);
      resetForm();
      fetch();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification channel?')) return;
    try {
      await api.delete(`/api/v1/notifications/${id}`);
      fetch();
    } catch {
      /* ignore */
    }
  };

  const handleTest = async (id: string) => {
    try {
      setTestResult(prev => ({ ...prev, [id]: null }));
      await api.post(`/api/v1/notifications/${id}/test`);
      setTestResult(prev => ({ ...prev, [id]: 'ok' }));
    } catch {
      setTestResult(prev => ({ ...prev, [id]: 'fail' }));
    }
  };

  const openEdit = (ch: Channel) => {
    setFormName(ch.name);
    setFormType(ch.channel_type);
    if (ch.channel_type === 'email') {
      setFormConfig({ recipients: ((ch.config.recipients as string[]) || []).join(', ') });
    } else if (ch.channel_type === 'webhook') {
      setFormConfig({ url: (ch.config.url as string) || '', method: (ch.config.method as string) || 'POST' });
    } else if (ch.channel_type === 'slack') {
      setFormConfig({ webhook_url: (ch.config.webhook_url as string) || '' });
    }
    setEditing(ch.id);
    setShowCreate(true);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-surface-900 dark:text-surface-50 flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-600" />
            Notification Channels
          </h2>
          <p className="text-sm text-surface-500 mt-1">
            Configure where alerts are sent when monitors fail
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Add Channel
        </button>
      </div>

      {/* Channel list */}
      {loading ? (
        <p className="text-sm text-surface-500">Loading...</p>
      ) : channels.length === 0 ? (
        <div className="text-center py-12 text-surface-500">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No notification channels configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((ch) => {
            const Icon = TYPE_ICONS[ch.channel_type] || Globe;
            return (
              <div
                key={ch.id}
                className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-surface-900 dark:text-surface-50 text-sm">
                        {ch.name}
                      </h3>
                      <span className="text-xs text-surface-500 capitalize">{ch.channel_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTest(ch.id)}
                      title="Send test"
                      className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                    >
                      {testResult[ch.id] === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : testResult[ch.id] === 'fail' ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Send className="w-4 h-4 text-surface-500" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(ch)}
                      className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-surface-500">
                  {ch.channel_type === 'email' && `Recipients: ${(ch.config.recipients as string[] || []).join(', ')}`}
                  {ch.channel_type === 'webhook' && `URL: ${ch.config.url}`}
                  {ch.channel_type === 'slack' && `Webhook configured`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold">
              {editing ? 'Edit Channel' : 'New Notification Channel'}
            </h2>

            <div>
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
              />
            </div>

            {!editing && (
              <div>
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Type</label>
                <select
                  value={formType}
                  onChange={(e) => { setFormType(e.target.value as 'email' | 'webhook' | 'slack'); setFormConfig({}); }}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                >
                  <option value="webhook">Webhook</option>
                  <option value="email">Email</option>
                  <option value="slack">Slack</option>
                </select>
              </div>
            )}

            {/* Type-specific config */}
            {formType === 'webhook' && (
              <>
                <div>
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">URL</label>
                  <input
                    value={formConfig.url || ''}
                    onChange={(e) => setFormConfig({ ...formConfig, url: e.target.value })}
                    placeholder="https://hooks.example.com/..."
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Method</label>
                  <select
                    value={formConfig.method || 'POST'}
                    onChange={(e) => setFormConfig({ ...formConfig, method: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
              </>
            )}
            {formType === 'email' && (
              <div>
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Recipients (comma-separated)
                </label>
                <input
                  value={formConfig.recipients || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, recipients: e.target.value })}
                  placeholder="alice@example.com, bob@example.com"
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                />
              </div>
            )}
            {formType === 'slack' && (
              <div>
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Slack Webhook URL
                </label>
                <input
                  value={formConfig.webhook_url || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, webhook_url: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setShowCreate(false); resetForm(); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 border-surface-200 dark:border-surface-700"
              >
                Cancel
              </button>
              <button
                onClick={editing ? handleUpdate : handleCreate}
                disabled={!formName}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
