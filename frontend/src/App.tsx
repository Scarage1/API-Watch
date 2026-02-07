import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import OnboardingModal from './components/OnboardingModal';
import { useAppStore } from './store/useAppStore';
import { useAuthStore } from './store/useAuthStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import LoadingSpinner from './components/LoadingSpinner';

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SingleRequest = lazy(() => import('./pages/SingleRequest'));
const TestSuites = lazy(() => import('./pages/TestSuites'));
const Analytics = lazy(() => import('./pages/Analytics'));
const History = lazy(() => import('./pages/History'));
const Settings = lazy(() => import('./pages/Settings'));
const WebSocketClient = lazy(() => import('./pages/WebSocketClient'));
const GraphQLClient = lazy(() => import('./pages/GraphQLClient'));
const MockServer = lazy(() => import('./pages/MockServer'));
const Documentation = lazy(() => import('./pages/Documentation'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function App() {
  const { darkMode } = useAppStore();
  const { isAuthenticated } = useAuthStore();

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  // Initialise dark mode from persisted state (single source of truth)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Detect system preference on first visit (no stored preference yet)
  useEffect(() => {
    const stored = localStorage.getItem('api-watch-storage');
    if (!stored || !JSON.parse(stored)?.state?.darkMode) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        useAppStore.getState().toggleDarkMode();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/auth" element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="request" element={<SingleRequest />} />
            <Route path="suites" element={<TestSuites />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="history" element={<History />} />
            <Route path="websocket" element={<WebSocketClient />} />
            <Route path="graphql" element={<GraphQLClient />} />
            <Route path="mocks" element={<MockServer />} />
            <Route path="docs" element={<Documentation />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Suspense>
      <ToastContainer />
      <CommandPalette />
      <OnboardingModal />
    </BrowserRouter>
  );
}

export default App;

