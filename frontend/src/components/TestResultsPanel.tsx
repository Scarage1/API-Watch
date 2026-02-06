import { CheckCircle, XCircle, AlertTriangle, Trophy, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import type { AssertionResult } from '../lib/scriptEngine';

interface TestResultsPanelProps {
  results: AssertionResult[];
  scriptError?: string | null;
  duration?: number;
}

export default function TestResultsPanel({ results, scriptError, duration }: TestResultsPanelProps) {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  if (total === 0 && !scriptError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-surface-400" />
        </div>
        <p className="text-sm font-medium text-surface-500">No test results</p>
        <p className="text-xs text-surface-400 max-w-[240px] text-center">
          Add test assertions to the Tests tab and send a request to see results here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50/50 dark:bg-surface-900/30">
        <div className="flex items-center gap-3">
          {failed === 0 && !scriptError ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                All Passed
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                {failed} Failed
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px] font-medium">
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 tabular-nums">
              {passed} passed
            </span>
            {failed > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 tabular-nums">
                {failed} failed
              </span>
            )}
            <span className="text-surface-400 tabular-nums">
              / {total} total
            </span>
          </div>
        </div>

        {duration !== undefined && (
          <div className="flex items-center gap-1 text-[10px] text-surface-400">
            <Clock className="w-3 h-3" />
            {duration.toFixed(1)}ms
          </div>
        )}
      </div>

      {/* Script error */}
      {scriptError && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-800/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-red-700 dark:text-red-400">Script Error</p>
              <p className="text-[11px] font-mono text-red-600 dark:text-red-300 mt-1">
                {scriptError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Individual results */}
      <div className="flex-1 overflow-auto">
        {results.map((result, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-start gap-3 px-4 py-2.5 border-b border-surface-100 dark:border-surface-800/50',
              'hover:bg-surface-50/50 dark:hover:bg-surface-800/20 transition-colors'
            )}
          >
            {result.passed ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-xs font-medium',
                  result.passed
                    ? 'text-surface-700 dark:text-surface-200'
                    : 'text-red-700 dark:text-red-300'
                )}
              >
                {result.name}
              </p>
              {result.error && (
                <p className="text-[10px] font-mono text-red-500 dark:text-red-400 mt-1 break-all">
                  {result.error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
