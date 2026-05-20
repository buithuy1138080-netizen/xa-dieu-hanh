"""add responsible_department_id to nq57_tasks and kpis

Revision ID: c4e2f7a8b1d9
Revises: b3f1c2d4e5a6
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4e2f7a8b1d9'
down_revision = 'b3f1c2d4e5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('nq57_tasks', sa.Column(
        'responsible_department_id', sa.Integer(),
        sa.ForeignKey('departments.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_nq57_tasks_dept_id', 'nq57_tasks', ['responsible_department_id'])

    op.add_column('kpis', sa.Column(
        'responsible_department_id', sa.Integer(),
        sa.ForeignKey('departments.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_kpis_dept_id', 'kpis', ['responsible_department_id'])


def downgrade() -> None:
    op.drop_index('ix_kpis_dept_id', 'kpis')
    op.drop_column('kpis', 'responsible_department_id')

    op.drop_index('ix_nq57_tasks_dept_id', 'nq57_tasks')
    op.drop_column('nq57_tasks', 'responsible_department_id')
