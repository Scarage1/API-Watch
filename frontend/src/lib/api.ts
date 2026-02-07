import axios from 'axios';
import { toast } from '../store/useToastStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT and workspace ID from stores
apiClient.interceptors.request.use(
  (config) => {
    // Read token from persisted auth store in localStorage
    try {
      const stored = localStorage.getItem('api-watch-auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        const token = parsed?.state?.accessToken;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Inject active workspace ID
    try {
      const wsStored = localStorage.getItem('api-watch-workspace');
      if (wsStored) {
        const parsed = JSON.parse(wsStored);
        const wsId = parsed?.state?.activeWorkspaceId;
        if (wsId) {
          config.headers['X-Workspace-Id'] = wsId;
        }
      }
    } catch {
      // Ignore parse errors
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Track whether a token refresh is already in progress to avoid duplicates
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Response interceptor — handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;

      // Avoid parallel refresh attempts
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = (async () => {
          try {
            const stored = localStorage.getItem('api-watch-auth');
            if (!stored) return null;
            const parsed = JSON.parse(stored);
            const refreshToken = parsed?.state?.refreshToken;
            if (!refreshToken) return null;

            const res = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
              refresh_token: refreshToken,
            });
            const { access_token, refresh_token: newRefresh, user } = res.data;

            // Update localStorage (Zustand persist format)
            parsed.state.accessToken = access_token;
            parsed.state.refreshToken = newRefresh;
            parsed.state.user = user;
            localStorage.setItem('api-watch-auth', JSON.stringify(parsed));
            return access_token;
          } catch {
            // Refresh failed — clear auth state and redirect
            localStorage.removeItem('api-watch-auth');
            toast.warning('Session expired', 'Please sign in again');
            // Use a small delay to let state settle before redirect
            setTimeout(() => {
              window.location.replace('/auth');
            }, 100);
            return null;
          } finally {
            isRefreshing = false;
            refreshPromise = null;
          }
        })();
      }

      const newToken = await refreshPromise;
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(error.config);
      }
    }

    // Global network error feedback (skip if already handled above)
    if (!error.response && !error.config._retry) {
      toast.error('Network error', 'Could not reach the server');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
