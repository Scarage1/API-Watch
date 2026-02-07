"""Phase 4 — Monitoring & Alerting

Create monitors, monitor_runs, notification_channels, and monitor_notifications tables.

Revision ID: c4d5e6f7g8h9
Revises: b2c3d4e5f6g7
Create Date: 2026-02-08
"""
from alembic import op
import sqlalchemy as sa

revision = "c4d5e6f7g8h9"
down_revision = "b2c3d4e5f6g7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- monitors ---
    op.create_table(
        "monitors",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("collection_id", sa.String(36), sa.ForeignKey("collections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cron_expression", sa.String(100), nullable=False, server_default="*/5 * * * *"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("assertions", sa.JSON, nullable=True),
        sa.Column("alert_after_failures", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("consecutive_failures", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("last_status", sa.String(20), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_monitors_workspace", "monitors", ["workspace_id"])
    op.create_index("ix_monitors_owner", "monitors", ["owner_id"])
    op.create_index("ix_monitors_enabled_next_run", "monitors", ["enabled", "next_run_at"])

    # --- monitor_runs ---
    op.create_table(
        "monitor_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("monitor_id", sa.String(36), sa.ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("total_requests", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("passed_requests", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("failed_requests", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("assertions_passed", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("assertions_failed", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("results", sa.JSON, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_monitor_runs_monitor_started", "monitor_runs", ["monitor_id", "started_at"])

    # --- notification_channels ---
    op.create_table(
        "notification_channels",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("channel_type", sa.String(20), nullable=False),
        sa.Column("config", sa.JSON, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notification_channels_workspace", "notification_channels", ["workspace_id"])
    op.create_index("ix_notification_channels_owner", "notification_channels", ["owner_id"])

    # --- monitor_notifications (link table) ---
    op.create_table(
        "monitor_notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("monitor_id", sa.String(36), sa.ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel_id", sa.String(36), sa.ForeignKey("notification_channels.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("monitor_id", "channel_id", name="uq_monitor_channel"),
    )


def downgrade() -> None:
    op.drop_table("monitor_notifications")
    op.drop_table("notification_channels")
    op.drop_table("monitor_runs")
    op.drop_index("ix_monitors_enabled_next_run", "monitors")
    op.drop_index("ix_monitors_owner", "monitors")
    op.drop_index("ix_monitors_workspace", "monitors")
    op.drop_table("monitors")
