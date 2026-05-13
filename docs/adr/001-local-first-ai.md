# ADR 001: Local-First AI with Ollama

**Status:** Accepted  
**Date:** 2026-05-14  
**Decision makers:** Shivam Kumar (Founder/CTO)

## Context

API-Watch v2.2 introduces AI-powered features: automated test generation, request debugging, and natural language request building. We need to choose between:

1. **Cloud-only** (OpenAI/Anthropic) — Lower engineering effort, higher quality models
2. **Local-only** (Ollama) — Full privacy, no vendor lock-in, no API costs
3. **Hybrid** (Local default, cloud opt-in) — Maximum flexibility

### Constraints

- API-Watch is self-hosted — users expect data sovereignty
- API requests may contain sensitive data (auth tokens, PII)
- Not all users have internet access in their deployment environments
- Cloud API costs could deter adoption

## Decision

**We chose Option 3: Hybrid with local-first default.**

- **Ollama** is the default AI provider — runs entirely on the user's machine
- **OpenAI** and **Anthropic** are available as opt-in cloud providers
- Cloud providers require explicit `AI_API_KEY` configuration
- All AI features work identically regardless of provider

## Consequences

### Positive
- Zero data leaves the user's network by default
- No API costs for default usage
- Works in air-gapped environments
- Users can choose quality vs. privacy trade-off

### Negative
- Local models are less capable than GPT-4o/Claude 3.5
- Requires ~4GB RAM for local inference
- More complex provider abstraction layer to maintain

### Risks
- Ollama API may change (mitigated: we pin to a stable API version)
- Local model quality may not satisfy power users (mitigated: cloud opt-in)
