/**
 * useDeferredSearch — Combines search input with React's useDeferredValue
 * for non-blocking search across large datasets.
 *
 * The raw `query` updates instantly (keeps the input responsive),
 * while `deferredQuery` updates during idle time (won't block animations).
 *
 * Usage:
 *   const { query, deferredQuery, setQuery, isStale } = useDeferredSearch();
 *   // Use `query` for the <input> value
 *   // Use `deferredQuery` for filtering/searching
 */
import { useState, useDeferredValue, useTransition, useCallback } from 'react';

interface UseDeferredSearchOptions {
  /** Minimum query length to trigger search (default: 0) */
  minLength?: number;
  /** Initial query value */
  initialQuery?: string;
}

interface UseDeferredSearchResult {
  /** Current input value (always up-to-date) */
  query: string;
  /** Deferred query for actual search/filtering (may lag behind) */
  deferredQuery: string;
  /** Update the query */
  setQuery: (value: string) => void;
  /** True while the deferred value hasn't caught up */
  isStale: boolean;
  /** True during any pending transition */
  isPending: boolean;
  /** Clear the search */
  clear: () => void;
}

export function useDeferredSearch(options?: UseDeferredSearchOptions): UseDeferredSearchResult {
  const { minLength = 0, initialQuery = '' } = options || {};
  const [query, setQueryRaw] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [isPending, startTransition] = useTransition();

  const isStale = query !== deferredQuery;

  const setQuery = useCallback((value: string) => {
    // Update the input immediately
    setQueryRaw(value);
  }, []);

  const clear = useCallback(() => {
    startTransition(() => {
      setQueryRaw('');
    });
  }, []);

  // Only expose non-empty queries above minLength for actual searching
  const effectiveDeferred = deferredQuery.length >= minLength ? deferredQuery : '';

  return {
    query,
    deferredQuery: effectiveDeferred,
    setQuery,
    isStale,
    isPending,
    clear,
  };
}
