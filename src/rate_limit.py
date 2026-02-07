"""
Rate Limiting Middleware for API-Watch.

Provides IP-based rate limiting using an in-memory sliding window counter.
Configurable limits per endpoint group:
  - API requests:       60 req/min (default)
  - Auth endpoints:     10 req/min (stricter to prevent brute force)
  - Health check:       unlimited

Headers returned:
  X-RateLimit-Limit       Total requests allowed in the window
  X-RateLimit-Remaining   Requests remaining in the current window
  X-RateLimit-Reset       Unix timestamp when the window resets
"""
import time
import asyncio
from collections import defaultdict
from typing import Dict, Tuple, Optional
from dataclasses import dataclass

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""
    # Default limits (requests per window)
    default_limit: int = 60
    auth_limit: int = 10
    window_seconds: int = 60
    # Paths exempt from rate limiting
    exempt_paths: Tuple[str, ...] = ("/health", "/docs", "/openapi.json", "/redoc")
    # Enable/disable
    enabled: bool = True


class SlidingWindowCounter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Tracks request counts per key (IP address) with automatic cleanup.
    """

    def __init__(self, window_seconds: int = 60):
        self.window = window_seconds
        self._hits: Dict[str, list] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()

    async def hit(self, key: str) -> Tuple[int, int, float]:
        """
        Record a hit and return (count, limit, reset_time).
        Returns the current count within the sliding window.
        """
        now = time.time()
        async with self._lock:
            # Prune old entries
            window_start = now - self.window
            self._hits[key] = [t for t in self._hits[key] if t > window_start]
            # Add current hit
            self._hits[key].append(now)
            count = len(self._hits[key])
            # Calculate reset time (when oldest entry in window expires)
            reset_time = self._hits[key][0] + self.window if self._hits[key] else now + self.window

            # Periodic cleanup of stale keys (every 5 minutes)
            if now - self._last_cleanup > 300:
                self._cleanup(window_start)
                self._last_cleanup = now

        return count, self.window, reset_time

    def _cleanup(self, window_start: float):
        """Remove keys with no recent hits."""
        stale_keys = [k for k, v in self._hits.items() if not v or v[-1] < window_start]
        for k in stale_keys:
            del self._hits[k]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware that applies IP-based rate limiting.
    """

    def __init__(self, app, config: Optional[RateLimitConfig] = None):
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self.counter = SlidingWindowCounter(self.config.window_seconds)

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request."""
        # Check common proxy headers
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        # Fallback to direct client IP
        return request.client.host if request.client else "unknown"

    def _get_limit(self, path: str) -> int:
        """Determine the rate limit for a given path."""
        if path.startswith("/api/v1/auth"):
            return self.config.auth_limit
        return self.config.default_limit

    def _is_exempt(self, path: str) -> bool:
        """Check if a path is exempt from rate limiting."""
        return path in self.config.exempt_paths or path.startswith("/assets")

    async def dispatch(self, request: Request, call_next):
        """Process the request with rate limiting."""
        if not self.config.enabled:
            return await call_next(request)

        path = request.url.path

        # Skip exempt paths
        if self._is_exempt(path):
            return await call_next(request)

        # Get client identifier
        client_ip = self._get_client_ip(request)
        limit = self._get_limit(path)

        # Check rate limit
        count, window, reset_time = await self.counter.hit(f"{client_ip}:{path.split('/')[1]}")
        remaining = max(0, limit - count)

        if count > limit:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "retry_after": int(reset_time - time.time()),
                },
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(reset_time)),
                    "Retry-After": str(int(reset_time - time.time())),
                },
            )

        # Proceed with the request
        response: Response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(reset_time))

        return response
