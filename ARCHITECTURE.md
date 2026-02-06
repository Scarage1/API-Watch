# Architecture

System design and component overview for API-Watch.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│                  React SPA (Vite)                        │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │Dashboard │ │TestSuites│ │Analytics │ │ History  │  │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│        └─────────────┴─────────────┴─────────────┘      │
│                        Axios                             │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (JSON)
┌──────────────────────────▼──────────────────────────────┐
│                    FastAPI Server                        │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Router    │  │Static Files │  │ Webhook Handler │ │
│  │ /api/*      │  │ / (SPA)     │  │ /webhook/*      │ │
│  └──────┬──────┘  └─────────────┘  └─────────────────┘ │
│         │                                               │
│  ┌──────▼──────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Runner    │  │  Diagnose   │  │    Auth          │ │
│  │ (executor)  │  │  (analysis) │  │  (credentials)   │ │
│  └──────┬──────┘  └─────────────┘  └─────────────────┘ │
│         │                                               │
│  ┌──────▼──────┐  ┌─────────────┐                       │
│  │   Retry     │  │   Report    │                       │
│  │ (backoff)   │  │ (HTML gen)  │                       │
│  └─────────────┘  └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

## Components

### Frontend

| Component | File | Responsibility |
|-----------|------|---------------|
| **Dashboard** | `pages/Dashboard.tsx` | Stats overview, cumulative success rate chart |
| **Single Request** | `pages/SingleRequest.tsx` | Execute individual API calls |
| **Test Suites** | `pages/TestSuites.tsx` | CRUD + execute multi-test suites |
| **Analytics** | `pages/Analytics.tsx` | P50/P95/P99 latency, histograms, trends |
| **History** | `pages/History.tsx` | Execution log with method/status/search filters |
| **Settings** | `pages/Settings.tsx` | User preferences (timeout, retries, theme) |
| **Store** | `store/useAppStore.ts` | Zustand store, persisted to localStorage |
| **API Client** | `lib/api.ts` | Axios instance with base URL config |

**State Management:** Zustand with `persist` middleware. All test history, suites, and settings survive page reloads. History capped at 200 entries.

**Routing:** React Router v7 with sidebar navigation. Layout wraps all pages with Header + Sidebar.

### Backend

| Module | File | Responsibility |
|--------|------|---------------|
| **API Server** | `api_server.py` | FastAPI app, CORS, routes, static file serving |
| **Runner** | `runner.py` | Executes HTTP requests via `requests` library |
| **Auth** | `auth.py` | Handles Bearer, API Key, and Basic auth |
| **Retry** | `retry.py` | Exponential backoff with jitter, configurable max retries |
| **Diagnose** | `diagnose.py` | Maps status codes + errors to human-readable diagnosis |
| **Report** | `report.py` | Generates HTML test reports via Jinja2 |
| **Utils** | `utils.py` | Env loading, formatting, JSON parsing, timestamps |
| **CLI** | `main.py` | Command-line interface (Rich-powered output) |

## Data Flow

### Single Request

```
User fills form → POST /api/execute-request
                       │
                 ┌─────▼─────┐
                 │  Runner    │──→ requests.request()
                 └─────┬─────┘
                       │ RequestResult
                 ┌─────▼─────┐
                 │  Diagnose  │  (if error)
                 └─────┬─────┘
                       │
                  JSON Response → Frontend renders result
                                → Store appends to history
```

### Test Suite

```
User creates suite → POST /api/execute-suite
                           │
                    ┌──────▼──────┐
                    │  For each   │
                    │  test case  │
                    └──────┬──────┘
                           │
                 ┌─────────▼─────────┐
                 │  Runner.execute() │──→ Auth headers injected
                 │  + Retry logic    │──→ Exponential backoff
                 └─────────┬─────────┘
                           │ List[RequestResult]
                    ┌──────▼──────┐
                    │  Aggregate  │
                    │  results    │
                    └──────┬──────┘
                           │
                    JSON Response → Frontend shows pass/fail per test
                                 → Batch added to history
```

## Retry Strategy

```
Attempt 1 → fail (5xx / timeout)
  wait: base_delay * 2^0 + jitter
Attempt 2 → fail
  wait: base_delay * 2^1 + jitter
Attempt 3 → fail
  wait: base_delay * 2^2 + jitter  (capped at max_delay)
Attempt N → give up after max_retries
```

- **Retryable:** 500, 502, 503, 504, timeouts, connection errors
- **Not retryable:** 4xx client errors (except 429 rate limit)

## Diagnosis Engine

Maps failure patterns to actionable advice:

| Condition | Severity | Suggestion |
|-----------|----------|-----------|
| 401 Unauthorized | High | Check auth credentials |
| 403 Forbidden | High | Verify permissions/API scopes |
| 404 Not Found | Medium | Verify endpoint URL |
| 429 Rate Limited | Medium | Reduce request frequency |
| 500 Server Error | High | Server-side issue, check logs |
| 502/503/504 | High | Service unavailable, retry later |
| Timeout | Medium | Increase timeout or check network |
| Connection Error | High | Verify URL is reachable |

## Deployment Architecture

```
GitHub (main branch)
       │ push
       ▼
GitHub Actions
  ├── pytest (137 tests)
  ├── vitest (41 tests)
  ├── vite build (frontend → dist/)
  ├── package (src/ + dist/ → zip)
  └── az webapp deploy
             │
             ▼
Azure App Service (F1 Free)
  ├── startup.sh → gunicorn
  ├── /api/*     → FastAPI routes
  ├── /health    → health check
  ├── /webhook   → webhook receiver
  └── /*         → React SPA (index.html)
```

**Single deployment unit:** Backend serves the frontend as static files. No separate frontend hosting needed. The FastAPI server handles API routes first, then falls back to serving `index.html` for all other paths (SPA routing).

## Security

- CORS enabled (configurable origins)
- No secrets stored in code — all via environment variables
- Auth credentials handled per-request, never persisted server-side
- Webhook payloads logged to isolated directory
