"""redesign_task_module

Revision ID: e8fc9b4a22f0
Revises: 09e354bd1c8e
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'e8fc9b4a22f0'
down_revision = '09e354bd1c8e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Rename columns
    op.alter_column('tasks', 'creator_id',                new_column_name='created_by')
    op.alter_column('tasks', 'deadline',                  new_column_name='due_date')
    op.alter_column('tasks', 'source_document_id',        new_column_name='incoming_document_id')
    op.alter_column('tasks', 'source_directive_id',       new_column_name='directive_id')
    op.alter_column('tasks', 'responsible_department_id', new_column_name='lead_department_id')
    op.alter_column('tasks', 'title', type_=sa.String(300), existing_nullable=False)

    # 2. New columns
    op.add_column('tasks', sa.Column('task_code',            sa.String(30),              nullable=True))
    op.add_column('tasks', sa.Column('content_summary',      sa.Text(),                  nullable=True))
    op.add_column('tasks', sa.Column('progress_percent',     sa.Integer(),               nullable=False, server_default='0'))
    op.add_column('tasks', sa.Column('start_date',           sa.Date(),                  nullable=True))
    op.add_column('tasks', sa.Column('outgoing_document_id', sa.Integer(),               nullable=True))
    op.add_column('tasks', sa.Column('updated_by',           sa.Integer(),               nullable=True))
    op.add_column('tasks', sa.Column('supervising_user_id',  sa.Integer(),               nullable=True))
    op.add_column('tasks', sa.Column('completed_at',         sa.DateTime(timezone=True), nullable=True))
    op.add_column('tasks', sa.Column('reminder_enabled',     sa.Boolean(),               nullable=False, server_default='false'))
    op.add_column('tasks', sa.Column('overdue_warning',      sa.Boolean(),               nullable=False, server_default='false'))
    op.add_column('tasks', sa.Column('completion_note',      sa.Text(),                  nullable=True))
    op.add_column('tasks', sa.Column('deleted_at',           sa.DateTime(timezone=True), nullable=True))

    # 3. FK constraints for new integer columns
    op.create_foreign_key('fk_tasks_outgoing_doc',      'tasks', 'documents', ['outgoing_document_id'],  ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_tasks_updated_by',        'tasks', 'users',     ['updated_by'],            ['id'])
    op.create_foreign_key('fk_tasks_supervising_user',  'tasks', 'users',     ['supervising_user_id'],   ['id'])

    # 4. Indexes
    op.create_index('ix_tasks_task_code', 'tasks', ['task_code'], unique=True)
    op.create_index('ix_tasks_due_date',  'tasks', ['due_date'])

    # 5. Migrate status values
    op.execute("UPDATE tasks SET status = 'pending'     WHERE status = 'todo'")
    op.execute("UPDATE tasks SET status = 'completed'   WHERE status = 'done'")
    op.execute("UPDATE tasks SET status = 'in_progress' WHERE status = 'review'")
    op.execute("""
        UPDATE tasks SET completed_at = updated_at
        WHERE status = 'completed' AND completed_at IS NULL AND updated_at IS NOT NULL
    """)

    # 6. Migrate priority
    op.execute("UPDATE tasks SET priority = 'urgent' WHERE priority = 'critical'")

    # 7. Create task_departments
    op.create_table(
        'task_departments',
        sa.Column('id',            sa.Integer(), primary_key=True),
        sa.Column('task_id',       sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('department_id', sa.Integer(), sa.ForeignKey('departments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role',          sa.String(20), nullable=False, server_default='coordinating'),
    )
    op.create_index('ix_task_departments_task_id', 'task_departments', ['task_id'])

    # 8. Migrate existing cooperating departments
    op.execute("""
        INSERT INTO task_departments (task_id, department_id, role)
        SELECT task_id, department_id, 'coordinating'
        FROM task_cooperating_departments
    """)

    # 9. Drop old table
    op.drop_table('task_cooperating_departments')


def downgrade() -> None:
    op.create_table(
        'task_cooperating_departments',
        sa.Column('id',            sa.Integer(), primary_key=True),
        sa.Column('task_id',       sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('department_id', sa.Integer(), sa.ForeignKey('departments.id', ondelete='CASCADE'), nullable=False),
    )
    op.execute("""
        INSERT INTO task_cooperating_departments (task_id, department_id)
        SELECT task_id, department_id FROM task_departments
    """)
    op.drop_table('task_departments')
    for col in ['task_code','content_summary','progress_percent','start_date',
                'outgoing_document_id','updated_by','supervising_user_id',
                'completed_at','reminder_enabled','overdue_warning','completion_note','deleted_at']:
        op.drop_column('tasks', col)
    op.alter_column('tasks', 'created_by',          new_column_name='creator_id')
    op.alter_column('tasks', 'due_date',             new_column_name='deadline')
    op.alter_column('tasks', 'incoming_document_id', new_column_name='source_document_id')
    op.alter_column('tasks', 'directive_id',         new_column_name='source_directive_id')
    op.alter_column('tasks', 'lead_department_id',   new_column_name='responsible_department_id')
    op.execute("UPDATE tasks SET status = 'todo'      WHERE status = 'pending'")
    op.execute("UPDATE tasks SET status = 'done'      WHERE status = 'completed'")
    op.execute("UPDATE tasks SET priority = 'critical' WHERE priority = 'urgent'")
