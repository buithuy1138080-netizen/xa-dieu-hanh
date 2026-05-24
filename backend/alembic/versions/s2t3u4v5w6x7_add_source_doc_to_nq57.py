"""add source document fields to nq57_tasks

Revision ID: s2t3u4v5w6x7
Revises: r1s2t3u4v5w6
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = 's2t3u4v5w6x7'
down_revision = 'r1s2t3u4v5w6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('nq57_tasks', sa.Column('incoming_document_id', sa.Integer(), nullable=True))
    op.add_column('nq57_tasks', sa.Column('outgoing_document_id', sa.Integer(), nullable=True))
    op.add_column('nq57_tasks', sa.Column('directive_id', sa.Integer(), nullable=True))

    op.create_foreign_key(
        'fk_nq57_tasks_incoming_doc', 'nq57_tasks', 'documents',
        ['incoming_document_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_nq57_tasks_outgoing_doc', 'nq57_tasks', 'documents',
        ['outgoing_document_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_nq57_tasks_directive', 'nq57_tasks', 'directives',
        ['directive_id'], ['id'], ondelete='SET NULL'
    )


def downgrade():
    op.drop_constraint('fk_nq57_tasks_directive', 'nq57_tasks', type_='foreignkey')
    op.drop_constraint('fk_nq57_tasks_outgoing_doc', 'nq57_tasks', type_='foreignkey')
    op.drop_constraint('fk_nq57_tasks_incoming_doc', 'nq57_tasks', type_='foreignkey')
    op.drop_column('nq57_tasks', 'directive_id')
    op.drop_column('nq57_tasks', 'outgoing_document_id')
    op.drop_column('nq57_tasks', 'incoming_document_id')
