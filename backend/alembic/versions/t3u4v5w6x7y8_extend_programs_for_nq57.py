"""extend programs table for NQ57 dashboard

Revision ID: t3u4v5w6x7y8
Revises: s2t3u4v5w6x7
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = 't3u4v5w6x7y8'
down_revision = 's2t3u4v5w6x7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('programs', sa.Column('fiscal_year', sa.Integer(), nullable=True))
    op.add_column('programs', sa.Column('target_summary', sa.Text(), nullable=True))
    op.add_column('programs', sa.Column('review_cycle', sa.String(20), nullable=True,
                                        server_default='annual'))


def downgrade():
    op.drop_column('programs', 'review_cycle')
    op.drop_column('programs', 'target_summary')
    op.drop_column('programs', 'fiscal_year')
