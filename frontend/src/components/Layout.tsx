import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAppStore } from '../store/useAppStore';
import { cn } from '../lib/utils';

export default function Layout() {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <Sidebar />
      
      <main
        className={cn(
          "pt-16 transition-all duration-300",
          sidebarOpen ? "lg:pl-64" : "pl-0"
        )}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
