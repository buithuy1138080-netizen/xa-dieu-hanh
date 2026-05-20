"""add_staff_fk_all_modules

Revision ID: f2a3b4c5d6e7
Revises: e5f6a7b8c9d0
Create Date: 2026-05-18 00:00:00.000000

Add assignee_staff_id / responsible_staff_id / project_manager_staff_id
to tasks, kpis, nq57_tasks, strategic_projects so every module can link
directly to the Staff table (independent of user accounts).
"""
from alembic import op
import sqlalchemy as sa


revision = 'f2a3b4c5d6e7'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # tasks — người thực hiện (staff)
    op.add_column('tasks', sa.Column(
        'assignee_staff_id', sa.Integer(),
        sa.ForeignKey('staff.id', ondelete='SET NULL'),
        nullable=True, index=True,
    ))

    # kpis — người phụ trách (staff)
    op.add_column('kpis', sa.Column(
        'responsible_staff_id', sa.Integer(),
        sa.ForeignKey('staff.id', ondelete='SET NULL'),
        nullable=True, index=True,
    ))

    # nq57_tasks — người phụ trách (staff)
    op.add_column('nq57_tasks', sa.Column(
        'responsible_staff_id', sa.Integer(),
        sa.ForeignKey('staff.id', ondelete='SET NULL'),
        nullable=True, index=True,
    ))

    # strategic_projects — trưởng dự án (staff)
    op.add_column('strategic_projects', sa.Column(
        'project_manager_staff_id', sa.Integer(),
        sa.ForeignKey('staff.id', ondelete='SET NULL'),
        nullable=True, index=True,
    ))


def downgrade() -> None:
    op.drop_column('strategic_projects', 'project_manager_staff_id')
    op.drop_column('nq57_tasks', 'responsible_staff_id')
    op.drop_column('kpis', 'responsible_staff_id')
    op.drop_column('tasks', 'assignee_staff_id')
