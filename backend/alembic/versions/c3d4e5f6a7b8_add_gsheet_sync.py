"""add gsheet sync module

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sync_configs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('entity_type', sa.String(30), nullable=False),
        sa.Column('source_type', sa.String(20), nullable=False, server_default='gsheet'),
        sa.Column('sheet_id', sa.String(300), nullable=True),
        sa.Column('sheet_tab', sa.String(100), nullable=False, server_default='Sheet1'),
        sa.Column('data_range', sa.String(50), nullable=False, server_default='A2:Z1000'),
        sa.Column('header_row', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('auth_type', sa.String(20), nullable=False, server_default='service_account'),
        sa.Column('credentials_json', sa.Text(), nullable=True),
        sa.Column('field_mappings', sa.JSON(), nullable=True),
        sa.Column('key_field', sa.String(50), nullable=False, server_default='code'),
        sa.Column('key_col', sa.String(5), nullable=False, server_default='B'),
        sa.Column('sync_direction', sa.String(20), nullable=False, server_default='bidirectional'),
        sa.Column('conflict_resolution', sa.String(20), nullable=False, server_default='latest_wins'),
        sa.Column('auto_sync_minutes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('webhook_token', sa.String(64), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'sync_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('config_id', sa.Integer(), sa.ForeignKey('sync_configs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('direction', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='running'),
        sa.Column('records_read', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('records_created', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('records_updated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('records_skipped', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('records_failed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('records_conflict', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_msg', sa.Text(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('triggered_by', sa.String(20), nullable=False, server_default='manual'),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'sync_conflicts',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('config_id', sa.Integer(), sa.ForeignKey('sync_configs.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('log_id', sa.Integer(), sa.ForeignKey('sync_logs.id', ondelete='SET NULL'), nullable=True),
        sa.Column('entity_type', sa.String(30), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('sheet_row', sa.Integer(), nullable=True),
        sa.Column('field_name', sa.String(100), nullable=False),
        sa.Column('ioc_value', sa.Text(), nullable=True),
        sa.Column('sheet_value', sa.Text(), nullable=True),
        sa.Column('ioc_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sheet_updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('resolved_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('sync_conflicts')
    op.drop_table('sync_logs')
    op.drop_table('sync_configs')
