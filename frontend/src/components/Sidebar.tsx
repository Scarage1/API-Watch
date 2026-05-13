import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Send,
  FolderOpen,
  BarChart3,
  Clock,
  Settings,
  X,
  Plug,
  Braces,
  Server,
  FileText,
  Users,
  Activity,
  Radar,
  Key,
  FileUp,
  Radio,
  Zap,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import CollectionsSidebar from './CollectionsSidebar';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { useState } from 'react';
import AIPanel from './AIPanel';

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard',   section: 'main' },
  { to: '/request',     icon: Send,            label: 'Request',     section: 'main' },
  { to: '/suites',      icon: FolderOpen,      label: 'Test Suites', section: 'main' },
  { to: '/websocket',   icon: Plug,            label: 'WebSocket',   section: 'main' },
  { to: '/graphql',     icon: Braces,          label: 'GraphQL',     section: 'main' },
  { to: '/sse',         icon: Radio,           label: 'SSE Client',  section: 'main' },
  { to: '/mocks',       icon: Server,          label: 'Mock Server', section: 'tools' },
  { to: '/monitors',    icon: Radar,           label: 'Monitors',    section: 'tools' },
  { to: '/import-export',icon: FileUp,         label: 'Import/Export',section: 'tools' },
  { to: '/docs',        icon: FileText,        label: 'Docs',        section: 'tools' },
  { to: '/analytics',   icon: BarChart3,       label: 'Analytics',   section: 'insights' },
  { to: '/history',     icon: Clock,           label: 'History',     section: 'insights' },
  { to: '/activity',    icon: Activity,        label: 'Activity',    section: 'insights' },
  { to: '/teams',       icon: Users,           label: 'Teams',       section: 'system' },
  { to: '/api-keys',    icon: Key,             label: 'API Keys',    section: 'system' },
  { to: '/settings',    icon: Settings,        label: 'Settings',    section: 'system' },
];

const sections: Record<string, string> = {
  main:     'Build',
  tools:    'Tools',
  insights: 'Insights',
  system:   'System',
};

const groupedItems = Object.entries(sections).map(([key, label]) => ({
  label,
  items: navItems.filter((item) => item.section === key),
}));

// Section label color map for gradient underlines
const sectionColors: Record<string, string> = {
  Build:    'from-brand-500 to-accent-500',
  Tools:    'from-violet-500 to-fuchsia-500',
  Insights: 'from-amber-500 to-orange-500',
  System:   'from-surface-400 to-surface-500',
};

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  return (
    <>
      {/* Backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40 w-56',
          'flex flex-col',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background: 'var(--sidebar-bg, rgba(255,255,255,0.96))',
          borderRight: '1px solid rgba(226,232,240,0.6)',
          boxShadow: '2px 0 24px rgba(0,0,0,0.06)',
        }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Dark mode sidebar styles via CSS variable */}
        <style>{`
          .dark aside[role="navigation"] {
            --sidebar-bg: rgba(15,23,42,0.97);
            border-right-color: rgba(51,65,85,0.5);
            box-shadow: 2px 0 24px rgba(0,0,0,0.3);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
          }
        `}</style>

        {/* Mobile close row */}
        <div className="flex items-center justify-between px-3 py-2 lg:hidden border-b border-surface-100 dark:border-surface-800/80">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #4f46e5, #0d9488)' }}>
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-surface-900 dark:text-white">
              API<span className="text-brand-500">Watch</span>
            </span>
          </div>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4 text-surface-400" />
          </button>
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-5 overflow-y-auto overscroll-contain">
          <WorkspaceSwitcher />

          {groupedItems.map((group) => (
            <div key={group.label}>
              {/* Section header */}
              <div className="flex items-center gap-2 px-2 mb-1.5">
                <div className={cn('h-px flex-1 bg-gradient-to-r opacity-40', sectionColors[group.label] || 'from-surface-300 to-transparent')} />
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-surface-400 dark:text-surface-600">
                  {group.label}
                </p>
                <div className={cn('h-px flex-1 bg-gradient-to-l opacity-40', sectionColors[group.label] || 'from-surface-300 to-transparent')} />
              </div>

              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] font-medium',
                        'transition-all duration-150 outline-none',
                        isActive
                          ? 'text-brand-700 dark:text-brand-300'
                          : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active background pill */}
                        {isActive && (
                          <span
                            className="absolute inset-0 rounded-xl"
                            style={{
                              background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(99,102,241,0.06))',
                              boxShadow: 'inset 0 1px 0 rgba(99,102,241,0.12)',
                            }}
                          />
                        )}

                        {/* Hover background */}
                        {!isActive && (
                          <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                                style={{ background: 'rgba(99,102,241,0.06)' }} />
                        )}

                        {/* Active left bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                                style={{ background: 'linear-gradient(180deg, #4f46e5, #0d9488)' }} />
                        )}

                        {/* Icon */}
                        <item.icon
                          className={cn(
                            'w-[15px] h-[15px] flex-shrink-0 relative z-10 transition-all duration-150',
                            'group-hover:scale-110',
                            isActive
                              ? 'text-brand-600 dark:text-brand-400'
                              : 'text-surface-400 dark:text-surface-500 group-hover:text-brand-500'
                          )}
                        />

                        <span className="relative z-10 truncate">{item.label}</span>

                        {isActive && <span className="sr-only">(current page)</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Collections panel */}
        <div className="px-2.5 py-2 border-t border-surface-100/80 dark:border-surface-800/80 overflow-y-auto max-h-[35vh]">
          <CollectionsSidebar />
        </div>

        {/* AI Assistant button — rotating gradient border */}
        <div className="px-2.5 py-2 border-t border-surface-100/80 dark:border-surface-800/80">
          <div className="relative p-px rounded-xl overflow-hidden">
            {/* Animated conic gradient border */}
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                background: 'conic-gradient(from 0deg at 50% 50%, #4f46e5, #7c3aed, #ec4899, #0d9488, #4f46e5)',
                animation: 'borderSpin 3s linear infinite',
                backgroundSize: '300% 300%',
              }}
            />
            <button
              onClick={() => setAiPanelOpen(true)}
              className="relative w-full flex items-center gap-2.5 px-3 py-2 rounded-[11px] text-[13px] font-semibold
                         bg-white dark:bg-surface-900
                         text-violet-600 dark:text-violet-400
                         hover:bg-violet-50 dark:hover:bg-violet-900/10
                         transition-colors group z-10"
            >
              <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform group-hover:text-fuchsia-500" />
              AI Assistant
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
                NEW
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-surface-100/80 dark:border-surface-800/80">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <p className="text-[10px] font-medium text-surface-400 dark:text-surface-600">
              API-Watch v3.0 Enterprise
            </p>
          </div>
        </div>
      </aside>

      {/* AI Panel */}
      <AIPanel isOpen={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </>
  );
}
