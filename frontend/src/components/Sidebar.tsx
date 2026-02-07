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
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';
import CollectionsSidebar from './CollectionsSidebar';
import WorkspaceSwitcher from './WorkspaceSwitcher';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'main' },
  { to: '/request', icon: Send, label: 'Request', section: 'main' },
  { to: '/suites', icon: FolderOpen, label: 'Test Suites', section: 'main' },
  { to: '/websocket', icon: Plug, label: 'WebSocket', section: 'main' },
  { to: '/graphql', icon: Braces, label: 'GraphQL', section: 'main' },
  { to: '/mocks', icon: Server, label: 'Mock Server', section: 'tools' },
  { to: '/docs', icon: FileText, label: 'Documentation', section: 'tools' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', section: 'insights' },
  { to: '/history', icon: Clock, label: 'History', section: 'insights' },
  { to: '/activity', icon: Activity, label: 'Activity', section: 'insights' },
  { to: '/teams', icon: Users, label: 'Teams', section: 'system' },
  { to: '/settings', icon: Settings, label: 'Settings', section: 'system' },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();

  const sections = {
    main: 'Build',
    tools: 'Tools',
    insights: 'Insights',
    system: 'System',
  };

  const groupedItems = Object.entries(sections).map(([key, label]) => ({
    label,
    items: navItems.filter((item) => item.section === key),
  }));

  return (
    <>
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40',
          'w-56 bg-white dark:bg-surface-900',
          'border-r border-surface-200/50 dark:border-surface-800',
          'transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full">
          {/* Mobile close */}
          <div className="flex items-center justify-end p-2 lg:hidden">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
            >
              <X className="w-4 h-4 text-surface-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
            <WorkspaceSwitcher />
            {groupedItems.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500">
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
                          'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150',
                          isActive
                            ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                            : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800/50 hover:text-surface-900 dark:hover:text-surface-200'
                        )
                      }
                      aria-label={item.label}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className="w-4 h-4 flex-shrink-0" />
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

          {/* Collections */}
          <div className="px-3 py-3 border-t border-surface-100 dark:border-surface-800 overflow-y-auto max-h-[40vh]">
            <CollectionsSidebar />
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-surface-100 dark:border-surface-800">
            <div className="px-3 py-2">
              <p className="text-[11px] font-medium text-surface-400 dark:text-surface-600">
                API-Watch v2.0
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
