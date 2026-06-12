"""add program_id to strategic_projects

Revision ID: a1b2c3d4e5f6
Revises: z0a1b2c3d4e5
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'strategic_projects',
        sa.Column('program_id', sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        'fk_strategic_projects_program_id',
        'strategic_projects', 'programs',
        ['program_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_strategic_projects_program_id', 'strategic_projects', ['program_id'])


def downgrade() -> None:
    op.drop_index('ix_strategic_projects_program_id', table_name='strategic_projects')
    op.drop_constraint('fk_strategic_projects_program_id', 'strategic_projects', type_='foreignkey')
    op.drop_column('strategic_projects', 'program_id')
