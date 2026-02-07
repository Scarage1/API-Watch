"""
Shared pytest fixtures and configuration.
"""
import sys
import os
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

# Use in-memory SQLite for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
# Disable rate limiting during tests
os.environ["TESTING"] = "true"
# Set JWT secret for tests (must be set before importing jwt_auth)
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-for-testing-only"
# Set CORS origins for tests
os.environ["CORS_ALLOWED_ORIGINS"] = "http://test,http://localhost:5173"

import pytest
import pytest_asyncio
import asyncio
from httpx import AsyncClient, ASGITransport

from src.database import engine, Base
from src.api_server import app


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create tables before each test and drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    """Async HTTP test client for FastAPI."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient):
    """Client with a pre-registered and authenticated user. Returns (client, token, user)."""
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "test@apiwatch.dev", "username": "testuser", "password": "TestPass123"},
    )
    data = res.json()
    token = data["access_token"]
    user = data["user"]

    client.headers["Authorization"] = f"Bearer {token}"
    return client, token, user
