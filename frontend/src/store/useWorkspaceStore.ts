/**
 * Workspace store — manages active workspace, list, and switching.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '../lib/api';

export interface WorkspaceEntry {
  id: string;
  name: string;
  description: string | null;
  is_personal: boolean;
  organization_id: string | null;
  member_count: number;
  my_role: string | null;
  created_at?: string;
}

interface WorkspaceState {
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string | null;
  loading: boolean;

  fetchWorkspaces: () => Promise<void>;
  switchWorkspace: (id: string) => void;
  setDefaultWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string, description?: string, organizationId?: string) => Promise<WorkspaceEntry>;
  deleteWorkspace: (id: string) => Promise<void>;
  getActiveWorkspace: () => WorkspaceEntry | null;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      loading: false,

      fetchWorkspaces: async () => {
        set({ loading: true });
        try {
          const res = await apiClient.get('/api/v1/workspaces');
          const workspaces: WorkspaceEntry[] = res.data;
          set((state) => {
            // If no active workspace set, pick personal or first
            let activeId = state.activeWorkspaceId;
            if (!activeId || !workspaces.find((w) => w.id === activeId)) {
              const personal = workspaces.find((w) => w.is_personal);
              activeId = personal?.id || workspaces[0]?.id || null;
            }
            return { workspaces, activeWorkspaceId: activeId, loading: false };
          });
        } catch {
          set({ workspaces: [], loading: false });
        }
      },

      switchWorkspace: (id: string) => {
        set({ activeWorkspaceId: id });
      },

      setDefaultWorkspace: async (id: string) => {
        try {
          await apiClient.post(`/api/v1/workspaces/${id}/set-default`);
          set({ activeWorkspaceId: id });
        } catch {
          // ignore
        }
      },

      createWorkspace: async (name, description, organizationId) => {
        const res = await apiClient.post('/api/v1/workspaces', {
          name,
          description: description || null,
          organization_id: organizationId || null,
        });
        const ws: WorkspaceEntry = res.data;
        set((state) => ({
          workspaces: [...state.workspaces, ws],
          activeWorkspaceId: ws.id,
        }));
        return ws;
      },

      deleteWorkspace: async (id: string) => {
        await apiClient.delete(`/api/v1/workspaces/${id}`);
        set((state) => {
          const remaining = state.workspaces.filter((w) => w.id !== id);
          let activeId = state.activeWorkspaceId;
          if (activeId === id) {
            const personal = remaining.find((w) => w.is_personal);
            activeId = personal?.id || remaining[0]?.id || null;
          }
          return { workspaces: remaining, activeWorkspaceId: activeId };
        });
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((w) => w.id === activeWorkspaceId) || null;
      },
    }),
    {
      name: 'api-watch-workspace',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);
