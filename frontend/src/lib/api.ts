import axios from 'axios';
import { toast } from '../store/useToastStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT from auth store
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
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token once
      try {
        const stored = localStorage.getItem('api-watch-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          const refreshToken = parsed?.state?.refreshToken;
          if (refreshToken && !error.config._retry) {
            error.config._retry = true;
            const res = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
              refresh_token: refreshToken,
            });
            const { access_token, refresh_token: newRefresh, user } = res.data;
            // Update localStorage
            parsed.state.accessToken = access_token;
            parsed.state.refreshToken = newRefresh;
            parsed.state.user = user;
            localStorage.setItem('api-watch-auth', JSON.stringify(parsed));
            // Retry original request
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return apiClient(error.config);
          }
        }
      } catch {
        // Refresh failed — clear auth & notify
        localStorage.removeItem('api-watch-auth');
        toast.warning('Session expired', 'Please sign in again');
        window.location.href = '/auth';
      }
    }

    // Global network error feedback
    if (!error.response) {
      toast.error('Network error', 'Could not reach the server');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
