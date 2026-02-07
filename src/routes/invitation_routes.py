"""
Invitation routes — invite users to workspaces, accept/decline.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import (
    User, Workspace, WorkspaceMember, WorkspaceRole,
    Invitation, InvitationStatus, _utcnow,
)
from ..jwt_auth import get_current_user, _EMAIL_PATTERN
from ..rbac import require_workspace_access

router = APIRouter(prefix="/invitations", tags=["Invitations"])

_INVITE_EXPIRY_DAYS = 7


# ── Schemas ───────────────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    email: str
    workspace_id: str
    role: WorkspaceRole = WorkspaceRole.EDITOR

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_PATTERN.match(v):
            raise ValueError("Invalid email address format")
        return v


class InviteAction(BaseModel):
    action: str  # "accept" | "decline"

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        if v not in ("accept", "decline"):
            raise ValueError("Action must be 'accept' or 'decline'")
        return v


# ── Send Invitation ───────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def send_invitation(
    body: InviteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a user to a workspace by email (workspace admin only)."""
    # Verify requester is admin of the workspace
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == body.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    ws_member = result.scalar_one_or_none()
    if not ws_member or ws_member.role != WorkspaceRole.ADMIN:
        raise HTTPException(status_code=403, detail="Workspace admin required to invite")

    # Check if already a member
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    target_user = result.scalar_one_or_none()
    if target_user:
        existing_member = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == body.workspace_id,
                WorkspaceMember.user_id == target_user.id,
            )
        )
        if existing_member.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="User is already a workspace member")

    # Check for pending invitation
    result = await db.execute(
        select(Invitation).where(
            Invitation.email == body.email,
            Invitation.workspace_id == body.workspace_id,
            Invitation.status == InvitationStatus.PENDING,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Pending invitation already exists")

    token = secrets.token_urlsafe(48)
    invitation = Invitation(
        email=body.email,
        workspace_id=body.workspace_id,
        role=body.role,
        invited_by_id=user.id,
        token=token,
        expires_at=_utcnow() + timedelta(days=_INVITE_EXPIRY_DAYS),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    return {
        "id": invitation.id,
        "email": invitation.email,
        "workspace_id": invitation.workspace_id,
        "role": invitation.role.value,
        "status": invitation.status.value,
        "token": invitation.token,
        "expires_at": invitation.expires_at.isoformat(),
    }


# ── List Invitations ─────────────────────────────────────────────────────────

@router.get("/pending")
async def list_my_invitations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List pending invitations for the current user's email."""
    result = await db.execute(
        select(Invitation).where(
            Invitation.email == user.email,
            Invitation.status == InvitationStatus.PENDING,
        )
    )
    invites = result.scalars().all()

    out = []
    for inv in invites:
        # Check if expired — compare as naive UTC to handle SQLite
        expires = inv.expires_at.replace(tzinfo=None) if inv.expires_at.tzinfo else inv.expires_at
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        if expires < now_naive:
            inv.status = InvitationStatus.EXPIRED
            continue
        # Get workspace name
        ws_result = await db.execute(
            select(Workspace).where(Workspace.id == inv.workspace_id)
        )
        ws = ws_result.scalar_one_or_none()
        out.append({
            "id": inv.id,
            "workspace_id": inv.workspace_id,
            "workspace_name": ws.name if ws else "Unknown",
            "role": inv.role.value,
            "token": inv.token,
            "created_at": inv.created_at.isoformat(),
            "expires_at": inv.expires_at.isoformat(),
        })

    await db.commit()  # persist any expired status changes
    return out


@router.get("/workspace/{workspace_id}")
async def list_workspace_invitations(
    workspace_id: str,
    _member: WorkspaceMember = Depends(require_workspace_access(WorkspaceRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """List all invitations for a workspace (admin only)."""
    result = await db.execute(
        select(Invitation).where(
            Invitation.workspace_id == workspace_id,
        ).order_by(Invitation.created_at.desc())
    )
    invites = result.scalars().all()

    return [
        {
            "id": inv.id,
            "email": inv.email,
            "role": inv.role.value,
            "status": inv.status.value,
            "created_at": inv.created_at.isoformat(),
            "expires_at": inv.expires_at.isoformat(),
        }
        for inv in invites
    ]


# ── Accept / Decline ─────────────────────────────────────────────────────────

@router.post("/{token}/respond")
async def respond_to_invitation(
    token: str,
    body: InviteAction,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept or decline an invitation."""
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.email != user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for you")

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Invitation already {invitation.status.value}")

    expires = invitation.expires_at.replace(tzinfo=None) if invitation.expires_at.tzinfo else invitation.expires_at
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if expires < now_naive:
        invitation.status = InvitationStatus.EXPIRED
        await db.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired")

    if body.action == "decline":
        invitation.status = InvitationStatus.DECLINED
        await db.commit()
        return {"detail": "Invitation declined"}

    # Accept — add to workspace
    invitation.status = InvitationStatus.ACCEPTED

    # Check not already a member (edge case)
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == invitation.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        member = WorkspaceMember(
            workspace_id=invitation.workspace_id,
            user_id=user.id,
            role=invitation.role,
        )
        db.add(member)

    await db.commit()

    return {
        "detail": "Invitation accepted",
        "workspace_id": invitation.workspace_id,
        "role": invitation.role.value,
    }


@router.delete("/{invitation_id}", status_code=204)
async def revoke_invitation(
    invitation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invitation (workspace admin or inviter)."""
    result = await db.execute(
        select(Invitation).where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Can only revoke pending invitations")

    # Check permission: must be inviter or workspace admin
    if invitation.invited_by_id != user.id:
        ws_member_result = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == invitation.workspace_id,
                WorkspaceMember.user_id == user.id,
            )
        )
        ws_member = ws_member_result.scalar_one_or_none()
        if not ws_member or ws_member.role != WorkspaceRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized to revoke")

    await db.delete(invitation)
    await db.commit()
