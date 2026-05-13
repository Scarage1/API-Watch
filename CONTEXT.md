# API-Watch — Project Context

> **Last updated:** 2026-05-14  
> **Maintainer:** Scarage1 (Shivam Kumar)  
> **Repository:** [github.com/Scarage1/API-Watch](https://github.com/Scarage1/API-Watch)

---

## 1. Product Vision

API-Watch is an **open-source, self-hosted alternative to Postman** that consolidates API testing, debugging, monitoring, and team collaboration into a single deployable container. The goal is to give individual developers and small teams a full-featured API development platform they can own — no SaaS lock-in, no per-seat pricing.

### Target Users
- Solo developers who want a local-first API tool with persistence
- Small engineering teams needing shared workspaces and monitors
- CI/CD pipelines that need programmatic API testing (via API keys)
- Companies wanting a self-hosted alternative to Postman/Insomnia

### Competitive Differentiation
| Feature | Postman | Insomnia | Hoppscotch | **API-Watch** |
|---------|---------|----------|------------|---------------|
| Self-hosted | ❌ (paid) | ✅ | ✅ | ✅ |
| Team workspaces + RBAC | ✅ (paid) | ❌ | ❌ | ✅ |
| API monitoring | ✅ (paid) | ❌ | ❌ | ✅ |
| Mock servers | ✅ | ❌ | ❌ | ✅ |
| GraphQL + WS + SSE | ✅ | ✅ | ✅ | ✅ |
| Scripting engine | ✅ | ❌ | ❌ | ✅ (`pm.*` compat) |
| Governance rules | ❌ | ❌ | ❌ | ✅ |
| Single container deploy | ❌ | ❌ | ❌ | ✅ |

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Frontend** | React + TypeScript | React 19, TS 5.9 | Vite 7 build, Tailwind CSS 3.4 |
| **State** | Zustand | 5.x | 8 stores, persisted via localStorage |
| **Charts** | Recharts | 3.7 | Analytics + dashboard |
| **Icons** | Lucide React | 0.563 | |
| **Backend** | FastAPI + Uvicorn | FastAPI 0.128, Python 3.11 | Async throughout |
| **ORM** | SQLAlchemy 2.0 (async) | 2.0.46 | Mapped columns, relationships |
| **Validation** | Pydantic v2 | 2.12 | Settings + request schemas |
| **Database** | PostgreSQL 16 (prod) / SQLite (dev) | via asyncpg / aiosqlite | |
| **Cache** | Redis 7 (prod) / in-memory (dev) | via `redis-py` 7.0 | |
| **Auth** | JWT (python-jose) + bcrypt | HS256 | + API key alternative |
| **HTTP Client** | httpx (async) + requests (sync) | httpx 0.28 | Connection pooling |
| **CI/CD** | GitHub Actions | Single workflow | Test → Build → GHCR → Azure App Service |
| **Containerization** | Docker (multi-stage) | Node 22 + Python 3.11-slim | Gunicorn + Uvicorn workers |
| **Migrations** | Alembic | 1.16 | 5 migration versions |

---

## 3. Codebase Inventory

### Scale
| Metric | Count |
|--------|-------|
| **Backend Python LoC** | ~22,700 (src/ + tests/) |
| **Frontend TypeScript LoC** | ~18,600 (frontend/src/) |
| **Total LoC** | ~41,300 |
| **Backend modules** (src/) | 26 files + routes/ |
| **Route modules** (src/routes/) | 20 files |
| **Frontend pages** | 16 page components |
| **Frontend components** | 25 reusable components |
| **Zustand stores** | 8 stores |
| **Frontend lib modules** | 10 utility modules |
| **Database models** | 18 SQLAlchemy models |
| **Alembic migrations** | 5 versions (phases 1–5) |
| **Backend test files** | 18 test files |
| **CI workflows** | 1 (docker-deploy.yml) |

### Backend Module Map

```
src/
├── api_server.py        # App entry, middleware stack, SPA serving (580 lines)
├── config.py            # Pydantic BaseSettings (145 lines)
├── models.py            # 18 SQLAlchemy models (658 lines)
├── database.py          # Async engine, session factory (130 lines)
├── runner.py            # HTTP execution engine (505 lines)
├── auth.py              # Bearer/API Key/Basic handlers
├── jwt_auth.py          # JWT + API key auth (330 lines)
├── rbac.py              # Role-based access control
├── cache.py             # Redis wrapper + in-memory fallback
├── rate_limit.py        # Sliding-window rate limiter
├── retry.py             # Exponential backoff + jitter
├── diagnose.py          # Failure pattern matching
├── monitor_executor.py  # Scheduled monitor runner
├── notifier.py          # Email/webhook/Slack notifications
├── secret_scanner.py    # Credential leak detection
├── governance.py        # API governance rules engine (379 lines)
├── telemetry.py         # Request tracing + metrics (262 lines)
├── storage.py           # Filesystem / Azure Blob storage
├── cookie_jar.py        # Persistent cookie management
├── oauth_handler.py     # OAuth 2.0 flow handler
├── scheduler.py         # Background cron scheduler
├── report.py            # HTML test report generator
├── junit_writer.py      # JUnit XML export
├── utils.py             # Formatting helpers
├── main.py              # CLI entry point (legacy)
├── importers/           # Import format parsers
└── templates/           # Jinja2 report templates
```

### Frontend Module Map

```
frontend/src/
├── App.tsx              # Router + lazy loading (88 lines)
├── main.tsx             # React DOM entry
├── index.css            # Tailwind + custom styles
├── pages/               # 16 page components
│   ├── Dashboard.tsx         # Overview + trends (14K)
│   ├── SingleRequest.tsx     # HTTP client (25K)
│   ├── TestSuites.tsx        # Test runner (36K — largest page)
│   ├── MonitorDashboard.tsx  # Monitors + uptime (25K)
│   ├── WebSocketClient.tsx   # WS client (21K)
│   ├── History.tsx           # Request log (22K)
│   ├── GraphQLClient.tsx     # GQL editor (19K)
│   ├── MockServer.tsx        # Mock endpoints (16K)
│   ├── Analytics.tsx         # Latency percentiles (15K)
│   ├── ApiKeysPage.tsx       # API key management (15K)
│   ├── SSEClient.tsx         # SSE streaming (11K)
│   ├── Documentation.tsx     # Auto-gen docs (11K)
│   ├── TeamSettings.tsx      # Workspace members (10K)
│   ├── ImportExportPage.tsx  # Import/export (10K)
│   ├── ActivityFeed.tsx      # Activity timeline (10K)
│   └── Settings.tsx          # Preferences (7K)
├── components/          # 25 reusable components
│   ├── ImportExportPanel.tsx  # 22K (complex)
│   ├── ResponseViewer.tsx     # 19K
│   ├── NotificationChannelConfig.tsx # 14K
│   ├── CollectionsSidebar.tsx  # 13K
│   ├── VersionHistoryDrawer.tsx # 11K
│   ├── RequestDetailModal.tsx  # 11K
│   ├── EnvironmentSelector.tsx # 9K
│   ├── CommandPalette.tsx      # 9K
│   ├── ShareCollectionDialog.tsx # 8K
│   └── ... (15 more)
├── store/               # 8 Zustand stores
│   ├── useRequestStore.ts   # Active tabs + responses (7K)
│   ├── useEnvironmentStore.ts
│   ├── useWorkspaceStore.ts
│   ├── useAppStore.ts       # Theme + sidebar
│   ├── useGraphQLStore.ts
│   ├── useWebSocketStore.ts
│   ├── useToastStore.ts
│   └── useCommandPaletteStore.ts
├── lib/                 # 10 utility modules
│   ├── codeGenerator.ts     # Multi-lang code gen (18K)
│   ├── scriptEngine.ts      # pm.* runtime (16K)
│   ├── openApiParser.ts     # OpenAPI 3.0 parser (12K)
│   ├── curlParser.ts        # cURL import (12K)
│   ├── schemaValidator.ts   # JSON Schema validation (8K)
│   ├── dataFile.ts          # CSV/JSON data files (8K)
│   ├── docGenerator.ts      # API doc generator (7K)
│   ├── interpolate.ts       # {{var}} interpolation (6K)
│   ├── api.ts               # Axios client (2K)
│   └── utils.ts             # Helpers (1K)
├── hooks/               # 1 custom hook
│   └── useKeyboardShortcuts.ts
├── types/               # TypeScript interfaces
│   └── index.ts             # Core domain types
└── workers/             # Web workers (if any)
```

### Database Schema (18 tables)

```
users ──────────┐
                │  owns
organizations ──┤
teams ──────────┤── team_members
workspaces ─────┤── workspace_members
                │── invitations
collections ────┤── saved_requests
                │── collection_shares
                │── collection_snapshots
environments ───┘
request_history
mock_endpoints
monitors ───────┤── monitor_runs
                │── monitor_notifications
notification_channels
api_keys
activity_logs
audit_logs
```

---

## 4. Architecture Patterns

### Backend
- **Async-first:** Every route handler, DB call, and HTTP execution is `async def`
- **Dependency injection:** FastAPI `Depends()` for DB sessions, auth, RBAC
- **Singleton services:** Cache, storage, settings via `@lru_cache` / module globals
- **Middleware chain:** Rate Limiter → Body Size Check → Telemetry → CORS → Route Handler
- **Open-source mode:** No-auth fallback creates a default user automatically — zero friction
- **SPA serving:** Built frontend is served from `/public/` or `frontend/dist/`, catch-all SPA route

### Frontend
- **Code-splitting:** All 16 pages are lazy-loaded via `React.lazy()`
- **State management:** Zustand stores with localStorage persistence
- **Dark mode:** System preference detection + manual toggle
- **Error boundaries:** Per-route `<ErrorBoundary>` wrappers
- **Command palette:** Ctrl+K global command palette
- **Proxy in dev:** Vite proxies `/api/*` and `/health` to backend

### Security Stack
1. Rate limiting (sliding window, per-IP)
2. Request body size limit (10 MB)
3. JWT auth + API key dual-mode
4. RBAC (admin / editor / viewer)
5. SSRF protection (private IP blocking)
6. Secret scanning (credential leak detection in requests)
7. Pydantic v2 input validation
8. Token blacklisting via cache (logout support)
9. bcrypt password hashing

### Deployment
- Multi-stage Docker: Node 22-alpine (frontend build) → Python 3.11-slim (production)
- Non-root user inside container
- Health check endpoint at `/health` (DB + cache)
- CI/CD: GitHub Actions → Test → Build → GHCR → Azure App Service
- Gunicorn with Uvicorn workers in production

---

## 5. Current State Assessment

### ✅ What's Working Well
- **Feature completeness:** Covers HTTP/GraphQL/WebSocket/SSE clients, test suites, monitors, mock servers, collections, environments, import/export, code gen, and analytics
- **Architecture:** Clean separation of concerns — routes, models, services, and stores are well-organized
- **Auth flexibility:** Open-source mode (no login) + JWT + API key authentication
- **Infrastructure:** Docker, CI/CD pipeline, Alembic migrations, health checks all production-ready
- **Security:** Multi-layered security (SSRF, rate limiting, secret scanning, RBAC)
- **Documentation:** README, ARCHITECTURE.md, CONTRIBUTING.md are thorough and well-written
- **Testing:** 18 backend test files covering auth, security, runner, API, phases 2-8

### ⚠️ Technical Debt & Issues

#### Backend
| ID | Issue | Severity | Location |
|----|-------|----------|----------|
| B1 | `api_server.py` is 580 lines — mixes concerns (models, interpolation, SSRF, routes, SPA) | Medium | `src/api_server.py` |
| B2 | Duplicate `import re` (lines 9 and 220 of `api_server.py`) | Low | `src/api_server.py` |
| B3 | Variable interpolation logic duplicated between backend (`api_server.py`) and frontend (`lib/interpolate.ts`) | Medium | Both |
| B4 | `APIRunner` creates a new `requests.Session()` per instance — no shared session pool for sync mode | Low | `src/runner.py` |
| B5 | `models.py` has no Alembic migration for Phase 6–8 models (`AuditLog`, governance tables) — `create_all` handles it but migrations are out of sync | High | `alembic/versions/` |
| B6 | `telemetry.py` stores all metrics in-memory — data lost on restart, memory grows unbounded for path_latencies | Medium | `src/telemetry.py` |
| B7 | `_settings` global in `jwt_auth.py` is a cached-once value — won't update if settings change at runtime | Low | `src/jwt_auth.py` |
| B8 | `scheduler.py` is only 2.4 KB — likely minimal implementation, needs robustness for production monitoring | Medium | `src/scheduler.py` |
| B9 | `docker-compose.prod.yml` has placeholder `<your-github-username>` in image name | Low | `docker-compose.prod.yml` |
| B10 | No request/response logging middleware for audit trail beyond in-memory telemetry | Medium | `src/` |
| B11 | `startup.sh` hardcodes Azure paths (`/home/site/wwwroot`) — not portable to other cloud providers | Low | `startup.sh` |
| B12 | `pytest-asyncio==1.2.0` is ancient — current is 0.23+ / 1.x is incompatible with modern pytest | High | `requirements.txt` |
| B13 | No `pyproject.toml` dependency management — using flat `requirements.txt` only | Low | Root |

#### Frontend
| ID | Issue | Severity | Location |
|----|-------|----------|----------|
| F1 | `TestSuites.tsx` is 36K — largest file, likely needs decomposition | Medium | `frontend/src/pages/` |
| F2 | `SingleRequest.tsx` (25K) and `MonitorDashboard.tsx` (25K) are also very large | Medium | `frontend/src/pages/` |
| F3 | Only 1 custom hook (`useKeyboardShortcuts`) — many pages likely duplicate stateful logic | Medium | `frontend/src/hooks/` |
| F4 | No `404` catch-all route defined in `App.tsx` | Low | `frontend/src/App.tsx` |
| F5 | `types/index.ts` only has 75 lines — many page-specific types are likely inline/unshared | Low | `frontend/src/types/` |
| F6 | No i18n support | Low | Frontend-wide |
| F7 | `frontend/.env` is committed (though likely just `VITE_API_URL`) — should be gitignored | Low | `frontend/.env` |
| F8 | `workers/` directory exists but appears empty — dead code | Low | `frontend/src/workers/` |

#### Testing
| ID | Issue | Severity | Location |
|----|-------|----------|----------|
| T1 | No frontend integration tests (e2e) — only unit tests via Vitest | Medium | `frontend/` |
| T2 | No test coverage reporting configured in CI | Medium | `.github/workflows/` |
| T3 | Backend tests are phased (test_phase2..8) suggesting incremental growth — may have gaps between phases | Low | `tests/` |

#### DevOps
| ID | Issue | Severity | Location |
|----|-------|----------|----------|
| D1 | Only 1 CI workflow — no separate lint, type-check, or security scan jobs | Medium | `.github/workflows/` |
| D2 | No staging environment — deploy goes straight to production | Medium | CI/CD |
| D3 | No Dependabot/Renovate configured for dependency updates | Low | `.github/` |
| D4 | No `CHANGELOG.md` | Low | Root |
| D5 | No pre-commit hooks configured | Low | Root |

---

## 6. Feature Map — What Exists vs. What's Planned

### Implemented ✅
- [x] HTTP client (all methods, body types, auth types)
- [x] GraphQL client with introspection
- [x] WebSocket client
- [x] SSE client
- [x] Collections + folders
- [x] Environments with {{variable}} interpolation + dynamic variables
- [x] Request history with search/filter
- [x] Test suites with pre/post scripts (`pm.*` API)
- [x] JSON Schema validation
- [x] Data-driven testing (CSV/JSON)
- [x] Code generation (8+ languages)
- [x] cURL import
- [x] Postman Collection v2.1 import/export
- [x] OpenAPI 3.0 import/export
- [x] Team workspaces + RBAC (admin/editor/viewer)
- [x] Organizations + teams
- [x] Collection sharing + forking
- [x] Version history (snapshots + restore)
- [x] Activity feed
- [x] API monitors (cron-based) + assertions
- [x] Notification channels (email/webhook/Slack)
- [x] Mock servers
- [x] API key authentication for CI/CD
- [x] Dashboard with analytics
- [x] P50/P95/P99 latency metrics
- [x] API governance rules engine
- [x] Audit logging
- [x] Observability (traces + metrics endpoints)
- [x] Auto-generated API documentation
- [x] Dark mode + command palette
- [x] SSRF protection + secret scanning + rate limiting
- [x] Cookie jar management
- [x] OAuth 2.0 flow support
- [x] JUnit XML export

### Not Yet Implemented 🔲
- [ ] gRPC client
- [ ] Socket.IO client
- [ ] MQTT client
- [ ] API diff / changelog between versions
- [ ] Real-time collaboration (WebSocket sync)
- [ ] Branching/merging for collections (like Git)
- [ ] Plugin / extension system
- [ ] CLI tool (`apiwatch run suite.yaml`)
- [ ] OAuth 2.0 PKCE browser flow (full UI)
- [ ] Webhook replay / retry
- [ ] Response mocking with rules (conditional responses)
- [ ] Request chaining (use output of req A as input to req B)
- [ ] Performance load testing (concurrent request simulation)
- [ ] Mobile app / PWA
- [ ] Paid cloud tier (if ever pursuing monetization)

---

## 7. Key Files for Common Tasks

| Task | Files to Touch |
|------|---------------|
| Add a new API route | `src/routes/new_routes.py` → register in `src/routes/__init__.py` |
| Add a DB model | `src/models.py` → create migration with `alembic revision --autogenerate` |
| Add a frontend page | `frontend/src/pages/NewPage.tsx` → add route in `frontend/src/App.tsx` |
| Add a UI component | `frontend/src/components/NewComponent.tsx` |
| Add a Zustand store | `frontend/src/store/useNewStore.ts` |
| Add a lib utility | `frontend/src/lib/newUtil.ts` |
| Add a backend test | `tests/test_new.py` |
| Add a frontend test | `frontend/src/__tests__/new.test.ts` |
| Change auth behavior | `src/jwt_auth.py` + `src/auth.py` |
| Change rate limits | `src/config.py` (settings) + `src/rate_limit.py` |
| Update CI/CD | `.github/workflows/docker-deploy.yml` |
| Update Docker build | `Dockerfile` + `docker-compose.prod.yml` |

---

## 8. Improvement Roadmap (Prioritized)

### 🔴 P0 — Fix Before Any Feature Work

1. **Fix `pytest-asyncio` version** (B12)  
   `pytest-asyncio==1.2.0` → `pytest-asyncio==0.23.8` (or latest stable). Current version is incompatible.

2. **Sync Alembic migrations** (B5)  
   Models for Phase 6–8 (AuditLog, governance) have no migrations. Run `alembic revision --autogenerate` to catch up.

3. **Remove committed `.env`** (F7)  
   Add `frontend/.env` to `.gitignore`, remove from tracking.

### 🟡 P1 — Code Quality & Maintainability

4. **Decompose `api_server.py`** (B1)  
   Extract interpolation logic into `src/interpolation.py`, SSRF protection into `src/ssrf_protection.py` (partially exists), and legacy endpoint models into routes.

5. **Break up large page components** (F1, F2)  
   - `TestSuites.tsx` (36K) → extract test runner, test editor, test results into sub-components
   - `SingleRequest.tsx` (25K) → extract request form, auth config, tab management
   - `MonitorDashboard.tsx` (25K) → extract monitor list, monitor detail, uptime chart

6. **Add shared custom hooks** (F3)  
   Extract common patterns: `useApi` (fetch + loading + error), `usePagination`, `useDebounce`, `useModal`.

7. **Add `404` route** (F4)  
   Add a catch-all `<Route path="*" element={<NotFound />} />` in `App.tsx`.

8. **Centralize TypeScript types** (F5)  
   Move all shared types from inline page definitions into `types/`.

### 🟢 P2 — Developer Experience

9. **Add test coverage to CI** (T2)  
   Backend: `pytest --cov=src --cov-report=xml`. Frontend: Vitest coverage.

10. **Add separate CI jobs** (D1)  
    Split into: lint, type-check, backend test, frontend test, build, deploy.

11. **Add pre-commit hooks** (D5)  
    `pre-commit` with ruff (Python linting), eslint, prettier, type-checking.

12. **Add Dependabot** (D3)  
    `.github/dependabot.yml` for pip and npm ecosystems.

13. **Add `CHANGELOG.md`** (D4)  
    Start tracking releases with conventional changelog.

### 🔵 P3 — Feature Enhancements

14. **Request chaining**  
    Use response values as variables in subsequent requests — huge UX win.

15. **CLI tool** (`apiwatch run`)  
    Run test suites from YAML/JSON config files — CI/CD integration.

16. **Response mocking with rules**  
    Conditional responses based on request body, headers, query params.

17. **Performance load testing**  
    Simple concurrent request simulation (N requests × M concurrency).

18. **Plugin/extension system**  
    Allow custom pre/post scripts, custom auth handlers, custom code generators.

19. **gRPC client**  
    Proto file upload → service/method browser → streaming support.

### ⚪ P4 — Polish & Growth

20. **PWA support** — service worker for offline collections
21. **i18n** — start with English + Hindi
22. **E2E tests** — Playwright or Cypress for critical flows
23. **API versioning** — v2 API with OpenAPI spec auto-generation
24. **Staging environment** — separate deployment target in CI
25. **Landing page** — marketing site for open-source visibility

---

## 9. Environment Setup Quick Reference

```bash
# ── Clone & Backend ──────────────────────────────────────
git clone git@github.com:Scarage1/API-Watch.git && cd API-Watch
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
ENVIRONMENT=development python -m uvicorn src.api_server:app --host 0.0.0.0 --port 8000 --reload

# ── Frontend (separate terminal) ─────────────────────────
cd frontend && npm install && npm run dev

# ── Docker (alternative) ─────────────────────────────────
docker compose up   # starts PostgreSQL + Redis

# ── Tests ─────────────────────────────────────────────────
ENVIRONMENT=development pytest tests/ -q          # backend
cd frontend && npm test                            # frontend
```

---

## 10. Conventions & Standards

### Git
- Branch from `main`
- Conventional Commits: `feat(scope): description`, `fix(scope): ...`
- PR against `main` with CI passing

### Python
- PEP 8, type hints, async def for all handlers
- Docstrings for public functions
- Imports: stdlib → third-party → local

### TypeScript
- ESLint config in repo, functional components + hooks
- Zustand for state (not prop drilling or Context)
- Tailwind CSS utility classes
- Named exports preferred

### Database
- UUIDs as primary keys (String(36))
- Timezone-aware datetime columns
- Alembic for schema migrations
- `create_all` as fallback in dev mode

---

## 11. Known External Dependencies

| Service | Required? | Purpose |
|---------|-----------|---------|
| PostgreSQL 16 | Prod only | Primary database |
| Redis 7 | Optional | Cache, rate limiting, token blacklist |
| Azure App Service | Optional | Current deployment target |
| GHCR | Optional | Container image registry |
| SMTP server | Optional | Email notifications |
| Slack webhook | Optional | Slack notifications |

---

*This context file should be updated whenever significant architectural decisions are made, new phases are started, or the tech stack changes.*
