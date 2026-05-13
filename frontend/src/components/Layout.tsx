import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAppStore } from '../store/useAppStore';

export default function Layout() {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="min-h-screen" style={{ background: '#f8f7f4' }}>
      <div className="dark:hidden" />
      <style>{`
        .dark { background: #0f0f17; }
        .dark main { background: #0f0f17; }
      `}</style>
      <Header />
      <Sidebar />

      {/* Content shifts right when sidebar is open */}
      <main
        className="transition-all duration-200 ease-out"
        style={{
          paddingTop: 'var(--header-height, 48px)',
          paddingLeft: sidebarOpen ? 'var(--sidebar-width, 220px)' : '0',
          minHeight: '100vh',
        }}
      >
        <div className="p-5 sm:p-6 max-w-[1400px] mx-auto page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
