"""
Environments CRUD routes.
Workspace-aware: when X-Workspace-Id header is sent, scopes to that workspace.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, Environment
from ..jwt_auth import get_current_user
from ..rbac import get_workspace_id

router = APIRouter(prefix="/environments", tags=["Environments"])


# --- Schemas ---

class EnvironmentCreate(BaseModel):
    name: str
    variables: dict = {}
    is_active: bool = False


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    variables: Optional[dict] = None
    is_active: Optional[bool] = None


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
            "variables": e.variables,
            "is_active": e.is_active,
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
    env = Environment(
        name=body.name,
        variables=body.variables,
        is_active=body.is_active,
        owner_id=user.id,
        workspace_id=workspace_id,
    )

    # If setting this one active, deactivate others
    if body.is_active:
        await db.execute(
            update(Environment)
            .where(Environment.owner_id == user.id)
            .values(is_active=False)
        )

    db.add(env)
    await db.commit()
    await db.refresh(env)
    return {
        "id": env.id,
        "name": env.name,
        "variables": env.variables,
        "is_active": env.is_active,
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
        "variables": env.variables,
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
        await db.execute(
            update(Environment)
            .where(Environment.owner_id == user.id)
            .values(is_active=False)
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(env, key, value)

    await db.commit()
    await db.refresh(env)
    return {
        "id": env.id,
        "name": env.name,
        "variables": env.variables,
        "is_active": env.is_active,
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

    await db.delete(env)
    await db.commit()
