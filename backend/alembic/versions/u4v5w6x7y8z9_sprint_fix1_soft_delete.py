"""Sprint Fix-1: soft delete on nq57/kpi/programs/nghi_quyet + program_id FK + strategic FK

Revision ID: u4v5w6x7y8z9
Revises: t3u4v5w6x7y8
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'u4v5w6x7y8z9'
down_revision = 't3u4v5w6x7y8'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Soft delete columns
    op.add_column('nq57_tasks',  sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('kpis',        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('programs',    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('nghi_quyet',  sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

    # Indexes for soft-delete filtering (partial where deleted_at IS NULL)
    op.create_index('ix_nq57_tasks_deleted_at',  'nq57_tasks', ['deleted_at'])
    op.create_index('ix_kpis_deleted_at',         'kpis',       ['deleted_at'])
    op.create_index('ix_programs_deleted_at',     'programs',   ['deleted_at'])
    op.create_index('ix_nghi_quyet_deleted_at',   'nghi_quyet', ['deleted_at'])

    # 2. program_id FK on nq57_tasks → programs
    op.add_column('nq57_tasks', sa.Column('program_id', sa.Integer(), nullable=True))
    op.create_index('ix_nq57_tasks_program_id', 'nq57_tasks', ['program_id'])
    op.create_foreign_key(
        'fk_nq57_tasks_program_id',
        'nq57_tasks', 'programs',
        ['program_id'], ['id'],
        ondelete='SET NULL',
    )

    # 3. Real FK on strategic_projects.nghi_quyet_id → nghi_quyet.id
    op.create_foreign_key(
        'fk_strategic_nghi_quyet_id',
        'strategic_projects', 'nghi_quyet',
        ['nghi_quyet_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_strategic_nghi_quyet_id', 'strategic_projects', type_='foreignkey')

    op.drop_constraint('fk_nq57_tasks_program_id', 'nq57_tasks', type_='foreignkey')
    op.drop_index('ix_nq57_tasks_program_id', table_name='nq57_tasks')
    op.drop_column('nq57_tasks', 'program_id')

    op.drop_index('ix_nghi_quyet_deleted_at',  table_name='nghi_quyet')
    op.drop_index('ix_programs_deleted_at',    table_name='programs')
    op.drop_index('ix_kpis_deleted_at',        table_name='kpis')
    op.drop_index('ix_nq57_tasks_deleted_at',  table_name='nq57_tasks')

    op.drop_column('nghi_quyet', 'deleted_at')
    op.drop_column('programs',   'deleted_at')
    op.drop_column('kpis',       'deleted_at')
    op.drop_column('nq57_tasks', 'deleted_at')
