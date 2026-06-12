"""B1: add strategic_project_id to kpis + merge heads

Revision ID: f6a7b8c9d0e1
Revises: b1c2d3e4f5a6, a1b2c3d4e5f6
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = ('b1c2d3e4f5a6', 'a1b2c3d4e5f6')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('kpis', sa.Column('strategic_project_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_kpis_strategic_project_id', 'kpis', 'strategic_projects',
        ['strategic_project_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_kpis_strategic_project_id', 'kpis', ['strategic_project_id'])


def downgrade() -> None:
    op.drop_index('ix_kpis_strategic_project_id', table_name='kpis')
    op.drop_constraint('fk_kpis_strategic_project_id', 'kpis', type_='foreignkey')
    op.drop_column('kpis', 'strategic_project_id')
