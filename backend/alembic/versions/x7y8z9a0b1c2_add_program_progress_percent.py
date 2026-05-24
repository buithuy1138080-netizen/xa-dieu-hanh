"""add progress_percent to programs

Revision ID: x7y8z9a0b1c2
Revises: w6x7y8z9a0b1
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'x7y8z9a0b1c2'
down_revision = 'w6x7y8z9a0b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('programs', sa.Column('progress_percent', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('programs', 'progress_percent')
