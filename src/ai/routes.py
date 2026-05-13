"""
AI API Routes for API-Watch.

Endpoints:
  GET  /api/v1/ai/status          — AI engine status & available models
  POST /api/v1/ai/config          — Update AI configuration
  POST /api/v1/ai/generate-tests  — Generate test assertions (streaming)
  POST /api/v1/ai/debug           — Debug failed request (streaming)
  POST /api/v1/ai/build-request   — NL → HTTP request (streaming)
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.ai.engine import get_ai_engine
from src.ai.providers import AIConfig, AIProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


# ── Request Models ────────────────────────────────────────────
class AIConfigUpdate(BaseModel):
    provider: str = "ollama"
    model: str = "llama3.2"
    base_url: str = "http://localhost:11434"
    api_key: str = ""
    temperature: float = 0.3
    max_tokens: int = 2048


class TestGenRequest(BaseModel):
    method: str
    url: str
    status_code: int
    response_body: Optional[str] = None
    response_headers: Dict[str, str] = Field(default_factory=dict)
    response_time: float = 0.0
    stream: bool = True


class DebugRequest(BaseModel):
    method: str
    url: str
    status_code: Optional[int] = None
    request_headers: Dict[str, str] = Field(default_factory=dict)
    request_body: Optional[str] = None
    response_body: Optional[str] = None
    response_headers: Dict[str, str] = Field(default_factory=dict)
    error: Optional[str] = None
    error_type: Optional[str] = None
    stream: bool = True


class BuildRequestInput(BaseModel):
    description: str
    stream: bool = True


# ── SSE Helper ────────────────────────────────────────────────
async def sse_stream(token_iter):
    """Convert an async token iterator into an SSE stream."""
    try:
        async for token in token_iter:
            # SSE format: data: <json>\n\n
            data = json.dumps({"token": token, "done": False})
            yield f"data: {data}\n\n"
        # Send completion signal
        yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
    except Exception as e:
        error_data = json.dumps({"error": str(e), "done": True})
        yield f"data: {error_data}\n\n"


# ── Routes ────────────────────────────────────────────────────
@router.get("/status")
async def ai_status():
    """Get AI engine status and available models."""
    engine = get_ai_engine()
    try:
        status = await engine.get_status()
        return status
    except Exception as e:
        return {
            "enabled": True,
            "available": False,
            "provider": engine.config.provider.value,
            "model": engine.config.model,
            "error": str(e),
        }


@router.post("/config")
async def update_ai_config(config_update: AIConfigUpdate):
    """Update AI provider configuration."""
    try:
        provider = AIProvider(config_update.provider.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {config_update.provider}. "
                   f"Supported: {', '.join(p.value for p in AIProvider)}",
        )

    config = AIConfig(
        provider=provider,
        model=config_update.model,
        base_url=config_update.base_url,
        api_key=config_update.api_key,
        temperature=config_update.temperature,
        max_tokens=config_update.max_tokens,
    )

    engine = get_ai_engine()
    engine.configure(config)

    # Verify connectivity
    available = await engine.is_available()

    return {
        "status": "configured",
        "available": available,
        "provider": provider.value,
        "model": config.model,
    }


@router.post("/generate-tests")
async def generate_tests(req: TestGenRequest):
    """Generate test assertions for an API response."""
    engine = get_ai_engine()

    if req.stream:
        token_iter = engine.generate_tests_stream(
            method=req.method,
            url=req.url,
            status_code=req.status_code,
            response_body=req.response_body,
            response_headers=req.response_headers,
            response_time=req.response_time,
        )
        return StreamingResponse(
            sse_stream(token_iter),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming response
    try:
        result = await engine.generate_tests(
            method=req.method,
            url=req.url,
            status_code=req.status_code,
            response_body=req.response_body,
            response_headers=req.response_headers,
            response_time=req.response_time,
        )
        return {
            "content": result.content,
            "model": result.model,
            "provider": result.provider,
            "tokens_used": result.tokens_used,
            "duration_ms": result.duration_ms,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}")


@router.post("/debug")
async def debug_request(req: DebugRequest):
    """Analyze a failed request and suggest fixes."""
    engine = get_ai_engine()

    if req.stream:
        token_iter = engine.debug_request_stream(
            method=req.method,
            url=req.url,
            status_code=req.status_code,
            request_headers=req.request_headers,
            request_body=req.request_body,
            response_body=req.response_body,
            response_headers=req.response_headers,
            error=req.error,
            error_type=req.error_type,
        )
        return StreamingResponse(
            sse_stream(token_iter),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result = await engine.debug_request(
            method=req.method,
            url=req.url,
            status_code=req.status_code,
            request_headers=req.request_headers,
            request_body=req.request_body,
            response_body=req.response_body,
            response_headers=req.response_headers,
            error=req.error,
            error_type=req.error_type,
        )
        return {
            "content": result.content,
            "model": result.model,
            "provider": result.provider,
            "tokens_used": result.tokens_used,
            "duration_ms": result.duration_ms,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}")


@router.post("/build-request")
async def build_request(req: BuildRequestInput):
    """Convert natural language into an HTTP request configuration."""
    engine = get_ai_engine()

    if req.stream:
        token_iter = engine.build_request_stream(req.description)
        return StreamingResponse(
            sse_stream(token_iter),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result = await engine.build_request(req.description)
        # Try to parse the JSON config
        parsed = engine.parse_built_request(result.content)

        return {
            "content": result.content,
            "parsed_request": parsed,
            "model": result.model,
            "provider": result.provider,
            "tokens_used": result.tokens_used,
            "duration_ms": result.duration_ms,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}")
