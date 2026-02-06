import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RequestResult, TestSuite, TestExecutionProgress } from '../types';

interface AppState {
  // Current test execution
  currentExecution: TestExecutionProgress[];
  setCurrentExecution: (progress: TestExecutionProgress[]) => void;
  updateTestProgress: (testId: string, update: Partial<TestExecutionProgress>) => void;
  
  // Test suites
  testSuites: TestSuite[];
  setTestSuites: (suites: TestSuite[]) => void;
  addTestSuite: (suite: TestSuite) => void;
  removeTestSuite: (name: string) => void;
  
  // Test history
  testHistory: RequestResult[];
  addToHistory: (result: RequestResult) => void;
  addBatchToHistory: (results: RequestResult[]) => void;
  clearHistory: () => void;
  
  // Settings
  settings: {
    defaultTimeout: number;
    maxRetries: number;
    autoSaveHistory: boolean;
    failureAlerts: boolean;
    apiToken: string;
  };
  updateSettings: (updates: Partial<AppState['settings']>) => void;
  
  // UI state
  darkMode: boolean;
  toggleDarkMode: () => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Current execution
      currentExecution: [],
      setCurrentExecution: (progress) => set({ currentExecution: progress }),
      updateTestProgress: (testId, update) =>
        set((state) => ({
          currentExecution: state.currentExecution.map((test) =>
            test.test_id === testId ? { ...test, ...update } : test
          ),
        })),
      
      // Test suites
      testSuites: [],
      setTestSuites: (suites) => set({ testSuites: suites }),
      addTestSuite: (suite) =>
        set((state) => ({ testSuites: [...state.testSuites, suite] })),
      removeTestSuite: (name) =>
        set((state) => ({
          testSuites: state.testSuites.filter((s) => s.name !== name),
        })),
      
      // Test history
      testHistory: [],
      addToHistory: (result) =>
        set((state) => ({
          testHistory: [result, ...state.testHistory].slice(0, 200),
        })),
      addBatchToHistory: (results) =>
        set((state) => ({
          testHistory: [...results.reverse(), ...state.testHistory].slice(0, 200),
        })),
      clearHistory: () => set({ testHistory: [] }),
      
      // Settings
      settings: {
        defaultTimeout: 10,
        maxRetries: 3,
        autoSaveHistory: true,
        failureAlerts: true,
        apiToken: '',
      },
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      
      // UI state
      darkMode: typeof window !== 'undefined' && localStorage.getItem('darkMode') === 'true',
      toggleDarkMode: () =>
        set((state) => {
          const newMode = !state.darkMode;
          localStorage.setItem('darkMode', String(newMode));
          document.documentElement.classList.toggle('dark', newMode);
          return { darkMode: newMode };
        }),
      
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    {
      name: 'api-watch-storage',
      partialize: (state) => ({
        testHistory: state.testHistory,
        testSuites: state.testSuites,
        settings: state.settings,
        darkMode: state.darkMode,
      }),
    }
  )
);
