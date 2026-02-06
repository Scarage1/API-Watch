export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface RequestResult {
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
  request_method: string;
  request_url: string;
}

export interface TestCase {
  id: string;
  method: string;
  path: string;
  description?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  timeout_seconds?: number;
}

export interface TestSuite {
  name: string;
  description?: string;
  base_url: string;
  defaults?: {
    headers?: Record<string, string>;
    timeout_seconds?: number;
    retries?: number;
  };
  auth?: {
    type: 'bearer' | 'api_key' | 'basic';
    token_env?: string;
    key_env?: string;
    header_name?: string;
  };
  tests: TestCase[];
}

export interface Diagnosis {
  issue: string;
  cause: string;
  suggestion: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

export interface TestExecutionProgress {
  test_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: RequestResult;
}

export interface DashboardStats {
  total_requests: number;
  successful: number;
  failed: number;
  success_rate: number;
  avg_response_time: number;
}
