"""Add extra performance indexes for tasks, kpis, programs status/due_date.

Revision ID: v5w6x7y8z9a0
Revises: u4v5w6x7y8z9
Create Date: 2026-05-22
"""
from alembic import op

revision = 'v5w6x7y8z9a0'
down_revision = 'u4v5w6x7y8z9'
branch_labels = None
depends_on = None


def _ci(name, table, cols):
    # Only create if table exists (some tables may not yet be created)
    op.execute(f"""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename='{table}') THEN
                EXECUTE 'CREATE INDEX IF NOT EXISTS {name} ON {table} ({cols})';
            END IF;
        END $$;
    """)


def upgrade():
    # tasks — missing filter columns
    _ci('ix_tasks_status',        'tasks', 'status')
    _ci('ix_tasks_due_date',      'tasks', 'due_date')
    _ci('ix_tasks_assignee_id',   'tasks', 'assignee_id')
    _ci('ix_tasks_program_id',    'tasks', 'program_id')

    # kpis — status filter
    _ci('ix_kpis_status',         'kpis',  'status')

    # programs
    _ci('ix_programs_status',        'programs',     'status')
    # nq57_programs — only if table exists
    _ci('ix_nq57_programs_status2',  'nq57_programs', 'status')


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_tasks_status")
    op.execute("DROP INDEX IF EXISTS ix_tasks_due_date")
    op.execute("DROP INDEX IF EXISTS ix_tasks_assignee_id")
    op.execute("DROP INDEX IF EXISTS ix_tasks_program_id")
    op.execute("DROP INDEX IF EXISTS ix_kpis_status")
    op.execute("DROP INDEX IF EXISTS ix_programs_status")
    op.execute("DROP INDEX IF EXISTS ix_nq57_programs_status2")
