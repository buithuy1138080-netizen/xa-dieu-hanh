"""add zalo notification module

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'zalo_configs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('app_id', sa.String(100), nullable=False, server_default=''),
        sa.Column('app_secret', sa.String(200), nullable=False, server_default=''),
        sa.Column('oa_id', sa.String(100), nullable=False, server_default=''),
        sa.Column('access_token', sa.Text(), nullable=False, server_default=''),
        sa.Column('refresh_token', sa.Text(), nullable=False, server_default=''),
        sa.Column('token_expiry', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'zalo_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('notif_type', sa.String(50), nullable=False, index=True),
        sa.Column('channel', sa.String(20), nullable=False, server_default='oa_message'),
        sa.Column('subject', sa.String(200), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('variables', sa.JSON(), nullable=True),
        sa.Column('zns_template_id', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'zalo_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('zalo_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('recipient_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('recipient_phone', sa.String(20), nullable=False, server_default=''),
        sa.Column('notif_type', sa.String(50), nullable=False, index=True),
        sa.Column('subject', sa.String(200), nullable=False, server_default=''),
        sa.Column('content_rendered', sa.Text(), nullable=False, server_default=''),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending', index=True),
        sa.Column('error_msg', sa.Text(), nullable=True),
        sa.Column('zalo_msg_id', sa.String(200), nullable=True),
        sa.Column('triggered_by', sa.String(20), nullable=False, server_default='event'),
        sa.Column('entity_type', sa.String(30), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'zalo_user_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True, index=True),
        sa.Column('zalo_phone', sa.String(20), nullable=True),
        sa.Column('zalo_user_id', sa.String(100), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('zalo_user_links')
    op.drop_table('zalo_logs')
    op.drop_table('zalo_templates')
    op.drop_table('zalo_configs')
