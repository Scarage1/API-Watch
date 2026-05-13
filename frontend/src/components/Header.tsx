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
  const mountedRef = useRef(true);

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
    void checkHealth();
    const id = setInterval(checkHealth, 30_000);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [checkHealth]);

  const statusMeta = {
    connected:    { dotClass: 'conn-dot-ok conn-dot-pulse', label: 'Connected',  Icon: Wifi },
    disconnected: { dotClass: 'conn-dot-err',               label: 'Offline',    Icon: WifiOff },
    checking:     { dotClass: 'conn-dot-warn conn-dot-pulse',label: 'Checking…', Icon: Wifi },
  }[status];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center"
      role="banner"
      style={{
        height: 'var(--header-height, 48px)',
        background: '#0f0f17',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center gap-2 px-4" style={{ width: 'var(--sidebar-width, 220px)', flexShrink: 0 }}>
        {/* Hamburger — aligns with sidebar width */}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)')}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
            style={{ background: '#6366f1' }}
          >
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[14px] font-semibold text-white tracking-tight leading-none">
            API<span style={{ color: '#818cf8' }}>Watch</span>
          </span>
        </div>
      </div>

      {/* Main toolbar area */}
      <div className="flex-1 flex items-center justify-between px-4">
        {/* Left: breadcrumb placeholder — pages inject their own */}
        <div id="header-breadcrumb" />

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:block mr-1">
            <EnvironmentSelector />
          </div>

          {/* Connection status */}
          <button
            onClick={recheckNow}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors text-[12px] font-medium"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: status === 'connected' ? '#4ade80' : status === 'disconnected' ? '#f87171' : '#fbbf24',
            }}
            title="Click to recheck server connection"
            aria-label={`Server status: ${statusMeta.label}`}
          >
            {rechecking ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <span className={cn('conn-dot', statusMeta.dotClass)} />
            )}
            <span>{statusMeta.label}</span>
          </button>

          {/* Command palette */}
          <button
            onClick={openPalette}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors text-[12px]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = 'rgba(255,255,255,0.08)';
              el.style.color = 'rgba(255,255,255,0.7)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = 'rgba(255,255,255,0.04)';
              el.style.color = 'rgba(255,255,255,0.4)';
            }}
            aria-label="Open command palette (⌘K)"
            title="Command Palette (⌘K)"
          >
            <Command className="w-3 h-3" />
            <span className="kbd" style={{ border: 'none', background: 'none', padding: 0, color: 'inherit', fontSize: '11px' }}>⌘K</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)')}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
