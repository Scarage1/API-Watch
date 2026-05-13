"""
Prometheus-compatible metrics endpoint for API-Watch.

Exposes key performance indicators:
  - HTTP request counts by method, status, and path
  - Request latency histogram (P50/P95/P99)
  - Active connections gauge
  - API execution counters
  - Database pool stats

Designed for scraping by Prometheus/Grafana/Datadog.
"""
import time
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import APIRouter, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

router = APIRouter(tags=["metrics"])


# ── Histogram implementation ──────────────────────────────────
@dataclass
class Histogram:
    """Simple histogram for latency tracking."""

    buckets: List[float] = field(
        default_factory=lambda: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
    )
    _counts: Dict[float, int] = field(default_factory=lambda: defaultdict(int))
    _sum: float = 0.0
    _count: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def observe(self, value: float) -> None:
        with self._lock:
            self._sum += value
            self._count += 1
            for bucket in self.buckets:
                if value <= bucket:
                    self._counts[bucket] += 1

    def percentile(self, p: float) -> float:
        """Approximate percentile from histogram buckets."""
        if self._count == 0:
            return 0.0
        target = self._count * p
        cumulative = 0
        for bucket in self.buckets:
            cumulative += self._counts.get(bucket, 0)
            if cumulative >= target:
                return bucket
        return self.buckets[-1]

    @property
    def avg(self) -> float:
        return self._sum / self._count if self._count > 0 else 0.0


# ── Global metrics registry ──────────────────────────────────
class MetricsRegistry:
    """Thread-safe global metrics container."""

    def __init__(self):
        self._lock = threading.Lock()
        # HTTP metrics
        self.http_requests_total: Dict[str, int] = defaultdict(int)
        self.http_request_duration = Histogram()
        self.http_errors_total: Dict[int, int] = defaultdict(int)
        # API execution metrics
        self.api_executions_total = 0
        self.api_execution_duration = Histogram()
        self.api_execution_errors = 0
        # System
        self.active_connections = 0
        self.start_time = time.time()

    def record_http_request(self, method: str, path: str, status: int, duration: float) -> None:
        with self._lock:
            key = f"{method}:{self._normalize_path(path)}:{status}"
            self.http_requests_total[key] += 1
            self.http_request_duration.observe(duration)
            if status >= 400:
                self.http_errors_total[status] += 1

    def record_api_execution(self, duration: float, success: bool) -> None:
        with self._lock:
            self.api_executions_total += 1
            self.api_execution_duration.observe(duration)
            if not success:
                self.api_execution_errors += 1

    def connection_opened(self) -> None:
        with self._lock:
            self.active_connections += 1

    def connection_closed(self) -> None:
        with self._lock:
            self.active_connections = max(0, self.active_connections - 1)

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalize path to avoid high-cardinality labels."""
        parts = path.strip("/").split("/")
        normalized = []
        for part in parts[:4]:  # Max 4 segments
            # Replace UUIDs and numeric IDs with placeholders
            if len(part) >= 32 or part.isdigit():
                normalized.append(":id")
            else:
                normalized.append(part)
        return "/" + "/".join(normalized) if normalized else "/"

    def to_prometheus(self) -> str:
        """Render metrics in Prometheus exposition format."""
        lines: List[str] = []

        # Uptime
        uptime = time.time() - self.start_time
        lines.append(f"# HELP apiwatch_uptime_seconds Time since server start")
        lines.append(f"# TYPE apiwatch_uptime_seconds gauge")
        lines.append(f"apiwatch_uptime_seconds {uptime:.2f}")
        lines.append("")

        # Active connections
        lines.append(f"# HELP apiwatch_active_connections Current active HTTP connections")
        lines.append(f"# TYPE apiwatch_active_connections gauge")
        lines.append(f"apiwatch_active_connections {self.active_connections}")
        lines.append("")

        # HTTP request totals
        lines.append(f"# HELP apiwatch_http_requests_total Total HTTP requests")
        lines.append(f"# TYPE apiwatch_http_requests_total counter")
        for key, count in sorted(self.http_requests_total.items()):
            method, path, status = key.split(":", 2)
            lines.append(
                f'apiwatch_http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}'
            )
        lines.append("")

        # HTTP latency histogram
        hist = self.http_request_duration
        lines.append(f"# HELP apiwatch_http_request_duration_seconds HTTP request latency")
        lines.append(f"# TYPE apiwatch_http_request_duration_seconds histogram")
        cumulative = 0
        for bucket in hist.buckets:
            cumulative += hist._counts.get(bucket, 0)
            lines.append(f'apiwatch_http_request_duration_seconds_bucket{{le="{bucket}"}} {cumulative}')
        lines.append(f'apiwatch_http_request_duration_seconds_bucket{{le="+Inf"}} {hist._count}')
        lines.append(f"apiwatch_http_request_duration_seconds_sum {hist._sum:.6f}")
        lines.append(f"apiwatch_http_request_duration_seconds_count {hist._count}")
        lines.append("")

        # Latency percentiles (convenience gauges)
        lines.append(f"# HELP apiwatch_http_latency_p50_seconds P50 HTTP latency")
        lines.append(f"# TYPE apiwatch_http_latency_p50_seconds gauge")
        lines.append(f"apiwatch_http_latency_p50_seconds {hist.percentile(0.50):.6f}")
        lines.append(f"# HELP apiwatch_http_latency_p95_seconds P95 HTTP latency")
        lines.append(f"# TYPE apiwatch_http_latency_p95_seconds gauge")
        lines.append(f"apiwatch_http_latency_p95_seconds {hist.percentile(0.95):.6f}")
        lines.append(f"# HELP apiwatch_http_latency_p99_seconds P99 HTTP latency")
        lines.append(f"# TYPE apiwatch_http_latency_p99_seconds gauge")
        lines.append(f"apiwatch_http_latency_p99_seconds {hist.percentile(0.99):.6f}")
        lines.append("")

        # API execution metrics
        lines.append(f"# HELP apiwatch_api_executions_total Total API test executions")
        lines.append(f"# TYPE apiwatch_api_executions_total counter")
        lines.append(f"apiwatch_api_executions_total {self.api_executions_total}")
        lines.append(f"# HELP apiwatch_api_execution_errors_total Failed API executions")
        lines.append(f"# TYPE apiwatch_api_execution_errors_total counter")
        lines.append(f"apiwatch_api_execution_errors_total {self.api_execution_errors}")
        lines.append("")

        # API execution latency
        api_hist = self.api_execution_duration
        if api_hist._count > 0:
            lines.append(f"# HELP apiwatch_api_execution_duration_seconds API execution latency")
            lines.append(f"# TYPE apiwatch_api_execution_duration_seconds summary")
            lines.append(f'apiwatch_api_execution_duration_seconds{{quantile="0.5"}} {api_hist.percentile(0.50):.6f}')
            lines.append(f'apiwatch_api_execution_duration_seconds{{quantile="0.95"}} {api_hist.percentile(0.95):.6f}')
            lines.append(f'apiwatch_api_execution_duration_seconds{{quantile="0.99"}} {api_hist.percentile(0.99):.6f}')
            lines.append(f"apiwatch_api_execution_duration_seconds_sum {api_hist._sum:.6f}")
            lines.append(f"apiwatch_api_execution_duration_seconds_count {api_hist._count}")
            lines.append("")

        return "\n".join(lines) + "\n"


# Global singleton
metrics = MetricsRegistry()


# ── Middleware ────────────────────────────────────────────────
class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware that records HTTP request metrics."""

    async def dispatch(self, request: Request, call_next):
        # Skip metrics endpoint itself to avoid recursion
        if request.url.path == "/metrics":
            return await call_next(request)

        metrics.connection_opened()
        start = time.perf_counter()

        try:
            response = await call_next(request)
            duration = time.perf_counter() - start
            metrics.record_http_request(
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration=duration,
            )
            return response
        except Exception:
            duration = time.perf_counter() - start
            metrics.record_http_request(
                method=request.method,
                path=request.url.path,
                status=500,
                duration=duration,
            )
            raise
        finally:
            metrics.connection_closed()


# ── Endpoint ──────────────────────────────────────────────────
@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus-compatible metrics endpoint."""
    return Response(
        content=metrics.to_prometheus(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
