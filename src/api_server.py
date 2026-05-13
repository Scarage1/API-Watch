"""
API Server for API-Watch.
FastAPI server providing REST endpoints for the React frontend.
Includes: v1 API (auth, collections, environments, history),
legacy endpoints, webhook receiver, and SPA static file serving.
"""

import ipaddress
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import create_auth_from_config
from src.cache import close_cache, get_cache
from src.config import get_settings
from src.database import check_db_health, close_db, get_db, init_db
from src.diagnose import DiagnosisEngine
from src.jwt_auth import get_current_user

# Setup structured logging
from src.logging_config import configure_logging, get_logger
from src.models import RequestHistory
from src.rate_limit import RateLimitConfig, RateLimitMiddleware
from src.retry import RetryConfig
from src.routes import api_v1_router, mock_catch_router
from src.runner import APIRunner, RequestConfig, RequestResult
from src.scheduler import start_scheduler, stop_scheduler
from src.storage import close_storage, get_storage
from src.telemetry import telemetry_middleware

_env = os.getenv("ENVIRONMENT", "production")
configure_logging(environment=_env, log_level=os.getenv("LOG_LEVEL", "INFO"))
logger = get_logger(__name__)


# Global API runner singleton (initialized in lifespan)
_global_runner: "APIRunner | None" = None


# --- Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    settings = get_settings()
    logger.info("Starting %s v%s", settings.app_name, settings.app_version)

    # Initialize database
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database ready.")

    # Warm up cache & storage (lazy singletons)
    get_cache()
    get_storage()
    logger.info("Cache & storage initialized.")

    # Create global API runner with shared connection pool
    global _global_runner
    _global_runner = APIRunner(
        auth_handler=None,
        retry_config=RetryConfig(max_retries=3, initial_delay=1.0),
        logger=logger,
    )
    logger.info("Global API runner initialized (connection pool ready).")

    # Start the background monitor scheduler
    import asyncio

    scheduler_task = asyncio.create_task(start_scheduler())
    logger.info("Monitor scheduler started.")

    yield

    logger.info("Shutting down...")
    await stop_scheduler()
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    await close_cache()
    await close_storage()
    if _global_runner:
        await _global_runner.close_async()
        logger.info("Global API runner connection pool closed.")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title="API-Watch Server",
    description="Backend API for API-Watch — a better Postman",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS Configuration — driven by Settings
_settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate Limiting
rate_limit_config = RateLimitConfig(
    default_limit=_settings.rate_limit_default,
    auth_limit=_settings.rate_limit_auth,
    window_seconds=_settings.rate_limit_window,
    enabled=_settings.rate_limit_enabled and not _settings.testing,
    use_redis=bool(_settings.redis_url),
)
app.add_middleware(RateLimitMiddleware, config=rate_limit_config)

# --- Telemetry middleware ---
app.middleware("http")(telemetry_middleware)

# --- Prometheus metrics ---
from src.metrics import MetricsMiddleware
from src.metrics import router as metrics_router

app.add_middleware(MetricsMiddleware)
app.include_router(metrics_router)

# --- AI Engine ---
from src.ai.routes import router as ai_router

app.include_router(ai_router)

# --- Enterprise (SSO, Audit, Compliance, Collaboration) ---
from src.enterprise.routes import router as enterprise_router

app.include_router(enterprise_router)


# --- Global exception handler ---
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    import traceback

    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    error_detail = "".join(tb)
    logger.error(
        "Unhandled exception on %s %s:\n%s", request.method, request.url.path, error_detail
    )
    # Only expose details in debug mode — never in production
    if os.getenv("DEBUG", "").lower() in ("true", "1"):
        content = {"detail": str(exc), "traceback": error_detail}
    else:
        content = {"detail": "Internal server error"}
    return JSONResponse(status_code=500, content=content)


# --- Request body size limit ---
MAX_BODY_SIZE = _settings.max_request_body_size


@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    """Reject requests with bodies larger than MAX_BODY_SIZE."""
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        return JSONResponse(
            status_code=413,
            content={
                "detail": f"Request body too large. Maximum size is {MAX_BODY_SIZE // (1024 * 1024)} MB."
            },
        )
    return await call_next(request)


# --- SSRF Protection ---
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]


def _validate_url(url: str) -> None:
    """Validate URL: must be http/https, must not target private/internal IPs."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400, detail=f"Only http and https URLs are allowed (got '{parsed.scheme}')"
        )
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="URL must have a valid hostname")
    # Block obvious private hostnames
    hostname = parsed.hostname.lower()
    if hostname in ("localhost", "0.0.0.0", "[::]"):
        raise HTTPException(
            status_code=400, detail="Requests to localhost/loopback addresses are not allowed"
        )
    # Try to parse as IP and check against private ranges
    try:
        ip = ipaddress.ip_address(hostname)
        for network in _PRIVATE_NETWORKS:
            if ip in network:
                raise HTTPException(
                    status_code=400,
                    detail="Requests to private/internal IP addresses are not allowed",
                )
    except ValueError:
        pass  # Not an IP literal — that's fine (it's a hostname)


# Include v1 API routes
app.include_router(api_v1_router)

# Mock server catch-all (no auth, matches /mock-server/*)
app.include_router(mock_catch_router)


# --- Request Models (legacy endpoints) ---


class RequestConfigInput(BaseModel):
    method: str
    url: str
    headers: dict[str, str] | None = {}
    params: dict[str, str] | None = {}
    body: Any | None = None
    timeout: int = 10
    env_variables: dict[str, str] | None = None  # environment variables for {{VAR}} interpolation


class TestCaseInput(BaseModel):
    id: str
    method: str
    path: str
    description: str | None = None
    headers: dict[str, str] | None = {}
    params: dict[str, str] | None = {}
    body: Any | None = None
    timeout_seconds: int = 10


class TestSuiteInput(BaseModel):
    name: str
    description: str | None = None
    base_url: str
    defaults: dict[str, Any] | None = {}
    auth: dict[str, Any] | None = {}
    tests: list[TestCaseInput]


# --- Variable interpolation (extracted to src/interpolation.py) ---
from src.interpolation import interpolate_body, interpolate_dict, interpolate_string

# --- Core endpoints ---


@app.get("/health")
async def health_check():
    """Health check endpoint with DB + cache connectivity."""
    settings = get_settings()
    db_ok = await check_db_health()

    cache = get_cache()
    cache_ok = await cache.ping()

    healthy = db_ok  # DB is required; cache is optional
    return {
        "status": "healthy" if healthy else "degraded",
        "service": settings.app_name,
        "version": settings.app_version,
        "checks": {
            "database": "ok" if db_ok else "error",
            "cache": "ok" if cache_ok else "unavailable",
        },
    }


@app.post("/api/execute-request")
async def execute_single_request(
    request_input: RequestConfigInput,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Execute a single API request (async via httpx)."""
    import time as _time

    from src.metrics import metrics as _metrics

    _exec_start = _time.perf_counter()
    try:
        # Apply environment variable interpolation if provided
        url = request_input.url
        headers = request_input.headers or {}
        params = request_input.params or {}
        body = request_input.body

        if request_input.env_variables:
            env = request_input.env_variables
            url = interpolate_string(url, env)
            headers = interpolate_dict(headers, env)
            params = interpolate_dict(params, env)
            body = interpolate_body(body, env)

        # SSRF protection: validate target URL
        _validate_url(url)

        config = RequestConfig(
            method=request_input.method,
            url=url,
            headers=headers,
            params=params,
            body=body,
            timeout=request_input.timeout,
        )

        # Lazy-init runner if lifespan was bypassed (e.g., during tests)
        global _global_runner
        if _global_runner is None:
            _global_runner = APIRunner(
                auth_handler=None,
                retry_config=RetryConfig(max_retries=3, initial_delay=1.0),
                logger=logger,
            )

        result = await _global_runner.execute_async(config)

        # Record execution metrics
        _metrics.record_api_execution(
            duration=_time.perf_counter() - _exec_start,
            success=result.success,
        )

        # Save to history (user is always authenticated)
        history_entry = RequestHistory(
            owner_id=user.id,
            request_method=result.request_method,
            request_url=result.request_url,
            request_headers=result.request_headers,
            request_body=result.request_body,
            success=result.success,
            status_code=result.status_code,
            response_time=result.response_time,
            response_size=result.response_size,
            response_body=result.response_body,
            response_headers=result.response_headers,
            error=result.error,
            error_type=result.error_type,
            retry_count=result.retry_count,
        )
        db.add(history_entry)
        await db.commit()

        return result

    except HTTPException:
        raise
    except Exception as e:
        _metrics.record_api_execution(
            duration=_time.perf_counter() - _exec_start,
            success=False,
        )
        logger.exception("Error executing request")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/execute-suite")
async def execute_test_suite(
    suite_input: TestSuiteInput,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[RequestResult]:
    """Execute a test suite (async via httpx)."""
    try:
        # SSRF protection: validate base URL
        _validate_url(suite_input.base_url)

        auth_handler = create_auth_from_config(suite_input.auth or {})
        retry_config = RetryConfig(
            max_retries=suite_input.defaults.get("retries", 3) if suite_input.defaults else 3,
            initial_delay=1.0,
        )
        runner = APIRunner(auth_handler, retry_config, logger)

        results = []
        for test in suite_input.tests:
            url = suite_input.base_url + test.path
            headers = (
                suite_input.defaults.get("headers", {}) if suite_input.defaults else {}
            ).copy()
            headers.update(test.headers or {})

            config = RequestConfig(
                method=test.method,
                url=url,
                headers=headers,
                params=test.params or {},
                body=test.body,
                timeout=test.timeout_seconds,
            )

            result = await runner.execute_async(config)
            results.append(result)

            # Save each result to history
            history_entry = RequestHistory(
                owner_id=user.id,
                request_method=result.request_method,
                request_url=result.request_url,
                request_headers=result.request_headers,
                request_body=result.request_body,
                success=result.success,
                status_code=result.status_code,
                response_time=result.response_time,
                response_size=result.response_size,
                response_body=result.response_body,
                response_headers=result.response_headers,
                error=result.error,
                error_type=result.error_type,
                retry_count=result.retry_count,
            )
            db.add(history_entry)

        await db.commit()

        return results

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error executing test suite")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/diagnose")
async def diagnose_result(result: RequestResult):
    """Diagnose a test result."""
    try:
        diagnosis = DiagnosisEngine.diagnose(result)
        return {
            "issue": diagnosis.issue,
            "cause": diagnosis.cause,
            "suggestion": diagnosis.suggestion,
            "severity": diagnosis.severity,
            "category": diagnosis.category,
        }
    except Exception as e:
        logger.exception("Error diagnosing result")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stats")
async def get_stats(results: list[RequestResult]):
    """Calculate statistics from results."""
    try:
        summary = DiagnosisEngine.get_summary(results)
        if "diagnoses" in summary:
            summary["diagnoses"] = [
                {
                    "issue": d.issue,
                    "cause": d.cause,
                    "suggestion": d.suggestion,
                    "severity": d.severity,
                    "category": d.category,
                }
                for d in summary["diagnoses"]
            ]
        return summary
    except Exception as e:
        logger.exception("Error calculating stats")
        raise HTTPException(status_code=500, detail=str(e))


# --- Webhook ---
# NOTE: Webhook routes MUST be registered before the SPA catch-all
# so that GET /webhook/... isn't swallowed by /{full_path:path}.


@app.api_route("/webhook/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.api_route("/webhook", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def webhook_catch_all(request: Request):
    """Catch-all webhook receiver."""
    method = request.method
    headers = dict(request.headers)

    try:
        body = await request.json()
    except Exception:
        try:
            raw_body = await request.body()
            body = raw_body.decode("utf-8") if raw_body else None
        except Exception:
            body = None

    # Sanitize timestamp for safe filename
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    safe_timestamp = re.sub(r"[^a-zA-Z0-9_]", "", timestamp)
    log_path = f"webhooks/webhook_{safe_timestamp}.json"

    log_data = {
        "timestamp": datetime.now(UTC).isoformat(),
        "endpoint": str(request.url.path),
        "method": method,
        "headers": headers,
        "body": body,
    }

    storage = get_storage()
    await storage.write(log_path, json.dumps(log_data, indent=2, default=str))

    logger.info(f"Webhook received: {method} {request.url.path}")

    return JSONResponse(
        status_code=200,
        content={
            "status": "received",
            "message": "Webhook received and logged successfully",
            "log_path": log_path,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )


# --- Static files / SPA ---

frontend_dist = None
for path in [
    Path(__file__).parent.parent / "public",
    Path(__file__).parent.parent / "frontend" / "dist",
]:
    if path.exists():
        frontend_dist = path
        break

if frontend_dist:
    assets_path = frontend_dist / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

    def _spa_html_response():
        """Return index.html with no-cache so the browser always fetches the latest bundle references."""
        return FileResponse(
            frontend_dist / "index.html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve React SPA for all non-API routes."""
        # Return 404 for unmatched API / webhook routes instead of serving SPA
        if full_path.startswith("api/") or full_path.startswith("webhook"):
            raise HTTPException(status_code=404, detail="Not found")

        if "." in full_path.split("/")[-1]:
            file_path = (frontend_dist / full_path).resolve()
            # Prevent path traversal — file must be inside frontend_dist
            if file_path.is_relative_to(frontend_dist.resolve()) and file_path.exists():
                return FileResponse(file_path)
            raise HTTPException(status_code=404, detail="Not found")

        return _spa_html_response()
else:

    @app.get("/")
    async def root():
        """Root endpoint with service info."""
        return {
            "service": "API-Watch Server",
            "status": "running",
            "version": "2.0.0",
            "endpoints": {
                "legacy": [
                    "/api/execute-request",
                    "/api/execute-suite",
                    "/api/diagnose",
                    "/api/stats",
                ],
                "v1": [
                    "/api/v1/auth/*",
                    "/api/v1/collections/*",
                    "/api/v1/environments/*",
                    "/api/v1/history/*",
                ],
            },
        }


if __name__ == "__main__":
    import uvicorn

    s = get_settings()
    logger.info(f"Starting API server on {s.host}:{s.port}")
    uvicorn.run(app, host=s.host, port=s.port)
