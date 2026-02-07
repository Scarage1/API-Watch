import axios from 'axios';
import { toast } from '../store/useToastStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Extract a human-readable error message from a FastAPI error response.
 * FastAPI returns `detail` as a string (e.g. "Not found") for simple errors,
 * or as an array of objects `{type, loc, msg, input, ctx}` for validation errors (422).
 */
export function extractDetail(err: any, fallback = 'Something went wrong'): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail.map((e: any) => e.msg || String(e)).join('; ');
  return fallback;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach workspace ID
apiClient.interceptors.request.use(
  (config) => {
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

// Response interceptor — handle network errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      toast.error('Network error', 'Could not reach the server');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
