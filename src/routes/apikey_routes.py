"""
API key CRUD routes — generate, list, and revoke API keys.
"""
import secrets
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, ApiKey, ActivityLog, ActivityAction, _utcnow
from ..jwt_auth import get_current_user, hash_password
from ..rbac import get_workspace_id

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str
    scopes: List[str] = ["read", "write"]
    expires_in_days: Optional[int] = None  # None = never expires


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: List[str]
    is_active: bool
    expires_at: Optional[str] = None
    last_used_at: Optional[str] = None
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _key_to_dict(k: ApiKey) -> dict:
    return {
        "id": k.id,
        "name": k.name,
        "key_prefix": k.key_prefix,
        "scopes": k.scopes or [],
        "is_active": k.is_active,
        "expires_at": k.expires_at.isoformat() if k.expires_at else None,
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
        "created_at": k.created_at.isoformat(),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new API key. The full key is returned ONLY once."""
    # Generate a secure random key: aw_<32 hex chars>
    raw_key = f"aw_{secrets.token_hex(24)}"
    prefix = raw_key[:8]

    from datetime import timedelta
    expires_at = None
    if body.expires_in_days:
        expires_at = _utcnow() + timedelta(days=body.expires_in_days)

    # Validate scopes
    valid_scopes = {"read", "write", "admin", "monitors", "collections"}
    for scope in body.scopes:
        if scope not in valid_scopes:
            raise HTTPException(status_code=400, detail=f"Invalid scope: {scope}. Valid scopes: {', '.join(sorted(valid_scopes))}")

    api_key = ApiKey(
        name=body.name,
        key_prefix=prefix,
        key_hash=hash_password(raw_key),
        scopes=body.scopes,
        expires_at=expires_at,
        owner_id=user.id,
        workspace_id=workspace_id,
    )
    db.add(api_key)

    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.CREATED, resource_type="api_key",
        resource_id=None, resource_name=body.name,
    )
    db.add(log)

    await db.commit()
    await db.refresh(api_key)
    log.resource_id = api_key.id
    await db.commit()

    result = _key_to_dict(api_key)
    result["key"] = raw_key  # Only returned once!
    return result


@router.get("")
async def list_api_keys(
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the current user."""
    query = select(ApiKey).where(ApiKey.owner_id == user.id)
    if workspace_id:
        query = query.where(ApiKey.workspace_id == workspace_id)
    query = query.order_by(ApiKey.created_at.desc())
    result = await db.execute(query)
    keys = result.scalars().all()
    return [_key_to_dict(k) for k in keys]


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    query = select(ApiKey).where(ApiKey.id == key_id, ApiKey.owner_id == user.id)
    result = await db.execute(query)
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    log = ActivityLog(
        workspace_id=workspace_id, user_id=user.id,
        action=ActivityAction.DELETED, resource_type="api_key",
        resource_id=api_key.id, resource_name=api_key.name,
    )
    db.add(log)

    api_key.is_active = False
    await db.commit()
