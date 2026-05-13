"""
Tests for authentication module.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from src.auth import AuthHandler, create_auth_from_config


class TestAuthHandlerBearer:
    def test_set_bearer_token_direct(self):
        handler = AuthHandler()
        handler.set_bearer_token(token="my-secret-token")
        assert handler.auth_type == "bearer"
        assert handler.credentials["token"] == "my-secret-token"

    def test_bearer_headers(self):
        handler = AuthHandler()
        handler.set_bearer_token(token="abc123")
        headers = handler.get_auth_headers()
        assert headers == {"Authorization": "Bearer abc123"}

    def test_bearer_from_env(self, monkeypatch):
        monkeypatch.setenv("TEST_TOKEN", "env-token-value")
        handler = AuthHandler()
        handler.set_bearer_token(token_env="TEST_TOKEN")
        headers = handler.get_auth_headers()
        assert headers == {"Authorization": "Bearer env-token-value"}

    def test_bearer_missing_env_raises(self):
        handler = AuthHandler()
        with pytest.raises(ValueError, match="not found"):
            handler.set_bearer_token(token_env="NONEXISTENT_ENV_TOKEN_XYZ")

    def test_bearer_no_args_raises(self):
        handler = AuthHandler()
        with pytest.raises(ValueError):
            handler.set_bearer_token()


class TestAuthHandlerApiKey:
    def test_set_api_key_direct(self):
        handler = AuthHandler()
        handler.set_api_key(api_key="key123")
        assert handler.auth_type == "api_key"
        assert handler.credentials["api_key"] == "key123"

    def test_api_key_headers_default_name(self):
        handler = AuthHandler()
        handler.set_api_key(api_key="key123")
        headers = handler.get_auth_headers()
        assert headers == {"X-API-Key": "key123"}

    def test_api_key_custom_header(self):
        handler = AuthHandler()
        handler.set_api_key(api_key="key123", header_name="Authorization")
        headers = handler.get_auth_headers()
        assert headers == {"Authorization": "key123"}

    def test_api_key_from_env(self, monkeypatch):
        monkeypatch.setenv("TEST_API_KEY", "env-key")
        handler = AuthHandler()
        handler.set_api_key(key_env="TEST_API_KEY")
        assert handler.credentials["api_key"] == "env-key"

    def test_api_key_missing_env_raises(self):
        handler = AuthHandler()
        with pytest.raises(ValueError, match="not found"):
            handler.set_api_key(key_env="NONEXISTENT_KEY_XYZ")

    def test_api_key_no_args_raises(self):
        handler = AuthHandler()
        with pytest.raises(ValueError):
            handler.set_api_key()


class TestAuthHandlerBasic:
    def test_set_basic_auth(self):
        handler = AuthHandler()
        handler.set_basic_auth("user", "pass")
        assert handler.auth_type == "basic"
        assert handler.credentials["username"] == "user"
        assert handler.credentials["password"] == "pass"

    def test_basic_auth_tuple(self):
        handler = AuthHandler()
        handler.set_basic_auth("user", "pass")
        assert handler.get_basic_auth_tuple() == ("user", "pass")

    def test_basic_auth_headers_empty(self):
        """Basic auth returns empty headers (handled by requests library)."""
        handler = AuthHandler()
        handler.set_basic_auth("user", "pass")
        assert handler.get_auth_headers() == {}

    def test_non_basic_auth_tuple_none(self):
        handler = AuthHandler()
        handler.set_bearer_token(token="tok")
        assert handler.get_basic_auth_tuple() is None


class TestAuthHandlerState:
    def test_initial_state(self):
        handler = AuthHandler()
        assert handler.auth_type is None
        assert handler.credentials == {}
        assert not handler.is_configured()
        assert handler.get_auth_type() is None

    def test_is_configured_after_setup(self):
        handler = AuthHandler()
        handler.set_bearer_token(token="tok")
        assert handler.is_configured()

    def test_get_auth_type(self):
        handler = AuthHandler()
        handler.set_bearer_token(token="tok")
        assert handler.get_auth_type() == "bearer"

    def test_unconfigured_headers_empty(self):
        handler = AuthHandler()
        assert handler.get_auth_headers() == {}


class TestCreateAuthFromConfig:
    def test_bearer_config(self):
        config = {"type": "bearer", "token": "my-token"}
        handler = create_auth_from_config(config)
        assert handler is not None
        assert handler.get_auth_type() == "bearer"
        assert handler.get_auth_headers() == {"Authorization": "Bearer my-token"}

    def test_api_key_config(self):
        config = {"type": "api_key", "api_key": "key123", "header_name": "X-Custom"}
        handler = create_auth_from_config(config)
        assert handler is not None
        assert handler.get_auth_headers() == {"X-Custom": "key123"}

    def test_basic_config(self):
        config = {"type": "basic", "username": "user", "password": "pass"}
        handler = create_auth_from_config(config)
        assert handler is not None
        assert handler.get_basic_auth_tuple() == ("user", "pass")

    def test_unknown_type_returns_none(self):
        config = {"type": "oauth2"}
        handler = create_auth_from_config(config)
        assert handler is None

    def test_empty_config_returns_none(self):
        assert create_auth_from_config({}) is None
        assert create_auth_from_config(None) is None

    def test_invalid_bearer_env_returns_none(self):
        config = {"type": "bearer", "token_env": "NONEXISTENT_XYZ"}
        handler = create_auth_from_config(config)
        assert handler is None
