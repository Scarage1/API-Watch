"""
Phase 1A security hardening tests.
Tests for SEC-01 through SEC-20 fixes.
"""
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from httpx import AsyncClient


# ───────────── SEC-01: JWT Secret Key Required ─────────────

class TestJWTSecretEnforcement:
    def test_secret_key_is_not_hardcoded_default(self):
        """SEC-01: Verify the hardcoded fallback 'api-watch-dev-secret-change-in-production' is gone."""
        from src.jwt_auth import SECRET_KEY
        assert SECRET_KEY != "api-watch-dev-secret-change-in-production"
        assert len(SECRET_KEY) > 10  # must be non-trivial


# ───────────── SEC-02: CORS Configuration ─────────────

class TestCORSConfiguration:
    def test_cors_not_wildcard(self):
        """SEC-02: CORS should not use wildcard origins."""
        from src.api_server import CORS_ORIGINS
        assert "*" not in CORS_ORIGINS

    def test_cors_reads_from_env(self):
        """SEC-02: CORS origins should be configurable via environment."""
        from src.api_server import CORS_ORIGINS
        assert isinstance(CORS_ORIGINS, list)
        assert len(CORS_ORIGINS) > 0


# ───────────── SEC-03/04: Auth Required on Legacy Endpoints ─────────────

class TestLegacyEndpointAuth:
    @pytest.mark.asyncio
    async def test_execute_request_401_without_auth(self, client: AsyncClient):
        """SEC-03: /api/execute-request must require authentication."""
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "https://httpbin.org/get"},
        )
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_execute_suite_401_without_auth(self, client: AsyncClient):
        """SEC-04: /api/execute-suite must require authentication."""
        res = await client.post(
            "/api/execute-suite",
            json={
                "name": "Test",
                "base_url": "https://httpbin.org",
                "tests": [{"id": "t1", "method": "GET", "path": "/get"}],
            },
        )
        assert res.status_code == 401


# ───────────── SEC-06: Password Validation ─────────────

class TestPasswordValidation:
    @pytest.mark.asyncio
    async def test_short_password_rejected(self, client: AsyncClient):
        """SEC-06: Passwords shorter than 8 characters must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "short@test.com", "username": "shortpw", "password": "Abc1"},
        )
        assert res.status_code == 422
        assert "8 characters" in str(res.json())

    @pytest.mark.asyncio
    async def test_no_uppercase_rejected(self, client: AsyncClient):
        """SEC-06: Passwords without uppercase must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "noup@test.com", "username": "noupcase", "password": "lowercase1"},
        )
        assert res.status_code == 422
        assert "uppercase" in str(res.json()).lower()

    @pytest.mark.asyncio
    async def test_no_digit_rejected(self, client: AsyncClient):
        """SEC-06: Passwords without digits must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "nodigit@test.com", "username": "nodigits", "password": "NoDigitHere"},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_no_lowercase_rejected(self, client: AsyncClient):
        """SEC-06: Passwords without lowercase must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "nolow@test.com", "username": "nolower", "password": "UPPERCASE1"},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_password_accepted(self, client: AsyncClient):
        """SEC-06: A password meeting all requirements should be accepted."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "valid@test.com", "username": "validpw", "password": "ValidPass1"},
        )
        assert res.status_code == 201


# ───────────── SEC-07: Email Validation ─────────────

class TestEmailValidation:
    @pytest.mark.asyncio
    async def test_invalid_email_rejected(self, client: AsyncClient):
        """SEC-07: Invalid email format must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "not-an-email", "username": "bademail", "password": "ValidPass1"},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_email_no_domain_rejected(self, client: AsyncClient):
        """SEC-07: Email without domain must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "user@", "username": "nodomain", "password": "ValidPass1"},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_email_accepted(self, client: AsyncClient):
        """SEC-07: Valid email format should be accepted."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "good@example.com", "username": "goodemail", "password": "ValidPass1"},
        )
        assert res.status_code == 201

    @pytest.mark.asyncio
    async def test_email_normalised_lowercase(self, client: AsyncClient):
        """SEC-07: Email should be normalised to lowercase."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "MiXeD@Example.COM", "username": "mixedemail", "password": "ValidPass1"},
        )
        assert res.status_code == 201
        assert res.json()["user"]["email"] == "mixed@example.com"


# ───────────── Username Validation ─────────────

class TestUsernameValidation:
    @pytest.mark.asyncio
    async def test_short_username_rejected(self, client: AsyncClient):
        """Username shorter than 3 characters must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "shortu@test.com", "username": "ab", "password": "ValidPass1"},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_special_chars_rejected(self, client: AsyncClient):
        """Username with special chars (spaces, @, etc.) must be rejected."""
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "special@test.com", "username": "bad user!", "password": "ValidPass1"},
        )
        assert res.status_code == 422


# ───────────── SSRF Protection ─────────────

class TestSSRFProtection:
    @pytest.mark.asyncio
    async def test_ssrf_localhost_blocked(self, auth_client):
        """Requests to localhost must be blocked."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "http://localhost:8080/internal"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_ssrf_127001_blocked(self, auth_client):
        """Requests to 127.0.0.1 must be blocked."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "http://127.0.0.1:3000/secret"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_ssrf_private_10x_blocked(self, auth_client):
        """Requests to 10.x.x.x must be blocked."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "http://10.0.0.1/admin"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_ssrf_private_192168_blocked(self, auth_client):
        """Requests to 192.168.x.x must be blocked."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "http://192.168.1.1/router"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_ssrf_file_scheme_blocked(self, auth_client):
        """file:// scheme must be rejected."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "file:///etc/passwd"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_ssrf_ftp_scheme_blocked(self, auth_client):
        """ftp:// scheme must be rejected."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "ftp://evil.com/data"},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_ssrf_public_url_allowed(self, auth_client):
        """Public URLs should still work normally."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "https://httpbin.org/get", "timeout": 15},
        )
        assert res.status_code == 200
        assert res.json()["success"] is True

    @pytest.mark.asyncio
    async def test_ssrf_suite_base_url_validated(self, auth_client):
        """Suite base_url must also be validated."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/execute-suite",
            json={
                "name": "Evil Suite",
                "base_url": "http://localhost:3000",
                "tests": [{"id": "t1", "method": "GET", "path": "/secret"}],
            },
        )
        assert res.status_code == 400


# ───────────── SEC-13: Mock exclude_unset Fix ─────────────

class TestMockExcludeUnset:
    @pytest.mark.asyncio
    async def test_update_mock_can_set_null_description(self, auth_client):
        """SEC-13: Setting description to None should work with exclude_unset."""
        client, _, _ = auth_client
        # Create mock with description
        create_res = await client.post(
            "/api/v1/mock/endpoints",
            json={
                "name": "Test Mock",
                "method": "GET",
                "path": "/test-null",
                "status_code": 200,
                "description": "Original description",
            },
        )
        assert create_res.status_code == 201
        mock_id = create_res.json()["id"]

        # Update: explicitly set description to null
        update_res = await client.put(
            f"/api/v1/mock/endpoints/{mock_id}",
            json={"description": None},
        )
        assert update_res.status_code == 200
        # With exclude_unset, explicitly sending null should be applied
        assert update_res.json()["description"] is None


# ───────────── SEC-11: Datetime Timezone Awareness ─────────────

class TestDatetimeTimezone:
    def test_models_use_utcnow_replacement(self):
        """SEC-11: Models should use _utcnow() not datetime.utcnow()."""
        from src.models import _utcnow
        from datetime import timezone
        now = _utcnow()
        assert now.tzinfo is not None
        assert now.tzinfo == timezone.utc

    @pytest.mark.asyncio
    async def test_created_at_has_value(self, auth_client):
        """Newly created resources should have valid created_at timestamps."""
        client, _, _ = auth_client
        res = await client.post(
            "/api/v1/collections",
            json={"name": "Timezone Test"},
        )
        assert res.status_code == 201
        assert res.json()["created_at"] is not None


# ───────────── SEC-20: Dead Code Removed ─────────────

class TestDeadCodeRemoved:
    def test_webhook_server_deleted(self):
        """SEC-20: src/webhook_server.py should no longer exist."""
        assert not Path("src/webhook_server.py").exists()


# ───────────── Webhook Endpoint Still Works ─────────────

class TestWebhookSanitisation:
    @pytest.mark.asyncio
    async def test_webhook_still_works(self, client: AsyncClient):
        """Webhook receiver should still function after security fixes."""
        res = await client.post("/webhook/test", json={"event": "ping"})
        assert res.status_code == 200
        assert res.json()["status"] == "received"
