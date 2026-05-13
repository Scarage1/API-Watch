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
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'main' },
  { to: '/request', icon: Send, label: 'Request', section: 'main' },
  { to: '/suites', icon: FolderOpen, label: 'Test Suites', section: 'main' },
  { to: '/websocket', icon: Plug, label: 'WebSocket', section: 'main' },
  { to: '/graphql', icon: Braces, label: 'GraphQL', section: 'main' },
  { to: '/sse', icon: Radio, label: 'SSE Client', section: 'main' },
  { to: '/mocks', icon: Server, label: 'Mock Server', section: 'tools' },
  { to: '/monitors', icon: Radar, label: 'Monitors', section: 'tools' },
  { to: '/import-export', icon: FileUp, label: 'Import/Export', section: 'tools' },
  { to: '/docs', icon: FileText, label: 'Documentation', section: 'tools' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', section: 'insights' },
  { to: '/history', icon: Clock, label: 'History', section: 'insights' },
  { to: '/activity', icon: Activity, label: 'Activity', section: 'insights' },
  { to: '/teams', icon: Users, label: 'Teams', section: 'system' },
  { to: '/api-keys', icon: Key, label: 'API Keys', section: 'system' },
  { to: '/settings', icon: Settings, label: 'Settings', section: 'system' },
];

const sections: Record<string, string> = {
  main: 'Build',
  tools: 'Tools',
  insights: 'Insights',
  system: 'System',
};

const groupedItems = Object.entries(sections).map(([key, label]) => ({
  label,
  items: navItems.filter((item) => item.section === key),
}));

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  return (
    <>
      {/* Backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40',
          'w-56',
          // Glass-morphism background
          'bg-white/95 dark:bg-surface-900/95 backdrop-blur-xl',
          'border-r border-surface-200/60 dark:border-surface-800/60',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'shadow-xl shadow-surface-900/5 dark:shadow-surface-950/40'
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full">
          {/* Mobile close button */}
          <div className="flex items-center justify-between px-3 py-2 lg:hidden border-b border-surface-100 dark:border-surface-800">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                <Zap className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold text-surface-900 dark:text-white">API<span className="text-brand-500">Watch</span></span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4 text-surface-400" />
            </button>
          </div>

          {/* Scrollable navigation */}
          <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto overscroll-contain">
            <WorkspaceSwitcher />

            {groupedItems.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-surface-400/70 dark:text-surface-600">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium',
                          'transition-all duration-150',
                          isActive
                            ? [
                                'bg-gradient-to-r from-brand-50 to-brand-50/50 dark:from-brand-900/25 dark:to-brand-900/10',
                                'text-brand-700 dark:text-brand-300',
                                'shadow-sm',
                              ]
                            : [
                                'text-surface-600 dark:text-surface-400',
                                'hover:bg-surface-50 dark:hover:bg-surface-800/60',
                                'hover:text-surface-900 dark:hover:text-surface-200',
                              ]
                        )
                      }
                      aria-label={item.label}
                    >
                      {({ isActive }) => (
                        <>
                          {/* Active indicator bar */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-r-full" />
                          )}

                          {/* Icon with hover scale */}
                          <item.icon
                            className={cn(
                              'w-4 h-4 flex-shrink-0 transition-transform duration-150',
                              'group-hover:scale-110',
                              isActive ? 'text-brand-600 dark:text-brand-400' : ''
                            )}
                          />
                          <span>{item.label}</span>

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
          <div className="px-3 py-3 border-t border-surface-100/80 dark:border-surface-800/80 overflow-y-auto max-h-[38vh]">
            <CollectionsSidebar />
          </div>

          {/* AI Assistant button */}
          <div className="px-3 py-2 border-t border-surface-100/80 dark:border-surface-800/80">
            <button
              onClick={() => setAiPanelOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold
                       bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10
                       dark:from-violet-500/10 dark:to-fuchsia-500/10
                       text-violet-600 dark:text-violet-400
                       hover:from-violet-600/20 hover:to-fuchsia-600/20
                       dark:hover:from-violet-500/20 dark:hover:to-fuchsia-500/20
                       transition-all group"
            >
              <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
              AI Assistant
              <span className="ml-auto text-[9px] font-bold bg-violet-600 dark:bg-violet-500 text-white px-1.5 py-0.5 rounded-full">
                NEW
              </span>
            </button>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-surface-100/80 dark:border-surface-800/80">
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
              <p className="text-[11px] font-medium text-surface-400 dark:text-surface-600">
                API-Watch v3.0 Enterprise
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* AI Panel */}
      <AIPanel isOpen={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </>
  );
}

