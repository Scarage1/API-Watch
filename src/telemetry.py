"""
OpenTelemetry-lite observability module.

Provides request tracing, structured logging, and metrics without requiring
a full OTel collector.  Works with any OTLP-compatible backend (Jaeger,
Azure Monitor, Datadog) or in local/stdout mode.

Usage in api_server.py:
    from .telemetry import setup_telemetry, telemetry_middleware
    setup_telemetry(app)
    app.middleware("http")(telemetry_middleware)
"""
import time
import uuid
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime, timezone

from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("apiwatch.telemetry")


# ── Trace / Span dataclass ────────────────────────────────────────────────────

@dataclass
class Span:
    """A lightweight trace span."""
    trace_id: str
    span_id: str
    name: str
    start_time: float
    end_time: Optional[float] = None
    status_code: Optional[int] = None
    attributes: Dict[str, Any] = field(default_factory=dict)

    @property
    def duration_ms(self) -> float:
        if self.end_time is None:
            return 0.0
        return (self.end_time - self.start_time) * 1000

    def to_dict(self) -> dict:
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "name": self.name,
            "duration_ms": round(self.duration_ms, 2),
            "status_code": self.status_code,
            "attributes": self.attributes,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }


# ── Metrics collector ─────────────────────────────────────────────────────────

class MetricsCollector:
    """In-process metrics — request count, latency histogram, error counts."""

    def __init__(self):
        self.request_count: int = 0
        self.error_count: int = 0
        self.status_counts: Dict[int, int] = defaultdict(int)
        self.method_counts: Dict[str, int] = defaultdict(int)
        self.path_latencies: Dict[str, List[float]] = defaultdict(list)
        self.total_latency: float = 0.0
        self._max_path_entries = 200  # cap per-path data
        self._start_time: float = time.time()

    def record_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        self.request_count += 1
        self.status_counts[status_code] += 1
        self.method_counts[method] += 1
        self.total_latency += duration_ms
        if status_code >= 500:
            self.error_count += 1

        # Keep last N latencies per path for P50/P95/P99
        key = f"{method} {path}"
        latencies = self.path_latencies[key]
        latencies.append(duration_ms)
        if len(latencies) > self._max_path_entries:
            self.path_latencies[key] = latencies[-self._max_path_entries:]

    def get_summary(self) -> dict:
        uptime = time.time() - self._start_time
        avg_latency = (self.total_latency / self.request_count) if self.request_count else 0

        # Top 10 slowest endpoints
        slowest = []
        for path, latencies in self.path_latencies.items():
            if latencies:
                avg = sum(latencies) / len(latencies)
                p95 = sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) >= 2 else avg
                slowest.append({
                    "endpoint": path,
                    "count": len(latencies),
                    "avg_ms": round(avg, 2),
                    "p95_ms": round(p95, 2),
                })
        slowest.sort(key=lambda x: x["p95_ms"], reverse=True)

        return {
            "uptime_seconds": round(uptime, 1),
            "total_requests": self.request_count,
            "total_errors": self.error_count,
            "error_rate": round(self.error_count / max(self.request_count, 1) * 100, 2),
            "avg_latency_ms": round(avg_latency, 2),
            "status_codes": dict(self.status_counts),
            "methods": dict(self.method_counts),
            "slowest_endpoints": slowest[:10],
        }

    def reset(self) -> None:
        self.__init__()


# ── Recent traces ring buffer ────────────────────────────────────────────────

class TraceStore:
    """In-memory ring buffer of recent traces for debugging."""

    def __init__(self, max_size: int = 500):
        self._spans: List[Span] = []
        self._max_size = max_size

    def add(self, span: Span) -> None:
        self._spans.append(span)
        if len(self._spans) > self._max_size:
            self._spans = self._spans[-self._max_size:]

    def list_recent(self, limit: int = 50) -> List[dict]:
        return [s.to_dict() for s in reversed(self._spans[-limit:])]

    def search(
        self,
        path: Optional[str] = None,
        min_duration_ms: Optional[float] = None,
        status_code: Optional[int] = None,
        limit: int = 50,
    ) -> List[dict]:
        results = []
        for span in reversed(self._spans):
            if path and path not in span.attributes.get("path", ""):
                continue
            if min_duration_ms and span.duration_ms < min_duration_ms:
                continue
            if status_code and span.status_code != status_code:
                continue
            results.append(span.to_dict())
            if len(results) >= limit:
                break
        return results

    @property
    def count(self) -> int:
        return len(self._spans)

    def clear(self) -> None:
        self._spans.clear()


# ── Module singletons ─────────────────────────────────────────────────────────

_metrics: Optional[MetricsCollector] = None
_traces: Optional[TraceStore] = None


def get_metrics() -> MetricsCollector:
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector()
    return _metrics


def get_traces() -> TraceStore:
    global _traces
    if _traces is None:
        _traces = TraceStore()
    return _traces


def reset_telemetry() -> None:
    global _metrics, _traces
    _metrics = MetricsCollector()
    _traces = TraceStore()


# ── ASGI Middleware ───────────────────────────────────────────────────────────

# Paths to exclude from tracing (health checks, static assets)
_EXCLUDE_PATHS = frozenset({"/health", "/favicon.ico", "/manifest.json"})


async def telemetry_middleware(request: Request, call_next) -> Response:
    """Record trace span + metrics for every request."""
    path = request.url.path

    # Skip noisy endpoints
    if path in _EXCLUDE_PATHS or path.startswith("/assets/"):
        return await call_next(request)

    trace_id = request.headers.get("x-trace-id", str(uuid.uuid4()))
    span_id = str(uuid.uuid4())[:16]
    start = time.time()

    span = Span(
        trace_id=trace_id,
        span_id=span_id,
        name=f"{request.method} {path}",
        start_time=start,
        attributes={
            "method": request.method,
            "path": path,
            "client": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", "")[:120],
        },
    )

    try:
        response = await call_next(request)
        span.status_code = response.status_code
        response.headers["X-Trace-Id"] = trace_id
        return response
    except Exception as exc:
        span.status_code = 500
        span.attributes["error"] = str(exc)[:200]
        raise
    finally:
        span.end_time = time.time()
        get_metrics().record_request(
            method=request.method,
            path=path,
            status_code=span.status_code or 500,
            duration_ms=span.duration_ms,
        )
        get_traces().add(span)

        # Structured log
        if span.status_code and span.status_code >= 500:
            logger.error(
                "HTTP %s %s → %s (%.1fms) trace=%s",
                request.method, path, span.status_code,
                span.duration_ms, trace_id,
            )
        elif span.duration_ms > 2000:
            logger.warning(
                "SLOW %s %s → %s (%.1fms) trace=%s",
                request.method, path, span.status_code,
                span.duration_ms, trace_id,
            )
