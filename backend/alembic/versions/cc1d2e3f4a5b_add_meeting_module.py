"""add meeting module

Revision ID: cc1d2e3f4a5b
Revises: bb2c3d4e5f6a
Create Date: 2026-05-26 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'cc1d2e3f4a5b'
down_revision = 'bb2c3d4e5f6a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'meetings',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('meeting_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('location', sa.String(300), nullable=True),
        sa.Column('chair', sa.String(200), nullable=True),
        sa.Column('agenda', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        'meeting_files',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_name', sa.String(300), nullable=False),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('file_size', sa.Integer(), default=0),
        sa.Column('file_mime', sa.String(100), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        'meeting_participants',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('meeting_id', sa.Integer(), sa.ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('staff_id', sa.Integer(), sa.ForeignKey('staff.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('meeting_participants')
    op.drop_table('meeting_files')
    op.drop_table('meetings')
