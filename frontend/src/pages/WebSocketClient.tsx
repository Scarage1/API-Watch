/**
 * WebSocket Testing Client page.
 * Connect, send/receive messages, save profiles, view message timeline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plug, Unplug, Send, Trash2, Save, Loader2,
  ArrowUpCircle, ArrowDownCircle, AlertCircle, RefreshCw,
  Bookmark, ChevronDown, Copy, Check, Info,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useWebSocketStore } from '../store/useWebSocketStore';
import type { WSMessage, WSConnectionStatus } from '../store/useWebSocketStore';
import { toast } from '../store/useToastStore';

const STATUS_STYLES: Record<WSConnectionStatus, { bg: string; text: string; label: string }> = {
  disconnected: { bg: 'bg-surface-200 dark:bg-surface-700', text: 'text-surface-500', label: 'Disconnected' },
  connecting:   { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', label: 'Connecting…' },
  connected:    { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', label: 'Connected' },
  error:        { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: 'Error' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
}

export default function WebSocketClient() {
  const {
    status, url, protocols, autoReconnect, error,
    messages, profiles,
    setUrl, setProtocols, setAutoReconnect, setStatus, setError,
    addMessage, clearMessages, saveProfile, deleteProfile, loadProfile,
  } = useWebSocketStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messageInput, setMessageInput] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'json'>('text');
  const [showProfiles, setShowProfiles] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [protocolInput, setProtocolInput] = useState(protocols.join(', '));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterDir, setFilterDir] = useState<'all' | 'sent' | 'received'>('all');

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
     
  }, []);

  const addSystemMessage = useCallback((data: string) => {
    addMessage({
      id: crypto.randomUUID(),
      direction: 'received',
      type: 'system',
      data,
      timestamp: Date.now(),
      size: data.length,
    });
  }, [addMessage]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    if (!url.trim()) {
      toast.error('Invalid URL', 'Enter a WebSocket URL');
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const parsedProtocols = protocolInput
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      setProtocols(parsedProtocols);

      const ws = parsedProtocols.length > 0
        ? new WebSocket(url, parsedProtocols)
        : new WebSocket(url);

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setStatus('connected');
        addSystemMessage(`Connected to ${url}`);
        toast.success('Connected', url);
      };

      ws.onmessage = (event) => {
        const data = typeof event.data === 'string' ? event.data : `[Binary: ${(event.data as ArrayBuffer).byteLength} bytes]`;
        const msgType = typeof event.data === 'string' ? 'text' as const : 'binary' as const;
        addMessage({
          id: crypto.randomUUID(),
          direction: 'received',
          type: msgType,
          data,
          timestamp: Date.now(),
          size: typeof event.data === 'string' ? event.data.length : (event.data as ArrayBuffer).byteLength,
        });
      };

      ws.onerror = () => {
        setStatus('error');
        setError('Connection error');
        addSystemMessage('Connection error occurred');
      };

      ws.onclose = (event) => {
        setStatus('disconnected');
        addSystemMessage(`Disconnected (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`);

        if (autoReconnect && event.code !== 1000) {
          addSystemMessage('Reconnecting in 3 seconds…');
          // eslint-disable-next-line
          reconnectTimer.current = setTimeout(() => connect(), 3000);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
      toast.error('Connection failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [url, protocolInput, autoReconnect, setStatus, setError, setProtocols, addMessage, addSystemMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [setStatus]);

  const sendMessage = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.warning('Not connected', 'Connect first to send messages');
      return;
    }
    if (!messageInput.trim()) return;

    let data = messageInput;
    if (messageType === 'json') {
      try {
        data = JSON.stringify(JSON.parse(messageInput), null, 0);
      } catch {
        toast.error('Invalid JSON', 'The message is not valid JSON');
        return;
      }
    }

    wsRef.current.send(data);
    addMessage({
      id: crypto.randomUUID(),
      direction: 'sent',
      type: 'text',
      data,
      timestamp: Date.now(),
      size: data.length,
    });
    setMessageInput('');
  }, [messageInput, messageType, addMessage]);

  const handleSaveProfile = () => {
    if (!profileName.trim()) {
      toast.warning('Name required', 'Enter a profile name');
      return;
    }
    saveProfile({
      id: crypto.randomUUID(),
      name: profileName,
      url,
      headers: {},
      protocols: protocolInput.split(',').map((p) => p.trim()).filter(Boolean),
      autoReconnect,
    });
    setProfileName('');
    toast.success('Profile saved', profileName);
  };

  const copyMessage = (msg: WSMessage) => {
    navigator.clipboard.writeText(msg.data);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredMessages = filterDir === 'all'
    ? messages
    : messages.filter((m) => m.direction === filterDir || m.type === 'system');

  const st = STATUS_STYLES[status];
  const sentCount = messages.filter((m) => m.direction === 'sent').length;
  const recvCount = messages.filter((m) => m.direction === 'received' && m.type !== 'system').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <Plug className="w-5 h-5 text-brand-600" />
            WebSocket Client
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Connect, send, and inspect WebSocket messages in real-time
          </p>
        </div>
        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium', st.bg, st.text)}>
          <span className="relative flex h-2 w-2">
            {status === 'connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            <span className={cn('relative inline-flex rounded-full h-2 w-2', status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-500' : status === 'error' ? 'bg-red-500' : 'bg-surface-400')} />
          </span>
          {st.label}
        </div>
      </div>

      {/* Connection bar */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="wss://echo.websocket.org"
              disabled={status === 'connected'}
              className="w-full pl-4 pr-4 py-2.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:opacity-50"
              onKeyDown={(e) => e.key === 'Enter' && (status === 'connected' ? disconnect() : connect())}
            />
          </div>
          {status === 'connected' ? (
            <button onClick={disconnect} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors">
              <Unplug className="w-4 h-4" /> Disconnect
            </button>
          ) : (
            <button onClick={connect} disabled={status === 'connecting'} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors">
              {status === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Connect
            </button>
          )}
        </div>

        {/* Options row */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-surface-500 dark:text-surface-400 text-xs">Protocols:</label>
            <input
              type="text"
              value={protocolInput}
              onChange={(e) => setProtocolInput(e.target.value)}
              placeholder="e.g. graphql-ws"
              disabled={status === 'connected'}
              className="w-40 px-2.5 py-1.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs outline-none disabled:opacity-50"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoReconnect}
              onChange={(e) => setAutoReconnect(e.target.checked)}
              className="rounded border-surface-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs text-surface-600 dark:text-surface-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Auto-reconnect
            </span>
          </label>
          <button onClick={() => setShowProfiles(!showProfiles)} className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:underline">
            <Bookmark className="w-3 h-3" /> Profiles <ChevronDown className={cn('w-3 h-3 transition-transform', showProfiles && 'rotate-180')} />
          </button>
        </div>

        {/* Profiles */}
        {showProfiles && (
          <div className="border-t border-surface-100 dark:border-surface-800 pt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Profile name"
                className="flex-1 px-2.5 py-1.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-xs outline-none"
              />
              <button onClick={handleSaveProfile} className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700">
                <Save className="w-3 h-3" /> Save Current
              </button>
            </div>
            {profiles.length === 0 ? (
              <p className="text-xs text-surface-400 py-2">No saved profiles yet</p>
            ) : (
              <div className="grid gap-1">
                {profiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800 rounded-lg">
                    <button onClick={() => { loadProfile(p.id); toast.info('Loaded', p.name); }} className="text-xs font-medium text-surface-700 dark:text-surface-300 hover:text-brand-600 text-left">
                      <span className="font-semibold">{p.name}</span>
                      <span className="ml-2 text-surface-400">{p.url}</span>
                    </button>
                    <button onClick={() => deleteProfile(p.id)} className="text-surface-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}
      </div>

      {/* Main content: Messages + Compose */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Message log */}
        <div className="lg:col-span-2 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 flex flex-col" style={{ height: '500px' }}>
          {/* Message header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-surface-800">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">Messages</h3>
              <span className="text-[11px] text-surface-400">
                ↑ {sentCount} sent · ↓ {recvCount} received
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-surface-100 dark:bg-surface-800 rounded-lg p-0.5">
                {(['all', 'sent', 'received'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterDir(f)}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors',
                      filterDir === f ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-500'
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'sent' ? '↑ Sent' : '↓ Recv'}
                  </button>
                ))}
              </div>
              <button onClick={clearMessages} className="p-1.5 text-surface-400 hover:text-red-500 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800" title="Clear messages">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-surface-400">
                <Info className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs">Connect and start sending messages</p>
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'group flex items-start gap-2 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50',
                    msg.type === 'system' && 'justify-center'
                  )}
                >
                  {msg.type === 'system' ? (
                    <span className="text-[11px] text-surface-400 italic">{msg.data}</span>
                  ) : (
                    <>
                      <span className="flex-shrink-0 mt-0.5">
                        {msg.direction === 'sent' ? (
                          <ArrowUpCircle className="w-4 h-4 text-blue-500" />
                        ) : (
                          <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all text-surface-800 dark:text-surface-200 max-h-40 overflow-auto">
                          {msg.data}
                        </pre>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-surface-400">
                          <span>{formatTime(msg.timestamp)}</span>
                          <span>{formatBytes(msg.size)}</span>
                          {msg.type === 'binary' && <span className="text-amber-500">binary</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => copyMessage(msg)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-surface-400 hover:text-brand-600 transition-opacity"
                        title="Copy"
                      >
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Compose panel */}
        <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-4 space-y-3 h-fit">
          <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">Compose</h3>

          {/* Type toggle */}
          <div className="flex bg-surface-100 dark:bg-surface-800 rounded-lg p-0.5">
            {(['text', 'json'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMessageType(t)}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  messageType === t ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-500'
                )}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={messageType === 'json' ? '{"type": "hello", "payload": {}}' : 'Type a message…'}
            rows={12}
            className="w-full px-3 py-2.5 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-xs font-mono resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />

          <button
            onClick={sendMessage}
            disabled={status !== 'connected' || !messageInput.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" /> Send Message
          </button>
          <p className="text-[10px] text-surface-400 text-center">⌘+Enter to send</p>

          {/* Quick templates */}
          <div className="border-t border-surface-100 dark:border-surface-800 pt-3">
            <p className="text-[11px] font-medium text-surface-400 mb-2">Quick Templates</p>
            <div className="grid gap-1">
              {[
                { label: 'Ping', value: '{"type":"ping"}' },
                { label: 'Subscribe', value: '{"type":"subscribe","channel":"default"}' },
                { label: 'Auth', value: '{"type":"auth","token":"your-token"}' },
              ].map((t) => (
                <button
                  key={t.label}
                  onClick={() => { setMessageInput(t.value); setMessageType('json'); }}
                  className="text-left px-2.5 py-1.5 text-[11px] text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
