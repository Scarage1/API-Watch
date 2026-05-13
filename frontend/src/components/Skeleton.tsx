import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
  /** Number of lines to render (default 1) */
  lines?: number;
}

// ── Base shimmer atom ────────────────────────────────────────────────────────

export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg',
        'bg-surface-200 dark:bg-surface-700/60',
        'after:absolute after:inset-0',
        'after:bg-gradient-to-r after:from-transparent after:via-white/20 dark:after:via-white/5 after:to-transparent',
        'after:animate-shimmer after:bg-[length:200%_100%]',
        className
      )}
      aria-hidden="true"
    />
  );
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

// ── Stat card skeleton ───────────────────────────────────────────────────────

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

// ── Rich skeleton components ─────────────────────────────────────────────────

export function SkeletonCard({ className, showAvatar = false }: { className?: string; showAvatar?: boolean }) {
  return (
    <div className={cn('card p-5 space-y-4', className)} role="status" aria-label="Loading">
      {showAvatar && (
        <div className="flex items-center gap-3">
          <Shimmer className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-1/3" />
            <Shimmer className="h-3 w-1/2" />
          </div>
        </div>
      )}
      <div className="space-y-2.5">
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-4 w-full" />
        <Shimmer className="h-4 w-3/4" />
      </div>
      <div className="flex gap-2 pt-1">
        <Shimmer className="h-7 w-20 rounded-xl" />
        <Shimmer className="h-7 w-16 rounded-xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn('card p-5', className)} role="status" aria-label="Loading">
      <div className="flex items-center justify-between mb-3">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-8 w-8 rounded-xl" />
      </div>
      <Shimmer className="h-8 w-24 mb-2" />
      <Shimmer className="h-3 w-32" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SkeletonListItem({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 p-3', className)} role="status" aria-label="Loading">
      <Shimmer className="w-8 h-8 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Shimmer className="h-3.5 w-1/3" />
        <Shimmer className="h-3 w-1/2" />
      </div>
      <Shimmer className="h-5 w-14 rounded-full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SkeletonPageHeader({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)} role="status" aria-label="Loading">
      <div className="space-y-2">
        <Shimmer className="h-7 w-48" />
        <Shimmer className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Shimmer className="h-9 w-24 rounded-xl" />
        <Shimmer className="h-9 w-32 rounded-xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
