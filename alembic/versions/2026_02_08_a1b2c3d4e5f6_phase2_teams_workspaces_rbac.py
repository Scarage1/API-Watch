"""Phase 2: Teams, Workspaces & RBAC

Revision ID: a1b2c3d4e5f6
Revises: 34709db76d9a
Create Date: 2026-02-08

Adds:
  - organizations, teams, team_members tables
  - workspaces, workspace_members tables
  - invitations table
  - workspace_id FK on collections, environments, mock_endpoints
  - default_workspace_id on users
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "34709db76d9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Organizations ---
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"])

    # --- Teams ---
    op.create_table(
        "teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_teams_organization", "teams", ["organization_id"])
    op.create_unique_constraint("uq_team_org_name", "teams", ["organization_id", "name"])

    # --- Team Members ---
    op.create_table(
        "team_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("team_id", sa.String(36), sa.ForeignKey("teams.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint("uq_team_member", "team_members", ["team_id", "user_id"])
    op.create_index("ix_team_members_user", "team_members", ["user_id"])

    # --- Workspaces ---
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_personal", sa.Boolean, server_default="0", nullable=False),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_workspaces_organization", "workspaces", ["organization_id"])

    # --- Workspace Members ---
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint("uq_workspace_member", "workspace_members", ["workspace_id", "user_id"])
    op.create_index("ix_workspace_members_user", "workspace_members", ["user_id"])

    # --- Invitations ---
    op.create_table(
        "invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
        sa.Column("invited_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("token", sa.String(64), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_invitations_email", "invitations", ["email"])
    op.create_index("ix_invitations_token", "invitations", ["token"])
    op.create_index("ix_invitations_workspace", "invitations", ["workspace_id"])

    # --- Add workspace_id FK to existing tables ---
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("default_workspace_id", sa.String(36), nullable=True))

    with op.batch_alter_table("collections") as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key("fk_collections_workspace", "workspaces", ["workspace_id"], ["id"])
        batch_op.create_index("ix_collections_workspace", ["workspace_id"])

    with op.batch_alter_table("environments") as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key("fk_environments_workspace", "workspaces", ["workspace_id"], ["id"])
        batch_op.create_index("ix_environments_workspace", ["workspace_id"])

    with op.batch_alter_table("mock_endpoints") as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key("fk_mock_endpoints_workspace", "workspaces", ["workspace_id"], ["id"])
        batch_op.create_index("ix_mock_endpoints_workspace", ["workspace_id"])


def downgrade() -> None:
    # --- Remove workspace_id FK from existing tables ---
    with op.batch_alter_table("mock_endpoints") as batch_op:
        batch_op.drop_index("ix_mock_endpoints_workspace")
        batch_op.drop_constraint("fk_mock_endpoints_workspace", type_="foreignkey")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("environments") as batch_op:
        batch_op.drop_index("ix_environments_workspace")
        batch_op.drop_constraint("fk_environments_workspace", type_="foreignkey")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("collections") as batch_op:
        batch_op.drop_index("ix_collections_workspace")
        batch_op.drop_constraint("fk_collections_workspace", type_="foreignkey")
        batch_op.drop_column("workspace_id")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("default_workspace_id")

    # --- Drop new tables ---
    op.drop_table("invitations")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("organizations")
