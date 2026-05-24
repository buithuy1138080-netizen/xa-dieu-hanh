"""add source_document_id to strategic_projects

Revision ID: aa1b2c3d4e5f
Revises: z0a1b2c3d4e5
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = 'aa1b2c3d4e5f'
down_revision = 'z0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'strategic_projects',
        sa.Column('source_document_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_strategic_project_source_doc',
        'strategic_projects', 'documents',
        ['source_document_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_strategic_projects_source_document_id',
        'strategic_projects', ['source_document_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_strategic_projects_source_document_id', table_name='strategic_projects')
    op.drop_constraint('fk_strategic_project_source_doc', 'strategic_projects', type_='foreignkey')
    op.drop_column('strategic_projects', 'source_document_id')
