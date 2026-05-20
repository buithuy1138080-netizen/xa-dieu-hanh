"""Add missing FK indexes on junction tables.

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-05-19
"""
from alembic import op

revision = 'k4l5m6n7o8p9'
down_revision = 'j3k4l5m6n7o8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_document_tasks_task_id', 'document_tasks', ['task_id'])
    op.create_index('ix_task_departments_department_id', 'task_departments', ['department_id'])
    op.create_index('ix_directive_tasks_task_id', 'directive_tasks', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_directive_tasks_task_id', 'directive_tasks')
    op.drop_index('ix_task_departments_department_id', 'task_departments')
    op.drop_index('ix_document_tasks_task_id', 'document_tasks')
