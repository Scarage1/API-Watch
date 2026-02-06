import { create } from 'zustand';
import { RequestResult, TestSuite, TestExecutionProgress } from '../types';

interface AppState {
  // Current test execution
  currentExecution: TestExecutionProgress[];
  setCurrentExecution: (progress: TestExecutionProgress[]) => void;
  updateTestProgress: (testId: string, update: Partial<TestExecutionProgress>) => void;
  
  // Test suites
  testSuites: TestSuite[];
  setTestSuites: (suites: TestSuite[]) => void;
  addTestSuite: (suite: TestSuite) => void;
  
  // Test history
  testHistory: RequestResult[];
  addToHistory: (result: RequestResult) => void;
  clearHistory: () => void;
  
  // UI state
  darkMode: boolean;
  toggleDarkMode: () => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
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
  
  // Test history
  testHistory: [],
  addToHistory: (result) =>
    set((state) => ({
      testHistory: [result, ...state.testHistory].slice(0, 100), // Keep last 100
    })),
  clearHistory: () => set({ testHistory: [] }),
  
  // UI state
  darkMode: localStorage.getItem('darkMode') === 'true',
  toggleDarkMode: () =>
    set((state) => {
      const newMode = !state.darkMode;
      localStorage.setItem('darkMode', String(newMode));
      document.documentElement.classList.toggle('dark', newMode);
      return { darkMode: newMode };
    }),
  
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
