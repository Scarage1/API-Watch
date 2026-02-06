import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type Toast, type ToastType } from '../store/useToastStore';
import { cn } from '../lib/utils';

const iconMap: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300',
  error: 'border-red-500/30 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300',
  info: 'border-blue-500/30 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300',
  warning: 'border-amber-500/30 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300',
};

const iconColor: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const Icon = iconMap[toast.type];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 200);
  };

  // Auto-exit animation before removal
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => setExiting(true), toast.duration - 200);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm',
        'transition-all duration-200 max-w-sm w-full',
        colorMap[toast.type],
        visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', iconColor[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{toast.title}</p>
        {toast.description && (
          <p className="text-xs opacity-75 mt-0.5 leading-snug">{toast.description}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5 opacity-50" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.slice(-5).map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={() => removeToast(t.id)} />
        </div>
      ))}
    </div>
  );
}
