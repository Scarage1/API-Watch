"""
Import/Export routes — upload Postman collections, export as Postman or OpenAPI.
"""
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import User, Collection, SavedRequest, ActivityLog, ActivityAction
from ..jwt_auth import get_current_user_or_apikey as get_current_user
from ..rbac import get_workspace_id

router = APIRouter(prefix="/import-export", tags=["Import/Export"])


# ── Import ────────────────────────────────────────────────────────────────────

@router.post("/import/postman", status_code=201)
async def import_postman(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Import a Postman Collection v2.1 JSON file."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a .json file")

    try:
        content = await file.read()
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    # Validate it looks like a Postman collection
    if "info" not in data or "item" not in data:
        raise HTTPException(
            status_code=400,
            detail="File does not appear to be a Postman Collection v2.1 (missing 'info' or 'item')",
        )

    from ..importers.postman_v2 import import_postman_v2

    parsed = import_postman_v2(data)

    # Create collection
    collection = Collection(
        name=parsed["name"],
        description=parsed.get("description"),
        owner_id=user.id,
        workspace_id=workspace_id,
    )
    db.add(collection)
    await db.flush()

    # Create requests
    for req_data in parsed["requests"]:
        saved = SavedRequest(
            name=req_data["name"],
            method=req_data["method"],
            url=req_data["url"],
            headers=req_data.get("headers", {}),
            params=req_data.get("params", {}),
            body=req_data.get("body"),
            body_type=req_data.get("body_type", "none"),
            auth_config=req_data.get("auth_config"),
            timeout=req_data.get("timeout", 10),
            sort_order=req_data.get("sort_order", 0),
            collection_id=collection.id,
        )
        db.add(saved)

    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.CREATED, resource_type="collection",
        resource_id=collection.id, resource_name=f"[Imported] {parsed['name']}",
    )
    db.add(log)

    await db.commit()
    await db.refresh(collection)

    return {
        "id": collection.id,
        "name": collection.name,
        "request_count": len(parsed["requests"]),
        "message": f"Imported {len(parsed['requests'])} requests from Postman collection",
    }


# ── Export Postman ────────────────────────────────────────────────────────────

@router.get("/export/postman/{collection_id}")
async def export_postman(
    collection_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Export a collection as Postman Collection v2.1 JSON."""
    collection = await _load_collection(db, collection_id, user, workspace_id)

    from ..importers.postman_v2 import export_postman_v2

    requests_data = [
        {
            "name": r.name,
            "method": r.method,
            "url": r.url,
            "headers": r.headers or {},
            "params": r.params or {},
            "body": r.body,
            "body_type": r.body_type,
            "auth_config": r.auth_config,
            "sort_order": r.sort_order,
        }
        for r in sorted(collection.requests, key=lambda x: x.sort_order)
    ]

    result = export_postman_v2(collection.name, collection.description, requests_data)
    return result


# ── Export OpenAPI ────────────────────────────────────────────────────────────

@router.get("/export/openapi/{collection_id}")
async def export_openapi(
    collection_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Export a collection as OpenAPI 3.0.3 specification."""
    collection = await _load_collection(db, collection_id, user, workspace_id)

    from ..importers.openapi_export import export_openapi as _export

    requests_data = [
        {
            "name": r.name,
            "method": r.method,
            "url": r.url,
            "headers": r.headers or {},
            "params": r.params or {},
            "body": r.body,
            "body_type": r.body_type,
            "auth_config": r.auth_config,
            "sort_order": r.sort_order,
        }
        for r in sorted(collection.requests, key=lambda x: x.sort_order)
    ]

    result = _export(collection.name, collection.description, requests_data)
    return result


# ── Export JUnit ──────────────────────────────────────────────────────────────

@router.get("/export/junit/{monitor_id}/runs/{run_id}")
async def export_junit(
    monitor_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Export a monitor run as JUnit XML (for CI pipeline integration)."""
    from ..models import Monitor, MonitorRun
    from fastapi.responses import Response

    # Verify access
    query = select(Monitor).where(Monitor.id == monitor_id)
    if workspace_id:
        query = query.where(Monitor.workspace_id == workspace_id)
    else:
        query = query.where(Monitor.owner_id == user.id)
    result = await db.execute(query)
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    run_q = select(MonitorRun).where(
        MonitorRun.id == run_id, MonitorRun.monitor_id == monitor_id,
    )
    result = await db.execute(run_q)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    from ..junit_writer import monitor_run_to_junit

    xml_str = monitor_run_to_junit(monitor.name, run)
    return Response(content=xml_str, media_type="application/xml")


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _load_collection(db, collection_id: str, user, workspace_id):
    """Load a collection with requests, verifying access."""
    query = (
        select(Collection)
        .where(Collection.id == collection_id)
        .options(selectinload(Collection.requests))
    )
    if workspace_id:
        query = query.where(Collection.workspace_id == workspace_id)
    else:
        query = query.where(Collection.owner_id == user.id)
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection
