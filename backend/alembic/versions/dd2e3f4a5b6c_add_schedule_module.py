"""add schedule (lich cong tac) module

Revision ID: dd2e3f4a5b6c
Revises: cc1d2e3f4a5b
Create Date: 2026-06-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'dd2e3f4a5b6c'
down_revision = 'cc1d2e3f4a5b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── schedule_items ────────────────────────────────────────────────────────
    op.create_table(
        'schedule_items',
        sa.Column('id',          sa.Integer(),     primary_key=True, autoincrement=True),
        sa.Column('leader_id',   sa.Integer(),     sa.ForeignKey('staff.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title',       sa.String(500),   nullable=False),
        sa.Column('location',    sa.String(300)),
        sa.Column('note',        sa.Text()),
        sa.Column('work_date',   sa.Date(),        nullable=False),
        sa.Column('session',     sa.String(20),    nullable=False, server_default='sang'),
        sa.Column('start_time',  sa.Time()),
        sa.Column('zalo_remind',           sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('remind_before_minutes', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('created_by',  sa.Integer(),     sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at',  sa.DateTime(timezone=True)),
        sa.Column('deleted_at',  sa.DateTime(timezone=True)),
    )
    op.create_index('ix_schedule_items_work_date', 'schedule_items', ['work_date'])
    op.create_index('ix_schedule_items_leader_id', 'schedule_items', ['leader_id'])
    op.create_index('ix_schedule_items_deleted_at', 'schedule_items', ['deleted_at'])

    # ── schedule_reminders ────────────────────────────────────────────────────
    op.create_table(
        'schedule_reminders',
        sa.Column('id',           sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('schedule_id',  sa.Integer(), sa.ForeignKey('schedule_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('leader_id',    sa.Integer(), nullable=False),
        sa.Column('zalo_user_id', sa.String(100)),
        sa.Column('recipient_phone', sa.String(20)),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sent_at',      sa.DateTime(timezone=True)),
        sa.Column('status',       sa.String(20),  nullable=False, server_default='pending'),
        sa.Column('error_msg',    sa.Text()),
        sa.Column('zalo_msg_id',  sa.String(100)),
        sa.Column('retry_count',  sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('created_at',   sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_schedule_reminders_schedule_id', 'schedule_reminders', ['schedule_id'])
    op.create_index('ix_schedule_reminders_status_scheduled',
                    'schedule_reminders', ['status', 'scheduled_at'])


def downgrade() -> None:
    op.drop_table('schedule_reminders')
    op.drop_table('schedule_items')
