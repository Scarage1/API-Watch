import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search, LayoutDashboard, Send, FlaskConical, BarChart3,
  Clock, Settings as SettingsIcon, Sun, Moon, Plus, Command,
  Plug, Braces, Server, FileText,
} from 'lucide-react';
import { useCommandPaletteStore } from '../store/useCommandPaletteStore';
import { useAppStore } from '../store/useAppStore';
import { useRequestStore } from '../store/useRequestStore';
import { cn } from '../lib/utils';

interface PaletteCommand {
  id: string;
  label: string;
  section: string;
  icon: typeof Search;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette() {
  const { isOpen, close } = useCommandPaletteStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useAppStore();

  // ── Build command list ──────────────────────────────────────────────────
  const commands = useMemo<PaletteCommand[]>(() => {
    const nav = (path: string) => () => { navigate(path); close(); };
    return [
      // Navigation
      { id: 'nav-dashboard', label: 'Go to Dashboard', section: 'Navigation', icon: LayoutDashboard, action: nav('/') },
      { id: 'nav-request', label: 'Go to Request Builder', section: 'Navigation', icon: Send, action: nav('/request') },
      { id: 'nav-suites', label: 'Go to Test Suites', section: 'Navigation', icon: FlaskConical, action: nav('/suites') },
      { id: 'nav-analytics', label: 'Go to Analytics', section: 'Navigation', icon: BarChart3, action: nav('/analytics') },
      { id: 'nav-history', label: 'Go to History', section: 'Navigation', icon: Clock, action: nav('/history') },
      { id: 'nav-settings', label: 'Go to Settings', section: 'Navigation', icon: SettingsIcon, action: nav('/settings') },
      { id: 'nav-websocket', label: 'Go to WebSocket Client', section: 'Navigation', icon: Plug, action: nav('/websocket') },
      { id: 'nav-graphql', label: 'Go to GraphQL Client', section: 'Navigation', icon: Braces, action: nav('/graphql') },
      { id: 'nav-mocks', label: 'Go to Mock Server', section: 'Navigation', icon: Server, action: nav('/mocks') },
      { id: 'nav-docs', label: 'Go to Documentation', section: 'Navigation', icon: FileText, action: nav('/docs') },
      // Actions
      {
        id: 'act-new-tab', label: 'New Request Tab', section: 'Actions', icon: Plus,
        shortcut: '⌘T',
        action: () => {
          useRequestStore.getState().addTab();
          if (location.pathname !== '/request') navigate('/request');
          close();
        },
      },
      {
        id: 'act-toggle-dark', label: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        section: 'Actions', icon: darkMode ? Sun : Moon,
        action: () => { toggleDarkMode(); close(); },
      },
    ];
  }, [darkMode, toggleDarkMode, navigate, close, location.pathname]);

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.section.toLowerCase().includes(q));
  }, [commands, query]);

  // ── Grouped for rendering ──────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    filtered.forEach((c) => {
      const list = map.get(c.section) ?? [];
      list.push(c);
      map.set(c.section, list);
    });
    return map;
  }, [filtered]);

  // ── Reset when opened ──────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // ── Keyboard navigation ────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault();
      filtered[selectedIdx].action();
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!isOpen) return null;

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700">
          <Search className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-sm text-surface-900 dark:text-white placeholder:text-surface-400 outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-[10px] font-medium text-surface-500 border border-surface-200 dark:border-surface-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-surface-400">No results found</p>
          )}
          {Array.from(grouped.entries()).map(([section, items]) => (
            <div key={section}>
              <p className="px-3 py-1.5 text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
                {section}
              </p>
              {items.map((cmd) => {
                flatIdx++;
                const idx = flatIdx;
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    data-idx={idx}
                    role="option"
                    aria-selected={idx === selectedIdx}
                    onClick={cmd.action}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm transition-colors',
                      idx === selectedIdx
                        ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                        : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] font-medium text-surface-400">{cmd.shortcut}</kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-surface-100 dark:border-surface-800 text-[11px] text-surface-400">
          <span className="inline-flex items-center gap-1">
            <Command className="w-3 h-3" />K to toggle
          </span>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
        </div>
      </div>
    </div>
  );
}
