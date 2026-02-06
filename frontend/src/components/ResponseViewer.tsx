import { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Download,
  FileJson,
  Code2,
  CheckCircle,
  XCircle,
  WrapText,
} from 'lucide-react';
import { cn, formatDuration, formatBytes } from '../lib/utils';
import type { TabResponse } from '../store/useRequestStore';

interface ResponseViewerProps {
  response: TabResponse;
}

type ResponseTab = 'body' | 'headers';

/** Minimal JSON / XML syntax highlighter (no external deps) */
function highlightJson(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // strings
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, _inner) => {
      // Check if this is a key (followed by :)
      return `<span class="json-string">${match}</span>`;
    })
    // numbers
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>')
    // booleans & null
    .replace(/\b(true|false|null)\b/g, '<span class="json-keyword">$1</span>');
}

function formatAndHighlight(body: string): { formatted: string; language: string } {
  // Try JSON
  try {
    const parsed = JSON.parse(body);
    const formatted = JSON.stringify(parsed, null, 2);
    return { formatted: highlightJson(formatted), language: 'json' };
  } catch {
    // not JSON
  }

  // XML / HTML
  if (body.trimStart().startsWith('<')) {
    return {
      formatted: body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;'),
      language: 'xml',
    };
  }

  return { formatted: body, language: 'text' };
}

function getStatusText(code: number | null): string {
  if (!code) return 'Error';
  const texts: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict',
    422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway',
    503: 'Service Unavailable', 504: 'Gateway Timeout',
  };
  return texts[code] || `Status ${code}`;
}

export default function ResponseViewer({ response }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  const highlighted = useMemo(() => {
    if (!response.response_body) return null;
    return formatAndHighlight(response.response_body);
  }, [response.response_body]);

  const headerCount = Object.keys(response.response_headers).length;

  const copyBody = () => {
    if (response.response_body) {
      navigator.clipboard.writeText(response.response_body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadBody = () => {
    if (!response.response_body) return;
    const ext = highlighted?.language === 'json' ? 'json' : highlighted?.language === 'xml' ? 'xml' : 'txt';
    const blob = new Blob([response.response_body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = !response.status_code
    ? 'text-red-500'
    : response.status_code < 300
      ? 'text-emerald-500'
      : response.status_code < 400
        ? 'text-blue-500'
        : response.status_code < 500
          ? 'text-amber-500'
          : 'text-red-500';

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50/50 dark:bg-surface-900/30">
        <div className="flex items-center gap-3">
          {response.success ? (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className={cn('text-sm font-bold tabular-nums', statusColor)}>
            {response.status_code || 'ERR'}
          </span>
          <span className="text-xs text-surface-400">
            {getStatusText(response.status_code)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Badges */}
          <span className="px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800 text-[10px] font-medium text-surface-500 tabular-nums">
            {formatDuration(response.response_time * 1000)}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-800 text-[10px] font-medium text-surface-500 tabular-nums">
            {formatBytes(response.response_size)}
          </span>
          {response.retry_count > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">
              {response.retry_count} retries
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {response.error && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-800/30">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">{response.error}</p>
          {response.error_type && (
            <p className="text-[10px] text-red-500 mt-0.5">Type: {response.error_type}</p>
          )}
        </div>
      )}

      {/* Response tabs */}
      <div className="flex items-center justify-between border-b border-surface-100 dark:border-surface-700/50">
        <div className="flex">
          <button
            onClick={() => setActiveTab('body')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium transition-colors relative',
              activeTab === 'body'
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            )}
          >
            <div className="flex items-center gap-1.5">
              <FileJson className="w-3 h-3" />
              Body
            </div>
            {activeTab === 'body' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('headers')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium transition-colors relative',
              activeTab === 'headers'
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            )}
          >
            <div className="flex items-center gap-1.5">
              <Code2 className="w-3 h-3" />
              Headers
              {headerCount > 0 && (
                <span className="text-[10px] font-bold text-surface-400">({headerCount})</span>
              )}
            </div>
            {activeTab === 'headers' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
            )}
          </button>
        </div>

        {/* Actions */}
        {activeTab === 'body' && response.response_body && (
          <div className="flex items-center gap-1 pr-2">
            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                wordWrap ? 'text-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
              )}
              title="Toggle word wrap"
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>
            <button onClick={copyBody} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors" title="Copy response">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button onClick={downloadBody} className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors" title="Download response">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'body' && (
          response.response_body ? (
            <pre
              className={cn(
                'p-4 text-xs font-mono leading-relaxed response-highlight',
                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
              )}
              dangerouslySetInnerHTML={{ __html: highlighted?.formatted || '' }}
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-xs text-surface-400">
              No response body
            </div>
          )
        )}

        {activeTab === 'headers' && (
          headerCount > 0 ? (
            <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
              {Object.entries(response.response_headers).map(([key, value]) => (
                <div key={key} className="flex items-start gap-4 px-4 py-2.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-800/30">
                  <span className="font-medium text-surface-600 dark:text-surface-300 flex-shrink-0 min-w-[140px]">{key}</span>
                  <span className="font-mono text-surface-500 dark:text-surface-400 break-all">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-xs text-surface-400">
              No response headers
            </div>
          )
        )}
      </div>
    </div>
  );
}
