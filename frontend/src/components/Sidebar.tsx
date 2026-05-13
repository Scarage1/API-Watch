import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Send, FolderOpen, BarChart3, Clock, Settings,
  X, Plug, Braces, Server, FileText, Users, Activity, Radar, Key,
  FileUp, Radio, Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import CollectionsSidebar from './CollectionsSidebar';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { useState } from 'react';
import AIPanel from './AIPanel';

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard',    section: 'build' },
  { to: '/request',      icon: Send,            label: 'Request',      section: 'build' },
  { to: '/suites',       icon: FolderOpen,      label: 'Test Suites',  section: 'build' },
  { to: '/websocket',    icon: Plug,            label: 'WebSocket',    section: 'build' },
  { to: '/graphql',      icon: Braces,          label: 'GraphQL',      section: 'build' },
  { to: '/sse',          icon: Radio,           label: 'SSE Client',   section: 'build' },
  { to: '/mocks',        icon: Server,          label: 'Mock Server',  section: 'tools' },
  { to: '/monitors',     icon: Radar,           label: 'Monitors',     section: 'tools' },
  { to: '/import-export',icon: FileUp,          label: 'Import/Export',section: 'tools' },
  { to: '/docs',         icon: FileText,        label: 'Docs',         section: 'tools' },
  { to: '/analytics',    icon: BarChart3,       label: 'Analytics',    section: 'insights' },
  { to: '/history',      icon: Clock,           label: 'History',      section: 'insights' },
  { to: '/activity',     icon: Activity,        label: 'Activity',     section: 'insights' },
  { to: '/teams',        icon: Users,           label: 'Teams',        section: 'system' },
  { to: '/api-keys',     icon: Key,             label: 'API Keys',     section: 'system' },
  { to: '/settings',     icon: Settings,        label: 'Settings',     section: 'system' },
];

const sectionGroups = [
  { key: 'build',    label: 'Build' },
  { key: 'tools',    label: 'Tools' },
  { key: 'insights', label: 'Insights' },
  { key: 'system',   label: 'System' },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-[48px] h-[calc(100vh-48px)] z-40 flex flex-col',
          'transition-transform duration-200 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          width: 'var(--sidebar-width, 220px)',
          background: '#0f0f17',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Mobile close row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] lg:hidden">
          <span className="text-sm font-semibold text-white">Menu</span>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Workspace switcher */}
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <WorkspaceSwitcher />
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto overscroll-contain py-2">
          {sectionGroups.map((group) => {
            const items = navItems.filter((i) => i.section === group.key);
            return (
              <div key={group.key} className="mb-1">
                <p className="section-label">{group.label}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      cn('nav-item', isActive && 'active')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={cn(
                            'w-[15px] h-[15px] flex-shrink-0 transition-colors',
                            isActive
                              ? 'text-white'
                              : 'text-white/40 group-hover:text-white/70'
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {isActive && <span className="sr-only">(current page)</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Collections */}
        <div
          className="border-t border-white/[0.06] overflow-y-auto"
          style={{ maxHeight: '30vh' }}
        >
          <p className="section-label">Collections</p>
          <div className="px-2 pb-2">
            <CollectionsSidebar />
          </div>
        </div>

        {/* AI Assistant — clean, no spinning border */}
        <div className="px-3 py-2 border-t border-white/[0.06]">
          <button
            onClick={() => setAiPanelOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors"
            style={{
              color: 'rgba(167, 139, 250, 0.9)',
              background: 'rgba(167, 139, 250, 0.08)',
              border: '1px solid rgba(167, 139, 250, 0.15)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167, 139, 250, 0.12)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167, 139, 250, 0.08)';
            }}
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            AI Assistant
            <span
              className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(167,139,250,0.25)', color: '#c4b5fd' }}
            >
              BETA
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="conn-dot conn-dot-ok conn-dot-pulse" />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              v3.1 Enterprise
            </span>
          </div>
        </div>
      </aside>

      <AIPanel isOpen={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </>
  );
}
