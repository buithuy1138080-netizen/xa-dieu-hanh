"""add_report_templates

Revision ID: g9h8i7j6k5l4
Revises: f2a3b4c5d6e7
Create Date: 2026-05-19 00:00:00.000000

Add report_templates table for dynamic template management.
"""
from alembic import op
import sqlalchemy as sa

revision = 'g9h8i7j6k5l4'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'report_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('file_ext', sa.String(10), nullable=False),
        sa.Column('file_path', sa.String(512), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('variables_json', sa.JSON(), nullable=True),
        sa.Column('list_variables_json', sa.JSON(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_report_templates_id', 'report_templates', ['id'])
    op.create_index('ix_report_templates_category', 'report_templates', ['category'])


def downgrade() -> None:
    op.drop_index('ix_report_templates_category', 'report_templates')
    op.drop_index('ix_report_templates_id', 'report_templates')
    op.drop_table('report_templates')
