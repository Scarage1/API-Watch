import { useState, useEffect, useCallback } from 'react';
import {
  Radar,
  Plus,
  Play,
  Pause,
  Trash2,
  Settings2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Bell,
  Search,
  Activity,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface Monitor {
  id: string;
  name: string;
  description: string | null;
  collection_id: string;
  cron_expression: string;
  enabled: boolean;
  assertions: Assertion[];
  alert_after_failures: number;
  consecutive_failures: number;
  last_status: 'passing' | 'failing' | 'error' | null;
  last_run_at: string | null;
  next_run_at: string | null;
  channel_ids: string[];
  created_at: string;
  updated_at: string;
}

interface MonitorRun {
  id: string;
  status: 'passing' | 'failing' | 'error';
  duration_ms: number;
  total_requests: number;
  passed_requests: number;
  failed_requests: number;
  assertions_passed: number;
  assertions_failed: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface Assertion {
  type: string;
  operator: string;
  value: string;
}

interface Collection {
  id: string;
  name: string;
}

interface Channel {
  id: string;
  name: string;
  channel_type: string;
  enabled: boolean;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function MonitorDashboard() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [selected, setSelected] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCron, setFormCron] = useState('*/5 * * * *');
  const [formCollection, setFormCollection] = useState('');
  const [formAlertAfter, setFormAlertAfter] = useState(1);
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [formAssertions, setFormAssertions] = useState<Assertion[]>([]);
  const [editing, setEditing] = useState(false);

  const fetchMonitors = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/v1/monitors');
      setMonitors(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCollections = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/collections');
      setCollections(data);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/notifications');
      setChannels(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
    fetchCollections();
    fetchChannels();
  }, [fetchMonitors, fetchCollections, fetchChannels]);

  const fetchRuns = useCallback(async (monitorId: string) => {
    try {
      const { data } = await api.get(`/api/v1/monitors/${monitorId}/runs`);
      setRuns(data);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    if (selected) fetchRuns(selected.id);
    else setRuns([]);
  }, [selected, fetchRuns]);

  /* ── Handlers ────────────────────────────────────────────────────────── */

  const handleCreate = async () => {
    try {
      await api.post('/api/v1/monitors', {
        name: formName,
        description: formDesc || null,
        collection_id: formCollection,
        cron_expression: formCron,
        alert_after_failures: formAlertAfter,
        channel_ids: formChannels,
        assertions: formAssertions,
      });
      setShowCreate(false);
      resetForm();
      fetchMonitors();
    } catch {
      /* ignore */
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    try {
      await api.put(`/api/v1/monitors/${selected.id}`, {
        name: formName,
        description: formDesc || null,
        cron_expression: formCron,
        alert_after_failures: formAlertAfter,
        channel_ids: formChannels,
        assertions: formAssertions,
      });
      setShowCreate(false);
      setEditing(false);
      resetForm();
      fetchMonitors();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this monitor and all its history?')) return;
    try {
      await api.delete(`/api/v1/monitors/${id}`);
      if (selected?.id === id) setSelected(null);
      fetchMonitors();
    } catch {
      /* ignore */
    }
  };

  const handleToggle = async (m: Monitor) => {
    try {
      await api.put(`/api/v1/monitors/${m.id}`, { enabled: !m.enabled });
      fetchMonitors();
    } catch {
      /* ignore */
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      await api.post(`/api/v1/monitors/${id}/trigger`);
      setTimeout(() => {
        fetchMonitors();
        if (selected?.id === id) fetchRuns(id);
      }, 2000);
    } catch {
      /* ignore */
    }
  };

  const openEdit = (m: Monitor) => {
    setFormName(m.name);
    setFormDesc(m.description || '');
    setFormCron(m.cron_expression);
    setFormCollection(m.collection_id);
    setFormAlertAfter(m.alert_after_failures);
    setFormChannels(m.channel_ids);
    setFormAssertions(m.assertions);
    setSelected(m);
    setEditing(true);
    setShowCreate(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormCron('*/5 * * * *');
    setFormCollection('');
    setFormAlertAfter(1);
    setFormChannels([]);
    setFormAssertions([]);
    setEditing(false);
  };

  const addAssertion = () => {
    setFormAssertions([...formAssertions, { type: 'status_code', operator: 'eq', value: '200' }]);
  };

  const removeAssertion = (i: number) => {
    setFormAssertions(formAssertions.filter((_, idx) => idx !== i));
  };

  const updateAssertion = (i: number, field: keyof Assertion, val: string) => {
    const copy = [...formAssertions];
    copy[i] = { ...copy[i], [field]: val };
    setFormAssertions(copy);
  };

  /* ── Status helpers ──────────────────────────────────────────────────── */

  const statusIcon = (s: string | null) => {
    if (s === 'passing') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (s === 'failing') return <XCircle className="w-4 h-4 text-red-500" />;
    if (s === 'error') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <Clock className="w-4 h-4 text-surface-400" />;
  };

  const statusColor = (s: string | null) => {
    if (s === 'passing') return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (s === 'failing') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (s === 'error') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400';
  };

  const filtered = monitors.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase())
  );

  const passing = monitors.filter(m => m.last_status === 'passing').length;
  const failing = monitors.filter(m => m.last_status === 'failing').length;
  const inactive = monitors.filter(m => !m.enabled).length;

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50 flex items-center gap-2">
            <Radar className="w-6 h-6 text-primary-600" />
            API Monitors
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Continuously monitor your APIs and get alerted on failures
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Monitor
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: monitors.length, icon: Radar, color: 'text-primary-600' },
          { label: 'Passing', value: passing, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Failing', value: failing, icon: XCircle, color: 'text-red-600' },
          { label: 'Disabled', value: inactive, icon: Pause, color: 'text-surface-400' },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-4"
          >
            <div className="flex items-center gap-2">
              <card.icon className={cn('w-5 h-5', card.color)} />
              <span className="text-sm text-surface-500">{card.label}</span>
            </div>
            <p className="text-2xl font-bold mt-2 text-surface-900 dark:text-surface-50">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search monitors..."
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg text-sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monitor list */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-surface-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading monitors…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-surface-500">
              <Radar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No monitors yet. Create one to start monitoring your APIs.</p>
            </div>
          ) : (
            filtered.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelected(m)}
                className={cn(
                  'bg-white dark:bg-surface-900 rounded-xl border p-4 cursor-pointer transition-all',
                  selected?.id === m.id
                    ? 'border-primary-500 ring-1 ring-primary-500/30'
                    : 'border-surface-200 dark:border-surface-800 hover:border-surface-300'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {statusIcon(m.last_status)}
                    <div>
                      <h3 className="font-semibold text-surface-900 dark:text-surface-50">
                        {m.name}
                      </h3>
                      {m.description && (
                        <p className="text-xs text-surface-500 mt-0.5">{m.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor(m.last_status))}>
                      {m.last_status || 'pending'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-surface-400" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-surface-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {m.cron_expression}
                  </span>
                  {m.last_run_at && (
                    <span>Last: {new Date(m.last_run_at).toLocaleString()}</span>
                  )}
                  {m.channel_ids.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Bell className="w-3 h-3" /> {m.channel_ids.length} channel(s)
                    </span>
                  )}
                  {!m.enabled && (
                    <span className="text-amber-500 font-medium">Disabled</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-5">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-surface-900 dark:text-surface-50">
                  {selected.name}
                </h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleTrigger(selected.id)}
                    title="Run now"
                    className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                  >
                    <Play className="w-4 h-4 text-green-600" />
                  </button>
                  <button
                    onClick={() => handleToggle(selected)}
                    title={selected.enabled ? 'Pause' : 'Resume'}
                    className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                  >
                    {selected.enabled ? (
                      <Pause className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Play className="w-4 h-4 text-green-500" />
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(selected)}
                    className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-2">
                  <span className="text-surface-500 text-xs">Status</span>
                  <p className="font-medium">{selected.last_status || 'Pending'}</p>
                </div>
                <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-2">
                  <span className="text-surface-500 text-xs">Failures</span>
                  <p className="font-medium">{selected.consecutive_failures}</p>
                </div>
                <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-2">
                  <span className="text-surface-500 text-xs">Schedule</span>
                  <p className="font-medium text-xs">{selected.cron_expression}</p>
                </div>
                <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-2">
                  <span className="text-surface-500 text-xs">Alert after</span>
                  <p className="font-medium">{selected.alert_after_failures} failure(s)</p>
                </div>
              </div>

              {/* Recent runs */}
              <div>
                <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-2 flex items-center gap-1">
                  <Activity className="w-4 h-4" /> Recent Runs
                </h3>
                {runs.length === 0 ? (
                  <p className="text-xs text-surface-500">No runs yet</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {runs.slice(0, 20).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs bg-surface-50 dark:bg-surface-800 rounded-lg p-2"
                      >
                        <div className="flex items-center gap-2">
                          {statusIcon(r.status)}
                          <span className="font-medium">
                            {r.passed_requests}/{r.total_requests} passed
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-surface-500">
                          <span>{r.duration_ms}ms</span>
                          <span>{new Date(r.started_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-surface-500">
              <Radar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a monitor to see details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold">
              {editing ? 'Edit Monitor' : 'New Monitor'}
            </h2>

            <div>
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Name</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Description</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Collection</label>
              <select
                value={formCollection}
                onChange={(e) => setFormCollection(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
              >
                <option value="">Select a collection</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Cron Expression</label>
                <input
                  value={formCron}
                  onChange={(e) => setFormCron(e.target.value)}
                  placeholder="*/5 * * * *"
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Alert After Failures</label>
                <input
                  type="number"
                  min={1}
                  value={formAlertAfter}
                  onChange={(e) => setFormAlertAfter(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                />
              </div>
            </div>

            {/* Notification Channels */}
            {channels.length > 0 && (
              <div>
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Notification Channels
                </label>
                <div className="mt-1 space-y-1">
                  {channels.map((ch) => (
                    <label key={ch.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formChannels.includes(ch.id)}
                        onChange={(e) => {
                          if (e.target.checked) setFormChannels([...formChannels, ch.id]);
                          else setFormChannels(formChannels.filter((id) => id !== ch.id));
                        }}
                        className="rounded"
                      />
                      {ch.name} ({ch.channel_type})
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Assertions */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-surface-700 dark:text-surface-300">Assertions</label>
                <button onClick={addAssertion} className="text-xs text-primary-600 hover:underline">
                  + Add Assertion
                </button>
              </div>
              <div className="mt-1 space-y-2">
                {formAssertions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={a.type}
                      onChange={(e) => updateAssertion(i, 'type', e.target.value)}
                      className="px-2 py-1 border rounded text-xs bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                    >
                      <option value="status_code">Status Code</option>
                      <option value="response_time">Response Time</option>
                      <option value="body_contains">Body Contains</option>
                      <option value="header_exists">Header Exists</option>
                    </select>
                    <select
                      value={a.operator}
                      onChange={(e) => updateAssertion(i, 'operator', e.target.value)}
                      className="px-2 py-1 border rounded text-xs bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                    >
                      <option value="eq">equals</option>
                      <option value="lt">less than</option>
                      <option value="gt">greater than</option>
                    </select>
                    <input
                      value={a.value}
                      onChange={(e) => updateAssertion(i, 'value', e.target.value)}
                      className="flex-1 px-2 py-1 border rounded text-xs bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700"
                    />
                    <button onClick={() => removeAssertion(i)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setShowCreate(false); resetForm(); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 border-surface-200 dark:border-surface-700"
              >
                Cancel
              </button>
              <button
                onClick={editing ? handleUpdate : handleCreate}
                disabled={!formName || !formCollection}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {editing ? 'Save Changes' : 'Create Monitor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
