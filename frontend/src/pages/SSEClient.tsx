/**
 * SSE (Server-Sent Events) Testing Client page.
 * Connect to an SSE endpoint, display events in real-time, filter by type.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Radio, Unplug, Trash2, Loader2,
  ArrowDownCircle, AlertCircle, Copy, Check, Pause, Play,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SSEEvent {
  id: string;
  type: string;
  data: string;
  timestamp: number;
  eventId?: string;
  size: number;
}

type SSEStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const STATUS_STYLES: Record<SSEStatus, { bg: string; text: string; label: string }> = {
  disconnected: { bg: 'bg-surface-200 dark:bg-surface-700', text: 'text-surface-500', label: 'Disconnected' },
  connecting:   { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', label: 'Connecting…' },
  connected:    { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', label: 'Connected' },
  error:        { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: 'Error' },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

export default function SSEClient() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<SSEStatus>('disconnected');
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customHeaders, setCustomHeaders] = useState('');
  const [withCredentials, setWithCredentials] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const bufferRef = useRef<SSEEvent[]>([]);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Auto-scroll
  useEffect(() => {
    if (!paused) eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, paused]);

  // Cleanup
  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  const connect = useCallback(() => {
    if (!url.trim()) return;
    eventSourceRef.current?.close();

    setStatus('connecting');
    setError(null);

    const es = new EventSource(url, { withCredentials });
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
    };

    es.onmessage = (e) => {
      const evt: SSEEvent = {
        id: crypto.randomUUID(),
        type: 'message',
        data: e.data,
        timestamp: Date.now(),
        eventId: e.lastEventId || undefined,
        size: new Blob([e.data]).size,
      };
      if (pausedRef.current) {
        bufferRef.current.push(evt);
      } else {
        setEvents((prev) => [...prev, evt]);
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus('disconnected');
        setError('Connection closed by server');
      } else {
        setStatus('error');
        setError('Connection error — retrying…');
      }
    };
  }, [url, withCredentials]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStatus('disconnected');
  }, []);

  const togglePause = () => {
    if (paused) {
      // Flush buffer
      setEvents((prev) => [...prev, ...bufferRef.current]);
      bufferRef.current = [];
    }
    setPaused(!paused);
  };

  const clearEvents = () => {
    setEvents([]);
    bufferRef.current = [];
  };

  const copyData = (data: string, id: string) => {
    navigator.clipboard.writeText(data);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const statusStyle = STATUS_STYLES[status];
  const filteredEvents = filterType
    ? events.filter((e) => e.type.toLowerCase().includes(filterType.toLowerCase()))
    : events;

  const totalSize = events.reduce((s, e) => s + e.size, 0);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
          <Radio className="w-6 h-6 text-brand-600" />
          SSE Client
        </h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Connect to a Server-Sent Events endpoint and monitor events in real-time
        </p>
      </div>

      {/* Connection bar */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
          <span className={cn('px-3 py-2 text-xs font-semibold border-r border-surface-200 dark:border-surface-800', statusStyle.bg, statusStyle.text)}>
            {statusStyle.label}
          </span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/events"
            className="flex-1 px-3 py-2 bg-transparent text-sm text-surface-900 dark:text-surface-100 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && (status === 'disconnected' ? connect() : disconnect())}
          />
        </div>
        {status === 'disconnected' || status === 'error' ? (
          <button
            onClick={connect}
            disabled={!url.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {status === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            Connect
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <Unplug className="w-4 h-4" />
            Disconnect
          </button>
        )}
      </div>

      {/* Options */}
      <div className="flex items-center gap-4 text-xs text-surface-500">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={withCredentials}
            onChange={(e) => setWithCredentials(e.target.checked)}
            className="rounded border-surface-300 dark:border-surface-600"
          />
          withCredentials
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            placeholder="Filter by event type…"
            className="px-3 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-xs text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-48"
          />
          <button
            onClick={togglePause}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              paused
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400'
            )}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? `Paused (${bufferRef.current.length} buffered)` : 'Pause'}
          </button>
          <button
            onClick={clearEvents}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-surface-400">
          <span>{filteredEvents.length} events</span>
          <span>{(totalSize / 1024).toFixed(1)} KB received</span>
        </div>
      </div>

      {/* Events list */}
      <div className="flex-1 min-h-0 bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-400 py-12">
            <Radio className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">
              {status === 'connected' ? 'Waiting for events…' : 'Connect to start receiving events'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {filteredEvents.map((evt) => (
              <div key={evt.id} className="p-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                      {evt.type}
                    </span>
                    {evt.eventId && (
                      <span className="text-[10px] text-surface-400 font-mono">
                        id:{evt.eventId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-surface-400 tabular-nums">
                      {formatTime(evt.timestamp)}
                    </span>
                    <button
                      onClick={() => copyData(evt.data, evt.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-100 dark:hover:bg-surface-700 rounded transition-all"
                    >
                      {copiedId === evt.id
                        ? <Check className="w-3 h-3 text-emerald-500" />
                        : <Copy className="w-3 h-3 text-surface-400" />}
                    </button>
                  </div>
                </div>
                <pre className="text-xs text-surface-700 dark:text-surface-300 font-mono whitespace-pre-wrap break-all bg-surface-50 dark:bg-surface-800/50 rounded-lg p-2 max-h-40 overflow-auto">
                  {evt.data}
                </pre>
              </div>
            ))}
            <div ref={eventsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
