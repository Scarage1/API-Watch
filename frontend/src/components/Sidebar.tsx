import { NavLink } from 'react-router-dom';
import {
  Home,
  Send,
  FolderOpen,
  BarChart3,
  Clock,
  Settings,
  ChevronLeft,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/request', icon: Send, label: 'Single Request' },
  { to: '/suites', icon: FolderOpen, label: 'Test Suites' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-40 transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "w-64"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    "hover:bg-gray-100 dark:hover:bg-gray-700",
                    isActive &&
                      "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium"
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={toggleSidebar}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
