"""
Tests for FastAPI API server endpoints.
Uses httpx AsyncClient + pytest-asyncio.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from httpx import AsyncClient


# ───────────── Health & Root ─────────────

class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "api-watch-server"
        assert data["version"] == "2.0.0"


class TestRootEndpoint:
    @pytest.mark.asyncio
    async def test_root(self, client: AsyncClient):
        response = await client.get("/")
        assert response.status_code == 200
        # Root may serve SPA (index.html) or API info depending on whether frontend/dist exists
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            data = response.json()
            assert data["service"] == "API-Watch Server"
            assert data["version"] == "2.0.0"
        else:
            # SPA is being served — that's fine
            assert "text/html" in content_type


# ───────────── Auth ─────────────

class TestAuthRegister:
    @pytest.mark.asyncio
    async def test_register_success(self, client: AsyncClient):
        res = await client.post(
            "/api/v1/auth/register",
            json={"email": "new@test.com", "username": "newuser", "password": "TestPass1"},
        )
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["username"] == "newuser"

    @pytest.mark.asyncio
    async def test_register_duplicate(self, client: AsyncClient):
        payload = {"email": "dup@test.com", "username": "dupuser", "password": "TestPass1"}
        await client.post("/api/v1/auth/register", json=payload)
        res = await client.post("/api/v1/auth/register", json=payload)
        assert res.status_code == 409


class TestAuthLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/register",
            json={"email": "login@test.com", "username": "loginuser", "password": "TestPass1"},
        )
        res = await client.post(
            "/api/v1/auth/login",
            json={"username": "loginuser", "password": "TestPass1"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["user"]["username"] == "loginuser"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient):
        await client.post(
            "/api/v1/auth/register",
            json={"email": "wrong@test.com", "username": "wronguser", "password": "Correct1x"},
        )
        res = await client.post(
            "/api/v1/auth/login",
            json={"username": "wronguser", "password": "WrongPw1x"},
        )
        assert res.status_code == 401


class TestAuthRefresh:
    @pytest.mark.asyncio
    async def test_refresh_token(self, client: AsyncClient):
        reg = await client.post(
            "/api/v1/auth/register",
            json={"email": "ref@test.com", "username": "refuser", "password": "TestPass1"},
        )
        refresh = reg.json()["refresh_token"]
        res = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh},
        )
        assert res.status_code == 200
        assert "access_token" in res.json()


class TestAuthProfile:
    @pytest.mark.asyncio
    async def test_get_profile(self, auth_client):
        client, token, user = auth_client
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 200
        assert res.json()["username"] == "testuser"

    @pytest.mark.asyncio
    async def test_profile_no_token(self, client: AsyncClient):
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401


# ───────────── Collections ─────────────

class TestCollections:
    @pytest.mark.asyncio
    async def test_create_collection(self, auth_client):
        client, _, _ = auth_client
        res = await client.post(
            "/api/v1/collections",
            json={"name": "Test APIs", "description": "My collection"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Test APIs"
        assert data["request_count"] == 0

    @pytest.mark.asyncio
    async def test_list_collections(self, auth_client):
        client, _, _ = auth_client
        await client.post("/api/v1/collections", json={"name": "Col1"})
        await client.post("/api/v1/collections", json={"name": "Col2"})
        res = await client.get("/api/v1/collections")
        assert res.status_code == 200
        assert len(res.json()) == 2

    @pytest.mark.asyncio
    async def test_get_collection(self, auth_client):
        client, _, _ = auth_client
        create = await client.post("/api/v1/collections", json={"name": "Detail"})
        col_id = create.json()["id"]
        res = await client.get(f"/api/v1/collections/{col_id}")
        assert res.status_code == 200
        assert res.json()["name"] == "Detail"

    @pytest.mark.asyncio
    async def test_update_collection(self, auth_client):
        client, _, _ = auth_client
        create = await client.post("/api/v1/collections", json={"name": "Old"})
        col_id = create.json()["id"]
        res = await client.put(f"/api/v1/collections/{col_id}", json={"name": "New"})
        assert res.status_code == 200
        assert res.json()["name"] == "New"

    @pytest.mark.asyncio
    async def test_delete_collection(self, auth_client):
        client, _, _ = auth_client
        create = await client.post("/api/v1/collections", json={"name": "ToDelete"})
        col_id = create.json()["id"]
        res = await client.delete(f"/api/v1/collections/{col_id}")
        assert res.status_code == 204

    @pytest.mark.asyncio
    async def test_collections_require_auth(self, client: AsyncClient):
        res = await client.get("/api/v1/collections")
        assert res.status_code == 401


# ───────────── Saved Requests ─────────────

class TestSavedRequests:
    @pytest.mark.asyncio
    async def test_create_request(self, auth_client):
        client, _, _ = auth_client
        col = await client.post("/api/v1/collections", json={"name": "ReqCol"})
        col_id = col.json()["id"]
        res = await client.post(
            f"/api/v1/collections/{col_id}/requests",
            json={"name": "Get Users", "method": "GET", "url": "https://api.example.com/users"},
        )
        assert res.status_code == 201
        assert res.json()["name"] == "Get Users"

    @pytest.mark.asyncio
    async def test_update_request(self, auth_client):
        client, _, _ = auth_client
        col = await client.post("/api/v1/collections", json={"name": "UpdCol"})
        col_id = col.json()["id"]
        req = await client.post(
            f"/api/v1/collections/{col_id}/requests",
            json={"name": "Original", "method": "GET", "url": "https://example.com"},
        )
        req_id = req.json()["id"]
        res = await client.put(
            f"/api/v1/collections/{col_id}/requests/{req_id}",
            json={"name": "Updated", "method": "POST"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Updated"

    @pytest.mark.asyncio
    async def test_delete_request(self, auth_client):
        client, _, _ = auth_client
        col = await client.post("/api/v1/collections", json={"name": "DelCol"})
        col_id = col.json()["id"]
        req = await client.post(
            f"/api/v1/collections/{col_id}/requests",
            json={"name": "ToDelete", "method": "GET", "url": "https://example.com"},
        )
        req_id = req.json()["id"]
        res = await client.delete(f"/api/v1/collections/{col_id}/requests/{req_id}")
        assert res.status_code == 204


# ───────────── Environments ─────────────

class TestEnvironments:
    @pytest.mark.asyncio
    async def test_create_environment(self, auth_client):
        client, _, _ = auth_client
        res = await client.post(
            "/api/v1/environments",
            json={"name": "Dev", "variables": {"BASE_URL": "http://localhost:3000"}},
        )
        assert res.status_code == 201
        assert res.json()["name"] == "Dev"

    @pytest.mark.asyncio
    async def test_list_environments(self, auth_client):
        client, _, _ = auth_client
        await client.post("/api/v1/environments", json={"name": "Dev", "variables": {}})
        await client.post("/api/v1/environments", json={"name": "Prod", "variables": {}})
        res = await client.get("/api/v1/environments")
        assert res.status_code == 200
        assert len(res.json()) == 2

    @pytest.mark.asyncio
    async def test_set_active_environment(self, auth_client):
        client, _, _ = auth_client
        await client.post("/api/v1/environments", json={"name": "Dev", "is_active": True})
        res = await client.get("/api/v1/environments/active")
        assert res.status_code == 200
        assert res.json()["name"] == "Dev"

    @pytest.mark.asyncio
    async def test_delete_environment(self, auth_client):
        client, _, _ = auth_client
        create = await client.post("/api/v1/environments", json={"name": "Temp"})
        env_id = create.json()["id"]
        res = await client.delete(f"/api/v1/environments/{env_id}")
        assert res.status_code == 204


# ───────────── History ─────────────

class TestHistory:
    @pytest.mark.asyncio
    async def test_empty_history(self, auth_client):
        client, _, _ = auth_client
        res = await client.get("/api/v1/history")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_history_stats(self, auth_client):
        client, _, _ = auth_client
        res = await client.get("/api/v1/history/stats")
        assert res.status_code == 200
        data = res.json()
        assert data["total_requests"] == 0
        assert data["success_rate"] == 0


# ───────────── Legacy Endpoints ─────────────

class TestExecuteRequest:
    @pytest.mark.asyncio
    async def test_valid_get_request(self, auth_client):
        client, _, _ = auth_client
        response = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "https://httpbin.org/get", "timeout": 15},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["request_method"] == "GET"
        assert data["success"] is True
        assert data["status_code"] == 200

    @pytest.mark.asyncio
    async def test_invalid_url(self, auth_client):
        client, _, _ = auth_client
        response = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "https://this-domain-definitely-does-not-exist-xyz123.com", "timeout": 3},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["error_type"] in ("CONNECTION_ERROR", "TIMEOUT", "REQUEST_ERROR")

    @pytest.mark.asyncio
    async def test_missing_url(self, auth_client):
        client, _, _ = auth_client
        response = await client.post("/api/execute-request", json={"method": "GET"})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_execute_request_requires_auth(self, client: AsyncClient):
        """SEC-03: Unauthenticated requests must be rejected."""
        response = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "https://httpbin.org/get"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_ssrf_blocked_localhost(self, auth_client):
        """SEC-12: Requests to localhost must be blocked."""
        client, _, _ = auth_client
        response = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "http://localhost:8080/secret"},
        )
        assert response.status_code == 400
        assert "localhost" in response.json()["detail"].lower() or "loopback" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_ssrf_blocked_private_ip(self, auth_client):
        """SEC-12: Requests to private IPs must be blocked."""
        client, _, _ = auth_client
        response = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "http://192.168.1.1/admin"},
        )
        assert response.status_code == 400
        assert "private" in response.json()["detail"].lower() or "internal" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_ssrf_blocked_non_http(self, auth_client):
        """SEC-12: Non-http/https schemes must be rejected."""
        client, _, _ = auth_client
        response = await client.post(
            "/api/execute-request",
            json={"method": "GET", "url": "file:///etc/passwd"},
        )
        assert response.status_code == 400


class TestExecuteSuite:
    @pytest.mark.asyncio
    async def test_simple_suite(self, auth_client):
        client, _, _ = auth_client
        response = await client.post(
            "/api/execute-suite",
            json={
                "name": "Test Suite",
                "base_url": "https://httpbin.org",
                "tests": [
                    {"id": "test-1", "method": "GET", "path": "/get", "timeout_seconds": 15},
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["success"] is True

    @pytest.mark.asyncio
    async def test_execute_suite_requires_auth(self, client: AsyncClient):
        """SEC-04: Unauthenticated suite execution must be rejected."""
        response = await client.post(
            "/api/execute-suite",
            json={
                "name": "Test",
                "base_url": "https://httpbin.org",
                "tests": [{"id": "t1", "method": "GET", "path": "/get"}],
            },
        )
        assert response.status_code == 401


class TestDiagnoseEndpoint:
    @pytest.mark.asyncio
    async def test_diagnose_success(self, client: AsyncClient):
        response = await client.post(
            "/api/diagnose",
            json={"success": True, "status_code": 200, "response_time": 0.5},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "success"

    @pytest.mark.asyncio
    async def test_diagnose_401(self, client: AsyncClient):
        response = await client.post(
            "/api/diagnose",
            json={"success": False, "status_code": 401, "response_time": 0.1, "error": "HTTP 401", "error_type": "HTTP_ERROR"},
        )
        assert response.status_code == 200
        assert response.json()["category"] == "auth"


class TestStatsEndpoint:
    @pytest.mark.asyncio
    async def test_stats_with_results(self, client: AsyncClient):
        response = await client.post(
            "/api/stats",
            json=[
                {"success": True, "status_code": 200, "response_time": 0.1},
                {"success": True, "status_code": 200, "response_time": 0.2},
                {"success": False, "status_code": 500, "response_time": 0.5, "error": "Server Error", "error_type": "HTTP_ERROR"},
            ],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_requests"] == 3
        assert data["successful"] == 2

    @pytest.mark.asyncio
    async def test_stats_empty(self, client: AsyncClient):
        response = await client.post("/api/stats", json=[])
        assert response.status_code == 200
        assert response.json()["total_requests"] == 0


class TestWebhookEndpoint:
    @pytest.mark.asyncio
    async def test_webhook_post(self, client: AsyncClient):
        response = await client.post("/webhook/test-hook", json={"event": "test"})
        assert response.status_code == 200
        assert response.json()["status"] == "received"

    @pytest.mark.asyncio
    async def test_webhook_get(self, client: AsyncClient):
        response = await client.get("/webhook/ping")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_webhook_root(self, client: AsyncClient):
        response = await client.post("/webhook", json={"test": True})
        assert response.status_code == 200
