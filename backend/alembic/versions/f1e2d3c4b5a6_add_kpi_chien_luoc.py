"""add kpi chien luoc strategic kpi system

Revision ID: f1e2d3c4b5a6
Revises: d5e6f7a8b9c0
Create Date: 2026-05-17

Tables:
  kpi_chien_luoc   – Strategic KPI (quarterly / annual / 5-year term)
  kpi_cl_tien_do   – Progress entry per period
"""

from alembic import op
import sqlalchemy as sa

revision = 'f1e2d3c4b5a6'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'kpi_chien_luoc',
        sa.Column('id',                   sa.Integer,      primary_key=True),
        sa.Column('ma_kpi',               sa.String(50),   nullable=True),
        sa.Column('ten',                  sa.String(300),  nullable=False),
        sa.Column('mo_ta',                sa.Text,         nullable=True),
        # loai: quy | nam | nhiem_ky
        sa.Column('loai_kpi',             sa.String(20),   nullable=False, server_default='nam'),
        sa.Column('danh_muc',             sa.String(100),  nullable=True),
        sa.Column('gia_tri_muc_tieu',     sa.Float,        nullable=False, server_default='100'),
        sa.Column('gia_tri_thuc_te',      sa.Float,        nullable=False, server_default='0'),
        sa.Column('pct_hoan_thanh',       sa.Float,        nullable=False, server_default='0'),
        sa.Column('don_vi_do',            sa.String(50),   nullable=True),
        # trang_thai: Chưa bắt đầu | Đúng tiến độ | Có rủi ro | Chậm tiến độ | Đạt mục tiêu | Quá hạn
        sa.Column('trang_thai',           sa.String(30),   nullable=False, server_default='Chưa bắt đầu'),
        sa.Column('quy',                  sa.Integer,      nullable=True),   # 1-4
        sa.Column('nam',                  sa.Integer,      nullable=False),
        sa.Column('ten_nhiem_ky',         sa.String(20),   nullable=True),   # e.g. '2025-2030'
        sa.Column('han_hoan_thanh',       sa.Date,         nullable=True),
        # FK references (no cascade on referenced side — soft links to avoid cross-module deps)
        sa.Column('don_vi_phu_trach_id',  sa.Integer,
                  sa.ForeignKey('departments.id', ondelete='SET NULL'), nullable=True),
        sa.Column('nguoi_theo_doi_id',    sa.Integer,
                  sa.ForeignKey('users.id',       ondelete='SET NULL'), nullable=True),
        sa.Column('created_by',           sa.Integer,
                  sa.ForeignKey('users.id',       ondelete='RESTRICT'), nullable=False),
        # Soft links to other modules (no FK constraint — avoids cross-module coupling)
        sa.Column('van_ban_id',           sa.Integer,      nullable=True),   # → documents.id
        sa.Column('nhiem_vu_id',          sa.Integer,      nullable=True),   # → tasks.id
        sa.Column('chi_tieu_nq_id',       sa.Integer,      nullable=True),   # → muc_tieu_nq.id
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_kpi_cl_nam',       'kpi_chien_luoc', ['nam'])
    op.create_index('ix_kpi_cl_loai',      'kpi_chien_luoc', ['loai_kpi'])
    op.create_index('ix_kpi_cl_trang_thai','kpi_chien_luoc', ['trang_thai'])
    op.create_index('ix_kpi_cl_danh_muc',  'kpi_chien_luoc', ['danh_muc'])

    op.create_table(
        'kpi_cl_tien_do',
        sa.Column('id',               sa.Integer, primary_key=True),
        sa.Column('kpi_id',           sa.Integer,
                  sa.ForeignKey('kpi_chien_luoc.id', ondelete='CASCADE'), nullable=False),
        sa.Column('gia_tri',          sa.Float,   nullable=False),
        sa.Column('ghi_chu',          sa.Text,    nullable=True),
        sa.Column('quy',              sa.Integer, nullable=True),
        sa.Column('nam',              sa.Integer, nullable=False),
        sa.Column('nguoi_cap_nhat_id',sa.Integer,
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_kpi_cl_td_kpi_id', 'kpi_cl_tien_do', ['kpi_id'])


def downgrade() -> None:
    op.drop_table('kpi_cl_tien_do')
    op.drop_table('kpi_chien_luoc')
