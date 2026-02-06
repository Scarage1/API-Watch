import { useState } from 'react';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { RequestConfig, RequestResult } from '../types';
import { useAppStore } from '../store/useAppStore';
import { cn, formatDuration, formatBytes, getMethodColor, getStatusColor } from '../lib/utils';
import apiClient from '../lib/api';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

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

  const executeRequest = async () => {
    setLoading(true);
    setResult(null);

    try {
      // Parse JSON inputs
      const headers = headersText ? JSON.parse(headersText) : {};
      const params = paramsText ? JSON.parse(paramsText) : {};
      const body = bodyText ? JSON.parse(bodyText) : null;

      const requestData = { ...config, headers, params, body };

      const response = await apiClient.post('/api/execute-request', requestData);
      const result: RequestResult = response.data;
      
      setResult(result);
      addToHistory(result);
    } catch (error: any) {
      // Create error result
      const errorResult: RequestResult = {
        success: false,
        status_code: null,
        response_time: 0,
        response_size: 0,
        response_body: null,
        response_headers: {},
        error: error.message || 'Request failed',
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Single Request
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Execute and debug individual API requests
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Builder */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Request Configuration
            </h3>

            {/* Method & URL */}
            <div className="flex gap-2 mb-4">
              <select
                value={config.method}
                onChange={(e) =>
                  setConfig({ ...config, method: e.target.value as any })
                }
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={config.url}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
                placeholder="https://api.example.com/endpoint"
                className="input flex-1"
              />
            </div>

            {/* Headers */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Headers (JSON)
              </label>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder='{"Content-Type": "application/json"}'
                className="input font-mono text-sm"
                rows={3}
              />
            </div>

            {/* Query Params */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Query Parameters (JSON)
              </label>
              <textarea
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                placeholder='{"page": "1", "limit": "10"}'
                className="input font-mono text-sm"
                rows={3}
              />
            </div>

            {/* Request Body */}
            {config.method !== 'GET' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Request Body (JSON)
                </label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="input font-mono text-sm"
                  rows={6}
                />
              </div>
            )}

            {/* Timeout */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={config.timeout}
                onChange={(e) =>
                  setConfig({ ...config, timeout: parseInt(e.target.value) })
                }
                className="input"
                min="1"
                max="120"
              />
            </div>

            {/* Execute Button */}
            <button
              onClick={executeRequest}
              disabled={loading || !config.url}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors',
                loading || !config.url
                  ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Request
                </>
              )}
            </button>
          </div>
        </div>

        {/* Response Panel */}
        <div className="space-y-4">
          {result ? (
            <>
              {/* Status Summary */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-500" />
                    )}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {result.success ? 'Success' : 'Failed'}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium',
                      result.success
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    )}
                  >
                    {result.status_code || 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">
                      Response Time
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatDuration(result.response_time * 1000)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">
                      Response Size
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatBytes(result.response_size)}
                    </p>
                  </div>
                  {result.retry_count > 0 && (
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">
                        Retries
                      </p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {result.retry_count}
                      </p>
                    </div>
                  )}
                </div>

                {result.error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                      {result.error}
                    </p>
                    {result.error_type && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Type: {result.error_type}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Response Body */}
              {result.response_body && (
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Response Body
                  </h3>
                  <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                    {JSON.stringify(JSON.parse(result.response_body), null, 2)}
                  </pre>
                </div>
              )}

              {/* Response Headers */}
              {Object.keys(result.response_headers).length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Response Headers
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(result.response_headers).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between text-sm border-b border-gray-200 dark:border-gray-700 pb-2"
                        >
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {key}
                          </span>
                          <span className="text-gray-600 dark:text-gray-400 font-mono">
                            {value}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12">
              <Send className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Configure and execute a request to see results here
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
