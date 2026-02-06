import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SingleRequest from './pages/SingleRequest';
import TestSuites from './pages/TestSuites';
import Analytics from './pages/Analytics';
import History from './pages/History';
import Settings from './pages/Settings';
import { useAppStore } from './store/useAppStore';

function App() {
  const { darkMode } = useAppStore();

  useEffect(() => {
    // Initialize dark mode from localStorage
    const isDark = localStorage.getItem('darkMode') === 'true';
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="request" element={<SingleRequest />} />
          <Route path="suites" element={<TestSuites />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

