"""add project_type and budget_amount to tasks

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa

revision = 'k5l6m7n8o9p0'
down_revision = 'j4k5l6m7n8o9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('project_type', sa.String(30), nullable=True))
    op.add_column('tasks', sa.Column('budget_amount', sa.Float(), nullable=True))


def downgrade():
    op.drop_column('tasks', 'budget_amount')
    op.drop_column('tasks', 'project_type')
