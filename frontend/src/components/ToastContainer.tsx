import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type Toast, type ToastType } from '../store/useToastStore';
import { cn } from '../lib/utils';

const iconMap: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error:   XCircle,
  info:    Info,
  warning: AlertTriangle,
};

const styleMap: Record<ToastType, { container: string; icon: string; bar: string; border: string }> = {
  success: {
    container: 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100',
    icon:      'text-emerald-500',
    bar:       'bg-emerald-500',
    border:    'border-l-emerald-500',
  },
  error: {
    container: 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100',
    icon:      'text-red-500',
    bar:       'bg-red-500',
    border:    'border-l-red-500',
  },
  info: {
    container: 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100',
    icon:      'text-blue-500',
    bar:       'bg-blue-500',
    border:    'border-l-blue-500',
  },
  warning: {
    container: 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100',
    icon:      'text-amber-500',
    bar:       'bg-amber-500',
    border:    'border-l-amber-500',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [mounted, setMounted]   = useState(false);
  const [exiting, setExiting]   = useState(false);
  const [progress, setProgress] = useState(100);
  const Icon  = iconMap[toast.type];
  const style = styleMap[toast.type];
  const duration = toast.duration ?? 4000;

  // Mount animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Progress countdown
  useEffect(() => {
    if (duration <= 0) return;
    const start   = Date.now();
    const totalMs = duration - 200;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct     = Math.max(0, 100 - (elapsed / totalMs) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [duration]);

  // Auto-exit
  useEffect(() => {
    if (duration > 0) {
      const t = setTimeout(() => { setExiting(true); setTimeout(onDismiss, 300); }, duration - 200);
      return () => clearTimeout(t);
    }
  }, [duration, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden max-w-sm w-full rounded-xl border border-surface-200 dark:border-surface-700 border-l-4 shadow-lifted dark:shadow-lifted-dark',
        'transition-all duration-300',
        style.container,
        style.border,
        mounted && !exiting
          ? 'opacity-100 translate-x-0 scale-100'
          : 'opacity-0 translate-x-8 scale-95'
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', style.icon)} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight">{toast.title}</p>
          {toast.description && (
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 leading-snug">
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="p-0.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors flex-shrink-0 mt-0.5"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5 text-surface-400" />
        </button>
      </div>

      {/* Countdown progress bar */}
      {duration > 0 && (
        <div className="h-0.5 w-full bg-surface-100 dark:bg-surface-700">
          <div
            className={cn('h-full rounded-full transition-none', style.bar)}
            style={{ width: `${progress}%`, opacity: 0.7 }}
          />
        </div>
      )}
    </div>
  );
}

export default function ToastContainer() {
  const toasts      = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[4.5rem] right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.slice(-5).map((t) => (
        <div key={t.id} className="pointer-events-auto animate-slide-in-right">
          <ToastItem toast={t} onDismiss={() => removeToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
