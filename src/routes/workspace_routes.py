"""
Workspace management routes — CRUD, member management, switch active.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..jwt_auth import get_current_user
from ..models import (
    OrgRole,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from ..rbac import check_org_access, get_workspace_id, require_workspace_access

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class WorkspaceCreate(BaseModel):
    name: str
    description: str | None = None
    organization_id: str | None = None  # None → personal workspace


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class WorkspaceMemberAdd(BaseModel):
    user_id: str
    role: WorkspaceRole = WorkspaceRole.EDITOR


class WorkspaceMemberUpdate(BaseModel):
    role: WorkspaceRole


# ── Workspace CRUD ────────────────────────────────────────────────────────────


@router.get("")
async def list_workspaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all workspaces the user is a member of."""
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .options(selectinload(Workspace.members))
        .order_by(Workspace.is_personal.desc(), Workspace.name)
    )
    workspaces = result.scalars().unique().all()

    return [
        {
            "id": ws.id,
            "name": ws.name,
            "description": ws.description,
            "is_personal": ws.is_personal,
            "organization_id": ws.organization_id,
            "member_count": len(ws.members),
            "my_role": next((m.role.value for m in ws.members if m.user_id == user.id), None),
            "created_at": ws.created_at.isoformat(),
        }
        for ws in workspaces
    ]


@router.post("", status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workspace."""
    # If org-scoped, verify org membership
    if body.organization_id:
        await check_org_access(body.organization_id, user, db, min_role=OrgRole.ADMIN)

    ws = Workspace(
        name=body.name,
        description=body.description,
        is_personal=False,
        organization_id=body.organization_id,
    )
    db.add(ws)
    await db.flush()

    # Auto-add creator as admin
    member = WorkspaceMember(
        workspace_id=ws.id,
        user_id=user.id,
        role=WorkspaceRole.ADMIN,
    )
    db.add(member)

    await db.commit()
    await db.refresh(ws)

    return {
        "id": ws.id,
        "name": ws.name,
        "description": ws.description,
        "is_personal": ws.is_personal,
        "organization_id": ws.organization_id,
        "my_role": "admin",
        "created_at": ws.created_at.isoformat(),
    }


@router.get("/current")
async def get_current_workspace(
    user: User = Depends(get_current_user),
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Get workspace details for the current X-Workspace-Id header (or user default)."""
    ws_id = workspace_id or user.default_workspace_id
    if not ws_id:
        return None

    result = await db.execute(
        select(Workspace).where(Workspace.id == ws_id).options(selectinload(Workspace.members))
    )
    ws = result.scalar_one_or_none()
    if not ws:
        return None

    return {
        "id": ws.id,
        "name": ws.name,
        "description": ws.description,
        "is_personal": ws.is_personal,
        "organization_id": ws.organization_id,
        "member_count": len(ws.members),
        "my_role": next((m.role.value for m in ws.members if m.user_id == user.id), None),
    }


@router.get("/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get workspace details."""
    result = await db.execute(
        select(Workspace)
        .where(Workspace.id == workspace_id)
        .options(selectinload(Workspace.members))
    )
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Must be a member
    is_member = any(m.user_id == user.id for m in ws.members)
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    return {
        "id": ws.id,
        "name": ws.name,
        "description": ws.description,
        "is_personal": ws.is_personal,
        "organization_id": ws.organization_id,
        "member_count": len(ws.members),
        "my_role": next((m.role.value for m in ws.members if m.user_id == user.id), None),
        "created_at": ws.created_at.isoformat(),
    }


@router.put("/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdate,
    _member: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Update workspace (admin only)."""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if body.name is not None:
        ws.name = body.name
    if body.description is not None:
        ws.description = body.description

    await db.commit()
    await db.refresh(ws)
    return {"id": ws.id, "name": ws.name, "description": ws.description}


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: str,
    _member: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Delete workspace (admin only). Cannot delete personal workspaces."""
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if ws.is_personal:
        raise HTTPException(status_code=400, detail="Cannot delete personal workspace")

    await db.delete(ws)
    await db.commit()


@router.post("/{workspace_id}/set-default", status_code=200)
async def set_default_workspace(
    workspace_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the user's default workspace."""
    # Verify membership
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    user.default_workspace_id = workspace_id
    await db.commit()
    return {"detail": "Default workspace updated", "workspace_id": workspace_id}


# ── Workspace Members ────────────────────────────────────────────────────────


@router.get("/{workspace_id}/members")
async def list_workspace_members(
    workspace_id: str,
    _member: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.VIEWER)),
    db: AsyncSession = Depends(get_db),
):
    """List members of a workspace."""
    result = await db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user))
    )
    members = result.scalars().all()

    return [
        {
            "id": m.id,
            "user_id": m.user_id,
            "username": m.user.username,
            "email": m.user.email,
            "role": m.role.value,
            "joined_at": m.joined_at.isoformat(),
        }
        for m in members
    ]


@router.post("/{workspace_id}/members", status_code=201)
async def add_workspace_member(
    workspace_id: str,
    body: WorkspaceMemberAdd,
    _member: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to a workspace (admin only)."""
    # Verify target user exists
    result = await db.execute(select(User).where(User.id == body.user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check not already a member
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == body.user_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=body.user_id,
        role=body.role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return {
        "id": member.id,
        "user_id": member.user_id,
        "username": target_user.username,
        "role": member.role.value,
        "joined_at": member.joined_at.isoformat(),
    }


@router.put("/{workspace_id}/members/{member_id}")
async def update_workspace_member(
    workspace_id: str,
    member_id: str,
    body: WorkspaceMemberUpdate,
    _admin: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.ADMIN)),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a workspace member's role (admin only)."""
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Can't demote yourself from admin
    if (
        member.user_id == user.id
        and member.role == WorkspaceRole.ADMIN
        and body.role != WorkspaceRole.ADMIN
    ):
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    member.role = body.role
    await db.commit()
    return {"id": member.id, "role": member.role.value}


@router.delete("/{workspace_id}/members/{member_id}", status_code=204)
async def remove_workspace_member(
    workspace_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from workspace (admin or self-remove)."""
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Self-remove is always allowed; otherwise need admin
    if member.user_id != user.id:
        # Check requester is admin
        req_member = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
        req = req_member.scalar_one_or_none()
        if not req or req.role != WorkspaceRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin required")

    await db.delete(member)
    await db.commit()
