# API-Watch

A full-stack API debugging, testing, and monitoring toolkit. Execute requests, run test suites, diagnose failures, and track performance — all from a single dashboard.

**Live:** [apiwatch-shivamkumar.azurewebsites.net](https://apiwatch-shivamkumar.azurewebsites.net)

---

## Features

- **Single Request Executor** — Fire any HTTP method with custom headers, params, and body. See response, timing, and status instantly.
- **Test Suites** — Define and run multi-step API test suites with shared base URLs, auth, and defaults.
- **Auto-Diagnosis** — Automatic failure analysis with actionable suggestions for common HTTP errors (401, 403, 429, 5xx, timeouts).
- **Analytics Dashboard** — P50/P95/P99 latency, success rates, response time trends, method distribution, status code breakdown.
- **History & Filters** — Full execution history with method, status, and search filters.
- **Webhook Receiver** — Built-in endpoint to capture and log incoming webhooks.
- **Retry Logic** — Configurable exponential backoff with jitter for transient failures.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand, Recharts |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Testing | Vitest + Testing Library (41 tests), Pytest (137 tests) |
| CI/CD | GitHub Actions → Azure App Service |
| Hosting | Azure App Service (F1), Central India |

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+

### Run Locally

```bash
# Backend
pip install -r requirements.txt
python -m src.api_server

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:8000`, frontend on `http://localhost:5173`.

### Run Tests

```bash
# Backend (137 tests)
pytest

# Frontend (41 tests)
cd frontend && npm test
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/execute-request` | Execute a single HTTP request |
| `POST` | `/api/execute-suite` | Run a full test suite |
| `POST` | `/api/diagnose` | Diagnose a failed response |
| `POST` | `/api/stats` | Compute stats from test results |
| `ANY` | `/webhook` | Webhook receiver (logs all incoming) |

### Execute Request

```json
POST /api/execute-request
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts/1",
  "headers": {},
  "timeout": 10
}
```

### Execute Suite

```json
POST /api/execute-suite
{
  "name": "User API Tests",
  "base_url": "https://jsonplaceholder.typicode.com",
  "tests": [
    { "id": "get-posts", "method": "GET", "path": "/posts" },
    { "id": "get-user", "method": "GET", "path": "/users/1" }
  ]
}
```

## Project Structure

```
API-Watch/
├── src/                    # Backend
│   ├── api_server.py       # FastAPI server + static file serving
│   ├── runner.py           # HTTP request executor
│   ├── auth.py             # Auth handler (Bearer, API Key, Basic)
│   ├── retry.py            # Retry with exponential backoff
│   ├── diagnose.py         # Failure diagnosis engine
│   ├── report.py           # HTML report generator
│   ├── utils.py            # Shared utilities
│   └── main.py             # CLI entry point
├── frontend/               # React frontend
│   ├── src/
│   │   ├── pages/          # Dashboard, TestSuites, Analytics, History, Settings
│   │   ├── components/     # Header, Sidebar, Layout
│   │   ├── store/          # Zustand state (persisted to localStorage)
│   │   ├── lib/            # API client, utilities
│   │   └── __tests__/      # Vitest test suites
│   └── vite.config.ts
├── tests/                  # Backend tests (pytest)
├── examples/               # Sample test suite YAML files
├── .github/workflows/      # CI/CD pipeline
├── startup.sh              # Azure startup script
└── requirements.txt
```

## CI/CD

Every push to `main` triggers the GitHub Actions pipeline:

1. **Test** — 137 backend + 41 frontend tests
2. **Build** — Compiles frontend with production API URL
3. **Deploy** — Packages backend + frontend, deploys to Azure
4. **Verify** — Hits `/health` to confirm deployment

## License

MIT — see [LICENSE](LICENSE)


