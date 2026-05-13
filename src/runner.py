"""
API request runner module.
Executes HTTP requests with authentication, retry logic, and detailed logging.
Supports both sync (requests) and async (httpx) execution.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

import requests
from requests.exceptions import ConnectionError, RequestException, Timeout

from .auth import AuthHandler
from .retry import RetryConfig, RetryHandler
from .utils import format_bytes, format_duration, get_iso_timestamp


@dataclass
class RequestConfig:
    """Configuration for an API request."""

    method: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    params: dict[str, Any] = field(default_factory=dict)
    body: Any | None = None  # str, dict, or bytes
    body_type: str = "json"  # json | form-urlencoded | form-data | raw | xml | graphql | none
    timeout: int = 10  # seconds
    verify_ssl: bool = True
    allow_redirects: bool = True
    use_cookies: bool = True  # auto cookie-jar management


@dataclass
class RequestResult:
    """Result of an API request execution."""

    success: bool
    status_code: int | None = None
    response_time: float = 0.0  # seconds
    response_size: int = 0  # bytes
    response_body: str | None = None
    response_headers: dict[str, str] = field(default_factory=dict)
    error: str | None = None
    error_type: str | None = None
    retry_count: int = 0
    timestamp: str = field(default_factory=get_iso_timestamp)

    # Request details (for logging/reporting)
    request_method: str = ""
    request_url: str = ""
    request_headers: dict[str, str] = field(default_factory=dict)
    request_body: str | None = None


class APIRunner:
    """Executes API requests with authentication, retries, and logging."""

    def __init__(
        self,
        auth_handler: AuthHandler | None = None,
        retry_config: RetryConfig | None = None,
        logger: logging.Logger | None = None,
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
        # Persistent async client for connection pooling (lazy-initialised)
        self._async_client: httpx.AsyncClient | None = None

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
                exception=Exception(result.error) if result.error else None,
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
            request_body=str(config.body) if config.body else None,
        )

        try:
            # Prepare headers
            headers = config.headers.copy()

            # Add authentication headers
            if self.auth_handler and self.auth_handler.is_configured():
                auth_headers = self.auth_handler.get_auth_headers()
                headers.update(auth_headers)

            result.request_headers = headers.copy()

            # Inject cookies from cookie jar
            if config.use_cookies:
                from .cookie_jar import get_cookie_store

                cookie_header = get_cookie_store().get_cookie_header(config.url)
                if cookie_header:
                    headers.setdefault("Cookie", cookie_header)

            # Prepare auth tuple for Basic auth
            auth = None
            if self.auth_handler and self.auth_handler.get_auth_type() == "basic":
                auth = self.auth_handler.get_basic_auth_tuple()

            # Build body kwargs based on body_type
            body_kwargs = self._build_body_kwargs(config)

            # Execute request
            start_time = time.time()

            response = self.session.request(
                method=config.method.upper(),
                url=config.url,
                headers=headers,
                params=config.params,
                timeout=config.timeout,
                verify=config.verify_ssl,
                allow_redirects=config.allow_redirects,
                auth=auth,
                **body_kwargs,
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

            # Capture Set-Cookie headers
            if config.use_cookies:
                from .cookie_jar import get_cookie_store

                get_cookie_store().capture_from_headers(config.url, dict(response.headers))

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

    async def execute_async(self, config: RequestConfig) -> RequestResult:
        """
        Execute an API request asynchronously using httpx.

        Args:
            config: Request configuration

        Returns:
            RequestResult with response details
        """
        if httpx is None:
            raise ImportError(
                "httpx is required for async execution. Install with: pip install httpx"
            )

        self.retry_handler.reset()
        result = None

        while True:
            result = await self._execute_single_request_async(config)
            self._log_request(config, result)

            if not result.success and self.retry_handler.should_retry(
                status_code=result.status_code,
                exception=Exception(result.error) if result.error else None,
            ):
                self.retry_handler.increment_retry()
                retry_delay = self.retry_handler.get_delay()
                self.logger.info(
                    f"Retry {self.retry_handler.get_retry_count()}/"
                    f"{self.retry_handler.config.max_retries} after {retry_delay:.1f}s "
                    f"(Status: {result.status_code}, Error: {result.error_type})"
                )
                await asyncio.sleep(retry_delay)
            else:
                break

        result.retry_count = self.retry_handler.get_retry_count()
        return result

    async def _execute_single_request_async(self, config: RequestConfig) -> RequestResult:
        """
        Execute a single API request asynchronously without retry.
        """
        result = RequestResult(
            success=False,
            request_method=config.method.upper(),
            request_url=config.url,
            request_headers=config.headers.copy(),
            request_body=str(config.body) if config.body else None,
        )

        try:
            headers = config.headers.copy()
            if self.auth_handler and self.auth_handler.is_configured():
                auth_headers = self.auth_handler.get_auth_headers()
                headers.update(auth_headers)

            result.request_headers = headers.copy()

            # Inject cookies from cookie jar
            if config.use_cookies:
                from .cookie_jar import get_cookie_store

                cookie_header = get_cookie_store().get_cookie_header(config.url)
                if cookie_header:
                    headers.setdefault("Cookie", cookie_header)

            # Prepare auth for basic auth
            auth = None
            if self.auth_handler and self.auth_handler.get_auth_type() == "basic":
                creds = self.auth_handler.get_basic_auth_tuple()
                if creds:
                    auth = httpx.BasicAuth(creds[0], creds[1])

            # Build body kwargs based on body_type
            body_kwargs = self._build_body_kwargs_httpx(config)

            start_time = time.time()

            client = self._get_async_client()
            response = await client.request(
                method=config.method.upper(),
                url=config.url,
                headers=headers,
                params=config.params,
                auth=auth,
                timeout=config.timeout,
                follow_redirects=config.allow_redirects,
                **body_kwargs,
            )

            end_time = time.time()

            result.status_code = response.status_code
            result.response_time = end_time - start_time
            result.response_headers = dict(response.headers)
            result.response_size = len(response.content)

            try:
                result.response_body = response.text
            except Exception:
                result.response_body = "<binary data>"

            result.success = response.is_success
            if not result.success:
                result.error = f"HTTP {response.status_code}"
                result.error_type = "HTTP_ERROR"

            # Capture Set-Cookie headers
            if config.use_cookies:
                from .cookie_jar import get_cookie_store

                get_cookie_store().capture_from_headers(config.url, dict(response.headers))

        except httpx.TimeoutException as e:
            result.error = "Request timeout"
            result.error_type = "TIMEOUT"
            self.logger.error(f"Timeout error: {str(e)}")

        except httpx.ConnectError as e:
            result.error = "Connection error"
            result.error_type = "CONNECTION_ERROR"
            self.logger.error(f"Connection error: {str(e)}")

        except httpx.HTTPError as e:
            result.error = str(e)
            result.error_type = "REQUEST_ERROR"
            self.logger.error(f"HTTP error: {str(e)}")

        except Exception as e:
            result.error = str(e)
            result.error_type = "UNKNOWN_ERROR"
            self.logger.error(f"Unexpected error: {str(e)}")

        return result

    # ── Body builders ─────────────────────────────────────────────────────

    @staticmethod
    def _build_body_kwargs(config: RequestConfig) -> dict[str, Any]:
        """Build kwargs for requests.Session.request based on body_type."""
        if config.body is None:
            return {}
        bt = (config.body_type or "json").lower()
        if bt == "json":
            try:
                import orjson

                if isinstance(config.body, str):
                    try:
                        return {"json": orjson.loads(config.body)}
                    except (orjson.JSONDecodeError, TypeError):
                        return {"data": config.body}
                return {"json": config.body}
            except ImportError:
                import json as _json

                if isinstance(config.body, str):
                    try:
                        return {"json": _json.loads(config.body)}
                    except (ValueError, TypeError):
                        return {"data": config.body}
                return {"json": config.body}
        if bt in ("form-urlencoded", "urlencoded"):
            if isinstance(config.body, dict):
                return {"data": config.body}
            return {"data": config.body}
        if bt in ("form-data", "multipart"):
            if isinstance(config.body, dict):
                return {"files": [(k, (None, v)) for k, v in config.body.items()]}
            return {"data": config.body}
        # raw, xml, graphql, text, html → send as data with explicit content-type
        return {"data": config.body if isinstance(config.body, (str, bytes)) else str(config.body)}

    @staticmethod
    def _build_body_kwargs_httpx(config: RequestConfig) -> dict[str, Any]:
        """Build kwargs for httpx.AsyncClient.request based on body_type."""
        if config.body is None:
            return {}
        bt = (config.body_type or "json").lower()
        if bt == "json":
            try:
                import orjson

                if isinstance(config.body, str):
                    try:
                        return {"json": orjson.loads(config.body)}
                    except (orjson.JSONDecodeError, TypeError):
                        return {"content": config.body}
                return {"json": config.body}
            except ImportError:
                import json as _json

                if isinstance(config.body, str):
                    try:
                        return {"json": _json.loads(config.body)}
                    except (ValueError, TypeError):
                        return {"content": config.body}
                return {"json": config.body}
        if bt in ("form-urlencoded", "urlencoded"):
            if isinstance(config.body, dict):
                return {"data": config.body}
            return {"content": config.body}
        if bt in ("form-data", "multipart"):
            if isinstance(config.body, dict):
                return {"files": [(k, (None, v)) for k, v in config.body.items()]}
            return {"content": config.body}
        return {
            "content": config.body if isinstance(config.body, (str, bytes)) else str(config.body)
        }

    # ── Connection pool management ─────────────────────────────────────

    def _get_async_client(self) -> "httpx.AsyncClient":
        """Lazily create a persistent httpx.AsyncClient with connection pooling and HTTP/2."""
        if self._async_client is None or self._async_client.is_closed:
            pool_limits = httpx.Limits(
                max_connections=200,
                max_keepalive_connections=40,
                keepalive_expiry=60,
            )
            self._async_client = httpx.AsyncClient(
                limits=pool_limits,
                http2=True,  # Enable HTTP/2 multiplexing for supporting servers
                timeout=httpx.Timeout(30.0, connect=10.0),
            )
        return self._async_client

    async def close_async(self) -> None:
        """Close the persistent async client and its connection pool."""
        if self._async_client and not self._async_client.is_closed:
            await self._async_client.aclose()
            self._async_client = None

    def close(self) -> None:
        """Close the sync session."""
        self.session.close()


def create_runner_from_config(
    auth_config: dict[str, Any] | None = None,
    retry_config: dict[str, Any] | None = None,
    logger: logging.Logger | None = None,
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
    from .auth import create_auth_from_config

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
            retry_on_status_codes=retry_config.get("retry_on_status_codes"),
        )

    return APIRunner(auth_handler, retry_cfg, logger)
