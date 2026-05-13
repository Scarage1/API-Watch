"""
Database models for API-Watch.
Defines User, Organization, Team, Workspace, Collection, SavedRequest,
Environment, RequestHistory, MockEndpoint, Invitation, CollectionShare,
CollectionSnapshot, and ActivityLog.
"""

import enum
import uuid
from datetime import UTC, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """Return timezone-aware UTC now (replaces deprecated datetime.utcnow)."""
    return datetime.now(UTC)


# ── Enums ─────────────────────────────────────────────────────────────────────


class OrgRole(enum.StrEnum):
    """Organization-level role."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class WorkspaceRole(enum.StrEnum):
    """Workspace-level role."""

    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class InvitationStatus(enum.StrEnum):
    """Invitation lifecycle."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"


class EnvironmentScope(enum.StrEnum):
    """Environment variable scope."""

    PERSONAL = "personal"
    WORKSPACE = "workspace"


class ActivityAction(enum.StrEnum):
    """Activity log action types."""

    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    SHARED = "shared"
    UNSHARED = "unshared"
    FORKED = "forked"
    RESTORED = "restored"
    INVITED = "invited"
    JOINED = "joined"


class MonitorStatus(enum.StrEnum):
    """Monitor run result status."""

    PASSING = "passing"
    FAILING = "failing"
    ERROR = "error"


class ChannelType(enum.StrEnum):
    """Notification channel type."""

    EMAIL = "email"
    WEBHOOK = "webhook"
    SLACK = "slack"


class AuditCategory(enum.StrEnum):
    """Audit log event category."""

    AUTH = "auth"
    SECURITY = "security"
    ADMIN = "admin"
    DATA = "data"
    SYSTEM = "system"


# ── User ──────────────────────────────────────────────────────────────────────


class User(Base):
    """User account."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    default_workspace_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    collections: Mapped[list["Collection"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    environments: Mapped[list["Environment"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    history: Mapped[list["RequestHistory"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    owned_organizations: Mapped[list["Organization"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    team_memberships: Mapped[list["TeamMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ── Organization ──────────────────────────────────────────────────────────────


class Organization(Base):
    """An organization groups teams and workspaces."""

    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="owned_organizations")
    teams: Mapped[list["Team"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    workspaces: Mapped[list["Workspace"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


# ── Team ──────────────────────────────────────────────────────────────────────


class Team(Base):
    """A team within an organization."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="teams")
    members: Mapped[list["TeamMember"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )

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
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False)
    organization_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    organization: Mapped[Optional["Organization"]] = relationship(back_populates="workspaces")
    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    collections: Mapped[list["Collection"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    environments: Mapped[list["Environment"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
    mock_endpoints: Mapped[list["MockEndpoint"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_workspaces_organization", "organization_id"),)


class WorkspaceMember(Base):
    """Association between users and workspaces with a role."""

    __tablename__ = "workspace_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(
        SAEnum(WorkspaceRole), default=WorkspaceRole.EDITOR, nullable=False
    )
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
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=False
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        SAEnum(WorkspaceRole), default=WorkspaceRole.EDITOR, nullable=False
    )
    invited_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[InvitationStatus] = mapped_column(
        SAEnum(InvitationStatus), default=InvitationStatus.PENDING, nullable=False
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_invitations_workspace", "workspace_id"),)


# ── Collection ────────────────────────────────────────────────────────────────


class Collection(Base):
    """A collection groups saved requests (like Postman collections)."""

    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=True
    )
    forked_from_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("collections.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="collections")
    workspace: Mapped[Optional["Workspace"]] = relationship(back_populates="collections")
    requests: Mapped[list["SavedRequest"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
    forked_from: Mapped[Optional["Collection"]] = relationship(remote_side="Collection.id")
    snapshots: Mapped[list["CollectionSnapshot"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
    shares: Mapped[list["CollectionShare"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_collections_owner", "owner_id"),
        Index("ix_collections_workspace", "workspace_id"),
    )


class SavedRequest(Base):
    """A saved API request within a collection."""

    __tablename__ = "saved_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    url: Mapped[str] = mapped_column(Text, nullable=False)
    headers: Mapped[dict | None] = mapped_column(JSON, default=dict)
    params: Mapped[dict | None] = mapped_column(JSON, default=dict)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_type: Mapped[str] = mapped_column(String(20), default="json")  # json, form, text, none
    auth_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    timeout: Mapped[int] = mapped_column(Integer, default=10)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    collection: Mapped["Collection"] = relationship(back_populates="requests")

    __table_args__ = (Index("ix_saved_requests_collection", "collection_id"),)


class Environment(Base):
    """Named set of variables (like Postman environments)."""

    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)  # {"key": "value", ...}
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    scope: Mapped[EnvironmentScope] = mapped_column(
        SAEnum(EnvironmentScope),
        default=EnvironmentScope.PERSONAL,
        nullable=False,
    )
    secret_keys: Mapped[list | None] = mapped_column(
        JSON, default=list
    )  # list of keys marked secret
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

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
    request_headers: Mapped[dict | None] = mapped_column(JSON, default=dict)
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Response details
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_time: Mapped[float] = mapped_column(Float, default=0.0)
    response_size: Mapped[int] = mapped_column(Integer, default=0)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_headers: Mapped[dict | None] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata
    collection_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    saved_request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="history")

    __table_args__ = (Index("ix_history_owner_timestamp", "owner_id", "timestamp"),)


class MockEndpoint(Base):
    """A mock API endpoint that returns predefined responses."""

    __tablename__ = "mock_endpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    path: Mapped[str] = mapped_column(String(500), nullable=False)  # e.g. /api/users
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_headers: Mapped[dict | None] = mapped_column(JSON, default=dict)
    delay_ms: Mapped[int] = mapped_column(Integer, default=0)  # simulated latency
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    workspace: Mapped[Optional["Workspace"]] = relationship(back_populates="mock_endpoints")

    __table_args__ = (
        Index("ix_mock_endpoints_owner", "owner_id"),
        Index("ix_mock_endpoints_path", "method", "path"),
        Index("ix_mock_endpoints_workspace", "workspace_id"),
    )


# ── CollectionShare ───────────────────────────────────────────────────────────


class CollectionShare(Base):
    """Share a collection with a workspace (read-only or read-write)."""

    __tablename__ = "collection_shares"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=False
    )
    permission: Mapped[str] = mapped_column(
        String(20), default="read", nullable=False
    )  # read | write
    shared_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    collection: Mapped["Collection"] = relationship(back_populates="shares")
    workspace: Mapped["Workspace"] = relationship()
    shared_by: Mapped["User"] = relationship()

    __table_args__ = (
        UniqueConstraint("collection_id", "workspace_id", name="uq_collection_workspace_share"),
        Index("ix_shares_workspace", "workspace_id"),
    )


# ── CollectionSnapshot ────────────────────────────────────────────────────────


class CollectionSnapshot(Base):
    """A point-in-time snapshot of a collection and its requests."""

    __tablename__ = "collection_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    snapshot_data: Mapped[dict] = mapped_column(
        JSON, nullable=False
    )  # full collection + requests payload
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    collection: Mapped["Collection"] = relationship(back_populates="snapshots")
    created_by: Mapped["User"] = relationship()

    __table_args__ = (
        UniqueConstraint("collection_id", "version", name="uq_snapshot_version"),
        Index("ix_snapshots_collection", "collection_id"),
    )


# ── ActivityLog ───────────────────────────────────────────────────────────────


class ActivityLog(Base):
    """Audit-style log of workspace mutations."""

    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=True
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    action: Mapped[ActivityAction] = mapped_column(SAEnum(ActivityAction), nullable=False)
    resource_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # collection, environment, workspace, etc.
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resource_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # extra context
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )

    # Relationships
    user: Mapped["User"] = relationship()

    __table_args__ = (
        Index("ix_activity_workspace_time", "workspace_id", "created_at"),
        Index("ix_activity_user", "user_id"),
    )


# ── Monitor ───────────────────────────────────────────────────────────────────


class Monitor(Base):
    """Scheduled API monitor — runs a collection on a cron schedule and checks assertions."""

    __tablename__ = "monitors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id"), nullable=False
    )
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=True
    )

    # Schedule
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False, default="*/5 * * * *")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Assertions (JSON list of assertion objects)
    # Each: { "type": "status_code"|"response_time"|"body_contains"|"header_exists",
    #          "target": "<value>", "operator": "eq"|"lt"|"gt"|"contains", "value": "..." }
    assertions: Mapped[list | None] = mapped_column(JSON, default=list)

    # Alert config
    alert_after_failures: Mapped[int] = mapped_column(Integer, default=1)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)

    # Status tracking
    last_status: Mapped[MonitorStatus | None] = mapped_column(SAEnum(MonitorStatus), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    collection: Mapped["Collection"] = relationship()
    owner: Mapped["User"] = relationship()
    workspace: Mapped[Optional["Workspace"]] = relationship()
    runs: Mapped[list["MonitorRun"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )
    notification_links: Mapped[list["MonitorNotification"]] = relationship(
        back_populates="monitor", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_monitors_workspace", "workspace_id"),
        Index("ix_monitors_owner", "owner_id"),
        Index("ix_monitors_next_run", "enabled", "next_run_at"),
    )


class MonitorRun(Base):
    """Result of a single monitor execution."""

    __tablename__ = "monitor_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    monitor_id: Mapped[str] = mapped_column(String(36), ForeignKey("monitors.id"), nullable=False)
    status: Mapped[MonitorStatus] = mapped_column(SAEnum(MonitorStatus), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)

    # Results
    total_requests: Mapped[int] = mapped_column(Integer, default=0)
    passed_requests: Mapped[int] = mapped_column(Integer, default=0)
    failed_requests: Mapped[int] = mapped_column(Integer, default=0)
    assertions_passed: Mapped[int] = mapped_column(Integer, default=0)
    assertions_failed: Mapped[int] = mapped_column(Integer, default=0)
    results: Mapped[list | None] = mapped_column(JSON, default=list)  # per-request results
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    monitor: Mapped["Monitor"] = relationship(back_populates="runs")

    __table_args__ = (Index("ix_monitor_runs_monitor_time", "monitor_id", "started_at"),)


# ── Notification Channel ─────────────────────────────────────────────────────


class NotificationChannel(Base):
    """A notification delivery channel (email, webhook, Slack)."""

    __tablename__ = "notification_channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel_type: Mapped[ChannelType] = mapped_column(SAEnum(ChannelType), nullable=False)
    # Config varies by type:
    #   email:   { "recipients": ["a@b.com"] }
    #   webhook: { "url": "https://...", "method": "POST", "headers": {} }
    #   slack:   { "webhook_url": "https://hooks.slack.com/..." }
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    owner: Mapped["User"] = relationship()
    workspace: Mapped[Optional["Workspace"]] = relationship()
    monitor_links: Mapped[list["MonitorNotification"]] = relationship(
        back_populates="channel", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_notification_channels_workspace", "workspace_id"),
        Index("ix_notification_channels_owner", "owner_id"),
    )


class MonitorNotification(Base):
    """Link table: which monitors send alerts to which channels."""

    __tablename__ = "monitor_notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    monitor_id: Mapped[str] = mapped_column(String(36), ForeignKey("monitors.id"), nullable=False)
    channel_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("notification_channels.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    monitor: Mapped["Monitor"] = relationship(back_populates="notification_links")
    channel: Mapped["NotificationChannel"] = relationship(back_populates="monitor_links")

    __table_args__ = (UniqueConstraint("monitor_id", "channel_id", name="uq_monitor_channel"),)


# ── Phase 5 models ───────────────────────────────────────────────────────────


class ApiKey(Base):
    """API key for programmatic / CI/CD access (alternative to JWT)."""

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(8), nullable=False)  # first 8 chars, shown in UI
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False)  # bcrypt hash of full key
    scopes: Mapped[list | None] = mapped_column(JSON, default=lambda: ["read", "write"])
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    owner: Mapped["User"] = relationship()
    workspace: Mapped[Optional["Workspace"]] = relationship()

    __table_args__ = (
        Index("ix_api_keys_owner", "owner_id"),
        Index("ix_api_keys_workspace", "workspace_id"),
        Index("ix_api_keys_prefix", "key_prefix"),
    )


# ── Phase 7 models ───────────────────────────────────────────────────────────


class AuditLog(Base):
    """
    System-wide audit log for observability & governance.
    Captures auth events, security scans, admin operations, data access,
    and system lifecycle events — richer than the workspace-scoped ActivityLog.
    """

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    category: Mapped[str] = mapped_column(SAEnum(AuditCategory), nullable=False)
    action: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # e.g. "login", "api_key_created"
    resource_type: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # "user", "workspace", ...
    resource_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="info")  # info, warning, critical
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )

    # Relationship
    user: Mapped[Optional["User"]] = relationship()

    __table_args__ = (
        Index("ix_audit_logs_category_created", "category", "created_at"),
        Index("ix_audit_logs_user", "user_id"),
        Index("ix_audit_logs_action", "action"),
    )
