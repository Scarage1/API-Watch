"""
Organization & Team management routes.
"""
import re
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import (
    User, Organization, Team, TeamMember, OrgRole,
    Workspace, WorkspaceMember, WorkspaceRole,
)
from ..jwt_auth import get_current_user
from ..rbac import check_org_access

router = APIRouter(prefix="/orgs", tags=["Organizations"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str
    slug: str

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$", v):
            raise ValueError(
                "Slug must be 3-50 chars, lowercase alphanumeric + hyphens, "
                "cannot start/end with a hyphen"
            )
        return v


class OrgUpdate(BaseModel):
    name: Optional[str] = None


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class TeamMemberAdd(BaseModel):
    user_id: str
    role: OrgRole = OrgRole.MEMBER


class TeamMemberUpdate(BaseModel):
    role: OrgRole


# ── Organization CRUD ─────────────────────────────────────────────────────────

@router.get("")
async def list_organizations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List organizations the user owns or belongs to (via teams)."""
    # Owned orgs
    owned_q = select(Organization).where(Organization.owner_id == user.id)

    # Orgs where user is a team member
    member_q = (
        select(Organization)
        .join(Team, Team.organization_id == Organization.id)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user.id)
    )

    from sqlalchemy import union
    combined = union(owned_q, member_q).subquery()
    result = await db.execute(select(Organization).where(Organization.id.in_(select(combined.c.id))))
    orgs = result.scalars().all()

    return [
        {
            "id": o.id,
            "name": o.name,
            "slug": o.slug,
            "owner_id": o.owner_id,
            "is_owner": o.owner_id == user.id,
            "created_at": o.created_at.isoformat(),
        }
        for o in orgs
    ]


@router.post("", status_code=201)
async def create_organization(
    body: OrgCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new organization."""
    # Check slug uniqueness
    existing = await db.execute(
        select(Organization).where(Organization.slug == body.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization slug already taken",
        )

    org = Organization(name=body.name, slug=body.slug, owner_id=user.id)
    db.add(org)
    await db.flush()

    # Auto-create a default team "General" with owner as OWNER
    team = Team(name="General", organization_id=org.id)
    db.add(team)
    await db.flush()

    member = TeamMember(team_id=team.id, user_id=user.id, role=OrgRole.OWNER)
    db.add(member)

    await db.commit()
    await db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "owner_id": org.owner_id,
        "created_at": org.created_at.isoformat(),
    }


@router.get("/{org_id}")
async def get_organization(
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get organization details."""
    org = await check_org_access(org_id, user, db)

    # Count teams and members
    team_count = (
        await db.execute(
            select(func.count()).where(Team.organization_id == org_id)
        )
    ).scalar() or 0

    ws_count = (
        await db.execute(
            select(func.count()).where(Workspace.organization_id == org_id)
        )
    ).scalar() or 0

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "owner_id": org.owner_id,
        "is_owner": org.owner_id == user.id,
        "team_count": team_count,
        "workspace_count": ws_count,
        "created_at": org.created_at.isoformat(),
    }


@router.put("/{org_id}")
async def update_organization(
    org_id: str,
    body: OrgUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update organization (owner/admin only)."""
    org = await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    if body.name is not None:
        org.name = body.name

    await db.commit()
    await db.refresh(org)
    return {"id": org.id, "name": org.name, "slug": org.slug}


@router.delete("/{org_id}", status_code=204)
async def delete_organization(
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete organization (owner only)."""
    org = await check_org_access(org_id, user, db, min_role=OrgRole.OWNER)
    if org.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the org owner can delete it")

    await db.delete(org)
    await db.commit()


# ── Team CRUD ─────────────────────────────────────────────────────────────────

@router.get("/{org_id}/teams")
async def list_teams(
    org_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List teams in an organization."""
    await check_org_access(org_id, user, db)

    result = await db.execute(
        select(Team)
        .where(Team.organization_id == org_id)
        .options(selectinload(Team.members))
        .order_by(Team.name)
    )
    teams = result.scalars().all()

    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "member_count": len(t.members),
            "created_at": t.created_at.isoformat(),
        }
        for t in teams
    ]


@router.post("/{org_id}/teams", status_code=201)
async def create_team(
    org_id: str,
    body: TeamCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new team (admin+ only)."""
    await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    # Check uniqueness within org
    existing = await db.execute(
        select(Team).where(Team.organization_id == org_id, Team.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Team name already exists in this org")

    team = Team(name=body.name, description=body.description, organization_id=org_id)
    db.add(team)
    await db.flush()

    # Auto-add creator as team admin
    member = TeamMember(team_id=team.id, user_id=user.id, role=OrgRole.ADMIN)
    db.add(member)

    await db.commit()
    await db.refresh(team)
    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "member_count": 1,
        "created_at": team.created_at.isoformat(),
    }


@router.put("/{org_id}/teams/{team_id}")
async def update_team(
    org_id: str,
    team_id: str,
    body: TeamUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a team."""
    await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.organization_id == org_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if body.name is not None:
        team.name = body.name
    if body.description is not None:
        team.description = body.description

    await db.commit()
    await db.refresh(team)
    return {"id": team.id, "name": team.name, "description": team.description}


@router.delete("/{org_id}/teams/{team_id}", status_code=204)
async def delete_team(
    org_id: str,
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a team (admin+ only)."""
    await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.organization_id == org_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    await db.delete(team)
    await db.commit()


# ── Team Members ──────────────────────────────────────────────────────────────

@router.get("/{org_id}/teams/{team_id}/members")
async def list_team_members(
    org_id: str,
    team_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List members of a team."""
    await check_org_access(org_id, user, db)

    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.organization_id == org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")

    result = await db.execute(
        select(TeamMember)
        .where(TeamMember.team_id == team_id)
        .options(selectinload(TeamMember.user))
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


@router.post("/{org_id}/teams/{team_id}/members", status_code=201)
async def add_team_member(
    org_id: str,
    team_id: str,
    body: TeamMemberAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to a team (admin+ only)."""
    await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    # Verify team belongs to org
    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.organization_id == org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team not found")

    # Verify target user exists
    result = await db.execute(select(User).where(User.id == body.user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check not already a member
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id, TeamMember.user_id == body.user_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member of this team")

    member = TeamMember(team_id=team_id, user_id=body.user_id, role=body.role)
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


@router.put("/{org_id}/teams/{team_id}/members/{member_id}")
async def update_team_member_role(
    org_id: str,
    team_id: str,
    member_id: str,
    body: TeamMemberUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a team member's role (admin+ only)."""
    await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    result = await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id,
            TeamMember.team_id == team_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")

    # Can't demote yourself from owner
    if member.user_id == user.id and member.role == OrgRole.OWNER and body.role != OrgRole.OWNER:
        raise HTTPException(status_code=400, detail="Cannot demote yourself from owner")

    member.role = body.role
    await db.commit()
    return {"id": member.id, "role": member.role.value}


@router.delete("/{org_id}/teams/{team_id}/members/{member_id}", status_code=204)
async def remove_team_member(
    org_id: str,
    team_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a team (admin+ only, or self-remove)."""
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id,
            TeamMember.team_id == team_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")

    # Self-remove is always allowed; otherwise need admin+
    if member.user_id != user.id:
        await check_org_access(org_id, user, db, min_role=OrgRole.ADMIN)

    await db.delete(member)
    await db.commit()
