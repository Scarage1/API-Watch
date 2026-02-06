import { useState } from 'react';
import { Send, Loader2, CheckCircle, XCircle, Copy, Check, Code2, FileJson } from 'lucide-react';
import type { RequestConfig, RequestResult } from '../types';
import { useAppStore } from '../store/useAppStore';
import { cn, formatDuration, formatBytes } from '../lib/utils';
import apiClient from '../lib/api';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

const methodStyles: Record<string, string> = {
  GET: 'bg-emerald-600 text-white',
  POST: 'bg-blue-600 text-white',
  PUT: 'bg-amber-600 text-white',
  DELETE: 'bg-red-600 text-white',
  PATCH: 'bg-purple-600 text-white',
};

type Tab = 'headers' | 'params' | 'body';

export default function SingleRequest() {
  const { addToHistory } = useAppStore();
  const [config, setConfig] = useState<RequestConfig>({
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    headers: {},
    params: {},
    body: null,
    timeout: 10,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [headersText, setHeadersText] = useState('');
  const [paramsText, setParamsText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('headers');
  const [copied, setCopied] = useState(false);

  const executeRequest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const headers = headersText ? JSON.parse(headersText) : {};
      const params = paramsText ? JSON.parse(paramsText) : {};
      const body = bodyText ? JSON.parse(bodyText) : null;
      const requestData = { ...config, headers, params, body };

      const response = await apiClient.post('/api/execute-request', requestData);
      const requestResult: RequestResult = response.data;
      setResult(requestResult);
      addToHistory(requestResult);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Request failed';
      const errorResult: RequestResult = {
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
        request_method: config.method,
        request_url: config.url,
      };
      setResult(errorResult);
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (result?.response_body) {
      navigator.clipboard.writeText(result.response_body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatResponseBody = (body: string): string => {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  };

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'headers', label: 'Headers', show: true },
    { id: 'params', label: 'Params', show: true },
    { id: 'body', label: 'Body', show: config.method !== 'GET' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="section-title">Request Builder</h1>
        <p className="section-subtitle">Execute and debug individual API requests</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Request Builder */}
        <div className="space-y-4">
          {/* URL Bar */}
          <div className="card !p-4">
            <div className="flex gap-2">
              <select
                value={config.method}
                onChange={(e) => setConfig({ ...config, method: e.target.value as RequestConfig['method'] })}
                className={cn(
                  'px-3 py-2.5 rounded-xl text-xs font-bold tracking-wide appearance-none cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                  'transition-colors',
                  methodStyles[config.method]
                )}
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>

              <input
                type="text"
                value={config.url}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://api.example.com/endpoint"
                className="input flex-1 font-mono text-sm"
              />

              <button
                onClick={executeRequest}
                disabled={loading || !config.url}
                className="btn-primary !px-5"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Tabs + Content */}
          <div className="card !p-0 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-surface-100 dark:border-surface-700/50">
              {tabs.filter(t => t.show).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-3 text-xs font-medium transition-colors relative',
                    activeTab === tab.id
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                  )}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'headers' && (
                <textarea
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  placeholder='{"Content-Type": "application/json", "Authorization": "Bearer ..."}'
                  className="input font-mono text-xs !rounded-xl"
                  rows={5}
                />
              )}
              {activeTab === 'params' && (
                <textarea
                  value={paramsText}
                  onChange={(e) => setParamsText(e.target.value)}
                  placeholder='{"page": "1", "limit": "10"}'
                  className="input font-mono text-xs !rounded-xl"
                  rows={5}
                />
              )}
              {activeTab === 'body' && config.method !== 'GET' && (
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="input font-mono text-xs !rounded-xl"
                  rows={8}
                />
              )}
            </div>

            {/* Timeout */}
            <div className="px-4 pb-4 flex items-center gap-3">
              <label className="text-xs font-medium text-surface-500">Timeout</label>
              <input
                type="number"
                value={config.timeout}
                onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) || 10 })}
                className="input !w-20 text-center text-xs"
                min="1"
                max="120"
              />
              <span className="text-xs text-surface-400">seconds</span>
            </div>
          </div>
        </div>

        {/* Response Panel */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Status Card */}
              <div className={cn(
                'card !p-4 border-l-4',
                result.success ? 'border-l-emerald-500' : 'border-l-red-500'
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {result.success ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="text-sm font-semibold text-surface-900 dark:text-white">
                      {result.success ? 'Request Successful' : 'Request Failed'}
                    </span>
                  </div>
                  <span className={cn(
                    'text-lg font-bold tabular-nums',
                    result.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  )}>
                    {result.status_code || 'ERR'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Time', value: formatDuration(result.response_time * 1000) },
                    { label: 'Size', value: formatBytes(result.response_size) },
                    { label: 'Retries', value: String(result.retry_count) },
                  ].map((item) => (
                    <div key={item.label} className="bg-surface-50 dark:bg-surface-900/50 rounded-xl px-3 py-2 text-center">
                      <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wide">{item.label}</p>
                      <p className="text-sm font-semibold text-surface-900 dark:text-white tabular-nums mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>

                {result.error && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl">
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">{result.error}</p>
                    {result.error_type && (
                      <p className="text-[10px] text-red-500 dark:text-red-500 mt-1">Type: {result.error_type}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Response Body */}
              {result.response_body && (
                <div className="card !p-0 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700/50">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-3.5 h-3.5 text-surface-400" />
                      <span className="text-xs font-medium text-surface-600 dark:text-surface-400">Response Body</span>
                    </div>
                    <button onClick={copyResponse} className="btn-ghost !p-1.5 !rounded-lg">
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <pre className="code-block !rounded-none !border-0 max-h-80 overflow-y-auto text-xs leading-relaxed">
                    {formatResponseBody(result.response_body)}
                  </pre>
                </div>
              )}

              {/* Response Headers */}
              {Object.keys(result.response_headers).length > 0 && (
                <div className="card !p-0 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-100 dark:border-surface-700/50">
                    <Code2 className="w-3.5 h-3.5 text-surface-400" />
                    <span className="text-xs font-medium text-surface-600 dark:text-surface-400">
                      Response Headers ({Object.keys(result.response_headers).length})
                    </span>
                  </div>
                  <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
                    {Object.entries(result.response_headers).map(([key, value]) => (
                      <div key={key} className="flex items-start justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="font-medium text-surface-600 dark:text-surface-300 flex-shrink-0">{key}</span>
                        <span className="font-mono text-surface-500 dark:text-surface-400 text-right truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card empty-state py-20">
              <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-4">
                <Send className="w-5 h-5 text-surface-400" />
              </div>
              <h3 className="empty-state-title">Ready to send</h3>
              <p className="empty-state-desc">
                Configure your request and hit send to see the response
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
