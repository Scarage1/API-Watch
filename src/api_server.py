"""
API Server for API-Watch Frontend.
FastAPI server providing REST endpoints for the React frontend.
Also includes webhook receiver functionality.
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

# Add src to path for absolute imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.auth import AuthHandler, create_auth_from_config
from src.retry import RetryConfig
from src.runner import APIRunner, RequestConfig, RequestResult
from src.diagnose import DiagnosisEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure webhook logs directory exists
Path("logs/webhooks").mkdir(parents=True, exist_ok=True)

# Create FastAPI app
app = FastAPI(
    title="API-Watch Server",
    description="Backend API for API-Watch Frontend",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Models
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


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "api-watch-server"}


# Execute single request
@app.post("/api/execute-request")
async def execute_single_request(request_input: RequestConfigInput) -> RequestResult:
    """
    Execute a single API request.
    
    Args:
        request_input: Request configuration
        
    Returns:
        RequestResult with response details
    """
    try:
        # Create runner
        retry_config = RetryConfig(max_retries=3, initial_delay=1.0)
        runner = APIRunner(auth_handler=None, retry_config=retry_config, logger=logger)
        
        # Create request config
        config = RequestConfig(
            method=request_input.method,
            url=request_input.url,
            headers=request_input.headers or {},
            params=request_input.params or {},
            body=request_input.body,
            timeout=request_input.timeout
        )
        
        # Execute request
        result = runner.execute(config)
        runner.close()
        
        return result
        
    except Exception as e:
        logger.exception("Error executing request")
        raise HTTPException(status_code=500, detail=str(e))


# Execute test suite
@app.post("/api/execute-suite")
async def execute_test_suite(suite_input: TestSuiteInput) -> List[RequestResult]:
    """
    Execute a test suite.
    
    Args:
        suite_input: Test suite configuration
        
    Returns:
        List of RequestResult objects
    """
    try:
        # Setup authentication
        auth_handler = create_auth_from_config(suite_input.auth or {})
        
        # Setup retry config
        retry_config = RetryConfig(
            max_retries=suite_input.defaults.get('retries', 3),
            initial_delay=1.0
        )
        
        # Create runner
        runner = APIRunner(auth_handler, retry_config, logger)
        
        # Execute tests
        results = []
        for test in suite_input.tests:
            # Build full URL
            url = suite_input.base_url + test.path
            
            # Merge headers
            headers = suite_input.defaults.get('headers', {}).copy()
            headers.update(test.headers or {})
            
            # Create request config
            config = RequestConfig(
                method=test.method,
                url=url,
                headers=headers,
                params=test.params or {},
                body=test.body,
                timeout=test.timeout_seconds
            )
            
            # Execute
            result = runner.execute(config)
            results.append(result)
        
        runner.close()
        return results
        
    except Exception as e:
        logger.exception("Error executing test suite")
        raise HTTPException(status_code=500, detail=str(e))


# Diagnose result
@app.post("/api/diagnose")
async def diagnose_result(result: RequestResult):
    """
    Diagnose a test result.
    
    Args:
        result: RequestResult to diagnose
        
    Returns:
        Diagnosis details
    """
    try:
        diagnosis = DiagnosisEngine.diagnose(result)
        return {
            "issue": diagnosis.issue,
            "cause": diagnosis.cause,
            "suggestion": diagnosis.suggestion,
            "severity": diagnosis.severity,
            "category": diagnosis.category
        }
    except Exception as e:
        logger.exception("Error diagnosing result")
        raise HTTPException(status_code=500, detail=str(e))


# Get statistics
@app.post("/api/stats")
async def get_stats(results: List[RequestResult]):
    """
    Calculate statistics from results.
    
    Args:
        results: List of RequestResult objects
        
    Returns:
        Statistics summary
    """
    try:
        summary = DiagnosisEngine.get_summary(results)
        # Convert Diagnosis dataclass objects to dicts for JSON serialization
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


# Root endpoint - REMOVED, replaced with SPA serving below
# @app.get("/")
# async def root():
#     """Root endpoint with service info."""
#     return {
#         "service": "API-Watch Server",
#         "status": "running",
#         "version": "1.0.0",
#         "endpoints": ["/api/execute-request", "/api/execute-suite", "/api/diagnose", "/api/stats", "/health"],
#     }


# Mount static files from frontend/dist (if it exists)
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    # Serve static assets (JS, CSS, images, etc.)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")
    
    # SPA fallback - serve index.html for all non-API/webhook routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve React SPA for all non-API routes."""
        # Skip if it's an API or webhook route (already handled above)
        if full_path.startswith("api/") or full_path.startswith("webhook"):
            pass  # Let other routes handle it
        
        # If path looks like a file (has extension), try to serve it
        if "." in full_path.split("/")[-1]:
            file_path = frontend_dist / full_path
            if file_path.exists():
                return FileResponse(file_path)
        
        # Otherwise serve index.html (SPA fallback)
        return FileResponse(frontend_dist / "index.html")
else:
    # If no frontend dist, keep the API info endpoint
    @app.get("/")
    async def root():
        """Root endpoint with service info."""
        return {
            "service": "API-Watch Server",
            "status": "running",
            "version": "1.0.0",
            "endpoints": ["/api/execute-request", "/api/execute-suite", "/api/diagnose", "/api/stats", "/health"],
        }


# Webhook catch-all (must be LAST so /api/* routes take priority)
@app.api_route("/webhook/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.api_route("/webhook", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def webhook_catch_all(request: Request):
    """
    Catch-all webhook receiver. Send webhooks to /webhook or /webhook/<any-path>.
    """
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

    # Log webhook
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
    import os
    
    # Get port from environment variable (for Render, Railway, etc.) or default to 8000
    port = int(os.getenv("PORT", 8000))
    
    logger.info(f"Starting API server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
