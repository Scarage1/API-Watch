import { useEffect, useState, useCallback, useRef } from 'react';
import { Moon, Sun, Menu, Zap, Command, Wifi, WifiOff, RefreshCw } from 'lucide-react';
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
  const [rechecking, setRechecking] = useState(false);
  const [logoGlow, setLogoGlow] = useState(false);
  const mountedRef = useRef(true);

  // ── Health check ─────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      await apiClient.get('/health', { timeout: 5000 });
      if (mountedRef.current) setStatus('connected');
    } catch {
      if (mountedRef.current) setStatus('disconnected');
    }
  }, []);

  const recheckNow = useCallback(async () => {
    setRechecking(true);
    await checkHealth();
    setTimeout(() => { if (mountedRef.current) setRechecking(false); }, 600);
  }, [checkHealth]);

  useEffect(() => {
    mountedRef.current = true;
    setTimeout(() => { void checkHealth(); }, 0);
    const interval = setInterval(checkHealth, 30_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [checkHealth]);

  // Logo glow on mount
  useEffect(() => {
    const t = setTimeout(() => setLogoGlow(true), 800);
    return () => clearTimeout(t);
  }, []);

  const statusConfig = {
    connected: {
      dot: 'bg-emerald-500 animate-pulse-soft',
      bg:  'bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-500/20 dark:border-emerald-500/20 hover:bg-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'Connected',
      Icon: Wifi,
    },
    disconnected: {
      dot: 'bg-red-500',
      bg:  'bg-red-500/10 dark:bg-red-500/10 border-red-500/20 dark:border-red-500/20 hover:bg-red-500/15',
      text: 'text-red-600 dark:text-red-400',
      label: 'Offline',
      Icon: WifiOff,
    },
    checking: {
      dot: 'bg-amber-500 animate-pulse',
      bg:  'bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/20 dark:border-amber-500/20',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'Checking…',
      Icon: Wifi,
    },
  };

  const cs = statusConfig[status];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      role="banner"
      style={{
        background: darkMode
          ? 'rgba(15,23,42,0.85)'
          : 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(24px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
        borderBottom: darkMode
          ? '1px solid rgba(51,65,85,0.5)'
          : '1px solid rgba(226,232,240,0.7)',
        boxShadow: darkMode
          ? '0 1px 0 rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)'
          : '0 1px 0 rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          {/* ── Left ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors group"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-[18px] h-[18px] text-surface-500 group-hover:text-surface-700 dark:group-hover:text-surface-300 transition-colors" />
            </button>

            {/* Brand logo */}
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-500',
                  logoGlow
                    ? 'shadow-glow-brand'
                    : 'shadow-none'
                )}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #0d9488 100%)',
                }}
              >
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[15px] font-bold tracking-tight text-surface-900 dark:text-white">
                  API<span style={{ color: '#6366f1' }}>Watch</span>
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-surface-400 dark:text-surface-600 -mt-0.5">
                  Enterprise
                </span>
              </div>
            </div>
          </div>

          {/* ── Right ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5">
            <div className="hidden sm:block">
              <EnvironmentSelector />
            </div>

            {/* Connection status badge */}
            <button
              onClick={recheckNow}
              className={cn(
                'hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border cursor-pointer transition-all duration-200',
                cs.bg
              )}
              title={`Server ${cs.label.toLowerCase()} — click to recheck`}
              aria-label={`Server status: ${cs.label}`}
            >
              {rechecking ? (
                <RefreshCw className={cn('w-3 h-3 animate-spin', cs.text)} />
              ) : (
                <div className={cn('w-1.5 h-1.5 rounded-full', cs.dot)} />
              )}
              <span className={cn('text-xs font-semibold', cs.text)}>{cs.label}</span>
            </button>

            {/* Command palette trigger */}
            <button
              onClick={openPalette}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-surface-200 dark:border-surface-700
                         hover:bg-surface-100 dark:hover:bg-surface-800 hover:border-brand-300 dark:hover:border-brand-700
                         transition-all duration-200 text-surface-400 dark:text-surface-500 group"
              aria-label="Open command palette (⌘K)"
              title="Command Palette (⌘K)"
            >
              <Command className="w-3.5 h-3.5 group-hover:text-brand-500 transition-colors" />
              <span className="text-[11px] font-medium group-hover:text-brand-500 transition-colors">⌘K</span>
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-all duration-200 group"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <div className="transition-transform duration-300 group-hover:rotate-12">
                {darkMode ? (
                  <Sun className="w-[18px] h-[18px] text-amber-400 group-hover:text-amber-300" />
                ) : (
                  <Moon className="w-[18px] h-[18px] text-surface-500 group-hover:text-brand-500" />
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
