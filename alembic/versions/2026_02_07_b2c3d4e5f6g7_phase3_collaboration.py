"""Phase 3: Shared collections, versioning & activity

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-07

New tables: collection_shares, collection_snapshots, activity_logs
Modified tables: collections (forked_from_id), environments (scope, secret_keys)
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6g7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New tables ────────────────────────────────────────────────────────

    op.create_table(
        "collection_shares",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("collection_id", sa.String(36), sa.ForeignKey("collections.id"), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("permission", sa.String(20), nullable=False, server_default="read"),
        sa.Column("shared_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("collection_id", "workspace_id", name="uq_collection_workspace_share"),
    )
    op.create_index("ix_shares_workspace", "collection_shares", ["workspace_id"])

    op.create_table(
        "collection_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("collection_id", sa.String(36), sa.ForeignKey("collections.id"), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("snapshot_data", sa.JSON, nullable=False),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("collection_id", "version", name="uq_snapshot_version"),
    )
    op.create_index("ix_snapshots_collection", "collection_snapshots", ["collection_id"])

    op.create_table(
        "activity_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(36), nullable=True),
        sa.Column("resource_name", sa.String(255), nullable=True),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )
    op.create_index("ix_activity_workspace_time", "activity_logs", ["workspace_id", "created_at"])
    op.create_index("ix_activity_user", "activity_logs", ["user_id"])

    # ── Alter existing tables ─────────────────────────────────────────────

    with op.batch_alter_table("collections") as batch_op:
        batch_op.add_column(sa.Column("forked_from_id", sa.String(36), nullable=True))

    with op.batch_alter_table("environments") as batch_op:
        batch_op.add_column(sa.Column("scope", sa.String(20), nullable=True, server_default="personal"))
        batch_op.add_column(sa.Column("secret_keys", sa.JSON, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("environments") as batch_op:
        batch_op.drop_column("secret_keys")
        batch_op.drop_column("scope")

    with op.batch_alter_table("collections") as batch_op:
        batch_op.drop_column("forked_from_id")

    op.drop_index("ix_activity_user", table_name="activity_logs")
    op.drop_index("ix_activity_workspace_time", table_name="activity_logs")
    op.drop_table("activity_logs")

    op.drop_index("ix_snapshots_collection", table_name="collection_snapshots")
    op.drop_table("collection_snapshots")

    op.drop_index("ix_shares_workspace", table_name="collection_shares")
    op.drop_table("collection_shares")
