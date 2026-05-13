# ADR 004: Enterprise Feature Architecture

**Status:** Accepted  
**Date:** 2026-05-14  
**Decision makers:** Shivam Kumar (Founder/CTO)

## Context

API-Watch v3.0 adds enterprise features: SSO, compliance, audit, and collaboration. We need to decide how to architect these features within the existing codebase.

Options:
1. **Inline** — Add enterprise code directly to existing modules
2. **Feature flags** — Conditionally include enterprise code in the main modules
3. **Separate package** — Isolate enterprise code in `src/enterprise/`

## Decision

**We chose Option 3: Separate `src/enterprise/` package.**

Enterprise features are isolated in their own package with:
- `sso.py` — SSO/SAML/OIDC authentication
- `audit.py` — Advanced audit & compliance
- `collaboration.py` — Real-time collaboration
- `routes.py` — Enterprise API endpoints

### Key Design Principles

1. **Zero impact on core** — Enterprise features don't modify existing modules
2. **Clean boundary** — Single `include_router()` in `api_server.py`
3. **Graceful absence** — Removing `src/enterprise/` has no effect on core functionality
4. **Future licensing** — Clean separation enables potential dual-licensing (MIT core + enterprise)

## Consequences

### Positive
- Core remains lightweight and fast
- Enterprise features can be independently tested
- Clear upgrade path for users (community → enterprise)
- Easy to disable enterprise features for non-paying users

### Negative
- Some duplication of patterns between core and enterprise
- Enterprise routes don't share middleware with core routes (by design)
- SSO integration requires coordination with core auth module
