"""
Cache abstraction for API-Watch.

Provides a unified async cache interface with two backends:
  1. Redis (production)  — uses ``redis.asyncio``
  2. InMemory (dev/test) — simple dict-based TTL cache

The active backend is chosen automatically based on ``settings.redis_url``.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


# ── Interface ────────────────────────────────────────────────────────────────


class CacheBackend:
    """Abstract cache interface."""

    async def get(self, key: str) -> Optional[str]:
        raise NotImplementedError

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        raise NotImplementedError

    async def delete(self, key: str) -> None:
        raise NotImplementedError

    async def exists(self, key: str) -> bool:
        raise NotImplementedError

    async def incr(self, key: str) -> int:
        raise NotImplementedError

    async def expire(self, key: str, ttl: int) -> None:
        raise NotImplementedError

    async def ttl(self, key: str) -> int:
        """Return remaining TTL in seconds (-1 = no expiry, -2 = key missing)."""
        raise NotImplementedError

    async def flushdb(self) -> None:
        raise NotImplementedError

    async def ping(self) -> bool:
        raise NotImplementedError

    async def close(self) -> None:
        pass


# ── In-Memory Backend ────────────────────────────────────────────────────────


class InMemoryBackend(CacheBackend):
    """Dict-based cache with TTL support.  Used in dev/test when Redis is unavailable."""

    def __init__(self) -> None:
        self._store: Dict[str, Tuple[str, Optional[float]]] = {}  # key → (value, expire_at)
        self._lock = asyncio.Lock()

    def _is_expired(self, key: str) -> bool:
        if key not in self._store:
            return True
        _, expire_at = self._store[key]
        if expire_at is not None and time.time() > expire_at:
            del self._store[key]
            return True
        return False

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            if self._is_expired(key):
                return None
            return self._store[key][0]

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        async with self._lock:
            expire_at = (time.time() + ttl) if ttl else None
            self._store[key] = (value, expire_at)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def exists(self, key: str) -> bool:
        async with self._lock:
            return not self._is_expired(key)

    async def incr(self, key: str) -> int:
        async with self._lock:
            if self._is_expired(key):
                self._store[key] = ("1", None)
                return 1
            val, expire_at = self._store[key]
            new_val = int(val) + 1
            self._store[key] = (str(new_val), expire_at)
            return new_val

    async def expire(self, key: str, ttl: int) -> None:
        async with self._lock:
            if key in self._store:
                val, _ = self._store[key]
                self._store[key] = (val, time.time() + ttl)

    async def ttl(self, key: str) -> int:
        async with self._lock:
            if self._is_expired(key):
                return -2
            _, expire_at = self._store[key]
            if expire_at is None:
                return -1
            return max(0, int(expire_at - time.time()))

    async def flushdb(self) -> None:
        async with self._lock:
            self._store.clear()

    async def ping(self) -> bool:
        return True


# ── Redis Backend ────────────────────────────────────────────────────────────


class RedisBackend(CacheBackend):
    """Redis-backed cache using ``redis.asyncio``."""

    def __init__(self, url: str) -> None:
        import redis.asyncio as aioredis

        self._redis = aioredis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )

    async def get(self, key: str) -> Optional[str]:
        return await self._redis.get(key)

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        if ttl:
            await self._redis.setex(key, ttl, value)
        else:
            await self._redis.set(key, value)

    async def delete(self, key: str) -> None:
        await self._redis.delete(key)

    async def exists(self, key: str) -> bool:
        return bool(await self._redis.exists(key))

    async def incr(self, key: str) -> int:
        return await self._redis.incr(key)

    async def expire(self, key: str, ttl: int) -> None:
        await self._redis.expire(key, ttl)

    async def ttl(self, key: str) -> int:
        return await self._redis.ttl(key)

    async def flushdb(self) -> None:
        await self._redis.flushdb()

    async def ping(self) -> bool:
        try:
            return await self._redis.ping()
        except Exception:
            return False

    async def close(self) -> None:
        await self._redis.aclose()


# ── Factory ──────────────────────────────────────────────────────────────────

_cache: Optional[CacheBackend] = None


def _create_backend(redis_url: str) -> CacheBackend:
    if redis_url:
        try:
            backend = RedisBackend(redis_url)
            logger.info("Cache: using Redis backend (%s)", redis_url.split("@")[-1])
            return backend
        except Exception as exc:
            logger.warning("Cache: Redis unavailable (%s), falling back to in-memory", exc)
    logger.info("Cache: using in-memory backend")
    return InMemoryBackend()


def get_cache() -> CacheBackend:
    """Return the global cache instance (lazy-initialized)."""
    global _cache
    if _cache is None:
        from .config import get_settings
        _cache = _create_backend(get_settings().redis_url)
    return _cache


async def close_cache() -> None:
    """Gracefully shut down the cache backend."""
    global _cache
    if _cache is not None:
        await _cache.close()
        _cache = None


def reset_cache() -> None:
    """Reset cache instance (for testing)."""
    global _cache
    _cache = None
