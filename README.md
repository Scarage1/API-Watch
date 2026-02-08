<p align="center">
  <h1 align="center">⚡ API-Watch</h1>
  <p align="center">
    <strong>Open-source API development platform — test, debug, monitor, and collaborate.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/Scarage1/API-Watch/actions/workflows/docker-deploy.yml"><img src="https://github.com/Scarage1/API-Watch/actions/workflows/docker-deploy.yml/badge.svg" alt="CI/CD"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
    <a href="https://github.com/Scarage1/API-Watch/stargazers"><img src="https://img.shields.io/github/stars/Scarage1/API-Watch?style=social" alt="Stars"></a>
  </p>
</p>

---

A self-hosted alternative to Postman with team workspaces, API monitoring, mock servers, and a built-in scripting engine — all in a single deployable container.

## ✨ Features

### API Clients
- **HTTP Client** — Any method, headers, params, body (JSON, form-data, XML, raw). Tabbed interface with environment variable interpolation.
- **GraphQL Client** — Query editor with schema introspection, variables, and response explorer.
- **WebSocket Client** — Connect, send/receive messages, event log with timestamps.
- **SSE Client** — Server-Sent Events streaming with real-time event display.

### Testing & Scripting
- **Pre-request & Test Scripts** — JavaScript scripting engine with a Postman-compatible `pm.*` API (`pm.test`, `pm.expect`, `pm.environment.set`).
- **Test Suites** — Organize and run multi-step API tests with shared config and pass/fail assertions.
- **JSON Schema Validation** — Validate response bodies against JSON Schema directly in the response viewer.
- **Data-Driven Testing** — Import CSV/JSON data files to run parameterized test iterations.

### Collections & Environments
- **Collections** — Organize saved requests into folders. Import from Postman or OpenAPI specs.
- **Environments** — Create multiple environments (dev, staging, prod) with key-value variables. Supports `{{variable}}` interpolation across URLs, headers, params, and body.
- **Dynamic Variables** — Built-in `{{$timestamp}}`, `{{$randomInt}}`, `{{$guid}}`, and more.

### Collaboration
- **Team Workspaces** — Shared workspaces with role-based access (admin, editor, viewer).
- **Activity Feed** — Real-time log of who changed what across the workspace.
- **Collection Sharing** — Share collections across workspaces with fork/clone support.
- **Version History** — Auto-snapshot collections on changes with one-click restore.

### Monitoring & Alerts
- **API Monitors** — Schedule recurring health checks with configurable intervals and assertions.
- **Notification Channels** — Get alerts via email, webhook, or Slack when monitors fail.
- **Uptime Dashboard** — Visualize monitor results, response times, and uptime percentages.

### Developer Tools
- **Code Generation** — Generate request code in 8+ languages (cURL, Python, JavaScript, Go, Rust, PHP, Java, C#).
- **cURL Import** — Paste a cURL command and it is parsed into a request automatically.
- **Mock Servers** — Create mock API endpoints with custom status codes, headers, delays, and response bodies.
- **API Documentation** — Auto-generate browsable API docs from your collections.
- **Import/Export** — Postman Collection v2.1 and OpenAPI 3.0 import/export.

### Analytics & History
- **Dashboard** — Overview of recent activity, success rates, and response time trends.
- **Analytics** — P50/P95/P99 latency percentiles, method distribution, status code breakdown, response time histograms.
- **Request History** — Full execution log with search, method, and status filters. Persists across sessions.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, Uvicorn, SQLAlchemy 2.0 (async), Pydantic v2 |
| **Database** | PostgreSQL (production) / SQLite (development) |
| **Cache** | Redis (production) / in-memory fallback (development) |
| **Testing** | Vitest + Testing Library · Pytest |
| **CI/CD** | GitHub Actions → Docker → GHCR → Azure App Service |

---

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+

### Local Development

```bash
# Clone the repo
git clone https://github.com/Scarage1/API-Watch.git
cd API-Watch

# Backend
cp .env.example .env
pip install -r requirements.txt
ENVIRONMENT=development python -m uvicorn src.api_server:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend: **http://localhost:8000** · Frontend: **http://localhost:5173**

### With Docker

```bash
# Development (with hot-reload)
docker compose up

# Production
docker compose -f docker-compose.prod.yml up
```

### Run Tests

```bash
# Backend
ENVIRONMENT=development pytest tests/ -q

# Frontend
cd frontend && npm test
```

---

## 📁 Project Structure

```
API-Watch/
├── src/                          # Backend (FastAPI)
│   ├── api_server.py             # Main app — routes, middleware, SPA serving
│   ├── config.py                 # Centralized configuration
│   ├── models.py                 # SQLAlchemy models (15+ tables)
│   ├── database.py               # Async DB engine (PostgreSQL/SQLite)
│   ├── cache.py                  # Redis cache with in-memory fallback
│   ├── runner.py                 # HTTP request executor
│   ├── auth.py                   # Auth handlers (Bearer, API Key, Basic)
│   ├── jwt_auth.py               # JWT authentication
│   ├── rbac.py                   # Role-based access control
│   ├── retry.py                  # Exponential backoff with jitter
│   ├── diagnose.py               # Failure diagnosis engine
│   ├── rate_limit.py             # Sliding-window rate limiter
│   ├── monitor_executor.py       # Scheduled monitor runner
│   ├── notifier.py               # Alert notifications (email/webhook)
│   ├── secret_scanner.py         # Credential leak detection
│   ├── report.py                 # HTML report generator
│   └── routes/                   # API route modules (20 files)
│       ├── auth_routes.py
│       ├── workspace_routes.py
│       ├── collections_routes.py
│       ├── environments_routes.py
│       ├── history_routes.py
│       ├── monitor_routes.py
│       ├── mock_routes.py
│       └── ...
├── frontend/                     # Frontend (React + TypeScript)
│   └── src/
│       ├── pages/                # 16 page components
│       │   ├── SingleRequest.tsx
│       │   ├── GraphQLClient.tsx
│       │   ├── WebSocketClient.tsx
│       │   ├── SSEClient.tsx
│       │   ├── TestSuites.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Analytics.tsx
│       │   ├── MonitorDashboard.tsx
│       │   ├── MockServer.tsx
│       │   └── ...
│       ├── components/           # 25 reusable components
│       ├── store/                # 8 Zustand stores
│       └── lib/                  # 10 library modules
│           ├── api.ts
│           ├── scriptEngine.ts
│           ├── codeGenerator.ts
│           ├── curlParser.ts
│           ├── interpolate.ts
│           └── ...
├── tests/                        # Backend tests (pytest)
├── alembic/                      # Database migrations
├── .github/workflows/            # CI/CD pipeline
├── Dockerfile                    # Multi-stage production build
├── docker-compose.yml            # Local development
└── docker-compose.prod.yml       # Production deployment
```

---

## 🔌 API Reference

### Legacy Endpoints (no auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (DB + cache status) |
| `POST` | `/api/execute-request` | Execute a single HTTP request |
| `POST` | `/api/execute-suite` | Run a test suite |
| `POST` | `/api/diagnose` | Diagnose a failed response |
| `ANY` | `/webhook/{path}` | Webhook receiver |

### v1 REST API

| Resource | Endpoints |
|----------|-----------|
| **Workspaces** | `GET/POST /api/v1/workspaces`, `GET/PUT/DELETE /api/v1/workspaces/:id` |
| **Collections** | `GET/POST /api/v1/collections`, `GET/PUT/DELETE /api/v1/collections/:id` |
| **Environments** | `GET/POST /api/v1/environments`, `GET/PUT/DELETE /api/v1/environments/:id` |
| **History** | `GET /api/v1/history`, `GET /api/v1/history/:id`, `DELETE /api/v1/history` |
| **Monitors** | `GET/POST /api/v1/monitors`, `PUT/DELETE /api/v1/monitors/:id` |
| **Mock Endpoints** | `GET/POST /api/v1/mocks`, `PUT/DELETE /api/v1/mocks/:id` |
| **API Keys** | `GET/POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/:id` |
| **Import/Export** | `POST /api/v1/import-export/import/postman`, `GET /api/v1/import-export/export/:format/:id` |
| **Activity** | `GET /api/v1/activity` |
| **Notifications** | `GET/POST /api/v1/notifications` |

### Example

```bash
curl -X POST http://localhost:8000/api/execute-request \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "https://jsonplaceholder.typicode.com/posts/1",
    "headers": {},
    "timeout": 10
  }'
```

---

## 🐳 Deployment

### Docker (Recommended)

```bash
docker build -t api-watch .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql+asyncpg://user:pass@host/db \
  -e JWT_SECRET_KEY=$(openssl rand -hex 32) \
  -e CORS_ALLOWED_ORIGINS=https://yourdomain.com \
  api-watch
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./data/apiwatch.db` | Database connection string |
| `REDIS_URL` | No | — | Redis URL for caching and rate limiting |
| `JWT_SECRET_KEY` | No | Auto-generated | Secret for JWT signing |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |
| `ENVIRONMENT` | No | `production` | `development` or `production` |
| `RATE_LIMIT_ENABLED` | No | `true` | Enable/disable rate limiting |
| `MAX_REQUEST_BODY_SIZE` | No | `10485760` | Max request body size in bytes (10 MB) |

See [.env.example](.env.example) for the full list.

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development environment setup
- Code style guidelines
- Testing requirements
- Pull request process

---

## 📄 License

[MIT](LICENSE) — free for personal and commercial use.
