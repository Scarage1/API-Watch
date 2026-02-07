"""
Phase 8 backend tests — Mock server CRUD and catch-all.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_mock_crud_lifecycle(client: AsyncClient):
    """Test create, list, update, delete mock endpoint."""
    # Register + login
    await client.post(
        "/api/v1/auth/register",
        json={"email": "mock@test.dev", "username": "mockuser", "password": "TestPass123"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "mockuser", "password": "TestPass123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create
    res = await client.post(
        "/api/v1/mock/endpoints",
        json={
            "name": "Get Users",
            "method": "GET",
            "path": "/api/users",
            "status_code": 200,
            "response_body": '{"users": []}',
            "delay_ms": 0,
        },
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    mock_id = data["id"]
    assert data["name"] == "Get Users"
    assert data["path"] == "/api/users"
    assert data["method"] == "GET"
    assert data["status_code"] == 200
    assert data["hit_count"] == 0

    # List
    res = await client.get("/api/v1/mock/endpoints", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1

    # Update
    res = await client.put(
        f"/api/v1/mock/endpoints/{mock_id}",
        json={"status_code": 201, "name": "Create User"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status_code"] == 201
    assert res.json()["name"] == "Create User"

    # Delete
    res = await client.delete(f"/api/v1/mock/endpoints/{mock_id}", headers=headers)
    assert res.status_code == 200

    # Verify deleted
    res = await client.get("/api/v1/mock/endpoints", headers=headers)
    assert len(res.json()) == 0


@pytest.mark.asyncio
async def test_mock_catch_all_serves_response(client: AsyncClient):
    """Test that the mock catch-all handler serves predefined responses."""
    # Register + login
    await client.post(
        "/api/v1/auth/register",
        json={"email": "mockserve@test.dev", "username": "mockserve", "password": "TestPass123"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "mockserve", "password": "TestPass123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create a mock endpoint
    await client.post(
        "/api/v1/mock/endpoints",
        json={
            "name": "Mock Health",
            "method": "GET",
            "path": "/health",
            "status_code": 200,
            "response_body": '{"status": "ok", "mock": true}',
            "response_headers": {"X-Custom": "test"},
        },
        headers=headers,
    )

    # Call the mock server catch-all (no auth required)
    res = await client.get("/mock-server/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["mock"] is True
    assert res.headers.get("x-mock-server") == "API-Watch"


@pytest.mark.asyncio
async def test_mock_catch_all_404_when_no_match(client: AsyncClient):
    """Test 404 when no mock endpoint matches."""
    res = await client.get("/mock-server/nonexistent")
    assert res.status_code == 404
    assert "No mock endpoint found" in res.json()["error"]


@pytest.mark.asyncio
async def test_mock_path_normalisation(client: AsyncClient):
    """Test that paths are normalised with leading slash."""
    await client.post(
        "/api/v1/auth/register",
        json={"email": "norm@test.dev", "username": "normuser", "password": "TestPass123"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "normuser", "password": "TestPass123"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/mock/endpoints",
        json={
            "name": "No Slash",
            "method": "POST",
            "path": "api/data",  # no leading slash
            "status_code": 201,
            "response_body": '{"created": true}',
        },
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["path"] == "/api/data"  # normalized


@pytest.mark.asyncio
async def test_mock_requires_auth_for_crud(client: AsyncClient):
    """Test that CRUD operations require authentication."""
    res = await client.get("/api/v1/mock/endpoints")
    assert res.status_code in (401, 403)
