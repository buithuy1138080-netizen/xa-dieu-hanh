"""add deleted_at to staff

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'm7n8o9p0q1r2'
down_revision = 'l6m7n8o9p0q1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('staff', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('staff', 'deleted_at')
