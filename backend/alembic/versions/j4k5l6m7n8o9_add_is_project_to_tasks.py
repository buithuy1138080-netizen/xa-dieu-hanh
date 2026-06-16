"""Add is_project flag to tasks table (Hướng B: task = project).

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-06-16
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = 'j4k5l6m7n8o9'
down_revision = 'i3j4k5l6m7n8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('is_project', sa.Boolean(), nullable=False, server_default='false'))
    op.create_index('ix_tasks_is_project', 'tasks', ['is_project'])


def downgrade() -> None:
    op.drop_index('ix_tasks_is_project', table_name='tasks')
    op.drop_column('tasks', 'is_project')
