"""
Tests for API runner module.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import patch, MagicMock
from requests.exceptions import Timeout, ConnectionError as RequestsConnectionError

from src.runner import RequestConfig, RequestResult, APIRunner, create_runner_from_config
from src.auth import AuthHandler
from src.retry import RetryConfig


class TestRequestConfig:
    def test_defaults(self):
        config = RequestConfig(method="GET", url="https://example.com")
        assert config.method == "GET"
        assert config.url == "https://example.com"
        assert config.headers == {}
        assert config.params == {}
        assert config.body is None
        assert config.timeout == 10
        assert config.verify_ssl is True
        assert config.allow_redirects is True

    def test_custom_values(self):
        config = RequestConfig(
            method="POST",
            url="https://api.test.com",
            headers={"Content-Type": "application/json"},
            body={"key": "value"},
            timeout=30,
            verify_ssl=False,
        )
        assert config.method == "POST"
        assert config.timeout == 30
        assert config.verify_ssl is False
        assert config.body == {"key": "value"}


class TestRequestResult:
    def test_defaults(self):
        result = RequestResult(success=True)
        assert result.success is True
        assert result.status_code is None
        assert result.response_time == 0.0
        assert result.response_size == 0
        assert result.error is None
        assert result.error_type is None
        assert result.retry_count == 0

    def test_failed_result(self):
        result = RequestResult(
            success=False,
            status_code=500,
            error="Server Error",
            error_type="HTTP_ERROR",
        )
        assert result.success is False
        assert result.status_code == 500


class TestAPIRunner:
    def test_init_defaults(self):
        runner = APIRunner()
        assert runner.auth_handler is None
        assert runner.session is not None

    def test_init_with_auth(self):
        auth = AuthHandler()
        auth.set_bearer_token(token="test")
        runner = APIRunner(auth_handler=auth)
        assert runner.auth_handler is auth

    @patch("src.runner.requests.Session")
    def test_execute_success(self, mock_session_cls):
        """Test successful API execution with mocked requests."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.ok = True
        mock_response.headers = {"Content-Type": "application/json"}
        mock_response.content = b'{"result": "ok"}'
        mock_response.text = '{"result": "ok"}'
        mock_session.request.return_value = mock_response
        mock_session_cls.return_value = mock_session

        runner = APIRunner(retry_config=RetryConfig(max_retries=0))
        runner.session = mock_session

        config = RequestConfig(method="GET", url="https://api.test.com/data")
        result = runner.execute(config)

        assert result.success is True
        assert result.status_code == 200
        assert result.response_body == '{"result": "ok"}'
        mock_session.request.assert_called_once()

    @patch("src.runner.requests.Session")
    def test_execute_http_error(self, mock_session_cls):
        """Test HTTP error response."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.ok = False
        mock_response.headers = {}
        mock_response.content = b"Not Found"
        mock_response.text = "Not Found"
        mock_session.request.return_value = mock_response
        mock_session_cls.return_value = mock_session

        runner = APIRunner(retry_config=RetryConfig(max_retries=0))
        runner.session = mock_session

        config = RequestConfig(method="GET", url="https://api.test.com/missing")
        result = runner.execute(config)

        assert result.success is False
        assert result.status_code == 404
        assert result.error_type == "HTTP_ERROR"

    @patch("src.runner.requests.Session")
    def test_execute_timeout(self, mock_session_cls):
        """Test timeout exception handling."""
        mock_session = MagicMock()
        mock_session.request.side_effect = Timeout("Read timed out")
        mock_session_cls.return_value = mock_session

        runner = APIRunner(retry_config=RetryConfig(max_retries=0))
        runner.session = mock_session

        config = RequestConfig(method="GET", url="https://slow.api.com")
        result = runner.execute(config)

        assert result.success is False
        assert result.error_type == "TIMEOUT"

    @patch("src.runner.requests.Session")
    def test_execute_connection_error(self, mock_session_cls):
        """Test connection error handling."""
        mock_session = MagicMock()
        mock_session.request.side_effect = RequestsConnectionError("Connection refused")
        mock_session_cls.return_value = mock_session

        runner = APIRunner(retry_config=RetryConfig(max_retries=0))
        runner.session = mock_session

        config = RequestConfig(method="GET", url="https://dead.server.com")
        result = runner.execute(config)

        assert result.success is False
        assert result.error_type == "CONNECTION_ERROR"

    @patch("src.runner.requests.Session")
    def test_execute_with_auth_headers(self, mock_session_cls):
        """Test that auth headers are included in request."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.ok = True
        mock_response.headers = {}
        mock_response.content = b""
        mock_response.text = ""
        mock_session.request.return_value = mock_response
        mock_session_cls.return_value = mock_session

        auth = AuthHandler()
        auth.set_bearer_token(token="secret-tok")

        runner = APIRunner(auth_handler=auth, retry_config=RetryConfig(max_retries=0))
        runner.session = mock_session

        config = RequestConfig(method="GET", url="https://secure.api.com")
        result = runner.execute(config)

        # Verify auth header was passed
        call_kwargs = mock_session.request.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers", {})
        assert "Authorization" in headers
        assert headers["Authorization"] == "Bearer secret-tok"
        assert result.success is True

    @patch("src.runner.requests.Session")
    def test_execute_with_basic_auth(self, mock_session_cls):
        """Test that basic auth tuple is passed."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.ok = True
        mock_response.headers = {}
        mock_response.content = b""
        mock_response.text = ""
        mock_session.request.return_value = mock_response

        auth = AuthHandler()
        auth.set_basic_auth("user", "pass")

        runner = APIRunner(auth_handler=auth, retry_config=RetryConfig(max_retries=0))
        runner.session = mock_session

        config = RequestConfig(method="GET", url="https://secure.api.com")
        result = runner.execute(config)

        call_kwargs = mock_session.request.call_args
        auth_arg = call_kwargs.kwargs.get("auth") or call_kwargs[1].get("auth")
        assert auth_arg == ("user", "pass")

    def test_close_session(self):
        runner = APIRunner()
        runner.close()
        # Should not raise


class TestCreateRunnerFromConfig:
    def test_no_config(self):
        runner = create_runner_from_config()
        assert isinstance(runner, APIRunner)
        assert runner.auth_handler is None

    def test_with_auth_config(self):
        runner = create_runner_from_config(
            auth_config={"type": "bearer", "token": "tok"}
        )
        assert runner.auth_handler is not None
        assert runner.auth_handler.get_auth_type() == "bearer"

    def test_with_retry_config(self):
        runner = create_runner_from_config(
            retry_config={"max_retries": 5, "initial_delay": 0.5}
        )
        assert runner.retry_handler.config.max_retries == 5
        assert runner.retry_handler.config.initial_delay == 0.5
