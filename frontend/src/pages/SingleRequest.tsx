import { useCallback, useState } from 'react';
import {
  Send,
  Loader2,
  Plus,
  X,
  Copy,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient from '../lib/api';
import { useRequestStore } from '../store/useRequestStore';
import type { HttpMethod, KeyValuePair, TabResponse, BodyType } from '../store/useRequestStore';
import KeyValueEditor from '../components/KeyValueEditor';
import BodyEditor from '../components/BodyEditor';
import ResponseViewer from '../components/ResponseViewer';
import { useAppStore } from '../store/useAppStore';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const methodStyles: Record<string, string> = {
  GET: 'bg-emerald-600 text-white',
  POST: 'bg-blue-600 text-white',
  PUT: 'bg-amber-600 text-white',
  DELETE: 'bg-red-600 text-white',
  PATCH: 'bg-purple-600 text-white',
  HEAD: 'bg-teal-600 text-white',
  OPTIONS: 'bg-gray-600 text-white',
};

const methodDotColors: Record<string, string> = {
  GET: 'bg-emerald-500',
  POST: 'bg-blue-500',
  PUT: 'bg-amber-500',
  DELETE: 'bg-red-500',
  PATCH: 'bg-purple-500',
  HEAD: 'bg-teal-500',
  OPTIONS: 'bg-gray-500',
};

type RequestPanel = 'params' | 'headers' | 'body';

function deriveTabName(url: string, currentName: string): string {
  if (currentName && currentName !== 'New Request' && currentName !== 'Untitled') {
    return currentName;
  }
  if (!url) return 'Untitled';
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? u.hostname : u.pathname;
    return path.length > 25 ? path.slice(0, 25) : path;
  } catch {
    return url.length > 25 ? url.slice(0, 25) : url;
  }
}

export default function SingleRequest() {
  const {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    updateTab,
    duplicateTab,
    setResponse,
    setLoading,
    getActiveTab,
  } = useRequestStore();

  const { addToHistory } = useAppStore();
  const [activePanel, setActivePanel] = useState<RequestPanel>('params');
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);

  const tab = getActiveTab();

  const executeRequest = useCallback(async () => {
    if (!tab.url) return;
    const tabId = tab.id;
    setLoading(tabId, true);

    try {
      const headers: Record<string, string> = {};
      tab.headers
        .filter((h) => h.enabled && h.key)
        .forEach((h) => { headers[h.key] = h.value; });

      const params: Record<string, string> = {};
      tab.params
        .filter((p) => p.enabled && p.key)
        .forEach((p) => { params[p.key] = p.value; });

      let body: any = null;
      if (tab.method !== 'GET' && tab.method !== 'HEAD') {
        if (tab.bodyType === 'json') {
          try { body = JSON.parse(tab.bodyRaw); } catch { body = tab.bodyRaw; }
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        } else if (tab.bodyType === 'text' || tab.bodyType === 'xml') {
          body = tab.bodyRaw;
          if (tab.bodyType === 'xml' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/xml';
          }
        } else if (tab.bodyType === 'form-data' || tab.bodyType === 'x-www-form-urlencoded') {
          const formObj: Record<string, string> = {};
          tab.bodyFormData
            .filter((f) => f.enabled && f.key)
            .forEach((f) => { formObj[f.key] = f.value; });
          body = formObj;
          if (tab.bodyType === 'x-www-form-urlencoded' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
          }
        }
      }

      const res = await apiClient.post('/api/execute-request', {
        method: tab.method,
        url: tab.url,
        headers,
        params,
        body,
        timeout: tab.timeout,
      });
      const result = res.data;

      const tabResponse: TabResponse = {
        success: result.success,
        status_code: result.status_code,
        response_time: result.response_time,
        response_size: result.response_size,
        response_body: result.response_body,
        response_headers: result.response_headers || {},
        error: result.error,
        error_type: result.error_type,
        retry_count: result.retry_count || 0,
        timestamp: result.timestamp || new Date().toISOString(),
      };

      setResponse(tabId, tabResponse);
      addToHistory(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Request failed';
      setResponse(tab.id, {
        success: false,
        status_code: null,
        response_time: 0,
        response_size: 0,
        response_body: null,
        response_headers: {},
        error: message,
        error_type: 'CLIENT_ERROR',
        retry_count: 0,
        timestamp: new Date().toISOString(),
      });
    }
  }, [tab, setLoading, setResponse, addToHistory]);

  const update = (updates: Partial<typeof tab>) => updateTab(tab.id, updates);

  const enabledParamsCount = tab.params.filter((p) => p.enabled && p.key).length;
  const enabledHeadersCount = tab.headers.filter((h) => h.enabled && h.key).length;

  const panels: { id: RequestPanel; label: string; count?: number }[] = [
    { id: 'params', label: 'Params', count: enabledParamsCount },
    { id: 'headers', label: 'Headers', count: enabledHeadersCount },
    { id: 'body', label: 'Body' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 px-1 py-1 bg-surface-100 dark:bg-surface-900 rounded-xl mb-3 overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t.id}
            className="relative group"
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenuTab(t.id === contextMenuTab ? null : t.id);
            }}
          >
            <button
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                t.id === activeTabId
                  ? 'bg-white dark:bg-surface-800 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-200/50 dark:hover:bg-surface-800/50'
              )}
            >
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', methodDotColors[t.method] || 'bg-gray-400')} />
              <span className="max-w-[120px] truncate">{t.name || 'Untitled'}</span>
              {t.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
              <button
                onClick={(e) => { e.stopPropagation(); removeTab(t.id); }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </button>

            {contextMenuTab === t.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setContextMenuTab(null)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg py-1 min-w-[140px]">
                  <button
                    onClick={() => { duplicateTab(t.id); setContextMenuTab(null); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700/50 flex items-center gap-2"
                  >
                    <Copy className="w-3 h-3" /> Duplicate
                  </button>
                  <button
                    onClick={() => { removeTab(t.id); setContextMenuTab(null); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
                  >
                    <X className="w-3 h-3" /> Close
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        <button
          onClick={() => addTab()}
          className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-200/50 dark:hover:bg-surface-800/50 transition-colors flex-shrink-0"
          title="New tab"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* URL Bar */}
      <div className="card !p-3 mb-3">
        <div className="flex gap-2">
          <select
            value={tab.method}
            onChange={(e) => update({ method: e.target.value as HttpMethod })}
            className={cn(
              'px-3 py-2.5 rounded-xl text-xs font-bold tracking-wide appearance-none cursor-pointer min-w-[90px]',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors',
              methodStyles[tab.method]
            )}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <input
            type="text"
            value={tab.url}
            onChange={(e) => update({ url: e.target.value, name: deriveTabName(e.target.value, tab.name) })}
            onKeyDown={(e) => { if (e.key === 'Enter') executeRequest(); }}
            placeholder="https://api.example.com/endpoint"
            className="input flex-1 font-mono text-sm"
          />

          <button
            onClick={executeRequest}
            disabled={tab.isLoading || !tab.url}
            className="btn-primary !px-5"
          >
            {tab.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>

      {/* Request / Response split */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Left: Request config */}
        <div className="card !p-0 overflow-hidden flex flex-col min-h-[300px]">
          <div className="flex border-b border-surface-100 dark:border-surface-700/50">
            {panels.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePanel(p.id)}
                className={cn(
                  'px-4 py-2.5 text-xs font-medium transition-colors relative',
                  activePanel === p.id
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                )}
              >
                {p.label}
                {p.count !== undefined && p.count > 0 && (
                  <span className="ml-1 text-[10px] font-bold text-brand-500">({p.count})</span>
                )}
                {activePanel === p.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
                )}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-1.5 pr-3">
              <span className="text-[10px] text-surface-400">Timeout</span>
              <input
                type="number"
                value={tab.timeout}
                onChange={(e) => update({ timeout: parseInt(e.target.value) || 10 })}
                className="input !w-14 !py-1 text-center text-xs"
                min={1}
                max={120}
              />
              <span className="text-[10px] text-surface-400">s</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {activePanel === 'params' && (
              <KeyValueEditor
                pairs={tab.params}
                onChange={(pairs: KeyValuePair[]) => update({ params: pairs })}
                keyPlaceholder="Parameter"
                valuePlaceholder="Value"
              />
            )}

            {activePanel === 'headers' && (
              <KeyValueEditor
                pairs={tab.headers}
                onChange={(pairs: KeyValuePair[]) => update({ headers: pairs })}
                keyPlaceholder="Header"
                valuePlaceholder="Value"
              />
            )}

            {activePanel === 'body' && (
              <BodyEditor
                method={tab.method}
                bodyType={tab.bodyType}
                bodyRaw={tab.bodyRaw}
                bodyFormData={tab.bodyFormData}
                onBodyTypeChange={(bt: BodyType) => update({ bodyType: bt })}
                onBodyRawChange={(raw: string) => update({ bodyRaw: raw })}
                onBodyFormDataChange={(fd: KeyValuePair[]) => update({ bodyFormData: fd })}
              />
            )}
          </div>
        </div>

        {/* Right: Response */}
        <div className="card !p-0 overflow-hidden flex flex-col min-h-[300px]">
          {tab.isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
              <p className="text-xs text-surface-400">Sending request...</p>
            </div>
          ) : tab.response ? (
            <ResponseViewer response={tab.response} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                <Send className="w-5 h-5 text-surface-400" />
              </div>
              <p className="text-sm font-medium text-surface-500">Ready to send</p>
              <p className="text-xs text-surface-400">
                Enter a URL and hit Enter or click Send
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
