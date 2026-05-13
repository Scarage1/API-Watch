"""
Phase 6 tests — Advanced Auth & Protocol Gaps.

Covers:
  - OAuth 2.0 PKCE code verifier / challenge generation
  - OAuth authorization URL builder
  - OAuth route input validation
  - Cookie jar: capture from Set-Cookie headers
  - Cookie jar: domain-scoped matching
  - Cookie jar: expiry / purging
  - Cookie jar: set / delete / clear / list
  - Runner body_type handling (json, form-urlencoded, form-data, raw, xml, graphql, none)
  - Runner cookie integration (inject + capture)
"""

import base64
import hashlib
import re
import time

import pytest
from httpx import AsyncClient

from src.cookie_jar import Cookie, get_cookie_store, reset_cookie_store

# ── Import application modules ────────────────────────────────────────────────
from src.oauth_handler import (
    OAuthTokenResult,
    build_authorization_url,
    generate_code_challenge,
    generate_code_verifier,
)
from src.runner import APIRunner, RequestConfig

# ══════════════════════════════════════════════════════════════════════════════
# OAuth 2.0 PKCE helpers
# ══════════════════════════════════════════════════════════════════════════════


class TestOAuthPKCE:
    """Unit tests for PKCE verifier / challenge generation."""

    def test_generate_code_verifier_default_length(self):
        verifier = generate_code_verifier()
        assert isinstance(verifier, str)
        assert len(verifier) >= 43  # Base64url of 64 bytes >= 43 chars
        assert re.match(r"^[A-Za-z0-9_-]+$", verifier), "Verifier must be base64url"

    def test_generate_code_verifier_custom_length(self):
        v32 = generate_code_verifier(32)
        v128 = generate_code_verifier(128)
        assert len(v32) != len(v128)
        assert re.match(r"^[A-Za-z0-9_-]+$", v32)
        assert re.match(r"^[A-Za-z0-9_-]+$", v128)

    def test_generate_code_verifier_uniqueness(self):
        verifiers = {generate_code_verifier() for _ in range(20)}
        assert len(verifiers) == 20, "Each verifier must be unique"

    def test_generate_code_challenge_s256(self):
        verifier = generate_code_verifier()
        challenge = generate_code_challenge(verifier)
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        assert challenge == expected

    def test_generate_code_challenge_deterministic(self):
        verifier = "fixed_test_verifier_string"
        c1 = generate_code_challenge(verifier)
        c2 = generate_code_challenge(verifier)
        assert c1 == c2

    def test_code_challenge_format(self):
        challenge = generate_code_challenge(generate_code_verifier())
        assert re.match(r"^[A-Za-z0-9_-]+$", challenge), "Challenge must be base64url (no padding)"
        assert "=" not in challenge, "Challenge must not have padding"


# ══════════════════════════════════════════════════════════════════════════════
# OAuth Authorization URL
# ══════════════════════════════════════════════════════════════════════════════


class TestOAuthAuthorizationUrl:
    """Tests for building OAuth authorization URLs."""

    def test_build_authorization_url_basic(self):
        url = build_authorization_url(
            auth_url="https://auth.example.com/authorize",
            client_id="myapp",
            redirect_uri="http://localhost:8000/callback",
            scope="openid profile",
        )
        assert "https://auth.example.com/authorize" in url
        assert "client_id=myapp" in url
        assert "redirect_uri=" in url
        assert "scope=openid" in url
        assert "response_type=code" in url

    def test_build_authorization_url_with_pkce(self):
        challenge = generate_code_challenge(generate_code_verifier())
        url = build_authorization_url(
            auth_url="https://auth.example.com/authorize",
            client_id="myapp",
            redirect_uri="http://localhost:8000/callback",
            code_challenge=challenge,
        )
        assert f"code_challenge={challenge}" in url
        assert "code_challenge_method=S256" in url

    def test_build_authorization_url_with_state(self):
        url = build_authorization_url(
            auth_url="https://auth.example.com/authorize",
            client_id="myapp",
            redirect_uri="http://localhost:8000/callback",
            state="random-state-123",
        )
        assert "state=random-state-123" in url


# ══════════════════════════════════════════════════════════════════════════════
# OAuth Routes (input validation via FastAPI test client)
# ══════════════════════════════════════════════════════════════════════════════


class TestOAuthRoutes:
    """Integration tests for OAuth proxy routes."""

    @pytest.mark.asyncio
    async def test_pkce_endpoint(self, client: AsyncClient):
        """POST /api/v1/oauth/pkce should return verifier + challenge."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "oauth1@test.dev", "username": "oauthuser1", "password": "TestPass123"},
        )
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.post("/api/v1/oauth/pkce", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "code_verifier" in data
        assert "code_challenge" in data
        # Verify the challenge matches the verifier
        expected_challenge = generate_code_challenge(data["code_verifier"])
        assert data["code_challenge"] == expected_challenge

    @pytest.mark.asyncio
    async def test_pkce_accessible_without_auth(self, client: AsyncClient):
        """In open-source mode, PKCE endpoint is accessible without auth."""
        res = await client.post("/api/v1/oauth/pkce")
        assert res.status_code not in (401, 403)

    @pytest.mark.asyncio
    async def test_authorize_url_endpoint(self, client: AsyncClient):
        """POST /api/v1/oauth/authorize-url builds a redirect URL."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "oauth2@test.dev", "username": "oauthuser2", "password": "TestPass123"},
        )
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.post(
            "/api/v1/oauth/authorize-url",
            headers=headers,
            json={
                "auth_url": "https://auth.example.com/authorize",
                "client_id": "testapp",
                "redirect_uri": "http://localhost/callback",
                "scope": "openid",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "url" in data
        assert "testapp" in data["url"]

    @pytest.mark.asyncio
    async def test_token_endpoint_missing_fields(self, client: AsyncClient):
        """Token exchange should 422 on missing required fields."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "oauth3@test.dev", "username": "oauthuser3", "password": "TestPass123"},
        )
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.post(
            "/api/v1/oauth/token/authorization-code",
            headers=headers,
            json={"code": "abc"},  # missing token_url, client_id, redirect_uri
        )
        assert res.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# Cookie Jar — CookieStore
# ══════════════════════════════════════════════════════════════════════════════


class TestCookieStore:
    """Unit tests for CookieStore."""

    def setup_method(self):
        reset_cookie_store()
        self.store = get_cookie_store()

    # ── set / get ─────────────────────────────────────────────────────────

    def test_set_and_get_cookie(self):
        self.store.set_cookie("session", "abc123", domain="example.com")
        cookies = self.store.get_cookies_for_url("https://example.com/path")
        assert len(cookies) == 1
        assert "session" in cookies
        assert cookies["session"] == "abc123"

    def test_domain_scoping(self):
        self.store.set_cookie("a", "1", domain="example.com")
        self.store.set_cookie("b", "2", domain="other.com")
        cookies = self.store.get_cookies_for_url("https://example.com/")
        assert "a" in cookies
        assert "b" not in cookies

    def test_path_scoping(self):
        self.store.set_cookie("a", "1", domain="example.com", path="/api")
        match = self.store.get_cookies_for_url("https://example.com/api/v1")
        no_match = self.store.get_cookies_for_url("https://example.com/other")
        assert len(match) == 1
        assert len(no_match) == 0

    def test_subdomain_matching(self):
        self.store.set_cookie("sid", "x", domain=".example.com")
        cookies = self.store.get_cookies_for_url("https://api.example.com/test")
        assert len(cookies) == 1

    # ── Cookie header ────────────────────────────────────────────────────

    def test_get_cookie_header(self):
        self.store.set_cookie("a", "1", domain="example.com")
        self.store.set_cookie("b", "2", domain="example.com")
        header = self.store.get_cookie_header("https://example.com/")
        assert header is not None
        assert "a=1" in header
        assert "b=2" in header

    def test_get_cookie_header_empty(self):
        header = self.store.get_cookie_header("https://example.com/")
        assert header is None

    # ── capture_from_headers ─────────────────────────────────────────────

    def test_capture_from_set_cookie(self):
        headers = {"set-cookie": "token=xyz; Path=/; Domain=example.com; Secure; HttpOnly"}
        count = self.store.capture_from_headers("https://example.com", headers)
        assert count >= 1
        cookies = self.store.get_cookies_for_url("https://example.com/")
        assert "token" in cookies
        assert cookies["token"] == "xyz"

    # ── Expiry ───────────────────────────────────────────────────────────

    def test_expired_cookie_excluded(self):
        self.store.set_cookie("old", "val", domain="example.com", expires=1.0)
        cookies = self.store.get_cookies_for_url("https://example.com/")
        assert len(cookies) == 0

    def test_future_expiry_included(self):
        self.store.set_cookie("fresh", "val", domain="example.com", expires=time.time() + 3600)
        cookies = self.store.get_cookies_for_url("https://example.com/")
        assert len(cookies) == 1

    # ── delete / clear / list_all ─────────────────────────────────────────

    def test_delete_cookie(self):
        self.store.set_cookie("x", "1", domain="example.com")
        self.store.delete_cookie("x", domain="example.com")
        cookies = self.store.get_cookies_for_url("https://example.com/")
        assert len(cookies) == 0

    def test_clear_all(self):
        self.store.set_cookie("a", "1", domain="example.com")
        self.store.set_cookie("b", "2", domain="other.com")
        self.store.clear()
        assert len(self.store.list_all()) == 0

    def test_list_all(self):
        self.store.set_cookie("a", "1", domain="example.com")
        self.store.set_cookie("b", "2", domain="other.com")
        all_cookies = self.store.list_all()
        assert len(all_cookies) == 2

    # ── Upsert (same name + domain replaces) ─────────────────────────────

    def test_upsert_replaces(self):
        self.store.set_cookie("token", "v1", domain="example.com")
        self.store.set_cookie("token", "v2", domain="example.com")
        cookies = self.store.get_cookies_for_url("https://example.com/")
        assert len(cookies) == 1
        assert cookies["token"] == "v2"


# ══════════════════════════════════════════════════════════════════════════════
# Cookie — dataclass unit tests
# ══════════════════════════════════════════════════════════════════════════════


class TestCookieDataclass:
    """Unit tests for the Cookie dataclass."""

    def test_is_expired_no_expiry(self):
        c = Cookie(name="a", value="1", domain="example.com")
        assert c.is_expired is False

    def test_is_expired_future(self):
        c = Cookie(name="a", value="1", domain="example.com", expires=time.time() + 3600)
        assert c.is_expired is False

    def test_is_expired_past(self):
        c = Cookie(name="a", value="1", domain="example.com", expires=1.0)
        assert c.is_expired is True

    def test_matches_url_basic(self):
        c = Cookie(name="a", value="1", domain="example.com", path="/")
        assert c.matches_url("https://example.com/anything") is True
        assert c.matches_url("https://other.com/anything") is False

    def test_matches_url_secure(self):
        c = Cookie(name="a", value="1", domain="example.com", secure=True)
        assert c.matches_url("https://example.com/") is True
        assert c.matches_url("http://example.com/") is False


# ══════════════════════════════════════════════════════════════════════════════
# Runner — RequestConfig body_type handling (via TestRunner static methods)
# ══════════════════════════════════════════════════════════════════════════════


class TestRequestConfigBodyType:
    """Tests for RequestConfig body_type field and _build_body_kwargs."""

    def test_default_body_type_is_json(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"key": "value"},
        )
        assert cfg.body_type == "json"

    def test_body_type_none_skips_body(self):
        cfg = RequestConfig(
            method="GET",
            url="https://httpbin.org/get",
            body_type="none",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert kwargs == {}

    def test_body_type_json(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"name": "test"},
            body_type="json",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert "json" in kwargs
        assert kwargs["json"]["name"] == "test"

    def test_body_type_form_urlencoded(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"field": "value"},
            body_type="form-urlencoded",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert "data" in kwargs

    def test_body_type_raw(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body="raw text content",
            body_type="raw",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert "data" in kwargs
        assert kwargs["data"] == "raw text content"

    def test_body_type_xml(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body="<root><item>1</item></root>",
            body_type="xml",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert "data" in kwargs

    def test_body_type_graphql_dict(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"query": "{ users { id } }", "variables": {}},
            body_type="graphql",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert "data" in kwargs

    def test_body_type_form_data(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"file_field": "content"},
            body_type="form-data",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert "files" in kwargs

    def test_use_cookies_default_true(self):
        cfg = RequestConfig(method="GET", url="https://httpbin.org/get")
        assert cfg.use_cookies is True

    def test_use_cookies_can_disable(self):
        cfg = RequestConfig(method="GET", url="https://httpbin.org/get", use_cookies=False)
        assert cfg.use_cookies is False

    def test_body_none_returns_empty(self):
        cfg = RequestConfig(
            method="GET",
            url="https://httpbin.org/get",
            body=None,
            body_type="json",
        )
        kwargs = APIRunner._build_body_kwargs(cfg)
        assert kwargs == {}


# ══════════════════════════════════════════════════════════════════════════════
# Runner — HTTPX body kwargs (async path)
# ══════════════════════════════════════════════════════════════════════════════


class TestBuildBodyKwargsHttpx:
    """Tests for _build_body_kwargs_httpx used in async execution."""

    def test_json_body(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"key": "val"},
            body_type="json",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert "json" in kwargs

    def test_raw_body(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body="hello",
            body_type="raw",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert "content" in kwargs
        assert kwargs["content"] == "hello"

    def test_form_urlencoded_body(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"a": "1"},
            body_type="form-urlencoded",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert "data" in kwargs

    def test_none_body(self):
        cfg = RequestConfig(
            method="GET",
            url="https://httpbin.org/get",
            body_type="none",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert kwargs == {}

    def test_graphql_body(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"query": "{ me { name } }"},
            body_type="graphql",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert "content" in kwargs

    def test_form_data_body(self):
        cfg = RequestConfig(
            method="POST",
            url="https://httpbin.org/post",
            body={"field": "val"},
            body_type="form-data",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert "files" in kwargs

    def test_body_none_returns_empty(self):
        cfg = RequestConfig(
            method="GET",
            url="https://httpbin.org/get",
            body=None,
            body_type="json",
        )
        kwargs = APIRunner._build_body_kwargs_httpx(cfg)
        assert kwargs == {}


# ══════════════════════════════════════════════════════════════════════════════
# OAuth handler — OAuthTokenResult
# ══════════════════════════════════════════════════════════════════════════════


class TestOAuthTokenResult:
    """Tests for the OAuthTokenResult dataclass."""

    def test_success_result(self):
        result = OAuthTokenResult(
            success=True,
            access_token="tok123",
            token_type="Bearer",
        )
        assert result.success is True
        assert result.access_token == "tok123"
        assert result.refresh_token is None
        assert result.error is None

    def test_error_result(self):
        result = OAuthTokenResult(
            success=False,
            error="invalid_grant",
            error_description="The authorization code has expired.",
        )
        assert result.success is False
        assert result.access_token is None
        assert result.error == "invalid_grant"

    def test_raw_response_dict(self):
        raw = {"access_token": "abc", "token_type": "bearer", "custom": "field"}
        result = OAuthTokenResult(
            success=True,
            access_token="abc",
            token_type="bearer",
            raw_response=raw,
        )
        assert result.raw_response["custom"] == "field"


# ══════════════════════════════════════════════════════════════════════════════
# Module singleton
# ══════════════════════════════════════════════════════════════════════════════


class TestCookieStoreSingleton:
    """Tests for cookie_jar module-level singleton."""

    def test_singleton_identity(self):
        reset_cookie_store()
        a = get_cookie_store()
        b = get_cookie_store()
        assert a is b

    def test_reset_creates_new_store(self):
        a = get_cookie_store()
        a.set_cookie("x", "1", domain="example.com")
        reset_cookie_store()
        b = get_cookie_store()
        assert len(b.list_all()) == 0
        assert a is not b
