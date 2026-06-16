"""add budget_disbursed to tasks

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa

revision = 'l6m7n8o9p0q1'
down_revision = 'k5l6m7n8o9p0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('budget_disbursed', sa.Float(), nullable=True))


def downgrade():
    op.drop_column('tasks', 'budget_disbursed')
