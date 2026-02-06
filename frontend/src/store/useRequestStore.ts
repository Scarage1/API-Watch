import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssertionResult, ConsoleEntry } from '../lib/scriptEngine';

// ── Types ────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form-data' | 'x-www-form-urlencoded';

export interface RequestTab {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  params: KeyValuePair[];
  bodyType: BodyType;
  bodyRaw: string;               // raw body text (json / xml / text)
  bodyFormData: KeyValuePair[];   // form-data pairs
  timeout: number;
  isDirty: boolean;
  // Scripting (Phase 4)
  preRequestScript: string;      // JS script to run before sending request
  testScript: string;            // JS script to run after receiving response
  // response state (kept per-tab so switching tabs preserves results)
  response: TabResponse | null;
  isLoading: boolean;
  // optional link back to a saved request
  savedRequestId?: string;
  collectionId?: string;
}

export interface TabResponse {
  success: boolean;
  status_code: number | null;
  response_time: number;
  response_size: number;
  response_body: string | null;
  response_headers: Record<string, string>;
  error: string | null;
  error_type: string | null;
  retry_count: number;
  timestamp: string;
  // Scripting results (Phase 4)
  testResults?: AssertionResult[];
  consoleLogs?: ConsoleEntry[];
  scriptError?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let _counter = 0;
export function uid(): string {
  return `${Date.now()}-${++_counter}`;
}

export function emptyKV(): KeyValuePair {
  return { id: uid(), key: '', value: '', enabled: true };
}

function newTab(partial?: Partial<RequestTab>): RequestTab {
  return {
    id: uid(),
    name: 'New Request',
    method: 'GET',
    url: '',
    headers: [emptyKV()],
    params: [emptyKV()],
    bodyType: 'none',
    bodyRaw: '',
    bodyFormData: [emptyKV()],
    timeout: 10,
    isDirty: false,
    preRequestScript: '',
    testScript: '',
    response: null,
    isLoading: false,
    ...partial,
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

interface RequestState {
  tabs: RequestTab[];
  activeTabId: string;

  // Tab management
  addTab: (partial?: Partial<RequestTab>) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<RequestTab>) => void;
  duplicateTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;

  // Convenience
  getActiveTab: () => RequestTab;
  setResponse: (tabId: string, response: TabResponse | null) => void;
  setLoading: (tabId: string, loading: boolean) => void;
}

export const useRequestStore = create<RequestState>()(
  persist(
    (set, get) => {
      const initialTab = newTab({ name: 'Untitled' });

      return {
        tabs: [initialTab],
        activeTabId: initialTab.id,

        addTab: (partial) => {
          const tab = newTab(partial);
          set((s) => ({
            tabs: [...s.tabs, tab],
            activeTabId: tab.id,
          }));
          return tab.id;
        },

        removeTab: (tabId) => {
          set((s) => {
            if (s.tabs.length <= 1) {
              // Don't close last tab – reset it instead
              const fresh = newTab({ name: 'Untitled' });
              return { tabs: [fresh], activeTabId: fresh.id };
            }
            const idx = s.tabs.findIndex((t) => t.id === tabId);
            const remaining = s.tabs.filter((t) => t.id !== tabId);
            let nextActive = s.activeTabId;
            if (s.activeTabId === tabId) {
              // Activate the tab to the left, or the first tab
              const nextIdx = Math.max(0, idx - 1);
              nextActive = remaining[nextIdx].id;
            }
            return { tabs: remaining, activeTabId: nextActive };
          });
        },

        setActiveTab: (tabId) => set({ activeTabId: tabId }),

        updateTab: (tabId, updates) => {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, ...updates, isDirty: true } : t
            ),
          }));
        },

        duplicateTab: (tabId) => {
          const tab = get().tabs.find((t) => t.id === tabId);
          if (!tab) return;
          const dup = newTab({
            ...tab,
            id: undefined as any, // will be overwritten by newTab
            name: `${tab.name} (copy)`,
            response: null,
            isLoading: false,
            savedRequestId: undefined,
            isDirty: false,
          });
          set((s) => ({
            tabs: [...s.tabs, dup],
            activeTabId: dup.id,
          }));
        },

        renameTab: (tabId, name) => {
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
          }));
        },

        getActiveTab: () => {
          const s = get();
          return s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0];
        },

        setResponse: (tabId, response) => {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, response, isLoading: false } : t
            ),
          }));
        },

        setLoading: (tabId, loading) => {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, isLoading: loading } : t
            ),
          }));
        },
      };
    },
    {
      name: 'api-watch-requests',
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          ...t,
          isLoading: false,      // never persist loading state
          response: null,         // don't persist large response bodies
        })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
