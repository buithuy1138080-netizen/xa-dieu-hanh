"""add ocr module

Revision ID: a1b2c3d4e5f6
Revises: f1e2d3c4b5a6
Create Date: 2026-05-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a1b2c3d4e5f6'
down_revision = 'f1e2d3c4b5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ocr_documents',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('file_path', sa.String(512), nullable=False),
        sa.Column('file_type', sa.String(10), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('page_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending', index=True),
        sa.Column('ocr_text', sa.Text(), nullable=True),
        sa.Column('ai_result', sa.JSON(), nullable=True),
        sa.Column('error_msg', sa.String(500), nullable=True),
        sa.Column('document_id', sa.Integer(), nullable=True),
        sa.Column('linked_task_ids', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('ocr_documents')
