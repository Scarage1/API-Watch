"""
Retry logic module with exponential backoff.
Handles automatic retries for transient failures (429, 5xx).
"""
import time
from typing import Callable, Optional, Any
from dataclasses import dataclass


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 3
    initial_delay: float = 1.0  # seconds
    max_delay: float = 32.0  # seconds
    exponential_base: float = 2.0
    retry_on_status_codes: list = None
    
    def __post_init__(self):
        """Set default retry status codes if not provided."""
        if self.retry_on_status_codes is None:
            # Retry on rate limit (429) and server errors (5xx)
            self.retry_on_status_codes = [429, 500, 502, 503, 504]


class RetryHandler:
    """Handles retry logic with exponential backoff."""
    
    def __init__(self, config: Optional[RetryConfig] = None):
        """
        Initialize retry handler.
        
        Args:
            config: Retry configuration (uses defaults if not provided)
        """
        self.config = config or RetryConfig()
        self.retry_count = 0
        self.last_error: Optional[Exception] = None
    
    def should_retry(self, status_code: Optional[int] = None, exception: Optional[Exception] = None) -> bool:
        """
        Determine if a request should be retried.
        
        Args:
            status_code: HTTP status code from response
            exception: Exception that occurred
            
        Returns:
            True if should retry, False otherwise
        """
        # Check if we've exceeded max retries
        if self.retry_count >= self.config.max_retries:
            return False
        
        # Retry on configured status codes
        if status_code and status_code in self.config.retry_on_status_codes:
            return True
        
        # Retry on network/timeout exceptions
        if exception:
            # Common exceptions to retry on
            retry_exceptions = (
                ConnectionError,
                TimeoutError,
            )
            if isinstance(exception, retry_exceptions):
                return True
            
            # Check for requests library specific exceptions
            exception_name = type(exception).__name__
            if exception_name in ['ConnectionError', 'Timeout', 'ReadTimeout', 'ConnectTimeout']:
                return True
        
        return False
    
    def get_delay(self) -> float:
        """
        Calculate delay for next retry using exponential backoff.
        
        Returns:
            Delay in seconds
        """
        delay = self.config.initial_delay * (self.config.exponential_base ** self.retry_count)
        return min(delay, self.config.max_delay)
    
    def wait(self) -> None:
        """Wait for the calculated delay period."""
        delay = self.get_delay()
        time.sleep(delay)
    
    def increment_retry(self) -> None:
        """Increment retry counter."""
        self.retry_count += 1
    
    def reset(self) -> None:
        """Reset retry state."""
        self.retry_count = 0
        self.last_error = None
    
    def get_retry_count(self) -> int:
        """
        Get current retry count.
        
        Returns:
            Number of retries performed
        """
        return self.retry_count
    
    def get_remaining_retries(self) -> int:
        """
        Get remaining retry attempts.
        
        Returns:
            Number of retries remaining
        """
        return max(0, self.config.max_retries - self.retry_count)


def with_retry(
    func: Callable,
    retry_config: Optional[RetryConfig] = None,
    *args,
    **kwargs
) -> Any:
    """
    Execute a function with retry logic.
    
    Args:
        func: Function to execute
        retry_config: Retry configuration
        *args: Positional arguments for function
        **kwargs: Keyword arguments for function
        
    Returns:
        Function result
        
    Raises:
        Last exception if all retries exhausted
    """
    handler = RetryHandler(retry_config)
    
    while True:
        try:
            result = func(*args, **kwargs)
            handler.reset()
            return result
        
        except Exception as e:
            handler.last_error = e
            
            # Check if we should retry
            if handler.should_retry(exception=e):
                handler.increment_retry()
                print(f"Retry {handler.get_retry_count()}/{handler.config.max_retries} "
                      f"after {handler.get_delay():.1f}s due to: {type(e).__name__}")
                handler.wait()
            else:
                # No more retries or not a retryable error
                raise


def calculate_backoff_delay(attempt: int, initial_delay: float = 1.0, max_delay: float = 32.0) -> float:
    """
    Calculate exponential backoff delay.
    
    Args:
        attempt: Attempt number (0-indexed)
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        
    Returns:
        Delay in seconds
    """
    delay = initial_delay * (2 ** attempt)
    return min(delay, max_delay)
