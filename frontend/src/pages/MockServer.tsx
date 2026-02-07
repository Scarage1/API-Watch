/**
 * Mock Server management page.
 * Define mock API endpoints, manage responses, view hit counts.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Server, Plus, Trash2, Edit3, Save, X, Loader2,
  ToggleLeft, ToggleRight, Copy, Check, Zap, Activity,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient, { extractDetail } from '../lib/api';
import { toast } from '../store/useToastStore';

interface MockEndpoint {
  id: string;
  name: string;
  description: string | null;
  method: string;
  path: string;
  status_code: number;
  response_body: string | null;
  response_headers: Record<string, string>;
  delay_ms: number;
  is_active: boolean;
  hit_count: number;
  created_at: string;
  updated_at: string;
}

interface MockForm {
  name: string;
  description: string;
  method: string;
  path: string;
  status_code: number;
  response_body: string;
  response_headers: string;
  delay_ms: number;
  is_active: boolean;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const emptyForm: MockForm = {
  name: '', description: '', method: 'GET', path: '/api/',
  status_code: 200, response_body: '{\n  "message": "Hello from mock server"\n}',
  response_headers: '{\n  "Content-Type": "application/json"\n}',
  delay_ms: 0, is_active: true,
};

export default function MockServer() {
  const [endpoints, setEndpoints] = useState<MockEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MockForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000/mock-server`;

  const loadEndpoints = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/mock/endpoints');
      setEndpoints(res.data);
    } catch {
      toast.error('Failed to load', 'Could not fetch mock endpoints');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEndpoints(); }, [loadEndpoints]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.path.trim()) {
      toast.warning('Required fields', 'Name and path are required');
      return;
    }

    setSaving(true);
    try {
      let parsedHeaders = {};
      if (form.response_headers.trim()) {
        try { parsedHeaders = JSON.parse(form.response_headers); } catch { toast.error('Invalid JSON', 'Response headers must be valid JSON'); setSaving(false); return; }
      }

      const payload = {
        name: form.name,
        description: form.description || null,
        method: form.method,
        path: form.path.startsWith('/') ? form.path : `/${form.path}`,
        status_code: form.status_code,
        response_body: form.response_body || null,
        response_headers: parsedHeaders,
        delay_ms: form.delay_ms,
        is_active: form.is_active,
      };

      if (editingId) {
        await apiClient.put(`/api/v1/mock/endpoints/${editingId}`, payload);
        toast.success('Updated', form.name);
      } else {
        await apiClient.post('/api/v1/mock/endpoints', payload);
        toast.success('Created', form.name);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      loadEndpoints();
    } catch (err: any) {
      toast.error('Error', extractDetail(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/mock/endpoints/${id}`);
      toast.success('Deleted', 'Mock endpoint removed');
      loadEndpoints();
    } catch {
      toast.error('Error', 'Failed to delete');
    }
  };

  const handleToggle = async (endpoint: MockEndpoint) => {
    try {
      await apiClient.put(`/api/v1/mock/endpoints/${endpoint.id}`, {
        is_active: !endpoint.is_active,
      });
      loadEndpoints();
    } catch {
      toast.error('Error', 'Failed to toggle');
    }
  };

  const startEdit = (ep: MockEndpoint) => {
    setEditingId(ep.id);
    setForm({
      name: ep.name,
      description: ep.description || '',
      method: ep.method,
      path: ep.path,
      status_code: ep.status_code,
      response_body: ep.response_body || '',
      response_headers: JSON.stringify(ep.response_headers || {}, null, 2),
      delay_ms: ep.delay_ms,
      is_active: ep.is_active,
    });
    setShowForm(true);
  };

  const copyMockUrl = (path: string) => {
    const url = `${baseUrl}${path}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(path);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const activeCount = endpoints.filter((e) => e.is_active).length;
  const totalHits = endpoints.reduce((sum, e) => sum + e.hit_count, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-violet-600" />
            Mock Server
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Define mock API endpoints with predefined responses
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Endpoint
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Endpoints', value: endpoints.length, icon: Server },
          { label: 'Active', value: activeCount, icon: Zap },
          { label: 'Total Hits', value: totalHits, icon: Activity },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-surface-100 dark:bg-surface-800">
              <stat.icon className="w-4 h-4 text-surface-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-surface-900 dark:text-white">{stat.value}</p>
              <p className="text-[11px] text-surface-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
              {editingId ? 'Edit Endpoint' : 'New Mock Endpoint'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-surface-400 hover:text-surface-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Get Users" className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Returns list of users" className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Method</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none">
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Path *</label>
              <input type="text" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/api/users" className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm font-mono outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Status Code</label>
              <input type="number" value={form.status_code} onChange={(e) => setForm({ ...form, status_code: parseInt(e.target.value) || 200 })} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-surface-500 mb-1">Response Body</label>
            <textarea value={form.response_body} onChange={(e) => setForm({ ...form, response_body: e.target.value })} rows={6} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-xs font-mono resize-y outline-none" spellCheck={false} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-surface-500 mb-1">Response Headers (JSON)</label>
              <textarea value={form.response_headers} onChange={(e) => setForm({ ...form, response_headers: e.target.value })} rows={3} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-xs font-mono resize-y outline-none" spellCheck={false} />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Delay (ms)</label>
                <input type="number" value={form.delay_ms} onChange={(e) => setForm({ ...form, delay_ms: parseInt(e.target.value) || 0 })} min={0} max={30000} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-xs text-surface-600 dark:text-surface-400">Active</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-xl transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Endpoint list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
          </div>
        ) : endpoints.length === 0 ? (
          <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-8 text-center">
            <Server className="w-10 h-10 mx-auto mb-3 text-surface-300" />
            <p className="text-sm font-medium text-surface-600 dark:text-surface-400">No mock endpoints yet</p>
            <p className="text-xs text-surface-400 mt-1">Create your first mock endpoint to get started</p>
          </div>
        ) : (
          endpoints.map((ep) => (
            <div key={ep.id} className={cn('bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-4 transition-opacity', !ep.is_active && 'opacity-50')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-bold', METHOD_COLORS[ep.method] || 'bg-surface-100 text-surface-600')}>
                    {ep.method}
                  </span>
                  <span className="text-sm font-mono text-surface-700 dark:text-surface-300 truncate">{ep.path}</span>
                  <span className="text-xs text-surface-400 truncate hidden sm:block">— {ep.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-surface-400 tabular-nums hidden sm:block">{ep.hit_count} hits</span>
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', ep.status_code < 300 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ep.status_code < 400 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700')}>
                    {ep.status_code}
                  </span>
                  {ep.delay_ms > 0 && (
                    <span className="text-[10px] text-amber-500">{ep.delay_ms}ms</span>
                  )}
                  <button onClick={() => copyMockUrl(ep.path)} className="p-1.5 text-surface-400 hover:text-brand-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800" title="Copy URL">
                    {copiedUrl === ep.path ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleToggle(ep)} className="p-1.5 text-surface-400 hover:text-brand-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800" title={ep.is_active ? 'Disable' : 'Enable'}>
                    {ep.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => startEdit(ep)} className="p-1.5 text-surface-400 hover:text-brand-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800" title="Edit">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(ep.id)} className="p-1.5 text-surface-400 hover:text-red-500 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
