"""Add composite indexes on zalo_logs for dedup query performance.

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op

revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_zalo_logs_dedup",
        "zalo_logs",
        ["recipient_user_id", "notif_type", "entity_id", "status"],
    )
    op.create_index(
        "ix_zalo_logs_sent_at",
        "zalo_logs",
        ["sent_at"],
    )
    op.create_index(
        "ix_zalo_logs_created_at",
        "zalo_logs",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_zalo_logs_dedup", table_name="zalo_logs")
    op.drop_index("ix_zalo_logs_sent_at", table_name="zalo_logs")
    op.drop_index("ix_zalo_logs_created_at", table_name="zalo_logs")
