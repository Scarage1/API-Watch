# Contributing

## Getting Started

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Make changes
4. Run tests: `pytest` and `cd frontend && npm test`
5. Commit: `git commit -m "feat: description"`
6. Push and open a PR

## Code Style

- **Python:** PEP 8, type hints, docstrings
- **TypeScript:** ESLint config in `frontend/eslint.config.js`
- **Commits:** Use conventional commits (`feat:`, `fix:`, `docs:`, `test:`)

## Testing

All PRs must pass the existing test suite:

- Backend: `pytest`
- Frontend: 356 tests via `vitest`

Add tests for new features.

## Project Layout

- Backend logic goes in `src/`
- Frontend pages go in `frontend/src/pages/`
- Backend tests go in `tests/`
- Frontend tests go in `frontend/src/__tests__/`
