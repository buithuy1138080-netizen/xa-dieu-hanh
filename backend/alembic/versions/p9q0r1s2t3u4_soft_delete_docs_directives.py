"""Add deleted_at soft-delete column to documents and directives.

Revision ID: p9q0r1s2t3u4
Revises: o8p9q0r1s2t3
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = 'p9q0r1s2t3u4'
down_revision = 'o8p9q0r1s2t3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('documents',  sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('directives', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

    op.create_index(
        'ix_documents_deleted_at_null', 'documents', ['deleted_at'],
        postgresql_where='deleted_at IS NULL',
    )
    op.create_index(
        'ix_directives_deleted_at_null', 'directives', ['deleted_at'],
        postgresql_where='deleted_at IS NULL',
    )


def downgrade() -> None:
    op.drop_index('ix_directives_deleted_at_null', table_name='directives')
    op.drop_index('ix_documents_deleted_at_null',  table_name='documents')
    op.drop_column('directives', 'deleted_at')
    op.drop_column('documents',  'deleted_at')
