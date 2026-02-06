"""
Tests for retry module.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from src.retry import RetryConfig, RetryHandler, calculate_backoff_delay


class TestRetryConfig:
    def test_defaults(self):
        config = RetryConfig()
        assert config.max_retries == 3
        assert config.initial_delay == 1.0
        assert config.max_delay == 32.0
        assert config.exponential_base == 2.0
        assert 429 in config.retry_on_status_codes
        assert 500 in config.retry_on_status_codes
        assert 502 in config.retry_on_status_codes
        assert 503 in config.retry_on_status_codes
        assert 504 in config.retry_on_status_codes

    def test_custom_config(self):
        config = RetryConfig(max_retries=5, initial_delay=0.5, retry_on_status_codes=[500])
        assert config.max_retries == 5
        assert config.initial_delay == 0.5
        assert config.retry_on_status_codes == [500]

    def test_default_status_codes_set(self):
        """retry_on_status_codes=None triggers __post_init__ defaults."""
        config = RetryConfig(retry_on_status_codes=None)
        assert len(config.retry_on_status_codes) == 5


class TestRetryHandler:
    def test_initial_state(self):
        handler = RetryHandler()
        assert handler.retry_count == 0
        assert handler.last_error is None
        assert handler.get_retry_count() == 0
        assert handler.get_remaining_retries() == 3

    def test_should_retry_on_status_code(self):
        handler = RetryHandler()
        assert handler.should_retry(status_code=429) is True
        assert handler.should_retry(status_code=500) is True
        assert handler.should_retry(status_code=200) is False
        assert handler.should_retry(status_code=404) is False

    def test_should_retry_on_exception(self):
        handler = RetryHandler()
        assert handler.should_retry(exception=ConnectionError("fail")) is True
        assert handler.should_retry(exception=TimeoutError("timeout")) is True
        assert handler.should_retry(exception=ValueError("bad value")) is False

    def test_max_retries_exhausted(self):
        handler = RetryHandler(RetryConfig(max_retries=2))
        handler.retry_count = 2
        assert handler.should_retry(status_code=500) is False

    def test_increment_retry(self):
        handler = RetryHandler()
        handler.increment_retry()
        assert handler.get_retry_count() == 1
        assert handler.get_remaining_retries() == 2

    def test_reset(self):
        handler = RetryHandler()
        handler.retry_count = 3
        handler.last_error = Exception("test")
        handler.reset()
        assert handler.retry_count == 0
        assert handler.last_error is None

    def test_get_delay_exponential(self):
        handler = RetryHandler(RetryConfig(initial_delay=1.0, exponential_base=2.0))
        handler.retry_count = 0
        assert handler.get_delay() == 1.0

        handler.retry_count = 1
        assert handler.get_delay() == 2.0

        handler.retry_count = 2
        assert handler.get_delay() == 4.0

    def test_get_delay_capped_at_max(self):
        handler = RetryHandler(RetryConfig(initial_delay=1.0, max_delay=5.0))
        handler.retry_count = 10  # 2^10 = 1024, way above max
        assert handler.get_delay() == 5.0

    def test_remaining_retries_never_negative(self):
        handler = RetryHandler(RetryConfig(max_retries=2))
        handler.retry_count = 5
        assert handler.get_remaining_retries() == 0


class TestCalculateBackoffDelay:
    def test_first_attempt(self):
        assert calculate_backoff_delay(0) == 1.0

    def test_second_attempt(self):
        assert calculate_backoff_delay(1) == 2.0

    def test_third_attempt(self):
        assert calculate_backoff_delay(2) == 4.0

    def test_capped_at_max(self):
        assert calculate_backoff_delay(100, max_delay=32.0) == 32.0

    def test_custom_initial_delay(self):
        assert calculate_backoff_delay(0, initial_delay=0.5) == 0.5
        assert calculate_backoff_delay(1, initial_delay=0.5) == 1.0
