import { useEffect, useState, useCallback } from 'react';
import { Moon, Sun, Menu, Zap, Command, Wifi, WifiOff } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useCommandPaletteStore } from '../store/useCommandPaletteStore';
import EnvironmentSelector from './EnvironmentSelector';
import apiClient from '../lib/api';
import { cn } from '../lib/utils';

type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

export default function Header() {
  const { darkMode, toggleDarkMode, toggleSidebar } = useAppStore();
  const openPalette = useCommandPaletteStore((s) => s.open);
  const [status, setStatus] = useState<ConnectionStatus>('checking');

  // ── Health check ─────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      await apiClient.get('/health', { timeout: 5000 });
      setStatus('connected');
    } catch {
      setStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    // Avoid synchronous state updates in effect
    setTimeout(() => { void checkHealth(); }, 0);
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const statusConfig = {
    connected: {
      dot: 'bg-emerald-500 animate-pulse-soft',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'Connected',
      Icon: Wifi,
    },
    disconnected: {
      dot: 'bg-red-500',
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200/50 dark:border-red-800/30',
      text: 'text-red-700 dark:text-red-400',
      label: 'Disconnected',
      Icon: WifiOff,
    },
    checking: {
      dot: 'bg-amber-500 animate-pulse',
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/50 dark:border-amber-800/30',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Checking…',
      Icon: Wifi,
    },
  };

  const cs = statusConfig[status];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-surface-200/50 dark:border-surface-700/30"
      role="banner"
    >
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-[18px] h-[18px] text-surface-500" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg shadow-sm">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-surface-900 dark:text-white">
                API<span className="text-brand-600 dark:text-brand-400">Watch</span>
              </span>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <EnvironmentSelector />
            </div>

            {/* Connection indicator (real health check) */}
            <button
              onClick={checkHealth}
              className={cn(
                'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                cs.bg
              )}
              title={`Server ${cs.label.toLowerCase()} — click to recheck`}
              aria-label={`Server status: ${cs.label}`}
            >
              <div className={cn('w-1.5 h-1.5 rounded-full', cs.dot)} />
              <span className={cn('text-xs font-medium', cs.text)}>{cs.label}</span>
            </button>

            {/* Command palette trigger */}
            <button
              onClick={openPalette}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-surface-400"
              aria-label="Open command palette (⌘K)"
              title="Command Palette (⌘K)"
            >
              <Command className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">⌘K</span>
            </button>

            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <Sun className="w-[18px] h-[18px] text-amber-500" />
              ) : (
                <Moon className="w-[18px] h-[18px] text-surface-500" />
              )}
            </button>


          </div>
        </div>
      </div>
    </header>
  );
}
