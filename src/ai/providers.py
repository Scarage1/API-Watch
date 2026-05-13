"""
AI Provider Abstraction Layer for API-Watch.

Supports:
  - Ollama (local, privacy-first, DEFAULT)
  - OpenAI (cloud, opt-in)
  - Anthropic (cloud, opt-in)

Design principles:
  1. Privacy-first: Local model is the default. Cloud is opt-in.
  2. Provider-agnostic: All agents work with any provider.
  3. Streaming-native: All completions support SSE streaming.
  4. Graceful degradation: AI features are optional — app works without any AI.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import StrEnum

import httpx

logger = logging.getLogger(__name__)


# ── Data Models ───────────────────────────────────────────────
class AIProvider(StrEnum):
    OLLAMA = "ollama"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class AIConfig:
    """Configuration for AI provider connection."""

    provider: AIProvider = AIProvider.OLLAMA
    model: str = "llama3.2"
    base_url: str = "http://localhost:11434"
    api_key: str = ""
    temperature: float = 0.3
    max_tokens: int = 2048
    timeout: float = 60.0


@dataclass
class AIResponse:
    """Unified response from any AI provider."""

    content: str
    model: str
    provider: str
    tokens_used: int = 0
    finish_reason: str = ""
    duration_ms: float = 0.0


# ── Abstract Provider ─────────────────────────────────────────
class BaseAIProvider(ABC):
    """Abstract base for all AI providers."""

    def __init__(self, config: AIConfig):
        self.config = config

    @abstractmethod
    async def complete(self, messages: list[ChatMessage]) -> AIResponse:
        """Send a chat completion request and return the full response."""
        ...

    @abstractmethod
    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        """Stream a chat completion response token by token."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is reachable and configured."""
        ...


# ── Ollama Provider (Local, Default) ─────────────────────────
class OllamaProvider(BaseAIProvider):
    """
    Ollama — local LLM inference.
    Privacy-first: all data stays on the user's machine.
    """

    async def complete(self, messages: list[ChatMessage]) -> AIResponse:
        import time

        start = time.perf_counter()

        payload = {
            "model": self.config.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
            "options": {
                "temperature": self.config.temperature,
                "num_predict": self.config.max_tokens,
            },
        }

        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            resp = await client.post(
                f"{self.config.base_url}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        content = data.get("message", {}).get("content", "")
        tokens = data.get("eval_count", 0) + data.get("prompt_eval_count", 0)

        return AIResponse(
            content=content,
            model=self.config.model,
            provider="ollama",
            tokens_used=tokens,
            finish_reason=data.get("done_reason", "stop"),
            duration_ms=(time.perf_counter() - start) * 1000,
        )

    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        payload = {
            "model": self.config.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
            "options": {
                "temperature": self.config.temperature,
                "num_predict": self.config.max_tokens,
            },
        }

        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.config.base_url}/api/chat",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        import json

                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if chunk.get("done", False):
                            break
                    except (json.JSONDecodeError, KeyError):
                        continue

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.config.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        """List available Ollama models."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.config.base_url}/api/tags")
                resp.raise_for_status()
                data = resp.json()
                return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []


# ── OpenAI Provider (Cloud, Opt-In) ──────────────────────────
class OpenAIProvider(BaseAIProvider):
    """
    OpenAI API — cloud LLM. Opt-in only.
    Compatible with any OpenAI-API-compatible endpoint (Azure, local proxies).
    """

    async def complete(self, messages: list[ChatMessage]) -> AIResponse:
        import time

        start = time.perf_counter()

        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.config.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": False,
        }

        base = self.config.base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            resp = await client.post(
                f"{base}/chat/completions",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data["choices"][0]
        usage = data.get("usage", {})

        return AIResponse(
            content=choice["message"]["content"],
            model=data.get("model", self.config.model),
            provider="openai",
            tokens_used=usage.get("total_tokens", 0),
            finish_reason=choice.get("finish_reason", "stop"),
            duration_ms=(time.perf_counter() - start) * 1000,
        )

    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.config.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": True,
        }

        base = self.config.base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            async with client.stream(
                "POST",
                f"{base}/chat/completions",
                json=payload,
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        import json

                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    async def is_available(self) -> bool:
        if not self.config.api_key:
            return False
        try:
            headers = {"Authorization": f"Bearer {self.config.api_key}"}
            base = self.config.base_url.rstrip("/")
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{base}/models", headers=headers)
                return resp.status_code == 200
        except Exception:
            return False


# ── Anthropic Provider (Cloud, Opt-In) ───────────────────────
class AnthropicProvider(BaseAIProvider):
    """
    Anthropic Claude API — cloud LLM. Opt-in only.
    """

    async def complete(self, messages: list[ChatMessage]) -> AIResponse:
        import time

        start = time.perf_counter()

        # Separate system message
        system_msg = ""
        chat_messages = []
        for m in messages:
            if m.role == "system":
                system_msg = m.content
            else:
                chat_messages.append({"role": m.role, "content": m.content})

        headers = {
            "x-api-key": self.config.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }

        payload = {
            "model": self.config.model,
            "messages": chat_messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
        }
        if system_msg:
            payload["system"] = system_msg

        base = self.config.base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            resp = await client.post(
                f"{base}/messages",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        content_blocks = data.get("content", [])
        content = "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")
        usage = data.get("usage", {})

        return AIResponse(
            content=content,
            model=data.get("model", self.config.model),
            provider="anthropic",
            tokens_used=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            finish_reason=data.get("stop_reason", "end_turn"),
            duration_ms=(time.perf_counter() - start) * 1000,
        )

    async def stream(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        system_msg = ""
        chat_messages = []
        for m in messages:
            if m.role == "system":
                system_msg = m.content
            else:
                chat_messages.append({"role": m.role, "content": m.content})

        headers = {
            "x-api-key": self.config.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        }

        payload = {
            "model": self.config.model,
            "messages": chat_messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
            "stream": True,
        }
        if system_msg:
            payload["system"] = system_msg

        base = self.config.base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            async with client.stream(
                "POST",
                f"{base}/messages",
                json=payload,
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    try:
                        import json

                        event = json.loads(line[6:])
                        if event.get("type") == "content_block_delta":
                            text = event.get("delta", {}).get("text", "")
                            if text:
                                yield text
                        elif event.get("type") == "message_stop":
                            break
                    except (json.JSONDecodeError, KeyError):
                        continue

    async def is_available(self) -> bool:
        return bool(self.config.api_key)


# ── Factory ───────────────────────────────────────────────────
_PROVIDERS = {
    AIProvider.OLLAMA: OllamaProvider,
    AIProvider.OPENAI: OpenAIProvider,
    AIProvider.ANTHROPIC: AnthropicProvider,
}


def create_provider(config: AIConfig) -> BaseAIProvider:
    """Create an AI provider instance from config."""
    provider_cls = _PROVIDERS.get(config.provider)
    if not provider_cls:
        raise ValueError(f"Unknown AI provider: {config.provider}")
    return provider_cls(config)


def get_default_config() -> AIConfig:
    """Load AI config from environment variables."""
    import os

    provider_str = os.getenv("AI_PROVIDER", "ollama").lower()
    try:
        provider = AIProvider(provider_str)
    except ValueError:
        provider = AIProvider.OLLAMA

    model_defaults = {
        AIProvider.OLLAMA: "llama3.2",
        AIProvider.OPENAI: "gpt-4o-mini",
        AIProvider.ANTHROPIC: "claude-3-5-sonnet-20241022",
    }

    base_url_defaults = {
        AIProvider.OLLAMA: "http://localhost:11434",
        AIProvider.OPENAI: "https://api.openai.com/v1",
        AIProvider.ANTHROPIC: "https://api.anthropic.com/v1",
    }

    return AIConfig(
        provider=provider,
        model=os.getenv("AI_MODEL", model_defaults.get(provider, "llama3.2")),
        base_url=os.getenv("AI_BASE_URL", base_url_defaults.get(provider, "")),
        api_key=os.getenv("AI_API_KEY", ""),
        temperature=float(os.getenv("AI_TEMPERATURE", "0.3")),
        max_tokens=int(os.getenv("AI_MAX_TOKENS", "2048")),
        timeout=float(os.getenv("AI_TIMEOUT", "60")),
    )
