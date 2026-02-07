"""
Environments CRUD routes.
Workspace-aware: when X-Workspace-Id header is sent, scopes to that workspace.
Supports scope (personal/workspace) and secret variable masking.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import (
    User, Environment, EnvironmentScope,
    ActivityLog, ActivityAction,
)
from ..jwt_auth import get_current_user
from ..rbac import get_workspace_id

router = APIRouter(prefix="/environments", tags=["Environments"])

_SECRET_MASK = "••••••••"


def _mask_secrets(variables: dict, secret_keys: list) -> dict:
    """Return a copy of variables with secret values masked."""
    if not secret_keys:
        return variables
    return {
        k: (_SECRET_MASK if k in secret_keys else v)
        for k, v in variables.items()
    }


# --- Schemas ---

class EnvironmentCreate(BaseModel):
    name: str
    variables: dict = {}
    is_active: bool = False
    scope: str = "personal"  # "personal" or "workspace"
    secret_keys: List[str] = []


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    variables: Optional[dict] = None
    is_active: Optional[bool] = None
    scope: Optional[str] = None
    secret_keys: Optional[List[str]] = None


# --- CRUD ---

@router.get("")
async def list_environments(
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """List all environments for the current user/workspace."""
    query = select(Environment)
    if workspace_id:
        query = query.where(Environment.workspace_id == workspace_id)
    else:
        query = query.where(Environment.owner_id == user.id)
    query = query.order_by(Environment.name)
    result = await db.execute(query)
    envs = result.scalars().all()
    return [
        {
            "id": e.id,
            "name": e.name,
            "variables": _mask_secrets(e.variables, e.secret_keys or []),
            "is_active": e.is_active,
            "scope": e.scope.value if e.scope else "personal",
            "secret_keys": e.secret_keys or [],
            "created_at": e.created_at.isoformat(),
        }
        for e in envs
    ]


@router.post("", status_code=201)
async def create_environment(
    body: EnvironmentCreate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new environment."""
    scope_enum = EnvironmentScope.WORKSPACE if body.scope == "workspace" else EnvironmentScope.PERSONAL
    env = Environment(
        name=body.name,
        variables=body.variables,
        is_active=body.is_active,
        scope=scope_enum,
        secret_keys=body.secret_keys,
        owner_id=user.id,
        workspace_id=workspace_id,
    )

    # If setting this one active, deactivate others
    if body.is_active:
        deactivate_query = update(Environment).values(is_active=False)
        if workspace_id:
            deactivate_query = deactivate_query.where(Environment.workspace_id == workspace_id)
        else:
            deactivate_query = deactivate_query.where(Environment.owner_id == user.id)
        await db.execute(deactivate_query)

    db.add(env)

    # Activity log
    log = ActivityLog(
        workspace_id=workspace_id,
        user_id=user.id,
        action=ActivityAction.CREATED,
        resource_type="environment",
        resource_id=None,
        resource_name=body.name,
    )
    db.add(log)

    await db.commit()
    await db.refresh(env)

    # Update activity log with actual ID
    log.resource_id = env.id
    await db.commit()

    return {
        "id": env.id,
        "name": env.name,
        "variables": _mask_secrets(env.variables, env.secret_keys or []),
        "is_active": env.is_active,
        "scope": env.scope.value,
        "secret_keys": env.secret_keys or [],
    }


@router.get("/active")
async def get_active_environment(
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get the currently active environment."""
    query = select(Environment).where(Environment.is_active == True)
    if workspace_id:
        query = query.where(Environment.workspace_id == workspace_id)
    else:
        query = query.where(Environment.owner_id == user.id)
    result = await db.execute(query)
    env = result.scalar_one_or_none()
    if not env:
        return None
    return {
        "id": env.id,
        "name": env.name,
        "variables": env.variables,  # active env returns unmasked for execution
        "scope": env.scope.value if env.scope else "personal",
    }


@router.put("/{env_id}")
async def update_environment(
    env_id: str,
    body: EnvironmentUpdate,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Update an environment."""
    query = select(Environment).where(Environment.id == env_id)
    if workspace_id:
        query = query.where(Environment.workspace_id == workspace_id)
    else:
        query = query.where(Environment.owner_id == user.id)
    result = await db.execute(query)
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    # If setting active, deactivate others first
    if body.is_active is True:
        deactivate_query = update(Environment).values(is_active=False)
        if workspace_id:
            deactivate_query = deactivate_query.where(Environment.workspace_id == workspace_id)
        else:
            deactivate_query = deactivate_query.where(Environment.owner_id == user.id)
        await db.execute(deactivate_query)

    update_data = body.model_dump(exclude_unset=True)
    # Handle scope enum conversion
    if "scope" in update_data:
        scope_val = update_data.pop("scope")
        env.scope = EnvironmentScope.WORKSPACE if scope_val == "workspace" else EnvironmentScope.PERSONAL
    for key, value in update_data.items():
        setattr(env, key, value)

    # Activity log
    log = ActivityLog(
        workspace_id=workspace_id,
        user_id=user.id,
        action=ActivityAction.UPDATED,
        resource_type="environment",
        resource_id=env.id,
        resource_name=env.name,
    )
    db.add(log)

    await db.commit()
    await db.refresh(env)
    return {
        "id": env.id,
        "name": env.name,
        "variables": _mask_secrets(env.variables, env.secret_keys or []),
        "is_active": env.is_active,
        "scope": env.scope.value if env.scope else "personal",
        "secret_keys": env.secret_keys or [],
    }


@router.delete("/{env_id}", status_code=204)
async def delete_environment(
    env_id: str,
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete an environment."""
    query = select(Environment).where(Environment.id == env_id)
    if workspace_id:
        query = query.where(Environment.workspace_id == workspace_id)
    else:
        query = query.where(Environment.owner_id == user.id)
    result = await db.execute(query)
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    # Activity log
    log = ActivityLog(
        workspace_id=workspace_id,
        user_id=user.id,
        action=ActivityAction.DELETED,
        resource_type="environment",
        resource_id=env.id,
        resource_name=env.name,
    )
    db.add(log)

    await db.delete(env)
    await db.commit()
