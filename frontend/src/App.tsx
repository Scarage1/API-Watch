import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import ErrorBoundary from './components/ErrorBoundary';
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
const TeamSettings = lazy(() => import('./pages/TeamSettings'));

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
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="request" element={<ErrorBoundary><SingleRequest /></ErrorBoundary>} />
            <Route path="suites" element={<ErrorBoundary><TestSuites /></ErrorBoundary>} />
            <Route path="analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
            <Route path="history" element={<ErrorBoundary><History /></ErrorBoundary>} />
            <Route path="websocket" element={<ErrorBoundary><WebSocketClient /></ErrorBoundary>} />
            <Route path="graphql" element={<ErrorBoundary><GraphQLClient /></ErrorBoundary>} />
            <Route path="mocks" element={<ErrorBoundary><MockServer /></ErrorBoundary>} />
            <Route path="docs" element={<ErrorBoundary><Documentation /></ErrorBoundary>} />
            <Route path="teams" element={<ErrorBoundary><TeamSettings /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
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

