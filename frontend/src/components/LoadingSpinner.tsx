import { Loader2 } from 'lucide-react';

/**
 * Full-screen loading spinner used as a Suspense fallback
 * for lazy-loaded routes.
 */
export default function LoadingSpinner() {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-surface-50 dark:bg-surface-950"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <span className="text-sm text-surface-500 dark:text-surface-400">Loading…</span>
      </div>
    </div>
  );
}
