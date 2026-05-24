"""Add ai_chat_sessions and ai_chat_messages tables.

Revision ID: bb2c3d4e5f6a
Revises: aa1b2c3d4e5f
Create Date: 2026-05-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "bb2c3d4e5f6a"
down_revision = "aa1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_chat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "ai_chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tools_used", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), default=0),
        sa.Column("output_tokens", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("ai_chat_messages")
    op.drop_table("ai_chat_sessions")
