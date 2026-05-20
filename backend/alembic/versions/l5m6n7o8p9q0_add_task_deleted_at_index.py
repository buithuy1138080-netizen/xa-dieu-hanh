"""Add index on tasks.deleted_at for soft-delete query performance.

Revision ID: l5m6n7o8p9q0
Revises: k4l5m6n7o8p9
Create Date: 2026-05-20
"""
from alembic import op

revision = 'l5m6n7o8p9q0'
down_revision = 'k4l5m6n7o8p9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial index: only index rows where deleted_at IS NULL (active records).
    op.create_index(
        'ix_tasks_deleted_at_null',
        'tasks',
        ['deleted_at'],
        postgresql_where='deleted_at IS NULL',
    )


def downgrade() -> None:
    op.drop_index('ix_tasks_deleted_at_null', table_name='tasks')
