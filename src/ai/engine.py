"""
AI Engine — Central orchestrator for API-Watch AI features.

Manages provider lifecycle, routes requests to agents,
and provides a clean API for the rest of the application.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator, Dict, Optional, Any

from src.ai.providers import (
    AIConfig,
    AIProvider,
    AIResponse,
    BaseAIProvider,
    create_provider,
    get_default_config,
)
from src.ai.agents import (
    TestGeneratorAgent,
    DebugAssistantAgent,
    RequestBuilderAgent,
)

logger = logging.getLogger(__name__)


class AIEngine:
    """
    Central AI engine for API-Watch.

    Usage:
        engine = AIEngine()
        engine.configure(config)

        # Generate tests
        result = await engine.generate_tests(method="GET", url="...", ...)

        # Debug a request
        result = await engine.debug_request(method="POST", url="...", ...)

        # Build from natural language
        result = await engine.build_request("GET all users from the GitHub API")
    """

    def __init__(self):
        self._config: AIConfig = get_default_config()
        self._provider: Optional[BaseAIProvider] = None
        self._test_gen: Optional[TestGeneratorAgent] = None
        self._debug: Optional[DebugAssistantAgent] = None
        self._builder: Optional[RequestBuilderAgent] = None

    def configure(self, config: AIConfig) -> None:
        """Update the AI configuration and reinitialize the provider."""
        self._config = config
        self._provider = create_provider(config)
        self._test_gen = TestGeneratorAgent(self._provider)
        self._debug = DebugAssistantAgent(self._provider)
        self._builder = RequestBuilderAgent(self._provider)
        logger.info(
            "AI engine configured: provider=%s model=%s",
            config.provider.value, config.model,
        )

    def _ensure_initialized(self) -> None:
        """Lazy-initialize with default config if not configured."""
        if self._provider is None:
            self.configure(self._config)

    @property
    def provider(self) -> BaseAIProvider:
        self._ensure_initialized()
        return self._provider  # type: ignore

    @property
    def config(self) -> AIConfig:
        return self._config

    # ── Status ────────────────────────────────────────────────
    async def is_available(self) -> bool:
        """Check if the AI provider is reachable."""
        self._ensure_initialized()
        return await self._provider.is_available()  # type: ignore

    async def get_status(self) -> Dict[str, Any]:
        """Get the current AI engine status."""
        available = await self.is_available()
        status: Dict[str, Any] = {
            "enabled": True,
            "available": available,
            "provider": self._config.provider.value,
            "model": self._config.model,
            "base_url": self._config.base_url,
        }

        # List models for Ollama
        if self._config.provider == AIProvider.OLLAMA and available:
            from src.ai.providers import OllamaProvider
            if isinstance(self._provider, OllamaProvider):
                status["models"] = await self._provider.list_models()

        return status

    # ── Test Generation ───────────────────────────────────────
    async def generate_tests(
        self,
        method: str,
        url: str,
        status_code: int,
        response_body: Optional[str] = None,
        response_headers: Optional[Dict[str, str]] = None,
        response_time: float = 0.0,
    ) -> AIResponse:
        """Generate test assertions for an API response."""
        self._ensure_initialized()
        return await self._test_gen.generate(  # type: ignore
            method=method,
            url=url,
            status_code=status_code,
            response_body=response_body,
            response_headers=response_headers or {},
            response_time=response_time,
        )

    async def generate_tests_stream(
        self,
        method: str,
        url: str,
        status_code: int,
        response_body: Optional[str] = None,
        response_headers: Optional[Dict[str, str]] = None,
        response_time: float = 0.0,
    ) -> AsyncIterator[str]:
        """Stream test assertions for an API response."""
        self._ensure_initialized()
        async for token in self._test_gen.generate_stream(  # type: ignore
            method=method,
            url=url,
            status_code=status_code,
            response_body=response_body,
            response_headers=response_headers or {},
            response_time=response_time,
        ):
            yield token

    # ── Debug Assistant ───────────────────────────────────────
    async def debug_request(
        self,
        method: str,
        url: str,
        status_code: Optional[int] = None,
        request_headers: Optional[Dict[str, str]] = None,
        request_body: Optional[str] = None,
        response_body: Optional[str] = None,
        response_headers: Optional[Dict[str, str]] = None,
        error: Optional[str] = None,
        error_type: Optional[str] = None,
    ) -> AIResponse:
        """Analyze a failed request and suggest fixes."""
        self._ensure_initialized()
        return await self._debug.debug(  # type: ignore
            method=method,
            url=url,
            status_code=status_code,
            request_headers=request_headers or {},
            request_body=request_body,
            response_body=response_body,
            response_headers=response_headers or {},
            error=error,
            error_type=error_type,
        )

    async def debug_request_stream(
        self,
        method: str,
        url: str,
        status_code: Optional[int] = None,
        request_headers: Optional[Dict[str, str]] = None,
        request_body: Optional[str] = None,
        response_body: Optional[str] = None,
        response_headers: Optional[Dict[str, str]] = None,
        error: Optional[str] = None,
        error_type: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Stream debug analysis."""
        self._ensure_initialized()
        async for token in self._debug.debug_stream(  # type: ignore
            method=method,
            url=url,
            status_code=status_code,
            request_headers=request_headers or {},
            request_body=request_body,
            response_body=response_body,
            response_headers=response_headers or {},
            error=error,
            error_type=error_type,
        ):
            yield token

    # ── Request Builder ───────────────────────────────────────
    async def build_request(self, description: str) -> AIResponse:
        """Build an HTTP request from natural language."""
        self._ensure_initialized()
        return await self._builder.build(description)  # type: ignore

    async def build_request_stream(self, description: str) -> AsyncIterator[str]:
        """Stream the request building process."""
        self._ensure_initialized()
        async for token in self._builder.build_stream(description):  # type: ignore
            yield token

    def parse_built_request(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse a request builder AI response into a config dict."""
        self._ensure_initialized()
        return self._builder.parse_response(content)  # type: ignore


# ── Global singleton ──────────────────────────────────────────
_engine: Optional[AIEngine] = None


def get_ai_engine() -> AIEngine:
    """Get or create the global AI engine singleton."""
    global _engine
    if _engine is None:
        _engine = AIEngine()
    return _engine
