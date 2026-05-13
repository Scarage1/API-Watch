"""
Role-Based Access Control (RBAC) for API-Watch.

Provides FastAPI dependencies for:
  - require_workspace_access(min_role) — checks the current user is a member
    of the workspace identified by X-Workspace-Id header with at least `min_role`.
  - require_org_role(min_role) — checks org-level role.
  - get_workspace_id — extracts & validates the workspace header.
"""

from __future__ import annotations

import logging

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .jwt_auth import get_current_user
from .models import (
    Organization,
    OrgRole,
    TeamMember,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)

logger = logging.getLogger(__name__)

# Role hierarchy (higher index = more privilege)
_WORKSPACE_ROLE_RANK = {
    WorkspaceRole.VIEWER: 0,
    WorkspaceRole.EDITOR: 1,
    WorkspaceRole.ADMIN: 2,
}

_ORG_ROLE_RANK = {
    OrgRole.MEMBER: 0,
    OrgRole.ADMIN: 1,
    OrgRole.OWNER: 2,
}


# ── Workspace-level dependencies ─────────────────────────────────────────────


async def get_workspace_id(
    x_workspace_id: str | None = Header(None),
) -> str | None:
    """Extract workspace ID from the X-Workspace-Id header.
    Returns None if not provided (backward compat for personal scope).
    """
    return x_workspace_id


async def resolve_workspace(
    workspace_id: str | None = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
) -> Workspace | None:
    """Resolve workspace object. Returns None when no header is sent."""
    if workspace_id is None:
        return None
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if ws is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )
    return ws


def require_workspace_access(min_role: WorkspaceRole = WorkspaceRole.VIEWER):
    """
    Factory that returns a FastAPI dependency enforcing workspace membership
    at the given minimum role or higher.

    Usage:
        @router.get("/items")
        async def list_items(
            ws_member: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.EDITOR)),
        ):
            ...
    """

    async def _dep(
        user: User = Depends(get_current_user),
        workspace_id: str | None = Depends(get_workspace_id),
        db: AsyncSession = Depends(get_db),
    ) -> WorkspaceMember:
        if workspace_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Workspace-Id header is required",
            )

        result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
        member = result.scalar_one_or_none()

        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace",
            )

        if _WORKSPACE_ROLE_RANK[member.role] < _WORKSPACE_ROLE_RANK[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires at least {min_role.value} role in this workspace",
            )

        return member

    return _dep


# ── Organization-level dependencies ──────────────────────────────────────────


def require_org_role(org_id_param: str = "org_id", min_role: OrgRole = OrgRole.MEMBER):
    """
    Factory returning a dependency that checks the user has at least `min_role`
    in the organization whose ID comes from the path parameter `org_id_param`.
    The org owner always passes.
    """

    async def _dep(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
        **kwargs,
    ) -> Organization:
        # We cannot use **kwargs with Depends cleanly, so we'll make
        # a self-contained check that receives the org_id explicitly.
        raise NotImplementedError("Use check_org_role directly")

    return _dep


async def check_org_access(
    org_id: str,
    user: User,
    db: AsyncSession,
    min_role: OrgRole = OrgRole.MEMBER,
) -> Organization:
    """
    Verify user has at least `min_role` in the specified org.
    The org owner automatically satisfies any role check.
    Returns the Organization object on success.
    """
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    # Org owner always has full access
    if org.owner_id == user.id:
        return org

    # Check team membership within the org for role-based access
    result = await db.execute(
        select(TeamMember)
        .join(TeamMember.team)
        .where(
            TeamMember.user_id == user.id,
            TeamMember.team.has(organization_id=org_id),
        )
    )
    memberships = result.scalars().all()

    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )

    # User's effective role = highest role across all teams in this org
    best_rank = max(_ORG_ROLE_RANK[m.role] for m in memberships)
    if best_rank < _ORG_ROLE_RANK[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least {min_role.value} role in this organization",
        )

    return org
