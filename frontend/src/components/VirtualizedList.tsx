/**
 * VirtualizedList — High-performance list component using @tanstack/react-virtual.
 *
 * Only renders items visible in the viewport, making it possible to handle
 * 100K+ items without UI lag.
 *
 * Usage:
 *   <VirtualizedList
 *     items={historyEntries}
 *     estimateSize={48}
 *     renderItem={(item, index) => <HistoryRow item={item} />}
 *   />
 */
import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../lib/utils';

interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Estimated height of each item in pixels */
  estimateSize: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** CSS class for the outer container */
  className?: string;
  /** Number of items to render above/below the visible area */
  overscan?: number;
  /** Gap between items in pixels */
  gap?: number;
}

export default function VirtualizedList<T>({
  items,
  estimateSize,
  renderItem,
  className,
  overscan = 5,
  gap = 0,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
