# ADR 003: SSE for AI Response Streaming

**Status:** Accepted  
**Date:** 2026-05-14  
**Decision makers:** Shivam Kumar (Founder/CTO)

## Context

AI responses can take 5-30 seconds to generate. Waiting for the full response creates a poor UX. We need real-time streaming. Options:

1. **WebSocket** — Full-duplex, already used for WebSocket client feature
2. **Server-Sent Events (SSE)** — Unidirectional, built on HTTP, simpler
3. **Polling** — Simple but high latency and server load
4. **gRPC streaming** — High performance but requires protocol buffer setup

## Decision

**We chose SSE (Server-Sent Events).**

- AI responses are unidirectional (server → client) — SSE's sweet spot
- Works over standard HTTP — no protocol upgrade needed
- Built-in browser support via `EventSource` API
- FastAPI's `StreamingResponse` maps naturally to SSE
- Graceful degradation — can fall back to non-streaming mode

### Implementation

```python
# Backend: async generator → SSE stream
async def sse_stream(generator):
    async for token in generator:
        yield f"data: {json.dumps({'token': token})}\n\n"
    yield "data: [DONE]\n\n"
```

```typescript
// Frontend: EventSource reader
const reader = response.body.getReader();
// Process chunks as they arrive
```

## Consequences

### Positive
- Sub-100ms time to first token perceived by user
- No WebSocket connection management overhead
- Works through proxies and CDNs (standard HTTP)
- Clean abort via `AbortController`
- Natural fit for LLM token streaming

### Negative
- No client → server messaging (not needed for AI responses)
- Limited to text data (sufficient for our use case)
- Max 6 concurrent SSE connections per browser (HTTP/1.1 limit)
