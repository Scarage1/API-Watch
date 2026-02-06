import { useCallback, useState, useEffect, useMemo } from 'react';
import {
  Send,
  Loader2,
  Plus,
  X,
  Copy,
  Globe,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Code2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient from '../lib/api';
import { useRequestStore } from '../store/useRequestStore';
import type { HttpMethod, KeyValuePair, TabResponse, BodyType } from '../store/useRequestStore';
import { useEnvironmentStore } from '../store/useEnvironmentStore';
import {
  interpolateString,
  interpolateRecord,
  interpolateBody,
  hasVariables,
  getUnresolvedVariables,
  previewInterpolation,
  DYNAMIC_VARIABLE_NAMES,
} from '../lib/interpolate';
import { runScript, PRE_REQUEST_SNIPPETS, TEST_SNIPPETS } from '../lib/scriptEngine';
import type { ScriptContext } from '../lib/scriptEngine';
import KeyValueEditor from '../components/KeyValueEditor';
import BodyEditor from '../components/BodyEditor';
import ScriptEditor from '../components/ScriptEditor';
import ResponseViewer from '../components/ResponseViewer';
import CodeGenerator from '../components/CodeGenerator';
import type { CodeGenRequest } from '../lib/codeGenerator';
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

type RequestPanel = 'params' | 'headers' | 'body' | 'pre-request' | 'tests';

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
  const { activeEnv, getVariables, fetchEnvironments } = useEnvironmentStore();
  const [activePanel, setActivePanel] = useState<RequestPanel>('params');
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);
  const [showEnvPanel, setShowEnvPanel] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);

  // Fetch environments on mount
  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const tab = getActiveTab();
  const envVars = getVariables();

  // Compute resolved URL preview
  const resolvedUrl = useMemo(() => {
    if (!tab.url || !hasVariables(tab.url)) return '';
    return previewInterpolation(tab.url, envVars);
  }, [tab.url, envVars]);

  // Detect unresolved variables across all fields
  const unresolvedVars = useMemo(() => {
    const allText = [
      tab.url,
      ...tab.headers.filter(h => h.enabled).flatMap(h => [h.key, h.value]),
      ...tab.params.filter(p => p.enabled).flatMap(p => [p.key, p.value]),
      tab.bodyRaw,
      ...tab.bodyFormData.filter(f => f.enabled).flatMap(f => [f.key, f.value]),
    ].join(' ');
    return getUnresolvedVariables(allText, envVars);
  }, [tab, envVars]);

  const executeRequest = useCallback(async () => {
    if (!tab.url) return;
    const tabId = tab.id;
    setLoading(tabId, true);

    // Start with current env variables
    let activeVars = { ...envVars };

    // ── Run pre-request script ────────────────────────────────────────────
    let preScriptLogs: import('../lib/scriptEngine').ConsoleEntry[] = [];
    if (tab.preRequestScript.trim()) {
      const preContext: ScriptContext = { envVariables: activeVars };
      const preResult = runScript(tab.preRequestScript, preContext);
      preScriptLogs = preResult.consoleLogs;

      if (preResult.error) {
        setResponse(tabId, {
          success: false,
          status_code: null,
          response_time: 0,
          response_size: 0,
          response_body: null,
          response_headers: {},
          error: `Pre-request script error: ${preResult.error}`,
          error_type: 'SCRIPT_ERROR',
          retry_count: 0,
          timestamp: new Date().toISOString(),
          consoleLogs: preResult.consoleLogs,
          scriptError: preResult.error,
        });
        return;
      }

      // Use variables that the script may have updated
      activeVars = preResult.updatedVariables;
    }

    try {
      // Collect raw values
      const rawHeaders: Record<string, string> = {};
      tab.headers
        .filter((h) => h.enabled && h.key)
        .forEach((h) => { rawHeaders[h.key] = h.value; });

      const rawParams: Record<string, string> = {};
      tab.params
        .filter((p) => p.enabled && p.key)
        .forEach((p) => { rawParams[p.key] = p.value; });

      // Interpolate everything through the (possibly updated) environment
      const finalUrl = interpolateString(tab.url, activeVars);
      const finalHeaders = interpolateRecord(rawHeaders, activeVars);
      const finalParams = interpolateRecord(rawParams, activeVars);

      let body: any = null;
      if (tab.method !== 'GET' && tab.method !== 'HEAD') {
        if (tab.bodyType === 'json') {
          const interpolated = interpolateString(tab.bodyRaw, activeVars);
          try { body = JSON.parse(interpolated); } catch { body = interpolated; }
          if (!finalHeaders['Content-Type']) finalHeaders['Content-Type'] = 'application/json';
        } else if (tab.bodyType === 'text' || tab.bodyType === 'xml') {
          body = interpolateString(tab.bodyRaw, activeVars);
          if (tab.bodyType === 'xml' && !finalHeaders['Content-Type']) {
            finalHeaders['Content-Type'] = 'application/xml';
          }
        } else if (tab.bodyType === 'form-data' || tab.bodyType === 'x-www-form-urlencoded') {
          const formObj: Record<string, string> = {};
          tab.bodyFormData
            .filter((f) => f.enabled && f.key)
            .forEach((f) => { formObj[f.key] = f.value; });
          body = interpolateBody(formObj, activeVars);
          if (tab.bodyType === 'x-www-form-urlencoded' && !finalHeaders['Content-Type']) {
            finalHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
          }
        }
      }

      const res = await apiClient.post('/api/execute-request', {
        method: tab.method,
        url: finalUrl,
        headers: finalHeaders,
        params: finalParams,
        body,
        timeout: tab.timeout,
      });
      const result = res.data;

      // ── Run test script ──────────────────────────────────────────────────
      let testResults: import('../lib/scriptEngine').AssertionResult[] = [];
      let testLogs: import('../lib/scriptEngine').ConsoleEntry[] = [];
      let testScriptError: string | null = null;

      if (tab.testScript.trim()) {
        const testContext: ScriptContext = {
          response: {
            status: result.status_code,
            body: result.response_body,
            headers: result.response_headers || {},
            responseTime: (result.response_time || 0) * 1000, // convert to ms
            responseSize: result.response_size || 0,
          },
          envVariables: activeVars,
        };
        const testResult = runScript(tab.testScript, testContext);
        testResults = testResult.assertions;
        testLogs = testResult.consoleLogs;
        testScriptError = testResult.error;

        // Update env vars with any the test script set
        activeVars = testResult.updatedVariables;
      }

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
        testResults,
        consoleLogs: [...preScriptLogs, ...testLogs],
        scriptError: testScriptError,
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
        consoleLogs: preScriptLogs,
      });
    }
  }, [tab, envVars, setLoading, setResponse, addToHistory]);

  const update = (updates: Partial<typeof tab>) => updateTab(tab.id, updates);

  const enabledParamsCount = tab.params.filter((p) => p.enabled && p.key).length;
  const enabledHeadersCount = tab.headers.filter((h) => h.enabled && h.key).length;

  const panels: { id: RequestPanel; label: string; count?: number }[] = [
    { id: 'params', label: 'Params', count: enabledParamsCount },
    { id: 'headers', label: 'Headers', count: enabledHeadersCount },
    { id: 'body', label: 'Body' },
    { id: 'pre-request', label: 'Pre-request' },
    { id: 'tests', label: 'Tests' },
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
            onClick={() => setShowCodeGen(true)}
            disabled={!tab.url}
            className="btn-secondary !px-3"
            title="Generate Code"
          >
            <Code2 className="w-4 h-4" />
          </button>

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

        {/* Variable resolution preview */}
        {hasVariables(tab.url) && (
          <div className="mt-2 flex items-start gap-2">
            <Globe className="w-3 h-3 mt-0.5 flex-shrink-0 text-brand-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-mono text-surface-400 truncate" title={resolvedUrl}>
                → {resolvedUrl}
              </p>
              {unresolvedVars.length > 0 && (
                <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Unresolved: {unresolvedVars.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Environment Quick-View Panel */}
      <div className="mb-3">
        <button
          onClick={() => setShowEnvPanel(!showEnvPanel)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
            activeEnv
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
              : 'text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
          )}
        >
          <Globe className="w-3 h-3" />
          {activeEnv ? activeEnv.name : 'No Environment'}
          <span className="text-[10px] text-surface-400">
            {activeEnv ? `(${Object.keys(activeEnv.variables).length} vars)` : ''}
          </span>
          {showEnvPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showEnvPanel && (
          <div className="mt-1 card !p-3">
            {activeEnv && Object.keys(activeEnv.variables).length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-2">
                  {activeEnv.name} Variables
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(activeEnv.variables).map(([key, value]) => (
                    <div key={key} className="flex items-baseline gap-1.5 text-[11px] font-mono">
                      <span className="text-brand-500 dark:text-brand-400 font-medium">{`{{${key}}}`}</span>
                      <span className="text-surface-400">=</span>
                      <span className="text-surface-600 dark:text-surface-300 truncate" title={value}>
                        {value.length > 40 ? value.slice(0, 40) + '…' : value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-surface-100 dark:border-surface-700/50 mt-2 pt-2">
                  <p className="text-[10px] text-surface-400">
                    Dynamic: {DYNAMIC_VARIABLE_NAMES.slice(0, 5).map(n => `{{${n}}}`).join(', ')}
                    {DYNAMIC_VARIABLE_NAMES.length > 5 && ` +${DYNAMIC_VARIABLE_NAMES.length - 5} more`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-400 text-center py-2">
                {activeEnv ? 'No variables defined in this environment' : 'Select an environment from the header to use variables'}
              </p>
            )}
          </div>
        )}
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

            {activePanel === 'pre-request' && (
              <ScriptEditor
                value={tab.preRequestScript}
                onChange={(v: string) => update({ preRequestScript: v })}
                snippets={PRE_REQUEST_SNIPPETS}
                label="Pre-request Script"
                placeholder="// Runs before the request is sent&#10;// Use pm.environment.set() to set variables&#10;// Use console.log() for debugging"
              />
            )}

            {activePanel === 'tests' && (
              <ScriptEditor
                value={tab.testScript}
                onChange={(v: string) => update({ testScript: v })}
                snippets={TEST_SNIPPETS}
                label="Test Script"
                placeholder='// Runs after the response is received&#10;pm.test("Status code is 200", () => {&#10;    pm.expect(response.code).toBe(200);&#10;});'
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

      {/* Code Generator Modal */}
      {showCodeGen && (
        <CodeGenerator
          request={{
            method: tab.method,
            url: interpolateString(tab.url, envVars),
            headers: Object.fromEntries(
              tab.headers.filter(h => h.enabled && h.key).map(h => [h.key, interpolateString(h.value, envVars)])
            ),
            params: Object.fromEntries(
              tab.params.filter(p => p.enabled && p.key).map(p => [p.key, interpolateString(p.value, envVars)])
            ),
            body: tab.method !== 'GET' && tab.method !== 'HEAD' && tab.bodyType !== 'none'
              ? (tab.bodyType === 'json' || tab.bodyType === 'text' || tab.bodyType === 'xml'
                ? interpolateString(tab.bodyRaw, envVars)
                : Object.fromEntries(tab.bodyFormData.filter(f => f.enabled && f.key).map(f => [f.key, f.value])))
              : undefined,
            bodyType: tab.bodyType,
            timeout: tab.timeout,
          } as CodeGenRequest}
          onClose={() => setShowCodeGen(false)}
        />
      )}
    </div>
  );
}
