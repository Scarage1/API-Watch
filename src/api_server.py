"""
API Server for API-Watch.
FastAPI server providing REST endpoints for the React frontend.
Includes: v1 API (auth, collections, environments, history),
legacy endpoints, webhook receiver, and SPA static file serving.
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import logging

# Add src to path for absolute imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.auth import AuthHandler, create_auth_from_config
from src.retry import RetryConfig
from src.runner import APIRunner, RequestConfig, RequestResult
from src.diagnose import DiagnosisEngine
from src.database import init_db, close_db, get_db
from src.models import RequestHistory
from src.jwt_auth import get_optional_user
from src.routes import api_v1_router

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure webhook logs directory exists
Path("logs/webhooks").mkdir(parents=True, exist_ok=True)


# --- Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database ready.")
    yield
    logger.info("Shutting down...")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title="API-Watch Server",
    description="Backend API for API-Watch — a better Postman",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include v1 API routes
app.include_router(api_v1_router)


# --- Request Models (legacy endpoints) ---

class RequestConfigInput(BaseModel):
    method: str
    url: str
    headers: Optional[Dict[str, str]] = {}
    params: Optional[Dict[str, str]] = {}
    body: Optional[Any] = None
    timeout: int = 10


class TestCaseInput(BaseModel):
    id: str
    method: str
    path: str
    description: Optional[str] = None
    headers: Optional[Dict[str, str]] = {}
    params: Optional[Dict[str, str]] = {}
    body: Optional[Any] = None
    timeout_seconds: int = 10


class TestSuiteInput(BaseModel):
    name: str
    description: Optional[str] = None
    base_url: str
    defaults: Optional[Dict[str, Any]] = {}
    auth: Optional[Dict[str, Any]] = {}
    tests: List[TestCaseInput]


# --- Core endpoints ---

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "api-watch-server", "version": "2.0.0"}


@app.post("/api/execute-request")
async def execute_single_request(
    request_input: RequestConfigInput,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    """Execute a single API request (async via httpx)."""
    try:
        retry_config = RetryConfig(max_retries=3, initial_delay=1.0)
        runner = APIRunner(auth_handler=None, retry_config=retry_config, logger=logger)

        config = RequestConfig(
            method=request_input.method,
            url=request_input.url,
            headers=request_input.headers or {},
            params=request_input.params or {},
            body=request_input.body,
            timeout=request_input.timeout,
        )

        result = await runner.execute_async(config)

        # Save to history if user is authenticated
        if user:
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

    except Exception as e:
        logger.exception("Error executing request")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/execute-suite")
async def execute_test_suite(
    suite_input: TestSuiteInput,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
) -> List[RequestResult]:
    """Execute a test suite (async via httpx)."""
    try:
        auth_handler = create_auth_from_config(suite_input.auth or {})
        retry_config = RetryConfig(
            max_retries=suite_input.defaults.get('retries', 3) if suite_input.defaults else 3,
            initial_delay=1.0,
        )
        runner = APIRunner(auth_handler, retry_config, logger)

        results = []
        for test in suite_input.tests:
            url = suite_input.base_url + test.path
            headers = (suite_input.defaults.get('headers', {}) if suite_input.defaults else {}).copy()
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

            # Save each result to history if user is authenticated
            if user:
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

        if user:
            await db.commit()

        return results

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
async def get_stats(results: List[RequestResult]):
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

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve React SPA for all non-API routes."""
        if full_path.startswith("api/") or full_path.startswith("webhook"):
            pass

        if "." in full_path.split("/")[-1]:
            file_path = frontend_dist / full_path
            if file_path.exists():
                return FileResponse(file_path)

        return FileResponse(frontend_dist / "index.html")
else:
    @app.get("/")
    async def root():
        """Root endpoint with service info."""
        return {
            "service": "API-Watch Server",
            "status": "running",
            "version": "2.0.0",
            "endpoints": {
                "legacy": ["/api/execute-request", "/api/execute-suite", "/api/diagnose", "/api/stats"],
                "v1": ["/api/v1/auth/*", "/api/v1/collections/*", "/api/v1/environments/*", "/api/v1/history/*"],
            },
        }


# --- Webhook ---

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

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = Path("logs/webhooks") / f"webhook_{timestamp}.json"
    log_data = {
        "timestamp": datetime.now().isoformat(),
        "endpoint": str(request.url.path),
        "method": method,
        "headers": headers,
        "body": body,
    }
    with open(log_file, "w") as f:
        json.dump(log_data, f, indent=2, default=str)

    logger.info(f"Webhook received: {method} {request.url.path}")

    return JSONResponse(
        status_code=200,
        content={
            "status": "received",
            "message": "Webhook received and logged successfully",
            "log_file": str(log_file),
            "timestamp": datetime.now().isoformat(),
        },
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting API server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
