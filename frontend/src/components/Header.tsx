import { Moon, Sun, Menu, Activity } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';

export default function Header() {
  const { darkMode, toggleDarkMode, toggleSidebar } = useAppStore();

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                  API-Watch
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Monitor & Debug APIs
                </p>
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className={cn(
                "p-2 rounded-lg transition-colors",
                "hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-yellow-500" />
              ) : (
                <Moon className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
