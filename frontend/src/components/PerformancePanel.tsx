/**
 * PerformancePanel — Real-time performance monitoring widget.
 *
 * Shows:
 *  - FPS counter (requestAnimationFrame-based)
 *  - Memory usage (if performance.memory is available)
 *  - DOM node count
 *  - Component render count
 *
 * Only rendered in development mode or when explicitly enabled.
 */
import { useState, useEffect, useRef, memo } from 'react';
import { Activity, Cpu, HardDrive, Layers, X } from 'lucide-react';

interface PerfStats {
  fps: number;
  memoryUsedMB: number | null;
  domNodes: number;
  heapLimitMB: number | null;
}

function usePerfStats(enabled: boolean): PerfStats {
  const [stats, setStats] = useState<PerfStats>({
    fps: 0,
    memoryUsedMB: null,
    domNodes: 0,
    heapLimitMB: null,
  });

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const tick = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);
        frameCountRef.current = 0;
        lastTimeRef.current = now;

        // Memory (Chrome-only)
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        const memoryUsedMB = memory ? Math.round(memory.usedJSHeapSize / 1048576) : null;
        const heapLimitMB = memory ? Math.round(memory.jsHeapSizeLimit / 1048576) : null;

        // DOM node count
        const domNodes = document.querySelectorAll('*').length;

        setStats({ fps, memoryUsedMB, domNodes, heapLimitMB });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  return stats;
}

const PerformancePanel = memo(function PerformancePanel() {
  const [visible, setVisible] = useState(false);
  const stats = usePerfStats(visible);

  const getFPSColor = (fps: number): string => {
    if (fps >= 55) return 'text-emerald-400';
    if (fps >= 30) return 'text-amber-400';
    return 'text-red-400';
  };

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-surface-900/80 backdrop-blur-sm
                   border border-surface-700/50 flex items-center justify-center
                   text-surface-400 hover:text-emerald-400 transition-colors shadow-lg
                   hover:shadow-emerald-500/10"
        title="Show performance monitor"
      >
        <Activity className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 rounded-2xl bg-surface-900/95 backdrop-blur-xl
                    border border-surface-700/50 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700/50">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold text-surface-300">Performance</span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="p-0.5 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-surface-700/30 p-px">
        {/* FPS */}
        <div className="bg-surface-900 p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Cpu className="w-3 h-3 text-surface-500" />
            <span className="text-[10px] text-surface-500 uppercase tracking-wider">FPS</span>
          </div>
          <span className={`text-lg font-bold font-mono ${getFPSColor(stats.fps)}`}>
            {stats.fps}
          </span>
        </div>

        {/* Memory */}
        <div className="bg-surface-900 p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <HardDrive className="w-3 h-3 text-surface-500" />
            <span className="text-[10px] text-surface-500 uppercase tracking-wider">Memory</span>
          </div>
          <span className="text-lg font-bold font-mono text-blue-400">
            {stats.memoryUsedMB !== null ? `${stats.memoryUsedMB}` : '—'}
            <span className="text-[10px] text-surface-500 ml-0.5">MB</span>
          </span>
        </div>

        {/* DOM Nodes */}
        <div className="bg-surface-900 p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Layers className="w-3 h-3 text-surface-500" />
            <span className="text-[10px] text-surface-500 uppercase tracking-wider">DOM</span>
          </div>
          <span className="text-lg font-bold font-mono text-purple-400">
            {stats.domNodes.toLocaleString()}
          </span>
        </div>

        {/* Heap Limit */}
        <div className="bg-surface-900 p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <HardDrive className="w-3 h-3 text-surface-500" />
            <span className="text-[10px] text-surface-500 uppercase tracking-wider">Heap</span>
          </div>
          <span className="text-lg font-bold font-mono text-amber-400">
            {stats.heapLimitMB !== null ? `${stats.heapLimitMB}` : '—'}
            <span className="text-[10px] text-surface-500 ml-0.5">MB</span>
          </span>
        </div>
      </div>

      {/* FPS Bar */}
      <div className="px-3 py-2">
        <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              stats.fps >= 55 ? 'bg-emerald-500' : stats.fps >= 30 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(100, (stats.fps / 60) * 100)}%` }}
          />
        </div>
        <p className="text-[9px] text-surface-600 mt-1 text-center">
          Target: 60 FPS
        </p>
      </div>
    </div>
  );
});

export default PerformancePanel;
