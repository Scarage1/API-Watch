"""
API request runner module.
Executes HTTP requests with authentication, retry logic, and detailed logging.
"""
import time
import logging
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

from auth import AuthHandler
from retry import RetryHandler, RetryConfig
from utils import format_bytes, format_duration, get_iso_timestamp


@dataclass
class RequestConfig:
    """Configuration for an API request."""
    method: str
    url: str
    headers: Dict[str, str] = field(default_factory=dict)
    params: Dict[str, Any] = field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None
    timeout: int = 10  # seconds
    verify_ssl: bool = True
    allow_redirects: bool = True


@dataclass
class RequestResult:
    """Result of an API request execution."""
    success: bool
    status_code: Optional[int] = None
    response_time: float = 0.0  # seconds
    response_size: int = 0  # bytes
    response_body: Optional[str] = None
    response_headers: Dict[str, str] = field(default_factory=dict)
    error: Optional[str] = None
    error_type: Optional[str] = None
    retry_count: int = 0
    timestamp: str = field(default_factory=get_iso_timestamp)
    
    # Request details (for logging/reporting)
    request_method: str = ""
    request_url: str = ""
    request_headers: Dict[str, str] = field(default_factory=dict)
    request_body: Optional[str] = None


class APIRunner:
    """Executes API requests with authentication, retries, and logging."""
    
    def __init__(
        self,
        auth_handler: Optional[AuthHandler] = None,
        retry_config: Optional[RetryConfig] = None,
        logger: Optional[logging.Logger] = None
    ):
        """
        Initialize API runner.
        
        Args:
            auth_handler: Authentication handler
            retry_config: Retry configuration
            logger: Logger instance
        """
        self.auth_handler = auth_handler
        self.retry_handler = RetryHandler(retry_config) if retry_config else RetryHandler()
        self.logger = logger or logging.getLogger(__name__)
        self.session = requests.Session()
    
    def execute(self, config: RequestConfig) -> RequestResult:
        """
        Execute an API request with retry logic.
        
        Args:
            config: Request configuration
            
        Returns:
            RequestResult with response details
        """
        self.retry_handler.reset()
        result = None
        
        while True:
            result = self._execute_single_request(config)
            
            # Log the attempt
            self._log_request(config, result)
            
            # Check if we should retry
            if not result.success and self.retry_handler.should_retry(
                status_code=result.status_code,
                exception=Exception(result.error) if result.error else None
            ):
                self.retry_handler.increment_retry()
                retry_delay = self.retry_handler.get_delay()
                
                self.logger.info(
                    f"Retry {self.retry_handler.get_retry_count()}/"
                    f"{self.retry_handler.config.max_retries} after {retry_delay:.1f}s "
                    f"(Status: {result.status_code}, Error: {result.error_type})"
                )
                
                self.retry_handler.wait()
            else:
                # Success or no more retries
                break
        
        # Update retry count in result
        result.retry_count = self.retry_handler.get_retry_count()
        return result
    
    def _execute_single_request(self, config: RequestConfig) -> RequestResult:
        """
        Execute a single API request without retry.
        
        Args:
            config: Request configuration
            
        Returns:
            RequestResult
        """
        result = RequestResult(
            success=False,
            request_method=config.method.upper(),
            request_url=config.url,
            request_headers=config.headers.copy(),
            request_body=str(config.body) if config.body else None
        )
        
        try:
            # Prepare headers
            headers = config.headers.copy()
            
            # Add authentication headers
            if self.auth_handler and self.auth_handler.is_configured():
                auth_headers = self.auth_handler.get_auth_headers()
                headers.update(auth_headers)
            
            result.request_headers = headers.copy()
            
            # Prepare auth tuple for Basic auth
            auth = None
            if self.auth_handler and self.auth_handler.get_auth_type() == "basic":
                auth = self.auth_handler.get_basic_auth_tuple()
            
            # Execute request
            start_time = time.time()
            
            response = self.session.request(
                method=config.method.upper(),
                url=config.url,
                headers=headers,
                params=config.params,
                json=config.body if config.body else None,
                timeout=config.timeout,
                verify=config.verify_ssl,
                allow_redirects=config.allow_redirects,
                auth=auth
            )
            
            end_time = time.time()
            
            # Populate result
            result.status_code = response.status_code
            result.response_time = end_time - start_time
            result.response_headers = dict(response.headers)
            result.response_size = len(response.content)
            
            # Try to get response body as text
            try:
                result.response_body = response.text
            except Exception:
                result.response_body = "<binary data>"
            
            # Check if request was successful
            result.success = response.ok  # True for status codes 200-299
            
            if not result.success:
                result.error = f"HTTP {response.status_code}"
                result.error_type = "HTTP_ERROR"
        
        except Timeout as e:
            result.error = "Request timeout"
            result.error_type = "TIMEOUT"
            result.success = False
            self.logger.error(f"Timeout error: {str(e)}")
        
        except ConnectionError as e:
            result.error = "Connection error"
            result.error_type = "CONNECTION_ERROR"
            result.success = False
            self.logger.error(f"Connection error: {str(e)}")
        
        except RequestException as e:
            result.error = str(e)
            result.error_type = "REQUEST_ERROR"
            result.success = False
            self.logger.error(f"Request error: {str(e)}")
        
        except Exception as e:
            result.error = str(e)
            result.error_type = "UNKNOWN_ERROR"
            result.success = False
            self.logger.error(f"Unexpected error: {str(e)}")
        
        return result
    
    def _log_request(self, config: RequestConfig, result: RequestResult) -> None:
        """
        Log request details.
        
        Args:
            config: Request configuration
            result: Request result
        """
        status = "✓" if result.success else "✗"
        log_msg = (
            f"{status} {config.method.upper()} {config.url} | "
            f"Status: {result.status_code or 'N/A'} | "
            f"Time: {format_duration(result.response_time)} | "
            f"Size: {format_bytes(result.response_size)}"
        )
        
        if result.success:
            self.logger.info(log_msg)
        else:
            self.logger.warning(f"{log_msg} | Error: {result.error}")
    
    def close(self) -> None:
        """Close the session."""
        self.session.close()


def create_runner_from_config(
    auth_config: Optional[Dict[str, Any]] = None,
    retry_config: Optional[Dict[str, Any]] = None,
    logger: Optional[logging.Logger] = None
) -> APIRunner:
    """
    Create APIRunner from configuration dictionaries.
    
    Args:
        auth_config: Authentication configuration
        retry_config: Retry configuration
        logger: Logger instance
        
    Returns:
        Configured APIRunner
    """
    from auth import create_auth_from_config
    
    # Create auth handler
    auth_handler = None
    if auth_config:
        auth_handler = create_auth_from_config(auth_config)
    
    # Create retry config
    retry_cfg = None
    if retry_config:
        retry_cfg = RetryConfig(
            max_retries=retry_config.get("max_retries", 3),
            initial_delay=retry_config.get("initial_delay", 1.0),
            max_delay=retry_config.get("max_delay", 32.0),
            exponential_base=retry_config.get("exponential_base", 2.0),
            retry_on_status_codes=retry_config.get("retry_on_status_codes")
        )
    
    return APIRunner(auth_handler, retry_cfg, logger)
