/**
 * useApi — generic data-fetching hook with loading, error, and refetch support.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => api.get('/api/v1/workspaces'));
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiOptions {
  /** If false the fetch is skipped entirely (useful for conditional fetching). Default: true */
  enabled?: boolean;
  /** Deps that trigger a refetch when they change — works like useEffect deps. */
  deps?: unknown[];
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<{ data: T }>,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const { enabled = true, deps = [] } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async () => {
    if (!enabled) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const response = await fetcher();
      setData(response.data);
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    execute();
    return () => abortRef.current?.abort();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

export default useApi;
