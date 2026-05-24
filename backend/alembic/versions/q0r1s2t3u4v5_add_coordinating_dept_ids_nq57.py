"""Add coordinating_dept_ids to nq57_tasks.

Revision ID: q0r1s2t3u4v5
Revises: p9q0r1s2t3u4
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = 'q0r1s2t3u4v5'
down_revision = 'p9q0r1s2t3u4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('nq57_tasks', sa.Column('coordinating_dept_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('nq57_tasks', 'coordinating_dept_ids')
