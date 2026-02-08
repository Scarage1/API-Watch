# Contributing to API-Watch

Thank you for your interest in contributing! This guide will help you get set up and make your first contribution.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Code Style](#code-style)
- [Commit Conventions](#commit-conventions)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Where to Add Things](#where-to-add-things)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/API-Watch.git
   cd API-Watch
   ```
3. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## Development Setup

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.9+ |
| Node.js | 18+ |
| npm | 9+ |
| Git | 2.30+ |

### Backend

```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env

# Start the backend (development mode)
ENVIRONMENT=development python -m uvicorn src.api_server:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs at `http://localhost:5173` and proxies API calls to `http://127.0.0.1:8000`.

### Docker (alternative)

```bash
docker compose up
```

---

## Project Architecture

```
src/                  # Backend — FastAPI
├── api_server.py     # App entry, middleware, SPA serving
├── models.py         # SQLAlchemy models
├── database.py       # Async DB engine
├── config.py         # Centralized settings
├── runner.py         # HTTP request executor
├── auth.py           # Auth handlers
├── jwt_auth.py       # JWT authentication
├── rbac.py           # Role-based access control
├── cache.py          # Redis / in-memory cache
└── routes/           # Route modules (20 files)

frontend/src/         # Frontend — React + TypeScript
├── pages/            # 16 page components
├── components/       # 25 reusable UI components
├── store/            # 8 Zustand state stores
├── lib/              # 10 utility/library modules
└── __tests__/        # Frontend test suites
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed diagrams and data flow.

---

## Code Style

### Python (Backend)

- Follow **PEP 8**.
- Use **type hints** for function signatures.
- Use `async def` for all route handlers and database operations.
- Keep functions focused — one function, one responsibility.
- Docstrings for all public functions.

### TypeScript (Frontend)

- Follow the project ESLint config (run `npm run lint`).
- Use **functional components** with hooks.
- Use **Zustand** for state management (not prop drilling or Context).
- Use **Tailwind CSS** utility classes — avoid custom CSS files.
- Prefer named exports.

### General

- No hardcoded secrets, URLs, or credentials.
- No `console.log` in production code (use proper logging).
- Keep imports organized: stdlib → third-party → local.

---

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | When to use |
|------|------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build process, CI, dependencies |
| `perf` | Performance improvement |

### Examples

```bash
git commit -m "feat(monitors): add Slack notification channel"
git commit -m "fix(runner): handle timeout for IPv6 addresses"
git commit -m "docs: update API reference in README"
git commit -m "test(collections): add import/export round-trip tests"
```

---

## Testing

All PRs must pass the full test suite.

### Backend Tests (Pytest)

```bash
# Run all backend tests
ENVIRONMENT=development pytest tests/ -q

# Run a specific test file
ENVIRONMENT=development pytest tests/test_runner.py -v

# Run with coverage
ENVIRONMENT=development pytest tests/ --cov=src --cov-report=term-missing
```

### Frontend Tests (Vitest)

```bash
cd frontend

# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a specific test file
npx vitest run src/__tests__/scriptEngine.test.ts
```

### Before Submitting

- [ ] All backend tests pass (`pytest tests/`)
- [ ] All frontend tests pass (`npm test`)
- [ ] No lint errors (`cd frontend && npm run lint`)
- [ ] New features have corresponding tests

---

## Pull Request Process

1. **Update your branch** with the latest `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Push** your branch:
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Open a PR** against `main` on GitHub.

4. **Fill out the PR template** — describe what changed and why.

5. **Wait for CI** — the GitHub Actions pipeline will run tests and build.

6. **Address feedback** — maintainers may request changes.

7. **Merge** — once approved and CI passes, a maintainer will merge.

### PR Guidelines

- Keep PRs focused on a single concern.
- Include tests for new functionality.
- Update documentation if you change user-facing behavior.
- Link related issues (`Closes #123`).

---

## Where to Add Things

| I want to... | Where to look |
|--------------|---------------|
| Add a new page | `frontend/src/pages/` — create component, add route in `App.tsx` |
| Add a UI component | `frontend/src/components/` |
| Add client-side state | `frontend/src/store/` — create or extend a Zustand store |
| Add a utility function | `frontend/src/lib/` |
| Add a backend route | `src/routes/` — create a route module, register in `api_server.py` |
| Add a database model | `src/models.py` — add SQLAlchemy model, create Alembic migration |
| Add a backend test | `tests/` — follow existing naming: `test_<module>.py` |
| Add a frontend test | `frontend/src/__tests__/` — follow existing naming: `<module>.test.ts` |

---

## Reporting Issues

Use the [GitHub issue tracker](https://github.com/Scarage1/API-Watch/issues). We have templates for:

- **Bug reports** — include steps to reproduce, expected vs actual behavior, environment info.
- **Feature requests** — describe the use case and proposed solution.

---

Thank you for contributing! 🚀
