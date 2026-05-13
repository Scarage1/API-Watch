# ADR 002: Hook-Based Plugin System

**Status:** Accepted  
**Date:** 2026-05-14  
**Decision makers:** Shivam Kumar (Founder/CTO)

## Context

To grow the API-Watch ecosystem, we need extensibility. Users and community members should be able to extend functionality without modifying core code. Options considered:

1. **Middleware pattern** (Express-style) — Linear pipeline, limited flexibility
2. **Event/hook system** — Decoupled, flexible, familiar to plugin authors
3. **Module system** (like VS Code extensions) — Most powerful but highest complexity

## Decision

**We chose Option 2: Hook-based plugin system.**

Plugins are Python modules that implement a `Plugin` base class with well-defined hook methods:

- `pre_request(config)` — Modify request before execution
- `post_response(result)` — Process response after execution
- `on_error(error, context)` — Handle failures
- `on_startup()` / `on_shutdown()` — App lifecycle

### Plugin Loading Order
1. Built-in plugins (`src/plugins/builtin/`)
2. User plugins (`~/.apiwatch/plugins/`)
3. Project plugins (`.apiwatch/plugins/`)

## Consequences

### Positive
- Simple mental model for plugin authors
- Async-first with sync fallback
- Priority ordering for hook execution
- No core code modification needed
- Plugin discovery from multiple directories

### Negative
- Limited to predefined hook points (can't add arbitrary UI)
- No sandboxing — plugins run in the same process
- Plugin conflicts possible if multiple modify the same data
