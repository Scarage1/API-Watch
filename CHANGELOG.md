# Changelog

All notable changes to API-Watch will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — v3.0 "Enterprise"
- **SSO/SAML Service** — SAML 2.0 + OIDC authentication with per-org configuration
- **SSO Features** — Domain restriction, enforce-SSO mode, JIT user provisioning, session management
- **Advanced Audit System** — Hash-chained tamper-evident audit trail with structured events
- **Compliance Reports** — SOC 2 Type II, GDPR, HIPAA readiness report generation with scoring
- **Audit Log Search** — Full-text search, filter by category/severity/user, export (JSON/CSV)
- **Data Retention Policies** — Configurable retention (30d/90d/365d/unlimited) with enforcement
- **Real-Time Collaboration** — WebSocket-based presence tracking, live cursors, change broadcasting
- **Collaboration Rooms** — Workspace-scoped rooms with automatic cleanup of stale connections
- **Enterprise API Routes** — 15+ endpoints under `/api/v1/enterprise/`
- **Compliance Frameworks** — Framework listing and control evaluation engine

### Added — v2.3 "Growth"
- **CLI Tool** (`apiwatch`) — Run collections, init projects, export as cURL, health checks
- **Plugin System** — Hook-based extensibility (pre_request, post_response, on_error, lifecycle)
- **Plugin Manager** — Auto-discovery from builtin/user/project directories
- **Production Docker Compose** — App + PostgreSQL 16 + Redis 7 with health-check ordering
- **SECURITY.md** — Responsible disclosure policy and deployment best practices
- **CODE_OF_CONDUCT.md** — Contributor Covenant v2.1
- **FUNDING.yml** — GitHub Sponsors configuration
- **Architecture Decision Records** — ADR 001 (Local-First AI), ADR 002 (Plugin System), ADR 003 (SSE Streaming)
- **pyproject.toml** — Project metadata, CLI entry point, ruff linter config

### Added — v2.2 "Intelligence"
- **AI Engine** — Modular AI architecture with provider abstraction (Ollama, OpenAI, Anthropic)
- **AI Provider Layer** — Privacy-first: Ollama (local) as default, cloud providers opt-in
- **Test Generator Agent** — Analyze API responses → generate comprehensive pm.test() assertions
- **Debug Assistant Agent** — Failed request → root cause diagnosis → actionable fix suggestions
- **NL Request Builder Agent** — Natural language → HTTP request configuration (JSON output)
- **SSE Streaming** — All AI responses stream in real-time via Server-Sent Events
- **AI Panel** — Sliding panel UI with three tabs (Generate Tests, Debug, Build Request)
- **AI Sidebar Button** — One-click access to AI Assistant with gradient "NEW" badge
- **AI API Routes** — `/api/v1/ai/{status,config,generate-tests,debug,build-request}`
- **AI Settings** — Configurable provider, model, base URL, API key, temperature, max tokens

### Added — v2.1 "Performance"
- **Web Worker** for off-main-thread JSON parsing, formatting, syntax highlighting, and search
- **IndexedDB persistence** (`idb`) replacing localStorage for large datasets with cursor-based pagination
- **VirtualizedList** component via `@tanstack/react-virtual` for 100K+ item rendering
- **Prometheus `/metrics` endpoint** with HTTP latency histogram (P50/P95/P99), request counters, active connections
- **PerformancePanel** — real-time FPS/memory/DOM monitor widget (dev mode only)
- **Deferred search hook** using `useDeferredValue` for non-blocking search
- **Playwright E2E test suite** for critical flows (health, request execution, navigation, 404)
- Performance benchmarks in E2E (page load <3s, navigation <500ms)
- 404 Not Found page with premium UI design
- Custom hooks: `useApi`, `useDebounce`, `useModal`, `useLocalStorage`, `useCopyToClipboard`
- Skeleton loading components: `Shimmer`, `SkeletonCard`, `SkeletonStat`, `SkeletonListItem`, `SkeletonPageHeader`
- CSS utilities: `gradient-mesh`, `focus-ring`, `status-dot-*`, `tooltip`, `gradient-text`, `page-enter`
- Tailwind animations: `bounce-in`, `float`, `glow-pulse`, `slide-down`, `slide-up-fast`
- Pre-commit hooks configuration (ruff, mypy, eslint, tsc)
- Dependabot configuration for automated dependency updates
- This CHANGELOG

### Changed
- **Global APIRunner singleton** — shared connection pool eliminates ~5ms per-request setup overhead
- **Metrics middleware** records every HTTP request's method, path, status, and latency automatically
- Sidebar redesigned with glassmorphism backdrop, active indicator bar, icon scale micro-animations
- Upgraded `pytest-asyncio` from 1.2.0 to 0.24.0 (P0 compatibility fix)
- Added `orjson` 3.10.x for high-performance JSON serialization
- Enhanced Google Fonts import to include weight 900 for display text
- Improved animation easing curves (spring-based cubic-bezier)

### Fixed
- Added `frontend/.env` to `.gitignore` (was previously tracked)
- Added catch-all `<Route path="*">` to prevent blank pages on unknown routes

### Security
- Shimmer animation CSS keyframe fix for after pseudo-element rendering

## [1.0.0] — 2026-02-09

### Added
- Initial release of API-Watch
- HTTP/GraphQL/WebSocket/SSE clients
- Collections, environments, and variable interpolation
- Test suites with pre/post scripts (`pm.*` API compatible)
- Team workspaces with RBAC (admin/editor/viewer)
- API monitors with cron scheduling and assertions
- Mock servers
- Code generation (8+ languages)
- Import/export (Postman Collection v2.1, OpenAPI 3.0, cURL)
- Dashboard with analytics and latency percentiles
- JWT + API key authentication
- Docker single-container deployment
- CI/CD pipeline with GitHub Actions → GHCR → Azure
