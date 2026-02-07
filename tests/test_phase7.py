"""
Tests for Phase 7 — Rate Limiting middleware.
"""
import pytest
import asyncio
from src.rate_limit import SlidingWindowCounter, RateLimitConfig


@pytest.mark.asyncio
async def test_sliding_window_counter_basic():
    """Test basic sliding window counter."""
    counter = SlidingWindowCounter(window_seconds=60)
    count, window, reset = await counter.hit("test-ip")
    assert count == 1
    assert window == 60


@pytest.mark.asyncio
async def test_sliding_window_counter_increments():
    """Test that counter increments for the same key."""
    counter = SlidingWindowCounter(window_seconds=60)
    await counter.hit("ip1")
    await counter.hit("ip1")
    count, _, _ = await counter.hit("ip1")
    assert count == 3


@pytest.mark.asyncio
async def test_sliding_window_counter_separate_keys():
    """Test that different keys have separate counters."""
    counter = SlidingWindowCounter(window_seconds=60)
    await counter.hit("ip1")
    await counter.hit("ip1")
    count_ip2, _, _ = await counter.hit("ip2")
    assert count_ip2 == 1


@pytest.mark.asyncio
async def test_rate_limit_config_defaults():
    """Test default rate limit configuration."""
    config = RateLimitConfig()
    assert config.default_limit == 60
    assert config.auth_limit == 10
    assert config.window_seconds == 60
    assert config.enabled is True
    assert "/health" in config.exempt_paths


@pytest.mark.asyncio
async def test_rate_limit_config_custom():
    """Test custom rate limit configuration."""
    config = RateLimitConfig(
        default_limit=100,
        auth_limit=5,
        window_seconds=30,
        enabled=False,
    )
    assert config.default_limit == 100
    assert config.auth_limit == 5
    assert config.window_seconds == 30
    assert config.enabled is False
