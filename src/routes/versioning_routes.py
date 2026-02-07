"""
Collection versioning (snapshot) routes.
Auto-snapshot on changes, list versions, restore a version.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import (
    User, Collection, SavedRequest, CollectionSnapshot,
    ActivityLog, ActivityAction,
)
from ..jwt_auth import get_current_user
from ..rbac import get_workspace_id

router = APIRouter(prefix="/collections", tags=["Versioning"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SnapshotCreate(BaseModel):
    label: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_collection(collection: Collection) -> dict:
    """Serialize a collection + requests into a JSON-safe snapshot dict."""
    return {
        "name": collection.name,
        "description": collection.description,
        "requests": [
            {
                "name": r.name,
                "description": r.description,
                "method": r.method,
                "url": r.url,
                "headers": r.headers,
                "params": r.params,
                "body": r.body,
                "body_type": r.body_type,
                "auth_config": r.auth_config,
                "timeout": r.timeout,
                "sort_order": r.sort_order,
            }
            for r in sorted(collection.requests, key=lambda x: x.sort_order)
        ],
    }


async def _get_next_version(db: AsyncSession, collection_id: str) -> int:
    """Get the next version number for a collection snapshot."""
    result = await db.execute(
        select(func.coalesce(func.max(CollectionSnapshot.version), 0))
        .where(CollectionSnapshot.collection_id == collection_id)
    )
    return result.scalar() + 1


async def _verify_collection(
    collection_id: str, user: User, db: AsyncSession, workspace_id: Optional[str] = None,
) -> Collection:
    """Load collection with requests, verifying access."""
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


# ── Create Snapshot ───────────────────────────────────────────────────────────

@router.post("/{collection_id}/snapshots", status_code=201)
async def create_snapshot(
    collection_id: str,
    body: SnapshotCreate = SnapshotCreate(),
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a snapshot of the current collection state."""
    collection = await _verify_collection(collection_id, user, db, workspace_id)

    version = await _get_next_version(db, collection_id)
    snapshot_data = _serialize_collection(collection)

    snapshot = CollectionSnapshot(
        collection_id=collection_id,
        version=version,
        label=body.label,
        snapshot_data=snapshot_data,
        created_by_id=user.id,
    )
    db.add(snapshot)

    # Activity log
    log = ActivityLog(
        workspace_id=workspace_id,
        user_id=user.id,
        action=ActivityAction.CREATED,
        resource_type="snapshot",
        resource_id=collection_id,
        resource_name=f"{collection.name} v{version}",
        details={"version": version, "label": body.label},
    )
    db.add(log)

    await db.commit()
    await db.refresh(snapshot)

    return {
        "id": snapshot.id,
        "collection_id": snapshot.collection_id,
        "version": snapshot.version,
        "label": snapshot.label,
        "request_count": len(snapshot_data["requests"]),
        "created_at": snapshot.created_at.isoformat(),
    }


# ── List Snapshots ────────────────────────────────────────────────────────────

@router.get("/{collection_id}/snapshots")
async def list_snapshots(
    collection_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List all snapshots for a collection, newest first."""
    await _verify_collection(collection_id, user, db, workspace_id)

    result = await db.execute(
        select(CollectionSnapshot)
        .where(CollectionSnapshot.collection_id == collection_id)
        .order_by(CollectionSnapshot.version.desc())
    )
    snapshots = result.scalars().all()

    return [
        {
            "id": s.id,
            "version": s.version,
            "label": s.label,
            "request_count": len(s.snapshot_data.get("requests", [])),
            "created_by_id": s.created_by_id,
            "created_at": s.created_at.isoformat(),
        }
        for s in snapshots
    ]


# ── Get Snapshot Detail ───────────────────────────────────────────────────────

@router.get("/{collection_id}/snapshots/{snapshot_id}")
async def get_snapshot(
    collection_id: str,
    snapshot_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get full snapshot data including all requests."""
    await _verify_collection(collection_id, user, db, workspace_id)

    result = await db.execute(
        select(CollectionSnapshot).where(
            CollectionSnapshot.id == snapshot_id,
            CollectionSnapshot.collection_id == collection_id,
        )
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return {
        "id": snapshot.id,
        "collection_id": snapshot.collection_id,
        "version": snapshot.version,
        "label": snapshot.label,
        "snapshot_data": snapshot.snapshot_data,
        "created_by_id": snapshot.created_by_id,
        "created_at": snapshot.created_at.isoformat(),
    }


# ── Restore Snapshot ──────────────────────────────────────────────────────────

@router.post("/{collection_id}/snapshots/{snapshot_id}/restore")
async def restore_snapshot(
    collection_id: str,
    snapshot_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Restore a collection from a snapshot. Creates a new snapshot of the
    current state first (as a safety backup), then replaces collection
    contents with the snapshot data."""
    collection = await _verify_collection(collection_id, user, db, workspace_id)

    # Load the target snapshot
    result = await db.execute(
        select(CollectionSnapshot).where(
            CollectionSnapshot.id == snapshot_id,
            CollectionSnapshot.collection_id == collection_id,
        )
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Auto-snapshot current state as safety backup
    current_version = await _get_next_version(db, collection_id)
    backup = CollectionSnapshot(
        collection_id=collection_id,
        version=current_version,
        label=f"Auto-backup before restore to v{snapshot.version}",
        snapshot_data=_serialize_collection(collection),
        created_by_id=user.id,
    )
    db.add(backup)

    # Delete existing requests
    for req in list(collection.requests):
        await db.delete(req)

    # Restore from snapshot
    data = snapshot.snapshot_data
    collection.name = data.get("name", collection.name)
    collection.description = data.get("description", collection.description)

    for req_data in data.get("requests", []):
        restored_req = SavedRequest(
            name=req_data["name"],
            description=req_data.get("description"),
            method=req_data.get("method", "GET"),
            url=req_data.get("url", ""),
            headers=req_data.get("headers", {}),
            params=req_data.get("params", {}),
            body=req_data.get("body"),
            body_type=req_data.get("body_type", "json"),
            auth_config=req_data.get("auth_config"),
            timeout=req_data.get("timeout", 10),
            sort_order=req_data.get("sort_order", 0),
            collection_id=collection_id,
        )
        db.add(restored_req)

    # Activity log
    log = ActivityLog(
        workspace_id=workspace_id,
        user_id=user.id,
        action=ActivityAction.RESTORED,
        resource_type="collection",
        resource_id=collection_id,
        resource_name=collection.name,
        details={"restored_from_version": snapshot.version, "backup_version": current_version},
    )
    db.add(log)

    await db.commit()

    return {
        "detail": f"Collection restored from v{snapshot.version}",
        "backup_version": current_version,
        "restored_version": snapshot.version,
    }
