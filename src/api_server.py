"""
API Server for API-Watch Frontend.
FastAPI server providing REST endpoints for the React frontend.
"""
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from auth import AuthHandler, create_auth_from_config
from retry import RetryConfig
from runner import APIRunner, RequestConfig, RequestResult
from diagnose import DiagnosisEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="API-Watch Server",
    description="Backend API for API-Watch Frontend",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite and React dev servers
    allow_credentials=True,
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
        return summary
    except Exception as e:
        logger.exception("Error calculating stats")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    import os
    
    # Get port from environment variable (for Render, Railway, etc.) or default to 8000
    port = int(os.getenv("PORT", 8000))
    
    logger.info(f"Starting API server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
