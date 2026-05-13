<p align="center">
  <br />
  <img src="frontend/public/logo.svg" alt="API-Watch" width="64" height="64" />
  <br />
  <br />
  <strong>API-Watch</strong>
  <br />
  <em>The open-source API development platform for teams who ship fast.</em>
  <br />
  <br />
  <a href="https://github.com/Scarage1/API-Watch/actions/workflows/ci.yml"><img src="https://github.com/Scarage1/API-Watch/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/Scarage1/API-Watch/stargazers"><img src="https://img.shields.io/github/stars/Scarage1/API-Watch?style=social" alt="Stars" /></a>
  <a href="https://github.com/Scarage1/API-Watch/releases"><img src="https://img.shields.io/github/v/release/Scarage1/API-Watch?label=version" alt="Version" /></a>
</p>

---

**API-Watch** is a self-hosted, all-in-one API workspace that replaces Postman, Insomnia, and Hoppscotch. Test, debug, monitor, mock, and collaborate — all from a single container, all under your control.

> **Why API-Watch?**  Zero cloud lock-in. Your data stays on your servers. No seat limits. No usage caps. Deploy once, use forever.

---

## ⚡ 30-Second Start

```bash
# Clone and run
git clone https://github.com/Scarage1/API-Watch.git
cd API-Watch
docker compose up

# Open http://localhost:8000
```

That's it. Backend, frontend, and database — all wired together.

---

## 🏗️ What You Get

### API Clients
| Client | Highlights |
|--------|-----------|
| **HTTP** | Every method, headers, params, body types (JSON, form-data, XML, raw), environment variable interpolation |
| **GraphQL** | Schema introspection, variables panel, response explorer |
| **WebSocket** | Real-time send/receive with event log and timestamps |
| **SSE** | Server-Sent Events streaming with live event display |

### Testing Engine
- **Pre-request & test scripts** with Postman-compatible `pm.*` API
- **Test suites** — multi-step tests with shared config and assertions
- **Data-driven testing** — CSV/JSON parameterized iterations
- **JSON Schema validation** built into the response viewer

### Workspaces & Collaboration
- **Team workspaces** with role-based access (admin, editor, viewer)
- **Activity feed** — real-time audit trail of workspace changes
- **Version history** — auto-snapshots with one-click restore
- **Collections** — organize requests into folders, share across teams

### Monitoring & Alerts
- **Scheduled monitors** with configurable intervals and SLA assertions
- **Multi-channel alerts** — email, webhook, Slack
- **Uptime dashboard** — response time trends and availability percentages

### Developer Tools
- **Code generation** — cURL, Python, JavaScript, Go, Rust, PHP, Java, C# (8+ languages)
- **cURL import** — paste a curl command, get a pre-filled request
- **Mock servers** — custom endpoints with status codes, headers, delays, and response bodies
- **API documentation** — auto-generate browsable docs from collections
- **Import/Export** — Postman Collection v2.1, OpenAPI 3.0

### Analytics
- **P50/P95/P99 latency** percentiles
- **Method distribution** and status code breakdown
- **Response time histograms** and success rate trends

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 · TypeScript · Vite · Tailwind CSS · Zustand · Recharts |
| **Backend** | Python 3.11 · FastAPI · Uvicorn · SQLAlchemy 2.0 · Pydantic v2 · structlog |
| **Database** | PostgreSQL (prod) / SQLite (dev) |
| **Cache** | Redis (prod) / in-memory fallback (dev) |
| **Performance** | orjson · httpx with HTTP/2 · connection pooling (200 concurrent) |
| **Testing** | Pytest · Vitest · Testing Library |
| **CI/CD** | GitHub Actions (6-stage pipeline) → Docker → GHCR |

---

## 🚀 Local Development

### Prerequisites
- Python 3.11+
- Node.js 22+

```bash
# Backend
cp .env.example .env
pip install -r requirements.txt
ENVIRONMENT=development python -m uvicorn src.api_server:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Backend API | `http://localhost:8000` |
| Frontend Dev | `http://localhost:5173` |
| API Docs | `http://localhost:8000/docs` |

### Run Tests

```bash
# Backend
ENVIRONMENT=development pytest tests/ -v --tb=short

# Frontend
cd frontend && npm test
```

---

## 🐳 Docker Deployment

```bash
docker build -t api-watch .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql+asyncpg://user:pass@host/db \
  -e JWT_SECRET_KEY=$(openssl rand -hex 32) \
  -e CORS_ALLOWED_ORIGINS=https://yourdomain.com \
  api-watch
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | SQLite (file-based) | PostgreSQL connection string |
| `REDIS_URL` | — | Redis for caching & rate limiting |
| `JWT_SECRET_KEY` | Auto-generated | JWT signing secret |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `ENVIRONMENT` | `production` | `development` / `production` |
| `LOG_LEVEL` | `INFO` | Logging verbosity |
| `RATE_LIMIT_ENABLED` | `true` | Toggle rate limiting |
| `MAX_REQUEST_BODY_SIZE` | `10485760` | Max body size (bytes) |

Full list: [`.env.example`](.env.example)

---

## 📁 Project Structure

```
API-Watch/
├── src/                          # Backend (FastAPI)
│   ├── api_server.py             # App entry — routes, middleware, lifespan
│   ├── config.py                 # Settings (Pydantic BaseSettings)
│   ├── models.py                 # SQLAlchemy models (15+ tables)
│   ├── database.py               # Async DB engine
│   ├── runner.py                 # HTTP executor (orjson, HTTP/2, connection pool)
│   ├── interpolation.py          # {{variable}} template engine
│   ├── logging_config.py         # structlog configuration
│   ├── cache.py                  # Redis with in-memory fallback
│   ├── jwt_auth.py               # JWT authentication
│   ├── rbac.py                   # Role-based access control
│   ├── rate_limit.py             # Sliding-window rate limiter
│   ├── monitor_executor.py       # Scheduled health checks
│   ├── notifier.py               # Multi-channel alerts
│   ├── secret_scanner.py         # Credential leak detection
│   └── routes/                   # API route modules (20+ files)
├── frontend/                     # Frontend (React + TypeScript)
│   └── src/
│       ├── pages/                # 16 page components
│       ├── components/           # 25+ reusable components
│       ├── store/                # 8 Zustand stores
│       └── lib/                  # Utilities & API client
├── alembic/                      # Database migrations
├── tests/                        # Backend tests (pytest)
├── .github/workflows/            # CI pipeline (6-stage)
├── Dockerfile                    # Multi-stage production build
└── docker-compose.yml            # Local development
```

---

## 🔌 API Quick Reference

```bash
# Execute a request
curl -X POST http://localhost:8000/api/execute-request \
  -H "Content-Type: application/json" \
  -d '{
    "method": "GET",
    "url": "https://jsonplaceholder.typicode.com/posts/1",
    "headers": {},
    "timeout": 10
  }'
```

| Resource | Endpoints |
|----------|-----------|
| **Auth** | `POST /api/v1/auth/register`, `POST /api/v1/auth/login` |
| **Workspaces** | `GET/POST /api/v1/workspaces`, `GET/PUT/DELETE /api/v1/workspaces/:id` |
| **Collections** | `GET/POST /api/v1/collections`, `GET/PUT/DELETE /api/v1/collections/:id` |
| **Environments** | `GET/POST /api/v1/environments`, `GET/PUT/DELETE /api/v1/environments/:id` |
| **History** | `GET /api/v1/history`, `DELETE /api/v1/history` |
| **Monitors** | `GET/POST /api/v1/monitors`, `PUT/DELETE /api/v1/monitors/:id` |
| **Mock Endpoints** | `GET/POST /api/v1/mocks`, `PUT/DELETE /api/v1/mocks/:id` |
| **API Keys** | `GET/POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/:id` |
| **Import/Export** | `POST /api/v1/import-export/import/postman`, `GET /api/v1/import-export/export/:format/:id` |

Full interactive docs at `/docs` (Swagger UI).

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and PR process.

```bash
# Setup pre-commit hooks
pip install pre-commit
pre-commit install
```

---

## 📜 License

[MIT](LICENSE) — free for personal and commercial use.

---

<p align="center">
  <sub>Built with ☕ and obsession for developer experience.</sub>
  <br />
  <sub>If API-Watch saves you time, consider giving it a ⭐</sub>
</p>
