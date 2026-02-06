"""
Collections & Saved Requests CRUD routes.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import User, Collection, SavedRequest
from ..jwt_auth import get_current_user

router = APIRouter(prefix="/collections", tags=["Collections"])


# --- Schemas ---

class SavedRequestCreate(BaseModel):
    name: str
    description: Optional[str] = None
    method: str = "GET"
    url: str
    headers: Optional[dict] = {}
    params: Optional[dict] = {}
    body: Optional[str] = None
    body_type: str = "json"
    auth_config: Optional[dict] = None
    timeout: int = 10
    sort_order: int = 0


class SavedRequestUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    method: Optional[str] = None
    url: Optional[str] = None
    headers: Optional[dict] = None
    params: Optional[dict] = None
    body: Optional[str] = None
    body_type: Optional[str] = None
    auth_config: Optional[dict] = None
    timeout: Optional[int] = None
    sort_order: Optional[int] = None


class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# --- Collection CRUD ---

@router.get("")
async def list_collections(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all collections for the current user."""
    result = await db.execute(
        select(Collection)
        .where(Collection.owner_id == user.id)
        .options(selectinload(Collection.requests))
        .order_by(Collection.created_at.desc())
    )
    collections = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "request_count": len(c.requests),
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in collections
    ]


@router.post("", status_code=201)
async def create_collection(
    body: CollectionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new collection."""
    collection = Collection(
        name=body.name,
        description=body.description,
        owner_id=user.id,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "request_count": 0,
        "created_at": collection.created_at.isoformat(),
        "updated_at": collection.updated_at.isoformat(),
    }


@router.get("/{collection_id}")
async def get_collection(
    collection_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a collection with its requests."""
    result = await db.execute(
        select(Collection)
        .where(Collection.id == collection_id, Collection.owner_id == user.id)
        .options(selectinload(Collection.requests))
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "created_at": collection.created_at.isoformat(),
        "updated_at": collection.updated_at.isoformat(),
        "requests": [
            {
                "id": r.id,
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


@router.put("/{collection_id}")
async def update_collection(
    collection_id: str,
    body: CollectionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a collection."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    if body.name is not None:
        collection.name = body.name
    if body.description is not None:
        collection.description = body.description

    await db.commit()
    await db.refresh(collection)
    return {"id": collection.id, "name": collection.name, "description": collection.description}


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a collection and all its requests."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    await db.delete(collection)
    await db.commit()


# --- Saved Request CRUD ---

@router.post("/{collection_id}/requests", status_code=201)
async def create_request(
    collection_id: str,
    body: SavedRequestCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a request to a collection."""
    # Verify collection ownership
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collection not found")

    saved = SavedRequest(
        name=body.name,
        description=body.description,
        method=body.method,
        url=body.url,
        headers=body.headers,
        params=body.params,
        body=body.body,
        body_type=body.body_type,
        auth_config=body.auth_config,
        timeout=body.timeout,
        sort_order=body.sort_order,
        collection_id=collection_id,
    )
    db.add(saved)
    await db.commit()
    await db.refresh(saved)
    return {
        "id": saved.id,
        "name": saved.name,
        "method": saved.method,
        "url": saved.url,
        "collection_id": collection_id,
    }


@router.put("/{collection_id}/requests/{request_id}")
async def update_request(
    collection_id: str,
    request_id: str,
    body: SavedRequestUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a saved request."""
    # Verify collection ownership
    col_result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    if not col_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collection not found")

    result = await db.execute(
        select(SavedRequest).where(
            SavedRequest.id == request_id, SavedRequest.collection_id == collection_id
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Request not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(saved, key, value)

    await db.commit()
    await db.refresh(saved)
    return {
        "id": saved.id,
        "name": saved.name,
        "method": saved.method,
        "url": saved.url,
    }


@router.delete("/{collection_id}/requests/{request_id}", status_code=204)
async def delete_request(
    collection_id: str,
    request_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved request."""
    col_result = await db.execute(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    if not col_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collection not found")

    result = await db.execute(
        select(SavedRequest).where(
            SavedRequest.id == request_id, SavedRequest.collection_id == collection_id
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.delete(saved)
    await db.commit()
