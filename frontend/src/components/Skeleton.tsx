import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
  /** Number of lines to render (default 1) */
  lines?: number;
}

/**
 * Reusable loading skeleton placeholder with shimmer animation.
 */
export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-lg bg-surface-200 dark:bg-surface-700 animate-pulse',
            className ?? 'h-4 w-full'
          )}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-700 p-5 space-y-3" role="status" aria-label="Loading">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="animate-pulse" role="status" aria-label="Loading">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}
