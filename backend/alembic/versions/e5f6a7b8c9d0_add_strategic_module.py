"""add_strategic_module

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'strategic_projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_code', sa.String(50), nullable=True),
        sa.Column('project_name', sa.String(300), nullable=False),
        sa.Column('project_type', sa.String(30), nullable=False, server_default='project'),
        sa.Column('nghi_quyet_id', sa.Integer(), nullable=True),
        sa.Column('muc_tieu_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('project_status', sa.String(20), nullable=False, server_default='planning'),
        sa.Column('priority_level', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('progress_percent', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('responsible_department_id', sa.Integer(), nullable=True),
        sa.Column('coordinating_department_ids', sa.String(500), nullable=True),
        sa.Column('project_manager_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['responsible_department_id'], ['departments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_manager_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_code'),
    )
    op.create_index('ix_strategic_projects_id', 'strategic_projects', ['id'])
    op.create_index('ix_strategic_projects_project_code', 'strategic_projects', ['project_code'])
    op.create_index('ix_strategic_projects_project_name', 'strategic_projects', ['project_name'])
    op.create_index('ix_strategic_projects_project_status', 'strategic_projects', ['project_status'])
    op.create_index('ix_strategic_projects_nghi_quyet_id', 'strategic_projects', ['nghi_quyet_id'])
    op.create_index('ix_strategic_projects_muc_tieu_id', 'strategic_projects', ['muc_tieu_id'])
    op.create_index('ix_strategic_projects_responsible_department_id', 'strategic_projects', ['responsible_department_id'])

    op.create_table(
        'budget_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('budget_code', sa.String(50), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('fiscal_year', sa.Integer(), nullable=False),
        sa.Column('total_budget', sa.Float(), nullable=False, server_default='0'),
        sa.Column('allocated_budget', sa.Float(), nullable=False, server_default='0'),
        sa.Column('spent_budget', sa.Float(), nullable=False, server_default='0'),
        sa.Column('budget_status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['strategic_projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('budget_code'),
    )
    op.create_index('ix_budget_plans_id', 'budget_plans', ['id'])
    op.create_index('ix_budget_plans_budget_code', 'budget_plans', ['budget_code'])
    op.create_index('ix_budget_plans_project_id', 'budget_plans', ['project_id'])
    op.create_index('ix_budget_plans_fiscal_year', 'budget_plans', ['fiscal_year'])
    op.create_index('ix_budget_plans_budget_status', 'budget_plans', ['budget_status'])

    op.create_table(
        'funding_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('budget_plan_id', sa.Integer(), nullable=False),
        sa.Column('funding_source_name', sa.String(200), nullable=False),
        sa.Column('funding_type', sa.String(30), nullable=False, server_default='ngan_sach_xa'),
        sa.Column('funding_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('funding_year', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['budget_plan_id'], ['budget_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_funding_sources_id', 'funding_sources', ['id'])
    op.create_index('ix_funding_sources_budget_plan_id', 'funding_sources', ['budget_plan_id'])

    op.create_table(
        'disbursements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('disbursement_code', sa.String(50), nullable=True),
        sa.Column('budget_plan_id', sa.Integer(), nullable=False),
        sa.Column('disbursement_date', sa.Date(), nullable=False),
        sa.Column('disbursement_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('evidence_file', sa.String(512), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['budget_plan_id'], ['budget_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_disbursements_id', 'disbursements', ['id'])
    op.create_index('ix_disbursements_disbursement_code', 'disbursements', ['disbursement_code'])
    op.create_index('ix_disbursements_budget_plan_id', 'disbursements', ['budget_plan_id'])
    op.create_index('ix_disbursements_disbursement_date', 'disbursements', ['disbursement_date'])

    op.create_table(
        'project_task_links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['strategic_projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'task_id', name='uq_project_task'),
    )
    op.create_index('ix_project_task_links_id', 'project_task_links', ['id'])
    op.create_index('ix_project_task_links_project_id', 'project_task_links', ['project_id'])
    op.create_index('ix_project_task_links_task_id', 'project_task_links', ['task_id'])


def downgrade() -> None:
    op.drop_table('project_task_links')
    op.drop_table('disbursements')
    op.drop_table('funding_sources')
    op.drop_table('budget_plans')
    op.drop_table('strategic_projects')
