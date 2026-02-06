import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import type { RequestResult, TestSuite } from '../types';

const makeResult = (overrides: Partial<RequestResult> = {}): RequestResult => ({
  success: true,
  status_code: 200,
  response_time: 0.150,
  response_size: 1024,
  response_body: '{"ok":true}',
  response_headers: { 'content-type': 'application/json' },
  error: null,
  error_type: null,
  retry_count: 0,
  timestamp: new Date().toISOString(),
  request_method: 'GET',
  request_url: 'https://api.example.com/test',
  ...overrides,
});

const makeSuite = (name: string): TestSuite => ({
  name,
  base_url: 'https://api.example.com',
  tests: [
    { id: 'test-1', method: 'GET', path: '/users' },
    { id: 'test-2', method: 'POST', path: '/users' },
  ],
});

describe('useAppStore', () => {
  beforeEach(() => {
    const { clearHistory, setTestSuites } = useAppStore.getState();
    clearHistory();
    setTestSuites([]);
  });

  describe('testHistory', () => {
    it('starts empty', () => {
      expect(useAppStore.getState().testHistory).toHaveLength(0);
    });

    it('adds a result to history', () => {
      const result = makeResult();
      useAppStore.getState().addToHistory(result);
      const { testHistory } = useAppStore.getState();
      expect(testHistory).toHaveLength(1);
      expect(testHistory[0].request_url).toBe('https://api.example.com/test');
    });

    it('prepends new results (most recent first)', () => {
      useAppStore.getState().addToHistory(makeResult({ request_url: 'https://first.com' }));
      useAppStore.getState().addToHistory(makeResult({ request_url: 'https://second.com' }));
      const { testHistory } = useAppStore.getState();
      expect(testHistory[0].request_url).toBe('https://second.com');
      expect(testHistory[1].request_url).toBe('https://first.com');
    });

    it('limits history to 200 entries', () => {
      for (let i = 0; i < 210; i++) {
        useAppStore.getState().addToHistory(makeResult({ request_url: `https://test.com/${i}` }));
      }
      expect(useAppStore.getState().testHistory).toHaveLength(200);
    });

    it('adds batch results to history', () => {
      const results = [
        makeResult({ request_url: 'https://a.com' }),
        makeResult({ request_url: 'https://b.com' }),
      ];
      useAppStore.getState().addBatchToHistory(results);
      expect(useAppStore.getState().testHistory).toHaveLength(2);
    });

    it('clears history', () => {
      useAppStore.getState().addToHistory(makeResult());
      useAppStore.getState().clearHistory();
      expect(useAppStore.getState().testHistory).toHaveLength(0);
    });
  });

  describe('testSuites', () => {
    it('starts empty', () => {
      expect(useAppStore.getState().testSuites).toHaveLength(0);
    });

    it('adds a test suite', () => {
      useAppStore.getState().addTestSuite(makeSuite('Suite A'));
      const { testSuites } = useAppStore.getState();
      expect(testSuites).toHaveLength(1);
      expect(testSuites[0].name).toBe('Suite A');
      expect(testSuites[0].tests).toHaveLength(2);
    });

    it('removes a test suite by name', () => {
      useAppStore.getState().addTestSuite(makeSuite('Suite A'));
      useAppStore.getState().addTestSuite(makeSuite('Suite B'));
      useAppStore.getState().removeTestSuite('Suite A');
      const { testSuites } = useAppStore.getState();
      expect(testSuites).toHaveLength(1);
      expect(testSuites[0].name).toBe('Suite B');
    });

    it('sets all suites at once', () => {
      useAppStore.getState().setTestSuites([makeSuite('X'), makeSuite('Y')]);
      expect(useAppStore.getState().testSuites).toHaveLength(2);
    });
  });

  describe('settings', () => {
    it('has default values', () => {
      const { settings } = useAppStore.getState();
      expect(settings.defaultTimeout).toBe(10);
      expect(settings.maxRetries).toBe(3);
      expect(settings.autoSaveHistory).toBe(true);
      expect(settings.failureAlerts).toBe(true);
    });

    it('updates settings partially', () => {
      useAppStore.getState().updateSettings({ defaultTimeout: 30 });
      const { settings } = useAppStore.getState();
      expect(settings.defaultTimeout).toBe(30);
      expect(settings.maxRetries).toBe(3); // unchanged
    });
  });

  describe('UI state', () => {
    it('toggles sidebar', () => {
      const initial = useAppStore.getState().sidebarOpen;
      useAppStore.getState().toggleSidebar();
      expect(useAppStore.getState().sidebarOpen).toBe(!initial);
    });
  });

  describe('execution progress', () => {
    it('sets and updates execution progress', () => {
      useAppStore.getState().setCurrentExecution([
        { test_id: 't1', status: 'pending' },
        { test_id: 't2', status: 'pending' },
      ]);
      expect(useAppStore.getState().currentExecution).toHaveLength(2);

      useAppStore.getState().updateTestProgress('t1', { status: 'running' });
      const t1 = useAppStore.getState().currentExecution.find((t) => t.test_id === 't1');
      expect(t1?.status).toBe('running');
    });
  });
});
