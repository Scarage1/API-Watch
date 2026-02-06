import { Terminal, Trash2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ConsoleEntry } from '../lib/scriptEngine';

interface ConsolePanelProps {
  logs: ConsoleEntry[];
  onClear?: () => void;
}

const levelStyles: Record<ConsoleEntry['level'], { icon: typeof Info; color: string; bg: string }> = {
  log: { icon: Info, color: 'text-surface-500', bg: '' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50/50 dark:bg-blue-900/5' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50/50 dark:bg-amber-900/5' },
  error: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50/50 dark:bg-red-900/5' },
};

function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

export default function ConsolePanel({ logs, onClear }: ConsolePanelProps) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-surface-400" />
        </div>
        <p className="text-sm font-medium text-surface-500">Console is empty</p>
        <p className="text-xs text-surface-400 max-w-[240px] text-center">
          Use <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-surface-100 dark:bg-surface-800">console.log()</span> in
          your scripts to see output here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50/50 dark:bg-surface-900/30">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-surface-400" />
          <span className="text-[10px] font-medium text-surface-400 tabular-nums">
            {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-auto">
        {logs.map((entry, idx) => {
          const style = levelStyles[entry.level];
          const Icon = style.icon;
          return (
            <div
              key={idx}
              className={cn(
                'flex items-start gap-2 px-4 py-2 border-b border-surface-100 dark:border-surface-800/50 font-mono text-xs',
                style.bg
              )}
            >
              <Icon className={cn('w-3 h-3 flex-shrink-0 mt-0.5', style.color)} />
              <pre className={cn(
                'flex-1 whitespace-pre-wrap break-all leading-relaxed',
                entry.level === 'error' ? 'text-red-600 dark:text-red-400' :
                entry.level === 'warn' ? 'text-amber-700 dark:text-amber-300' :
                'text-surface-600 dark:text-surface-300'
              )}>
                {entry.args.map(formatArg).join(' ')}
              </pre>
              <span className="text-[9px] text-surface-300 dark:text-surface-600 flex-shrink-0 tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
