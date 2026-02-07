import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '../lib/api';

interface User {
  id: string;
  email: string;
  username: string;
  default_workspace_id?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiClient.post('/api/v1/auth/login', { username, password });
          const { access_token, refresh_token, user } = res.data;
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
          // Initialize workspace store after login
          const { useWorkspaceStore } = await import('./useWorkspaceStore');
          if (user.default_workspace_id) {
            useWorkspaceStore.getState().switchWorkspace(user.default_workspace_id);
          }
          useWorkspaceStore.getState().fetchWorkspaces();
        } catch (err: any) {
          const message = err.response?.data?.detail || 'Login failed';
          set({ isLoading: false, error: message });
          throw new Error(message);
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiClient.post('/api/v1/auth/register', { email, username, password });
          const { access_token, refresh_token, user } = res.data;
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
          // Initialize workspace store after registration
          const { useWorkspaceStore } = await import('./useWorkspaceStore');
          if (user.default_workspace_id) {
            useWorkspaceStore.getState().switchWorkspace(user.default_workspace_id);
          }
          useWorkspaceStore.getState().fetchWorkspaces();
        } catch (err: any) {
          const message = err.response?.data?.detail || 'Registration failed';
          set({ isLoading: false, error: message });
          throw new Error(message);
        }
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;
        try {
          const res = await apiClient.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token, user } = res.data;
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
          });
        } catch {
          // Refresh failed — force logout
          get().logout();
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'api-watch-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
