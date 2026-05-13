/**
 * AIPanel — Sliding panel for AI-powered features.
 *
 * Features:
 *  - Generate Tests — Analyze a response and create pm.test() assertions
 *  - Debug Request — Analyze failures and suggest fixes
 *  - Build Request — Natural language → HTTP request
 *  - Real-time SSE streaming output
 *  - Provider status indicator
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  X,
  Wand2,
  Bug,
  MessageSquare,
  Loader2,
  Copy,
  Check,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient from '../lib/api';

type AITab = 'generate' | 'debug' | 'build';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill context for test generation */
  responseContext?: {
    method: string;
    url: string;
    status_code: number;
    response_body: string | null;
    response_headers: Record<string, string>;
    response_time: number;
  };
  /** Pre-fill context for debugging */
  errorContext?: {
    method: string;
    url: string;
    status_code: number | null;
    request_headers: Record<string, string>;
    request_body: string | null;
    response_body: string | null;
    response_headers: Record<string, string>;
    error: string | null;
    error_type: string | null;
  };
  /** Callback when tests are generated */
  onTestsGenerated?: (script: string) => void;
  /** Callback when a request config is built */
  onRequestBuilt?: (config: Record<string, unknown>) => void;
}

export default function AIPanel({
  isOpen,
  onClose,
  responseContext,
  errorContext,
  onTestsGenerated,
  onRequestBuilt,
}: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<AITab>(
    errorContext ? 'debug' : responseContext ? 'generate' : 'build'
  );
  const [output, setOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nlPrompt, setNlPrompt] = useState('');
  const [aiStatus, setAiStatus] = useState<{
    available: boolean;
    provider: string;
    model: string;
  } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check AI status on mount
  useEffect(() => {
    if (isOpen) {
      apiClient
        .get('/api/v1/ai/status')
        .then((res) => setAiStatus(res.data))
        .catch(() => setAiStatus({ available: false, provider: 'unknown', model: '' }));
    }
  }, [isOpen]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const streamResponse = useCallback(async (url: string, body: Record<string, unknown>) => {
    setOutput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${url}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, stream: true }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        setOutput(`Error: ${error}`);
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                accumulated += `\nError: ${data.error}`;
              } else if (data.token) {
                accumulated += data.token;
              }
              setOutput(accumulated);
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setOutput((prev) => prev + `\n\nError: ${(err as Error).message}`);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const handleGenerateTests = useCallback(() => {
    if (!responseContext) return;
    streamResponse('/api/v1/ai/generate-tests', {
      method: responseContext.method,
      url: responseContext.url,
      status_code: responseContext.status_code,
      response_body: responseContext.response_body,
      response_headers: responseContext.response_headers,
      response_time: responseContext.response_time,
    });
  }, [responseContext, streamResponse]);

  const handleDebug = useCallback(() => {
    if (!errorContext) return;
    streamResponse('/api/v1/ai/debug', {
      method: errorContext.method,
      url: errorContext.url,
      status_code: errorContext.status_code,
      request_headers: errorContext.request_headers,
      request_body: errorContext.request_body,
      response_body: errorContext.response_body,
      response_headers: errorContext.response_headers,
      error: errorContext.error,
      error_type: errorContext.error_type,
    });
  }, [errorContext, streamResponse]);

  const handleBuildRequest = useCallback(() => {
    if (!nlPrompt.trim()) return;
    streamResponse('/api/v1/ai/build-request', {
      description: nlPrompt,
    });
  }, [nlPrompt, streamResponse]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleApply = useCallback(() => {
    if (activeTab === 'generate' && onTestsGenerated) {
      onTestsGenerated(output);
      onClose();
    } else if (activeTab === 'build' && onRequestBuilt) {
      try {
        const parsed = JSON.parse(output);
        onRequestBuilt(parsed);
        onClose();
      } catch {
        // JSON parse failed — keep panel open
      }
    }
  }, [activeTab, output, onTestsGenerated, onRequestBuilt, onClose]);

  if (!isOpen) return null;

  const tabs: { id: AITab; label: string; icon: typeof Wand2; disabled: boolean }[] = [
    { id: 'generate', label: 'Generate Tests', icon: Wand2, disabled: !responseContext },
    { id: 'debug', label: 'Debug', icon: Bug, disabled: !errorContext },
    { id: 'build', label: 'Build Request', icon: MessageSquare, disabled: false },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-50 flex flex-col
                      bg-white dark:bg-surface-900 border-l border-surface-200 dark:border-surface-700
                      shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100 dark:border-surface-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500
                          flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-surface-900 dark:text-white">AI Assistant</h2>
              {aiStatus && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    aiStatus.available ? 'bg-emerald-500' : 'bg-red-500'
                  )} />
                  <span className="text-[10px] text-surface-400">
                    {aiStatus.provider} · {aiStatus.model}
                    {!aiStatus.available && ' (offline)'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-100 dark:border-surface-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all relative',
                activeTab === tab.id
                  ? 'text-violet-600 dark:text-violet-400'
                  : tab.disabled
                    ? 'text-surface-300 dark:text-surface-600 cursor-not-allowed'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 dark:bg-violet-400" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 p-5">
          {/* Tab-specific input */}
          {activeTab === 'generate' && responseContext && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  responseContext.status_code < 400 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                )}>
                  {responseContext.status_code}
                </span>
                <span className="text-xs font-mono text-surface-500 truncate">
                  {responseContext.method} {responseContext.url}
                </span>
              </div>
              <button
                onClick={handleGenerateTests}
                disabled={isStreaming}
                className="w-full btn-primary !bg-gradient-to-r !from-violet-600 !to-fuchsia-600
                         hover:!from-violet-500 hover:!to-fuchsia-500 !shadow-lg !shadow-violet-500/20"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {isStreaming ? 'Generating...' : 'Generate Test Assertions'}
              </button>
            </div>
          )}

          {activeTab === 'debug' && errorContext && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs text-red-500 truncate">
                  {errorContext.error || `${errorContext.status_code} error`}
                </span>
              </div>
              <button
                onClick={handleDebug}
                disabled={isStreaming}
                className="w-full btn-primary !bg-gradient-to-r !from-red-600 !to-orange-600
                         hover:!from-red-500 hover:!to-orange-500 !shadow-lg !shadow-red-500/20"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bug className="w-4 h-4" />
                )}
                {isStreaming ? 'Analyzing...' : 'Debug This Request'}
              </button>
            </div>
          )}

          {activeTab === 'build' && (
            <div className="mb-4">
              <textarea
                value={nlPrompt}
                onChange={(e) => setNlPrompt(e.target.value)}
                placeholder="Describe the API request in plain English...&#10;&#10;Examples:&#10;• GET all users from the GitHub API&#10;• POST a new todo to jsonplaceholder&#10;• Create a Stripe payment intent for $49.99"
                className="input w-full min-h-[100px] font-mono text-xs resize-none mb-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleBuildRequest();
                  }
                }}
              />
              <button
                onClick={handleBuildRequest}
                disabled={isStreaming || !nlPrompt.trim()}
                className="w-full btn-primary !bg-gradient-to-r !from-blue-600 !to-cyan-600
                         hover:!from-blue-500 hover:!to-cyan-500 !shadow-lg !shadow-blue-500/20"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {isStreaming ? 'Building...' : 'Build Request'}
              </button>
            </div>
          )}

          {/* Output area */}
          <div className="flex-1 min-h-0 flex flex-col">
            {output ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                    AI Output
                  </span>
                  <div className="flex items-center gap-1">
                    {isStreaming && (
                      <button
                        onClick={handleStop}
                        className="px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded transition-colors"
                      >
                        Stop
                      </button>
                    )}
                    <button
                      onClick={handleCopy}
                      className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 transition-colors"
                      title="Copy"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div
                  ref={outputRef}
                  className="flex-1 overflow-auto rounded-xl bg-surface-50 dark:bg-surface-950
                           border border-surface-100 dark:border-surface-800 p-4"
                >
                  <pre className="text-xs font-mono text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-words leading-relaxed">
                    {output}
                    {isStreaming && (
                      <span className="inline-block w-2 h-4 bg-violet-500 animate-pulse ml-0.5" />
                    )}
                  </pre>
                </div>

                {/* Apply button */}
                {!isStreaming && output && (activeTab === 'generate' || activeTab === 'build') && (
                  <button
                    onClick={handleApply}
                    className="mt-3 w-full py-2 rounded-xl text-xs font-semibold
                             bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300
                             hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                  >
                    {activeTab === 'generate' ? 'Apply as Test Script' : 'Apply as Request'}
                  </button>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100
                              dark:from-violet-900/20 dark:to-fuchsia-900/20
                              flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-violet-500" />
                </div>
                <p className="text-sm font-medium text-surface-500 dark:text-surface-400 mb-1">
                  {activeTab === 'generate' && 'Ready to generate tests'}
                  {activeTab === 'debug' && 'Ready to debug'}
                  {activeTab === 'build' && 'Describe your API request'}
                </p>
                <p className="text-[11px] text-surface-400 max-w-[250px]">
                  {activeTab === 'generate' && 'Click "Generate" to create comprehensive test assertions from the current response.'}
                  {activeTab === 'debug' && 'Click "Debug" to analyze the error and get actionable fix suggestions.'}
                  {activeTab === 'build' && 'Type a natural language description and AI will build the HTTP request configuration.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
