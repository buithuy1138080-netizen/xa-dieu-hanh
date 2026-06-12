"""B3: add document_strategic_projects junction table

Revision ID: f7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'f7a8b9c0d1e2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'document_strategic_projects',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('document_id', sa.Integer(),
                  sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_id', sa.Integer(),
                  sa.ForeignKey('strategic_projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('link_type', sa.String(30), nullable=False, server_default='reference'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_unique_constraint(
        'uq_doc_strategic_project', 'document_strategic_projects', ['document_id', 'project_id']
    )
    op.create_index('ix_dsp_project_id', 'document_strategic_projects', ['project_id'])
    op.create_index('ix_dsp_document_id', 'document_strategic_projects', ['document_id'])


def downgrade() -> None:
    op.drop_index('ix_dsp_document_id', table_name='document_strategic_projects')
    op.drop_index('ix_dsp_project_id', table_name='document_strategic_projects')
    op.drop_table('document_strategic_projects')
