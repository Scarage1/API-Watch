"""
Database models for API-Watch.
Defines User, Organization, Team, Workspace, Collection, SavedRequest,
Environment, RequestHistory, MockEndpoint, and Invitation.
"""
import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ForeignKey, JSON, Index,
    Enum as SAEnum, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """Return timezone-aware UTC now (replaces deprecated datetime.utcnow)."""
    return datetime.now(timezone.utc)


# ── Enums ─────────────────────────────────────────────────────────────────────

class OrgRole(str, enum.Enum):
    """Organization-level role."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class WorkspaceRole(str, enum.Enum):
    """Workspace-level role."""
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class InvitationStatus(str, enum.Enum):
    """Invitation lifecycle."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"


# ── User ──────────────────────────────────────────────────────────────────────

class User(Base):
    """User account."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    default_workspace_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    collections: Mapped[List["Collection"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    environments: Mapped[List["Environment"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    history: Mapped[List["RequestHistory"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    owned_organizations: Mapped[List["Organization"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    team_memberships: Mapped[List["TeamMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    workspace_memberships: Mapped[List["WorkspaceMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")


# ── Organization ──────────────────────────────────────────────────────────────

class Organization(Base):
    """An organization groups teams and workspaces."""
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="owned_organizations")
    teams: Mapped[List["Team"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    workspaces: Mapped[List["Workspace"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


# ── Team ──────────────────────────────────────────────────────────────────────

class Team(Base):
    """A team within an organization."""
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="teams")
    members: Mapped[List["TeamMember"]] = relationship(back_populates="team", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_team_org_name"),
        Index("ix_teams_organization", "organization_id"),
    )


class TeamMember(Base):
    """Association between users and teams with a role."""
    __tablename__ = "team_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role: Mapped[OrgRole] = mapped_column(SAEnum(OrgRole), default=OrgRole.MEMBER, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    team: Mapped["Team"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="team_memberships")

    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_member"),
        Index("ix_team_members_user", "user_id"),
    )


# ── Workspace ─────────────────────────────────────────────────────────────────

class Workspace(Base):
    """A workspace scopes collections, environments, and mocks."""
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False)
    organization_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    organization: Mapped[Optional["Organization"]] = relationship(back_populates="workspaces")
    members: Mapped[List["WorkspaceMember"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    collections: Mapped[List["Collection"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    environments: Mapped[List["Environment"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    mock_endpoints: Mapped[List["MockEndpoint"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_workspaces_organization", "organization_id"),
    )


class WorkspaceMember(Base):
    """Association between users and workspaces with a role."""
    __tablename__ = "workspace_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(SAEnum(WorkspaceRole), default=WorkspaceRole.EDITOR, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    workspace: Mapped["Workspace"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="workspace_memberships")

    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
        Index("ix_workspace_members_user", "user_id"),
    )


# ── Invitation ────────────────────────────────────────────────────────────────

class Invitation(Base):
    """Invitation to join a workspace."""
    __tablename__ = "invitations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(SAEnum(WorkspaceRole), default=WorkspaceRole.EDITOR, nullable=False)
    invited_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[InvitationStatus] = mapped_column(SAEnum(InvitationStatus), default=InvitationStatus.PENDING, nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_invitations_workspace", "workspace_id"),
    )


# ── Collection ────────────────────────────────────────────────────────────────

class Collection(Base):
    """A collection groups saved requests (like Postman collections)."""
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="collections")
    workspace: Mapped[Optional["Workspace"]] = relationship(back_populates="collections")
    requests: Mapped[List["SavedRequest"]] = relationship(back_populates="collection", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_collections_owner", "owner_id"),
        Index("ix_collections_workspace", "workspace_id"),
    )


class SavedRequest(Base):
    """A saved API request within a collection."""
    __tablename__ = "saved_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    url: Mapped[str] = mapped_column(Text, nullable=False)
    headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    params: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body_type: Mapped[str] = mapped_column(String(20), default="json")  # json, form, text, none
    auth_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timeout: Mapped[int] = mapped_column(Integer, default=10)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    collection_id: Mapped[str] = mapped_column(String(36), ForeignKey("collections.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    collection: Mapped["Collection"] = relationship(back_populates="requests")

    __table_args__ = (
        Index("ix_saved_requests_collection", "collection_id"),
    )


class Environment(Base):
    """Named set of variables (like Postman environments)."""
    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)  # {"key": "value", ...}
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="environments")
    workspace: Mapped[Optional["Workspace"]] = relationship(back_populates="environments")

    __table_args__ = (
        Index("ix_environments_owner", "owner_id"),
        Index("ix_environments_workspace", "workspace_id"),
    )


class RequestHistory(Base):
    """Record of an executed API request."""
    __tablename__ = "request_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    # Request details
    request_method: Mapped[str] = mapped_column(String(10), nullable=False)
    request_url: Mapped[str] = mapped_column(Text, nullable=False)
    request_headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    request_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Response details
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_time: Mapped[float] = mapped_column(Float, default=0.0)
    response_size: Mapped[int] = mapped_column(Integer, default=0)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata
    collection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    saved_request_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="history")

    __table_args__ = (
        Index("ix_history_owner_timestamp", "owner_id", "timestamp"),
    )


class MockEndpoint(Base):
    """A mock API endpoint that returns predefined responses."""
    __tablename__ = "mock_endpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    path: Mapped[str] = mapped_column(String(500), nullable=False)  # e.g. /api/users
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_headers: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    delay_ms: Mapped[int] = mapped_column(Integer, default=0)  # simulated latency
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    workspace: Mapped[Optional["Workspace"]] = relationship(back_populates="mock_endpoints")

    __table_args__ = (
        Index("ix_mock_endpoints_owner", "owner_id"),
        Index("ix_mock_endpoints_path", "method", "path"),
        Index("ix_mock_endpoints_workspace", "workspace_id"),
    )
