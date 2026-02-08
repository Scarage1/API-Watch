# Architecture

System design and component overview for API-Watch.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (SPA)                        │
│  React 19 · TypeScript · Vite · Tailwind · Zustand     │
│                                                         │
│  16 Pages · 25 Components · 8 Stores · 10 Lib Modules  │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP / WebSocket
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 FastAPI Backend                          │
│  Python 3.11 · Uvicorn · SQLAlchemy 2.0 · Pydantic v2  │
│                                                         │
│  26 Modules · 20 Route Files · JWT Auth · RBAC          │
│                                                         │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │ Rate Limiter│  │ Secret     │  │ SSRF Protection  │ │
│  │ (sliding    │  │ Scanner    │  │ (private IP      │ │
│  │  window)    │  │            │  │  blocking)       │ │
│  └─────────────┘  └────────────┘  └──────────────────┘ │
└──────┬──────────────────┬───────────────────┬───────────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌──────────────┐  ┌──────────────┐   ┌──────────────────┐
│  PostgreSQL  │  │    Redis     │   │  External APIs   │
│  (SQLite in  │  │  (in-memory  │   │  (user targets)  │
│   dev mode)  │  │   fallback)  │   │                  │
└──────────────┘  └──────────────┘   └──────────────────┘
```

---

## Frontend Architecture

### Pages (16)

| Page | Purpose |
|------|---------|
| `Dashboard` | Overview — recent activity, success rates, trends |
| `SingleRequest` | HTTP client with tabbed request/response |
| `GraphQLClient` | GraphQL query editor with introspection |
| `WebSocketClient` | WebSocket connection and messaging |
| `SSEClient` | Server-Sent Events streaming |
| `TestSuites` | Multi-step API test runner |
| `History` | Searchable request execution log |
| `Analytics` | P50/P95/P99 latency, status distribution |
| `MonitorDashboard` | Scheduled health check dashboard |
| `MockServer` | Mock endpoint management |
| `Documentation` | Auto-generated API docs |
| `ImportExportPage` | Postman/OpenAPI import and export |
| `Settings` | User preferences |
| `TeamSettings` | Workspace member and role management |
| `ApiKeysPage` | API key CRUD |
| `ActivityFeed` | Workspace activity timeline |

### State Management

Zustand stores (8) manage all client-side state:

| Store | Responsibility |
|-------|---------------|
| `requestStore` | Active request tabs, loading states, responses |
| `historyStore` | Request history with search/filter |
| `environmentStore` | Environment variables and active environment |
| `collectionStore` | Saved request collections |
| `workspaceStore` | Active workspace and membership |
| `authStore` | Auth tokens and user info |
| `themeStore` | Dark/light mode preference |
| `monitorStore` | Monitor configurations and results |

### Key Libraries

| Module | Purpose |
|--------|---------|
| `api.ts` | Axios HTTP client with auth interceptors |
| `scriptEngine.ts` | `pm.*` scripting runtime (test, expect, env) |
| `codeGenerator.ts` | Multi-language code generation |
| `curlParser.ts` | cURL command import parser |
| `interpolate.ts` | `{{variable}}` template interpolation |
| `schemaValidator.ts` | JSON Schema response validation |
| `importExport.ts` | Postman/OpenAPI format handlers |

---

## Backend Architecture

### Core Modules

| Module | Purpose |
|--------|---------|
| `api_server.py` | FastAPI app, middleware, SPA catch-all |
| `config.py` | Environment-based configuration |
| `models.py` | SQLAlchemy ORM models (15+ tables) |
| `database.py` | Async engine, session factory |
| `runner.py` | HTTP request execution with timing |
| `auth.py` | Bearer, API Key, Basic auth handlers |
| `jwt_auth.py` | JWT token creation, validation, refresh |
| `rbac.py` | Role-based access control (admin/editor/viewer) |
| `cache.py` | Redis wrapper with in-memory fallback |
| `rate_limit.py` | Sliding-window rate limiter |
| `retry.py` | Exponential backoff with jitter |
| `diagnose.py` | Failure pattern matching and suggestions |
| `monitor_executor.py` | Scheduled API monitor runner |
| `notifier.py` | Email/webhook/Slack notifications |
| `secret_scanner.py` | Credential leak detection in requests |
| `report.py` | HTML test report generator |
| `ssrf_protection.py` | Private IP and internal network blocking |

### Route Modules (20)

All routes are organized under `src/routes/` and registered to the main app:

| Route Module | Prefix | Description |
|-------------|--------|-------------|
| `auth_routes` | `/api/v1/auth` | Login, register, token refresh |
| `workspace_routes` | `/api/v1/workspaces` | Workspace CRUD, members |
| `collections_routes` | `/api/v1/collections` | Collection CRUD, folders |
| `environments_routes` | `/api/v1/environments` | Environment CRUD, variables |
| `history_routes` | `/api/v1/history` | Request history queries |
| `monitor_routes` | `/api/v1/monitors` | Monitor CRUD, results |
| `mock_routes` | `/api/v1/mocks` | Mock endpoint management |
| `api_key_routes` | `/api/v1/api-keys` | API key generation |
| `import_export_routes` | `/api/v1/import-export` | Postman/OpenAPI conversion |
| `activity_routes` | `/api/v1/activity` | Workspace activity log |
| `notification_routes` | `/api/v1/notifications` | Notification preferences |
| `execute_routes` | `/api` | Legacy execute endpoints |
| `webhook_routes` | `/webhook` | Incoming webhook capture |

### Security Layers

```
Request → Rate Limiter → Body Size Check → Auth (JWT/API Key)
       → SSRF Protection → Secret Scanner → Execute
```

1. **Rate Limiting** — Sliding-window per IP, configurable limits.
2. **Body Size Limit** — Rejects payloads over 10 MB.
3. **Authentication** — JWT tokens or API keys per workspace.
4. **RBAC** — Admin/Editor/Viewer roles on workspace resources.
5. **SSRF Protection** — Blocks requests to private IPs (10.x, 172.16.x, 192.168.x, localhost).
6. **Secret Scanning** — Warns when requests contain exposed credentials.
7. **Input Validation** — Pydantic v2 models validate all request bodies.

---

## Data Flow — Request Execution

```
┌────────┐     ┌────────────┐     ┌────────────┐     ┌──────────┐
│ Client │────▶│ Pre-Script │────▶│  Runner    │────▶│ External │
│ (SPA)  │     │ Engine     │     │ (httpx)    │     │ API      │
└────────┘     └────────────┘     └────────────┘     └──────────┘
                                        │
                                        ▼
                                  ┌────────────┐
                                  │ Post-Script│
                                  │ (pm.test)  │
                                  └─────┬──────┘
                                        │
                              ┌─────────┼──────────┐
                              ▼         ▼          ▼
                        ┌──────────┐ ┌───────┐ ┌────────┐
                        │ History  │ │ Cache │ │ Report │
                        │ (DB)     │ │       │ │ (HTML) │
                        └──────────┘ └───────┘ └────────┘
```

---

## Retry Strategy

When a request fails, the retry engine applies:

| Attempt | Delay | Strategy |
|---------|-------|----------|
| 1 | 1s | Base delay |
| 2 | 2s | Exponential (2^1) |
| 3 | 4s | Exponential (2^2) |
| N | min(2^(N-1), 30s) | Capped at 30 seconds |

All delays include random jitter (±25%) to avoid thundering herd.

---

## Deployment Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│ GitHub Push  │────▶│ GitHub       │────▶│ GHCR             │
│ (main)       │     │ Actions CI   │     │ (Container       │
│              │     │              │     │  Registry)        │
└──────────────┘     └──────────────┘     └────────┬─────────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │ Azure App Service│
                                          │ (Docker container│
                                          │  + PostgreSQL    │
                                          │  + Redis)        │
                                          └──────────────────┘
```

Multi-stage Docker build:
1. **Stage 1** — Node.js: install deps, build frontend (`npm run build`)
2. **Stage 2** — Python: install deps, copy backend + built frontend, run Uvicorn

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts, hashed passwords |
| `workspaces` | Team workspaces |
| `workspace_members` | User-workspace membership with roles |
| `collections` | Request collections |
| `collection_items` | Individual requests within collections |
| `environments` | Named environments (dev, staging, prod) |
| `environment_variables` | Key-value pairs per environment |
| `request_history` | Executed request log |
| `monitors` | Scheduled health check configs |
| `monitor_results` | Monitor execution results |
| `mock_endpoints` | Mock server endpoint configs |
| `api_keys` | Workspace API keys |
| `activity_log` | Workspace activity feed |
| `notifications` | Notification channel configs |

Migrations are managed with **Alembic** (`alembic/`).
