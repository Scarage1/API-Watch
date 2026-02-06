import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';

export default function Layout() {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 pt-14">
      <Header />
      <Sidebar />

      <main
        className={cn(
          'transition-all duration-300 ease-in-out',
          sidebarOpen ? 'lg:pl-56' : 'pl-0'
        )}
      >
        <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
