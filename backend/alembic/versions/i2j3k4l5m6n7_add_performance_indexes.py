"""Add performance indexes for common filter columns.

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-19
"""
from alembic import op

revision = 'i2j3k4l5m6n7'
down_revision = 'h1i2j3k4l5m6'
branch_labels = None
depends_on = None


def _create_if_not_exists(name: str, table: str, columns: list[str]) -> None:
    cols = ", ".join(columns)
    op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({cols})")


def upgrade():
    # tasks — frequently filtered columns
    _create_if_not_exists('ix_tasks_deleted_at',         'tasks',     ['deleted_at'])
    _create_if_not_exists('ix_tasks_directive_id',       'tasks',     ['directive_id'])
    _create_if_not_exists('ix_tasks_assignee_staff_id',  'tasks',     ['assignee_staff_id'])
    _create_if_not_exists('ix_tasks_lead_department_id', 'tasks',     ['lead_department_id'])

    # documents
    _create_if_not_exists('ix_documents_assignee_staff_id',          'documents',  ['assignee_staff_id'])
    _create_if_not_exists('ix_documents_responsible_department_id',  'documents',  ['responsible_department_id'])

    # directives
    _create_if_not_exists('ix_directives_assignee_staff_id',         'directives', ['assignee_staff_id'])
    _create_if_not_exists('ix_directives_responsible_department_id', 'directives', ['responsible_department_id'])

    # nq57_tasks
    _create_if_not_exists('ix_nq57_tasks_responsible_department_id', 'nq57_tasks', ['responsible_department_id'])
    _create_if_not_exists('ix_nq57_tasks_status',                    'nq57_tasks', ['status'])

    # kpis
    _create_if_not_exists('ix_kpis_responsible_department_id', 'kpis', ['responsible_department_id'])
    _create_if_not_exists('ix_kpis_year_period',               'kpis', ['year', 'period'])

    # staff
    _create_if_not_exists('ix_staff_department_id', 'staff', ['department_id'])
    _create_if_not_exists('ix_staff_role',          'staff', ['role'])


def downgrade():
    op.drop_index('ix_tasks_deleted_at',          'tasks')
    op.drop_index('ix_tasks_directive_id',        'tasks')
    op.drop_index('ix_tasks_assignee_staff_id',   'tasks')
    op.drop_index('ix_tasks_lead_department_id',  'tasks')

    op.drop_index('ix_documents_assignee_staff_id',              'documents')
    op.drop_index('ix_documents_responsible_department_id',      'documents')

    op.drop_index('ix_directives_assignee_staff_id',             'directives')
    op.drop_index('ix_directives_responsible_department_id',     'directives')

    op.drop_index('ix_nq57_tasks_responsible_department_id',     'nq57_tasks')
    op.drop_index('ix_nq57_tasks_status',                        'nq57_tasks')

    op.drop_index('ix_kpis_responsible_department_id',           'kpis')
    op.drop_index('ix_kpis_year_period',                         'kpis')

    op.drop_index('ix_staff_department_id', 'staff')
    op.drop_index('ix_staff_role',          'staff')
