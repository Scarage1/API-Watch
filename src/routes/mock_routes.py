"""
Mock Server routes — CRUD for mock endpoints + catch-all mock responder.
Users define mock API endpoints and the server responds with predefined data.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.jwt_auth import get_current_user
from src.models import MockEndpoint, User
from src.rbac import get_workspace_id

router = APIRouter(prefix="/mock", tags=["mock"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────


class MockEndpointCreate(BaseModel):
    name: str
    description: str | None = None
    method: str = "GET"
    path: str
    status_code: int = 200
    response_body: str | None = None
    response_headers: dict | None = None
    delay_ms: int = 0
    is_active: bool = True


class MockEndpointUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    method: str | None = None
    path: str | None = None
    status_code: int | None = None
    response_body: str | None = None
    response_headers: dict | None = None
    delay_ms: int | None = None
    is_active: bool | None = None


class MockEndpointResponse(BaseModel):
    id: str
    name: str
    description: str | None
    method: str
    path: str
    status_code: int
    response_body: str | None
    response_headers: dict | None
    delay_ms: int
    is_active: bool
    hit_count: int
    created_at: str
    updated_at: str


def _to_response(mock: MockEndpoint) -> dict:
    return {
        "id": mock.id,
        "name": mock.name,
        "description": mock.description,
        "method": mock.method,
        "path": mock.path,
        "status_code": mock.status_code,
        "response_body": mock.response_body,
        "response_headers": mock.response_headers or {},
        "delay_ms": mock.delay_ms,
        "is_active": mock.is_active,
        "hit_count": mock.hit_count,
        "created_at": mock.created_at.isoformat(),
        "updated_at": mock.updated_at.isoformat(),
    }


# ── CRUD endpoints ────────────────────────────────────────────────────────────


@router.get("/endpoints", response_model=list[MockEndpointResponse])
async def list_mock_endpoints(
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List all mock endpoints for the current user/workspace."""
    query = select(MockEndpoint)
    if workspace_id:
        query = query.where(MockEndpoint.workspace_id == workspace_id)
    else:
        query = query.where(MockEndpoint.owner_id == user.id)
    query = query.order_by(MockEndpoint.created_at.desc())
    result = await db.execute(query)
    mocks = result.scalars().all()
    return [_to_response(m) for m in mocks]


@router.post("/endpoints", response_model=MockEndpointResponse, status_code=201)
async def create_mock_endpoint(
    data: MockEndpointCreate,
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new mock endpoint."""
    # Normalise path
    path = data.path if data.path.startswith("/") else f"/{data.path}"

    mock = MockEndpoint(
        name=data.name,
        description=data.description,
        method=data.method.upper(),
        path=path,
        status_code=data.status_code,
        response_body=data.response_body,
        response_headers=data.response_headers or {},
        delay_ms=data.delay_ms,
        is_active=data.is_active,
        owner_id=user.id,
        workspace_id=workspace_id,
    )
    db.add(mock)
    await db.commit()
    await db.refresh(mock)
    return _to_response(mock)


@router.put("/endpoints/{mock_id}", response_model=MockEndpointResponse)
async def update_mock_endpoint(
    mock_id: str,
    data: MockEndpointUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a mock endpoint."""
    result = await db.execute(
        select(MockEndpoint).where(MockEndpoint.id == mock_id, MockEndpoint.owner_id == user.id)
    )
    mock = result.scalar_one_or_none()
    if not mock:
        raise HTTPException(status_code=404, detail="Mock endpoint not found")

    update_data = data.model_dump(exclude_unset=True)
    if "path" in update_data:
        update_data["path"] = (
            update_data["path"]
            if update_data["path"].startswith("/")
            else f"/{update_data['path']}"
        )
    if "method" in update_data:
        update_data["method"] = update_data["method"].upper()

    for key, value in update_data.items():
        setattr(mock, key, value)

    await db.commit()
    await db.refresh(mock)
    return _to_response(mock)


@router.delete("/endpoints/{mock_id}")
async def delete_mock_endpoint(
    mock_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a mock endpoint."""
    result = await db.execute(
        select(MockEndpoint).where(MockEndpoint.id == mock_id, MockEndpoint.owner_id == user.id)
    )
    mock = result.scalar_one_or_none()
    if not mock:
        raise HTTPException(status_code=404, detail="Mock endpoint not found")

    await db.delete(mock)
    await db.commit()
    return {"detail": "Deleted"}


# ── Mock catch-all responder ──────────────────────────────────────────────────

mock_catch_router = APIRouter(tags=["mock-server"])


@mock_catch_router.api_route(
    "/mock-server/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
)
async def mock_server_catch_all(request: Request, path: str, db: AsyncSession = Depends(get_db)):
    """
    Catch-all handler: match the request method + path against active mock endpoints
    and return the predefined response. No auth required for consuming mocks.
    """
    lookup_path = f"/{path}" if not path.startswith("/") else path
    method = request.method.upper()

    result = await db.execute(
        select(MockEndpoint)
        .where(
            MockEndpoint.method == method,
            MockEndpoint.path == lookup_path,
            MockEndpoint.is_active,
        )
        .limit(1)
    )
    mock = result.scalar_one_or_none()

    if not mock:
        return JSONResponse(
            status_code=404,
            content={"error": "No mock endpoint found", "method": method, "path": lookup_path},
        )

    # Simulate latency
    if mock.delay_ms > 0:
        await asyncio.sleep(mock.delay_ms / 1000.0)

    # Increment hit count
    await db.execute(
        update(MockEndpoint)
        .where(MockEndpoint.id == mock.id)
        .values(hit_count=MockEndpoint.hit_count + 1)
    )
    await db.commit()

    # Build response
    headers = dict(mock.response_headers or {})
    headers["X-Mock-Server"] = "API-Watch"
    headers["X-Mock-Endpoint"] = mock.name

    body = mock.response_body or ""

    # Try to parse as JSON
    try:
        import json

        content = json.loads(body)
        return JSONResponse(status_code=mock.status_code, content=content, headers=headers)
    except (json.JSONDecodeError, TypeError):
        from fastapi.responses import PlainTextResponse

        return PlainTextResponse(status_code=mock.status_code, content=body, headers=headers)
