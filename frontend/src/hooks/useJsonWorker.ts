/**
 * useJsonWorker — React hook for off-main-thread JSON processing.
 *
 * Uses a shared Web Worker instance so multiple components can
 * submit tasks without spinning up multiple workers.
 *
 * Usage:
 *   const { parse, format, highlight, search, isProcessing } = useJsonWorker();
 *   const result = await highlight(jsonString);
 */
import { useCallback, useRef, useEffect, useState } from 'react';

interface WorkerRequest {
  id: string;
  type: 'parse' | 'format' | 'highlight' | 'search';
  payload: string;
  options?: {
    indent?: number;
    query?: string;
    maxDepth?: number;
  };
}

interface WorkerResponse {
  id: string;
  type: WorkerRequest['type'];
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}

// Shared singleton worker across all hook instances
let sharedWorker: Worker | null = null;
let refCount = 0;
const pendingCallbacks = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}>();

function getWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(
      new URL('../workers/json.worker.ts', import.meta.url),
      { type: 'module' }
    );
    sharedWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, success, result, error } = event.data;
      const cb = pendingCallbacks.get(id);
      if (cb) {
        pendingCallbacks.delete(id);
        if (success) {
          cb.resolve(result);
        } else {
          cb.reject(new Error(error || 'Worker error'));
        }
      }
    };
    sharedWorker.onerror = (event) => {
      console.error('[json.worker] Error:', event);
    };
  }
  return sharedWorker;
}

let requestCounter = 0;

function sendToWorker(type: WorkerRequest['type'], payload: string, options?: WorkerRequest['options']): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `${type}-${++requestCounter}`;
    pendingCallbacks.set(id, { resolve, reject });
    const worker = getWorker();
    worker.postMessage({ id, type, payload, options } satisfies WorkerRequest);
  });
}

export interface HighlightResult {
  html: string;
  lineCount: number;
}

export function useJsonWorker() {
  const [isProcessing, setIsProcessing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    refCount++;
    mountedRef.current = true;
    return () => {
      refCount--;
      mountedRef.current = false;
      // Terminate worker when no hooks are using it
      if (refCount === 0 && sharedWorker) {
        sharedWorker.terminate();
        sharedWorker = null;
        pendingCallbacks.clear();
      }
    };
  }, []);

  const withProcessing = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    if (mountedRef.current) setIsProcessing(true);
    try {
      return await fn();
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  }, []);

  const parse = useCallback((json: string) => {
    return withProcessing(() => sendToWorker('parse', json) as Promise<unknown>);
  }, [withProcessing]);

  const format = useCallback((json: string, indent = 2) => {
    return withProcessing(() => sendToWorker('format', json, { indent }) as Promise<string>);
  }, [withProcessing]);

  const highlight = useCallback((json: string, indent = 2) => {
    return withProcessing(() => sendToWorker('highlight', json, { indent }) as Promise<HighlightResult>);
  }, [withProcessing]);

  const search = useCallback((json: string, query: string) => {
    return withProcessing(() => sendToWorker('search', json, { query }) as Promise<string[]>);
  }, [withProcessing]);

  return { parse, format, highlight, search, isProcessing };
}
