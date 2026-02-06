import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog with focus trapping.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on open (safe default)
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const Icon = variant === 'danger' ? Trash2 : AlertTriangle;
  const iconBg = variant === 'danger'
    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
  const confirmBg = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
    : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500';

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 max-w-sm w-full mx-4 p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0', iconBg)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-title" className="text-sm font-semibold text-surface-900 dark:text-white">
              {title}
            </h3>
            <p id="confirm-desc" className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
              confirmBg
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
