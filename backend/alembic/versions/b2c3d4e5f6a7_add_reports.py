"""add reports module

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('report_type', sa.String(30), nullable=False, index=True),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('period_label', sa.String(60), nullable=False, server_default=''),
        sa.Column('period_from', sa.Date(), nullable=False),
        sa.Column('period_to', sa.Date(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='generating', index=True),
        sa.Column('error_msg', sa.String(500), nullable=True),
        sa.Column('summary_data', sa.JSON(), nullable=True),
        sa.Column('ai_summary', sa.JSON(), nullable=True),
        sa.Column('file_path_docx', sa.String(512), nullable=True),
        sa.Column('file_path_xlsx', sa.String(512), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('generated_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('reports')
