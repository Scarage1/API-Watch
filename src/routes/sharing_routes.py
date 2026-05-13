"""
Collection sharing & forking routes.
Share collections with other workspaces and fork/clone them.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..jwt_auth import get_current_user
from ..models import (
    ActivityAction,
    ActivityLog,
    Collection,
    CollectionShare,
    SavedRequest,
    User,
    Workspace,
)
from ..rbac import get_workspace_id

router = APIRouter(prefix="/collections", tags=["Sharing"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class ShareCreate(BaseModel):
    workspace_id: str
    permission: str = "read"  # "read" | "write"


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _log_activity(
    db: AsyncSession,
    user_id: str,
    action: ActivityAction,
    resource_type: str,
    resource_id: str,
    resource_name: str,
    workspace_id: str | None = None,
    details: dict | None = None,
):
    log = ActivityLog(
        workspace_id=workspace_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        details=details,
    )
    db.add(log)


async def _verify_collection_owner(
    collection_id: str,
    user: User,
    db: AsyncSession,
    workspace_id: str | None = None,
) -> Collection:
    """Verify user owns or has editor access to the collection."""
    query = select(Collection).where(Collection.id == collection_id)
    if workspace_id:
        query = query.where(Collection.workspace_id == workspace_id)
    else:
        query = query.where(Collection.owner_id == user.id)
    result = await db.execute(query)
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


# ── Share Collection ──────────────────────────────────────────────────────────


@router.post("/{collection_id}/share", status_code=201)
async def share_collection(
    collection_id: str,
    body: ShareCreate,
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Share a collection with another workspace."""
    if body.permission not in ("read", "write"):
        raise HTTPException(status_code=400, detail="Permission must be 'read' or 'write'")

    collection = await _verify_collection_owner(collection_id, user, db, workspace_id)

    # Verify target workspace exists
    ws_result = await db.execute(select(Workspace).where(Workspace.id == body.workspace_id))
    target_ws = ws_result.scalar_one_or_none()
    if not target_ws:
        raise HTTPException(status_code=404, detail="Target workspace not found")

    # Can't share with the same workspace
    if body.workspace_id == collection.workspace_id:
        raise HTTPException(
            status_code=400, detail="Cannot share collection with its own workspace"
        )

    # Check if already shared
    existing = await db.execute(
        select(CollectionShare).where(
            CollectionShare.collection_id == collection_id,
            CollectionShare.workspace_id == body.workspace_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Collection already shared with this workspace")

    share = CollectionShare(
        collection_id=collection_id,
        workspace_id=body.workspace_id,
        permission=body.permission,
        shared_by_id=user.id,
    )
    db.add(share)

    await _log_activity(
        db,
        user.id,
        ActivityAction.SHARED,
        "collection",
        collection_id,
        collection.name,
        workspace_id=collection.workspace_id,
        details={"target_workspace_id": body.workspace_id, "permission": body.permission},
    )

    await db.commit()
    await db.refresh(share)

    return {
        "id": share.id,
        "collection_id": share.collection_id,
        "workspace_id": share.workspace_id,
        "permission": share.permission,
        "created_at": share.created_at.isoformat(),
    }


@router.delete("/{collection_id}/share/{share_id}", status_code=204)
async def unshare_collection(
    collection_id: str,
    share_id: str,
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove a collection share."""
    collection = await _verify_collection_owner(collection_id, user, db, workspace_id)

    result = await db.execute(
        select(CollectionShare).where(
            CollectionShare.id == share_id,
            CollectionShare.collection_id == collection_id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    target_ws_id = share.workspace_id
    await db.delete(share)

    await _log_activity(
        db,
        user.id,
        ActivityAction.UNSHARED,
        "collection",
        collection_id,
        collection.name,
        workspace_id=collection.workspace_id,
        details={"target_workspace_id": target_ws_id},
    )

    await db.commit()


@router.get("/{collection_id}/shares")
async def list_collection_shares(
    collection_id: str,
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List all workspaces a collection is shared with."""
    await _verify_collection_owner(collection_id, user, db, workspace_id)

    result = await db.execute(
        select(CollectionShare)
        .where(CollectionShare.collection_id == collection_id)
        .order_by(CollectionShare.created_at.desc())
    )
    shares = result.scalars().all()

    out = []
    for s in shares:
        ws_result = await db.execute(select(Workspace).where(Workspace.id == s.workspace_id))
        ws = ws_result.scalar_one_or_none()
        out.append(
            {
                "id": s.id,
                "workspace_id": s.workspace_id,
                "workspace_name": ws.name if ws else "Unknown",
                "permission": s.permission,
                "created_at": s.created_at.isoformat(),
            }
        )

    return out


# ── Shared With Me ────────────────────────────────────────────────────────────


@router.get("/shared")
async def list_shared_collections(
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List collections shared with the current workspace."""
    if not workspace_id:
        return []

    result = await db.execute(
        select(CollectionShare)
        .where(CollectionShare.workspace_id == workspace_id)
        .order_by(CollectionShare.created_at.desc())
    )
    shares = result.scalars().all()

    out = []
    for s in shares:
        col_result = await db.execute(
            select(Collection)
            .where(Collection.id == s.collection_id)
            .options(selectinload(Collection.requests))
        )
        col = col_result.scalar_one_or_none()
        if col:
            out.append(
                {
                    "id": col.id,
                    "name": col.name,
                    "description": col.description,
                    "request_count": len(col.requests),
                    "permission": s.permission,
                    "share_id": s.id,
                    "created_at": col.created_at.isoformat(),
                }
            )

    return out


# ── Fork / Clone ──────────────────────────────────────────────────────────────


@router.post("/{collection_id}/fork", status_code=201)
async def fork_collection(
    collection_id: str,
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Fork (clone) a collection into the current workspace.
    The user must either own the collection, or it must be shared with
    the current workspace.
    """
    # Load source collection with requests
    result = await db.execute(
        select(Collection)
        .where(Collection.id == collection_id)
        .options(selectinload(Collection.requests))
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Check access: owner, workspace member, or shared
    has_access = False
    if source.owner_id == user.id:
        has_access = True
    elif workspace_id and source.workspace_id == workspace_id:
        has_access = True
    elif workspace_id:
        share_check = await db.execute(
            select(CollectionShare).where(
                CollectionShare.collection_id == collection_id,
                CollectionShare.workspace_id == workspace_id,
            )
        )
        if share_check.scalar_one_or_none():
            has_access = True

    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this collection")

    # Create forked collection
    forked = Collection(
        name=f"{source.name} (fork)",
        description=source.description,
        owner_id=user.id,
        workspace_id=workspace_id,
        forked_from_id=source.id,
    )
    db.add(forked)
    await db.flush()  # get forked.id

    # Clone all requests
    for req in sorted(source.requests, key=lambda r: r.sort_order):
        cloned_req = SavedRequest(
            name=req.name,
            description=req.description,
            method=req.method,
            url=req.url,
            headers=req.headers,
            params=req.params,
            body=req.body,
            body_type=req.body_type,
            auth_config=req.auth_config,
            timeout=req.timeout,
            sort_order=req.sort_order,
            collection_id=forked.id,
        )
        db.add(cloned_req)

    await _log_activity(
        db,
        user.id,
        ActivityAction.FORKED,
        "collection",
        forked.id,
        forked.name,
        workspace_id=workspace_id,
        details={"source_collection_id": source.id, "source_name": source.name},
    )

    await db.commit()
    await db.refresh(forked)

    return {
        "id": forked.id,
        "name": forked.name,
        "description": forked.description,
        "forked_from_id": forked.forked_from_id,
        "workspace_id": forked.workspace_id,
        "request_count": len(source.requests),
        "created_at": forked.created_at.isoformat(),
    }
