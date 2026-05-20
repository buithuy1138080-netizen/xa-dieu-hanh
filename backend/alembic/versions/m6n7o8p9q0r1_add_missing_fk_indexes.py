"""Add missing indexes on high-frequency FK and sort columns.

Revision ID: m6n7o8p9q0r1
Revises: l5m6n7o8p9q0
Create Date: 2026-05-20
"""
from alembic import op

revision = 'm6n7o8p9q0r1'
down_revision = 'l5m6n7o8p9q0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_tasks_assignee_id', 'tasks', ['assignee_id'])
    op.create_index('ix_tasks_created_at', 'tasks', ['created_at'])
    op.create_index('ix_documents_created_by', 'documents', ['created_by'])
    op.create_index('ix_documents_assignee_id', 'documents', ['assignee_id'])


def downgrade() -> None:
    op.drop_index('ix_documents_assignee_id', table_name='documents')
    op.drop_index('ix_documents_created_by', table_name='documents')
    op.drop_index('ix_tasks_created_at', table_name='tasks')
    op.drop_index('ix_tasks_assignee_id', table_name='tasks')
