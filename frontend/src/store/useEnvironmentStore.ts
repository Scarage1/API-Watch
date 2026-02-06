import { create } from 'zustand';
import apiClient from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnvironmentEntry {
  id: string;
  name: string;
  variables: Record<string, string>;
  is_active: boolean;
  created_at?: string;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface EnvironmentState {
  /** All environments for the current user */
  environments: EnvironmentEntry[];
  /** The currently active environment (null = none) */
  activeEnv: EnvironmentEntry | null;
  /** Loading flag for initial fetch */
  loading: boolean;

  /** Fetch all environments from the API and set activeEnv */
  fetchEnvironments: () => Promise<void>;

  /** Activate a specific environment (API call + local update) */
  activate: (env: EnvironmentEntry) => Promise<void>;

  /** Deactivate the current environment */
  deactivate: () => Promise<void>;

  /** Get the variables dict of the active environment (empty object if none) */
  getVariables: () => Record<string, string>;

  /** Create a new environment */
  createEnvironment: (name: string, variables: Record<string, string>) => Promise<void>;

  /** Update an existing environment */
  updateEnvironment: (id: string, data: Partial<Pick<EnvironmentEntry, 'name' | 'variables' | 'is_active'>>) => Promise<void>;

  /** Delete an environment */
  deleteEnvironment: (id: string) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentState>()((set, get) => ({
  environments: [],
  activeEnv: null,
  loading: false,

  fetchEnvironments: async () => {
    set({ loading: true });
    try {
      const res = await apiClient.get('/api/v1/environments');
      const envs: EnvironmentEntry[] = res.data;
      const active = envs.find((e) => e.is_active) || null;
      set({ environments: envs, activeEnv: active, loading: false });
    } catch {
      set({ environments: [], activeEnv: null, loading: false });
    }
  },

  activate: async (env) => {
    try {
      await apiClient.put(`/api/v1/environments/${env.id}`, {
        name: env.name,
        variables: env.variables,
        is_active: true,
      });
      await get().fetchEnvironments();
    } catch {
      // ignore
    }
  },

  deactivate: async () => {
    const { activeEnv } = get();
    if (!activeEnv) return;
    try {
      await apiClient.put(`/api/v1/environments/${activeEnv.id}`, {
        name: activeEnv.name,
        variables: activeEnv.variables,
        is_active: false,
      });
      await get().fetchEnvironments();
    } catch {
      // ignore
    }
  },

  getVariables: () => {
    return get().activeEnv?.variables ?? {};
  },

  createEnvironment: async (name, variables) => {
    try {
      await apiClient.post('/api/v1/environments', { name, variables });
      await get().fetchEnvironments();
    } catch {
      // ignore
    }
  },

  updateEnvironment: async (id, data) => {
    try {
      await apiClient.put(`/api/v1/environments/${id}`, data);
      await get().fetchEnvironments();
    } catch {
      // ignore
    }
  },

  deleteEnvironment: async (id) => {
    try {
      await apiClient.delete(`/api/v1/environments/${id}`);
      await get().fetchEnvironments();
    } catch {
      // ignore
    }
  },
}));
