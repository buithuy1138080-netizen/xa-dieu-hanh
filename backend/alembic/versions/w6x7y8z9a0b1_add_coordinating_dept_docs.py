"""Add coordinating_dept_ids to documents table.

Revision ID: w6x7y8z9a0b1
Revises: v5w6x7y8z9a0
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = 'w6x7y8z9a0b1'
down_revision = 'v5w6x7y8z9a0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('coordinating_dept_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'coordinating_dept_ids')
