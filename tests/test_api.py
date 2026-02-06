"""
Tests for FastAPI API server endpoints.
Uses httpx + FastAPI TestClient.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from src.api_server import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "api-watch-server"


class TestRootEndpoint:
    def test_root(self, client):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "API-Watch Server"
        assert data["status"] == "running"
        assert data["version"] == "1.0.0"
        assert "/api/execute-request" in data["endpoints"]
        assert "/api/execute-suite" in data["endpoints"]
        assert "/health" in data["endpoints"]


class TestExecuteRequest:
    def test_valid_get_request(self, client):
        """Test executing a GET request against a public API."""
        response = client.post(
            "/api/execute-request",
            json={
                "method": "GET",
                "url": "https://httpbin.org/get",
                "timeout": 15,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["request_method"] == "GET"
        assert data["request_url"] == "https://httpbin.org/get"
        # httpbin should return 200
        assert data["success"] is True
        assert data["status_code"] == 200
        assert data["response_time"] > 0

    def test_invalid_url(self, client):
        """Test request to invalid/unreachable URL returns result (not crash)."""
        response = client.post(
            "/api/execute-request",
            json={
                "method": "GET",
                "url": "https://this-domain-definitely-does-not-exist-xyz123.com",
                "timeout": 3,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["error_type"] in ("CONNECTION_ERROR", "TIMEOUT", "REQUEST_ERROR")

    def test_post_request(self, client):
        """Test POST request with JSON body."""
        response = client.post(
            "/api/execute-request",
            json={
                "method": "POST",
                "url": "https://httpbin.org/post",
                "body": {"name": "test", "value": 42},
                "headers": {"Content-Type": "application/json"},
                "timeout": 15,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["request_method"] == "POST"
        assert data["success"] is True

    def test_missing_url(self, client):
        """Test that missing required field returns validation error."""
        response = client.post(
            "/api/execute-request",
            json={"method": "GET"},
        )
        assert response.status_code == 422  # Pydantic validation error


class TestExecuteSuite:
    def test_simple_suite(self, client):
        """Test executing a minimal test suite."""
        response = client.post(
            "/api/execute-suite",
            json={
                "name": "Test Suite",
                "base_url": "https://httpbin.org",
                "tests": [
                    {
                        "id": "test-1",
                        "method": "GET",
                        "path": "/get",
                        "description": "Simple GET",
                        "timeout_seconds": 15,
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["success"] is True
        assert data[0]["status_code"] == 200

    def test_multi_test_suite(self, client):
        """Test suite with multiple tests."""
        response = client.post(
            "/api/execute-suite",
            json={
                "name": "Multi Suite",
                "base_url": "https://httpbin.org",
                "tests": [
                    {"id": "t1", "method": "GET", "path": "/get", "timeout_seconds": 15},
                    {"id": "t2", "method": "GET", "path": "/status/404", "timeout_seconds": 15},
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # First should succeed, second should be a 404
        assert data[0]["success"] is True
        assert data[1]["success"] is False
        assert data[1]["status_code"] == 404


class TestDiagnoseEndpoint:
    def test_diagnose_success(self, client):
        """Test diagnosing a successful result."""
        response = client.post(
            "/api/diagnose",
            json={
                "success": True,
                "status_code": 200,
                "response_time": 0.5,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "success"
        assert "Successful" in data["issue"]

    def test_diagnose_401(self, client):
        """Test diagnosing a 401 result."""
        response = client.post(
            "/api/diagnose",
            json={
                "success": False,
                "status_code": 401,
                "response_time": 0.1,
                "error": "HTTP 401",
                "error_type": "HTTP_ERROR",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "auth"
        assert data["severity"] == "critical"

    def test_diagnose_timeout(self, client):
        """Test diagnosing a timeout error."""
        response = client.post(
            "/api/diagnose",
            json={
                "success": False,
                "response_time": 10.0,
                "error": "Request timeout",
                "error_type": "TIMEOUT",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "network"


class TestStatsEndpoint:
    def test_stats_with_results(self, client):
        """Test stats calculation from result list."""
        response = client.post(
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
        assert data["failed"] == 1
        assert data["success_rate"] == pytest.approx(66.67, abs=0.1)

    def test_stats_empty(self, client):
        """Test stats with empty results."""
        response = client.post("/api/stats", json=[])
        assert response.status_code == 200
        data = response.json()
        assert data["total_requests"] == 0
        assert data["success_rate"] == 0


class TestWebhookEndpoint:
    def test_webhook_post(self, client):
        """Test webhook catch-all receives POST."""
        response = client.post(
            "/webhook/test-hook",
            json={"event": "test", "data": {"id": 1}},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "received"
        assert "timestamp" in data

    def test_webhook_get(self, client):
        """Test webhook catch-all receives GET."""
        response = client.get("/webhook/ping")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "received"

    def test_webhook_root(self, client):
        """Test webhook at root /webhook path."""
        response = client.post("/webhook", json={"test": True})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "received"
