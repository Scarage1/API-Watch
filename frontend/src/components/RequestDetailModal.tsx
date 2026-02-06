import { useState } from 'react';
import {
  X,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  Clock,
  HardDrive,
  RefreshCw,
  FileJson,
  Code2,
} from 'lucide-react';
import { cn, formatDuration, formatBytes } from '../lib/utils';

export interface HistoryDetail {
  id: string;
  request_method: string;
  request_url: string;
  request_headers?: string | null;
  request_body?: string | null;
  success: boolean;
  status_code: number | null;
  response_time: number;
  response_size: number;
  response_body?: string | null;
  response_headers?: string | null;
  error: string | null;
  error_type?: string | null;
  retry_count: number;
  timestamp: string;
}

interface RequestDetailModalProps {
  detail: HistoryDetail;
  onClose: () => void;
  onReplay?: (detail: HistoryDetail) => void;
}

type DetailTab = 'response' | 'request' | 'headers';

function tryParseJson(str: string | null | undefined): Record<string, string> | null {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function formatJson(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function RequestDetailModal({
  detail,
  onClose,
  onReplay,
}: RequestDetailModalProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('response');
  const [copied, setCopied] = useState(false);

  const statusColor = !detail.status_code
    ? 'text-red-500'
    : detail.status_code < 300
      ? 'text-emerald-500'
      : detail.status_code < 400
        ? 'text-blue-500'
        : detail.status_code < 500
          ? 'text-amber-500'
          : 'text-red-500';

  const responseHeaders = tryParseJson(detail.response_headers);
  const requestHeaders = tryParseJson(detail.request_headers);

  const copyResponseBody = () => {
    if (detail.response_body) {
      navigator.clipboard.writeText(detail.response_body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-100 dark:border-surface-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              {detail.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className={cn('text-lg font-bold tabular-nums', statusColor)}>
                {detail.status_code || 'ERR'}
              </span>
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded',
                detail.request_method === 'GET' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                detail.request_method === 'POST' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                detail.request_method === 'PUT' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                detail.request_method === 'DELETE' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
              )}>
                {detail.request_method}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
            >
              <X className="w-4 h-4 text-surface-400" />
            </button>
          </div>

          <p className="font-mono text-xs text-surface-600 dark:text-surface-300 truncate" title={detail.request_url}>
            {detail.request_url}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <Clock className="w-3 h-3" />
              {formatDuration(detail.response_time * 1000)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <HardDrive className="w-3 h-3" />
              {formatBytes(detail.response_size)}
            </div>
            {detail.retry_count > 0 && (
              <span className="text-xs text-amber-500">{detail.retry_count} retries</span>
            )}
            <span className="text-xs text-surface-400 ml-auto">
              {new Date(detail.timestamp).toLocaleString()}
            </span>
          </div>

          {/* Error */}
          {detail.error && (
            <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800/30">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">{detail.error}</p>
              {detail.error_type && (
                <p className="text-[10px] text-red-500 mt-0.5">Type: {detail.error_type}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {onReplay && (
              <button
                onClick={() => onReplay(detail)}
                className="btn-primary !py-1.5 !px-3 !text-xs"
              >
                <RefreshCw className="w-3 h-3" />
                Replay
              </button>
            )}
            {detail.response_body && (
              <button
                onClick={copyResponseBody}
                className="btn-secondary !py-1.5 !px-3 !text-xs"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy Response'}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-100 dark:border-surface-700/50">
          {[
            { id: 'response' as DetailTab, label: 'Response Body', icon: FileJson },
            { id: 'headers' as DetailTab, label: 'Headers', icon: Code2 },
            { id: 'request' as DetailTab, label: 'Request', icon: Code2 },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'px-4 py-2.5 text-xs font-medium transition-colors relative',
                activeTab === t.id
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              )}
            >
              <div className="flex items-center gap-1.5">
                <t.icon className="w-3 h-3" />
                {t.label}
              </div>
              {activeTab === t.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'response' && (
            detail.response_body ? (
              <pre className="p-5 text-xs font-mono leading-relaxed text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-all">
                {formatJson(detail.response_body)}
              </pre>
            ) : (
              <div className="flex items-center justify-center py-12 text-xs text-surface-400">
                No response body
              </div>
            )
          )}

          {activeTab === 'headers' && (
            <div className="divide-y divide-surface-100 dark:divide-surface-800/50">
              {responseHeaders && Object.keys(responseHeaders).length > 0 ? (
                <>
                  <div className="px-5 py-2 bg-surface-50 dark:bg-surface-900/50">
                    <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Response Headers</p>
                  </div>
                  {Object.entries(responseHeaders).map(([key, value]) => (
                    <div key={`res-${key}`} className="flex items-start gap-4 px-5 py-2.5 text-xs">
                      <span className="font-medium text-surface-600 dark:text-surface-300 flex-shrink-0 min-w-[140px]">{key}</span>
                      <span className="font-mono text-surface-500 dark:text-surface-400 break-all">{value}</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="flex items-center justify-center py-12 text-xs text-surface-400">
                  No response headers
                </div>
              )}

              {requestHeaders && Object.keys(requestHeaders).length > 0 && (
                <>
                  <div className="px-5 py-2 bg-surface-50 dark:bg-surface-900/50">
                    <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Request Headers</p>
                  </div>
                  {Object.entries(requestHeaders).map(([key, value]) => (
                    <div key={`req-${key}`} className="flex items-start gap-4 px-5 py-2.5 text-xs">
                      <span className="font-medium text-surface-600 dark:text-surface-300 flex-shrink-0 min-w-[140px]">{key}</span>
                      <span className="font-mono text-surface-500 dark:text-surface-400 break-all">{value}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'request' && (
            detail.request_body ? (
              <pre className="p-5 text-xs font-mono leading-relaxed text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-all">
                {formatJson(detail.request_body)}
              </pre>
            ) : (
              <div className="flex items-center justify-center py-12 text-xs text-surface-400">
                No request body
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
