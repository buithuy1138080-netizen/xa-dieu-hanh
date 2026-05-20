"""Add template_id FK to reports table.

Revision ID: n7o8p9q0r1s2
Revises: m6n7o8p9q0r1
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = 'n7o8p9q0r1s2'
down_revision = 'm6n7o8p9q0r1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'reports',
        sa.Column('template_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_reports_template_id',
        'reports', 'report_templates',
        ['template_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_reports_template_id', 'reports', ['template_id'])


def downgrade() -> None:
    op.drop_index('ix_reports_template_id', table_name='reports')
    op.drop_constraint('fk_reports_template_id', 'reports', type_='foreignkey')
    op.drop_column('reports', 'template_id')
