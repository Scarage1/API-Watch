import { Moon, Sun, Menu, Zap } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function Header() {
  const { darkMode, toggleDarkMode, toggleSidebar } = useAppStore();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-surface-200/50 dark:border-surface-700/30">
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
          <div className="flex items-center gap-1">
            <div className="hidden sm:flex items-center gap-1.5 mr-3 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Connected</span>
            </div>

            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label="Toggle dark mode"
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
