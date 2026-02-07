/**
 * WebSocket connection store.
 * Manages connection state, message history, and saved profiles.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WSMessageDirection = 'sent' | 'received';
export type WSMessageType = 'text' | 'binary' | 'ping' | 'pong' | 'system';
export type WSConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WSMessage {
  id: string;
  direction: WSMessageDirection;
  type: WSMessageType;
  data: string;
  timestamp: number;
  size: number;
}

export interface WSConnectionProfile {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  protocols: string[];
  autoReconnect: boolean;
}

interface WebSocketState {
  // Connection
  status: WSConnectionStatus;
  url: string;
  protocols: string[];
  headers: Record<string, string>;
  autoReconnect: boolean;
  error: string | null;

  // Messages
  messages: WSMessage[];
  maxMessages: number;

  // Saved profiles
  profiles: WSConnectionProfile[];

  // Actions
  setUrl: (url: string) => void;
  setProtocols: (protocols: string[]) => void;
  setHeaders: (headers: Record<string, string>) => void;
  setAutoReconnect: (auto: boolean) => void;
  setStatus: (status: WSConnectionStatus) => void;
  setError: (error: string | null) => void;
  addMessage: (msg: WSMessage) => void;
  clearMessages: () => void;
  saveProfile: (profile: WSConnectionProfile) => void;
  deleteProfile: (id: string) => void;
  loadProfile: (id: string) => void;
}

export const useWebSocketStore = create<WebSocketState>()(
  persist(
    (set, get) => ({
      status: 'disconnected',
      url: 'wss://echo.websocket.org',
      protocols: [],
      headers: {},
      autoReconnect: false,
      error: null,
      messages: [],
      maxMessages: 500,
      profiles: [],

      setUrl: (url) => set({ url }),
      setProtocols: (protocols) => set({ protocols }),
      setHeaders: (headers) => set({ headers }),
      setAutoReconnect: (auto) => set({ autoReconnect: auto }),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),

      addMessage: (msg) =>
        set((state) => ({
          messages: [...state.messages, msg].slice(-state.maxMessages),
        })),

      clearMessages: () => set({ messages: [] }),

      saveProfile: (profile) =>
        set((state) => ({
          profiles: [
            ...state.profiles.filter((p) => p.id !== profile.id),
            profile,
          ],
        })),

      deleteProfile: (id) =>
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
        })),

      loadProfile: (id) => {
        const profile = get().profiles.find((p) => p.id === id);
        if (profile) {
          set({
            url: profile.url,
            protocols: profile.protocols,
            headers: profile.headers,
            autoReconnect: profile.autoReconnect,
          });
        }
      },
    }),
    {
      name: 'api-watch-websocket',
      partialize: (state) => ({
        url: state.url,
        profiles: state.profiles,
        autoReconnect: state.autoReconnect,
      }),
    }
  )
);
