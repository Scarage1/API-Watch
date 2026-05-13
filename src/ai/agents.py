"""
AI Agents for API-Watch.

Each agent is a specialized AI capability:
  1. TestGenerator — Analyze API response → generate test assertions
  2. DebugAssistant — Failed request → diagnose → suggest fixes
  3. RequestBuilder — Natural language → HTTP request configuration

Agents are stateless, composable, and provider-agnostic.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List, Optional

from src.ai.providers import BaseAIProvider, ChatMessage, AIResponse

logger = logging.getLogger(__name__)


# ── Base Agent ────────────────────────────────────────────────
class BaseAgent:
    """Base class for all AI agents."""

    def __init__(self, provider: BaseAIProvider):
        self.provider = provider

    def _build_messages(self, system: str, user: str) -> List[ChatMessage]:
        return [
            ChatMessage(role="system", content=system),
            ChatMessage(role="user", content=user),
        ]


# ── Test Generator Agent ─────────────────────────────────────
TESTGEN_SYSTEM = """You are an expert API testing engineer. Your job is to analyze HTTP API responses and generate comprehensive test assertions using the pm.test() API (Postman-compatible).

Rules:
1. Generate assertions that validate:
   - Status code
   - Response time thresholds
   - Content-Type header
   - Required fields exist in the response body
   - Data types of fields
   - Value ranges and constraints
   - Array lengths where applicable
   - Error handling cases
2. Use pm.test() and pm.expect() syntax
3. Be thorough but practical — don't test every single field
4. Add brief comments explaining each test group
5. Output ONLY valid JavaScript code, no markdown fences

Example output format:
// Status validation
pm.test("Status code is 200", () => {
    pm.expect(response.code).toBe(200);
});

// Response time
pm.test("Response time is under 500ms", () => {
    pm.expect(response.responseTime).toBeLessThan(500);
});"""


class TestGeneratorAgent(BaseAgent):
    """Analyze API responses and generate test assertions."""

    async def generate(
        self,
        method: str,
        url: str,
        status_code: int,
        response_body: Optional[str],
        response_headers: Dict[str, str],
        response_time: float,
    ) -> AIResponse:
        """Generate test assertions for a response."""
        user_prompt = self._build_context(
            method, url, status_code, response_body, response_headers, response_time
        )
        messages = self._build_messages(TESTGEN_SYSTEM, user_prompt)
        return await self.provider.complete(messages)

    async def generate_stream(
        self,
        method: str,
        url: str,
        status_code: int,
        response_body: Optional[str],
        response_headers: Dict[str, str],
        response_time: float,
    ) -> AsyncIterator[str]:
        """Stream test assertions for a response."""
        user_prompt = self._build_context(
            method, url, status_code, response_body, response_headers, response_time
        )
        messages = self._build_messages(TESTGEN_SYSTEM, user_prompt)
        async for token in self.provider.stream(messages):
            yield token

    def _build_context(
        self,
        method: str,
        url: str,
        status_code: int,
        response_body: Optional[str],
        response_headers: Dict[str, str],
        response_time: float,
    ) -> str:
        # Truncate large response bodies to stay within context window
        body_preview = response_body or ""
        if len(body_preview) > 4000:
            body_preview = body_preview[:4000] + "\n... (truncated)"

        return f"""Analyze this API response and generate comprehensive test assertions:

**Request:**
- Method: {method}
- URL: {url}

**Response:**
- Status Code: {status_code}
- Response Time: {response_time:.3f}s
- Headers: {json.dumps(dict(list(response_headers.items())[:10]), indent=2)}

**Response Body:**
```
{body_preview}
```

Generate pm.test() assertions that thoroughly validate this response."""


# ── Debug Assistant Agent ─────────────────────────────────────
DEBUG_SYSTEM = """You are an expert API debugging assistant. Your job is to analyze failed or unexpected API responses and help developers understand and fix issues.

Rules:
1. Identify the root cause of the failure
2. Explain the issue in clear, developer-friendly language
3. Suggest specific fixes (code, headers, URL, body changes)
4. If it's a common API pattern issue, explain the pattern
5. Include relevant HTTP status code documentation
6. Format your response with clear sections: Diagnosis, Root Cause, Suggested Fixes

Be concise but thorough. Developers appreciate precision over verbosity."""


class DebugAssistantAgent(BaseAgent):
    """Analyze failed requests and suggest fixes."""

    async def debug(
        self,
        method: str,
        url: str,
        status_code: Optional[int],
        request_headers: Dict[str, str],
        request_body: Optional[str],
        response_body: Optional[str],
        response_headers: Dict[str, str],
        error: Optional[str],
        error_type: Optional[str],
    ) -> AIResponse:
        """Analyze a failed request and suggest fixes."""
        user_prompt = self._build_context(
            method, url, status_code, request_headers, request_body,
            response_body, response_headers, error, error_type,
        )
        messages = self._build_messages(DEBUG_SYSTEM, user_prompt)
        return await self.provider.complete(messages)

    async def debug_stream(
        self,
        method: str,
        url: str,
        status_code: Optional[int],
        request_headers: Dict[str, str],
        request_body: Optional[str],
        response_body: Optional[str],
        response_headers: Dict[str, str],
        error: Optional[str],
        error_type: Optional[str],
    ) -> AsyncIterator[str]:
        """Stream debug analysis."""
        user_prompt = self._build_context(
            method, url, status_code, request_headers, request_body,
            response_body, response_headers, error, error_type,
        )
        messages = self._build_messages(DEBUG_SYSTEM, user_prompt)
        async for token in self.provider.stream(messages):
            yield token

    def _build_context(
        self,
        method: str,
        url: str,
        status_code: Optional[int],
        request_headers: Dict[str, str],
        request_body: Optional[str],
        response_body: Optional[str],
        response_headers: Dict[str, str],
        error: Optional[str],
        error_type: Optional[str],
    ) -> str:
        body_preview = (response_body or "")[:3000]
        req_body_preview = (request_body or "")[:2000]

        return f"""Debug this failed API request:

**Request:**
- Method: {method}
- URL: {url}
- Headers: {json.dumps(dict(list(request_headers.items())[:8]), indent=2)}
{f"- Body: {req_body_preview}" if req_body_preview else ""}

**Response:**
- Status Code: {status_code or "N/A"}
- Error: {error or "None"}
- Error Type: {error_type or "None"}
- Headers: {json.dumps(dict(list(response_headers.items())[:8]), indent=2)}
{f"- Body: {body_preview}" if body_preview else ""}

Diagnose the issue and suggest specific fixes."""


# ── Natural Language Request Builder Agent ────────────────────
REQUEST_BUILDER_SYSTEM = """You are an API request configuration assistant. Convert natural language descriptions into precise HTTP request configurations.

You MUST respond with valid JSON only, no markdown fences or explanations. The JSON format:
{
  "method": "GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS",
  "url": "https://...",
  "headers": {"key": "value"},
  "params": {"key": "value"},
  "body": null or {"key": "value"} or "raw string",
  "bodyType": "none|json|text|form-data|x-www-form-urlencoded|xml",
  "description": "Brief description of what this request does"
}

Rules:
1. Always use HTTPS unless HTTP is explicitly mentioned
2. Infer the correct HTTP method from the action words
3. Include appropriate Content-Type headers
4. Use realistic placeholder values (not "example" or "test")
5. Include authentication headers if the request implies auth
6. Add common headers like Accept, User-Agent where appropriate"""


class RequestBuilderAgent(BaseAgent):
    """Convert natural language into HTTP request configurations."""

    async def build(self, description: str) -> AIResponse:
        """Build an HTTP request from a natural language description."""
        messages = self._build_messages(REQUEST_BUILDER_SYSTEM, description)
        return await self.provider.complete(messages)

    async def build_stream(self, description: str) -> AsyncIterator[str]:
        """Stream the request building process."""
        messages = self._build_messages(REQUEST_BUILDER_SYSTEM, description)
        async for token in self.provider.stream(messages):
            yield token

    def parse_response(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse the AI response into a request configuration dict."""
        try:
            # Try to extract JSON from the response
            content = content.strip()
            if content.startswith("```"):
                # Strip markdown fences
                lines = content.split("\n")
                content = "\n".join(lines[1:-1])
            return json.loads(content)
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI response as JSON: %s", content[:200])
            return None
