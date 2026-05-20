"""add_module8_nghi_quyet

Revision ID: d5e6f7a8b9c0
Revises: c4e2f7a8b1d9
Create Date: 2026-05-17

Tạo toàn bộ cấu trúc Module 8:
  - nghi_quyet         : nghị quyết / đề án / kế hoạch đại hội
  - muc_tieu_nq        : cây mục tiêu 3 cấp (cap_do=3 là KPI chiến lược)
  - bang_theo_doi_chi_tieu : số liệu định kỳ theo tháng/quý/năm
  - nq_lien_ket_cong_viec  : liên kết đến nhiệm vụ từ module khác
  - VIEW v_nq_tong_quan    : tính % tiến độ rollup + trạng thái tự động
"""

from alembic import op
import sqlalchemy as sa

revision = 'd5e6f7a8b9c0'
down_revision = 'c4e2f7a8b1d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. nghi_quyet ──────────────────────────────────────────────────────────
    op.create_table(
        'nghi_quyet',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('ma_nghi_quyet', sa.String(50), nullable=True),
        sa.Column('ten', sa.String(500), nullable=False),
        sa.Column('mo_ta', sa.Text(), nullable=True),
        sa.Column('loai', sa.String(50), nullable=False, server_default='nghi_quyet'),
        sa.Column('nam_bat_dau', sa.Integer(), nullable=False),
        sa.Column('nam_ket_thuc', sa.Integer(), nullable=False),
        sa.Column('ngay_ban_hanh', sa.Date(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
    )
    op.create_index('ix_nghi_quyet_ma', 'nghi_quyet', ['ma_nghi_quyet'])
    op.create_index('ix_nghi_quyet_nam', 'nghi_quyet', ['nam_bat_dau', 'nam_ket_thuc'])

    # ── 2. muc_tieu_nq ─────────────────────────────────────────────────────────
    op.create_table(
        'muc_tieu_nq',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('nghi_quyet_id', sa.Integer(), sa.ForeignKey('nghi_quyet.id', ondelete='CASCADE'), nullable=False),
        sa.Column('muc_tieu_cha_id', sa.Integer(), sa.ForeignKey('muc_tieu_nq.id', ondelete='SET NULL'), nullable=True),
        sa.Column('ma_chi_tieu', sa.String(50), nullable=True),
        sa.Column('ten', sa.String(500), nullable=False),
        sa.Column('mo_ta', sa.Text(), nullable=True),
        sa.Column('loai_chi_tieu', sa.String(100), nullable=True),
        sa.Column('cap_do', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('gia_tri_muc_tieu', sa.Float(), nullable=True),
        sa.Column('don_vi_do', sa.String(50), nullable=True),
        sa.Column('don_vi_phu_trach_id', sa.Integer(), sa.ForeignKey('departments.id', ondelete='SET NULL'), nullable=True),
        sa.Column('can_bo_theo_doi_id', sa.Integer(), sa.ForeignKey('staff.id', ondelete='SET NULL'), nullable=True),
        sa.Column('nam_hoan_thanh', sa.Integer(), nullable=True),
        sa.Column('thu_tu', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ghi_chu', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
    )
    op.create_index('ix_muc_tieu_nq_nghi_quyet', 'muc_tieu_nq', ['nghi_quyet_id'])
    op.create_index('ix_muc_tieu_nq_cha', 'muc_tieu_nq', ['muc_tieu_cha_id'])
    op.create_index('ix_muc_tieu_nq_cap_do', 'muc_tieu_nq', ['cap_do'])
    op.create_index('ix_muc_tieu_nq_nam_don_vi', 'muc_tieu_nq', ['nam_hoan_thanh', 'don_vi_phu_trach_id'])

    # ── 3. bang_theo_doi_chi_tieu ──────────────────────────────────────────────
    op.create_table(
        'bang_theo_doi_chi_tieu',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('chi_tieu_id', sa.Integer(), sa.ForeignKey('muc_tieu_nq.id', ondelete='CASCADE'), nullable=False),
        sa.Column('gia_tri_thuc_te', sa.Float(), nullable=False),
        sa.Column('ghi_chu', sa.Text(), nullable=True),
        sa.Column('thang', sa.Integer(), nullable=True),
        sa.Column('quy', sa.Integer(), nullable=True),
        sa.Column('nam', sa.Integer(), nullable=False),
        sa.Column('nguoi_cap_nhat_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_theo_doi_chi_tieu', 'bang_theo_doi_chi_tieu', ['chi_tieu_id'])
    op.create_index('ix_theo_doi_nam_quy', 'bang_theo_doi_chi_tieu', ['nam', 'quy'])

    # ── 4. nq_lien_ket_cong_viec ──────────────────────────────────────────────
    op.create_table(
        'nq_lien_ket_cong_viec',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('chi_tieu_id', sa.Integer(), sa.ForeignKey('muc_tieu_nq.id', ondelete='CASCADE'), nullable=False),
        sa.Column('loai_cong_viec', sa.String(20), nullable=False),
        sa.Column('cong_viec_id', sa.Integer(), nullable=False),
        sa.Column('ghi_chu', sa.Text(), nullable=True),
        sa.Column('nguoi_lien_ket_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_lien_ket_chi_tieu', 'nq_lien_ket_cong_viec', ['chi_tieu_id'])
    op.create_index('ix_lien_ket_loai_id', 'nq_lien_ket_cong_viec', ['loai_cong_viec', 'cong_viec_id'])

    # ── 5. VIEW v_nq_tong_quan ─────────────────────────────────────────────────
    op.execute("""
CREATE OR REPLACE VIEW v_nq_tong_quan AS
WITH
latest_sl AS (
    SELECT DISTINCT ON (chi_tieu_id)
        chi_tieu_id,
        gia_tri_thuc_te,
        quy,
        thang,
        nam,
        created_at AS cap_nhat_luc
    FROM bang_theo_doi_chi_tieu
    ORDER BY chi_tieu_id, nam DESC, COALESCE(quy, 0) DESC, COALESCE(thang, 0) DESC, created_at DESC
),
kpi_l3 AS (
    SELECT
        mt.id,
        mt.ma_chi_tieu,
        mt.ten,
        mt.loai_chi_tieu,
        mt.cap_do,
        mt.muc_tieu_cha_id,
        mt.nghi_quyet_id,
        mt.gia_tri_muc_tieu,
        mt.don_vi_do,
        mt.don_vi_phu_trach_id,
        mt.nam_hoan_thanh,
        mt.can_bo_theo_doi_id,
        COALESCE(ls.gia_tri_thuc_te, 0)::float AS gia_tri_thuc_te_moi_nhat,
        CASE
            WHEN COALESCE(mt.gia_tri_muc_tieu, 0) > 0
            THEN LEAST(
                ROUND(
                    (COALESCE(ls.gia_tri_thuc_te, 0) / mt.gia_tri_muc_tieu * 100)::numeric,
                    2
                )::float,
                100.0
            )
            ELSE 0.0
        END AS pct_so_lieu,
        ls.cap_nhat_luc,
        ls.quy AS quy_cap_nhat,
        ls.nam AS nam_cap_nhat
    FROM muc_tieu_nq mt
    LEFT JOIN latest_sl ls ON ls.chi_tieu_id = mt.id
    WHERE mt.cap_do = 3
),
kpi_l3_status AS (
    SELECT
        id, ma_chi_tieu, ten, loai_chi_tieu, cap_do,
        muc_tieu_cha_id, nghi_quyet_id, gia_tri_muc_tieu, don_vi_do,
        don_vi_phu_trach_id, nam_hoan_thanh, can_bo_theo_doi_id,
        gia_tri_thuc_te_moi_nhat, pct_so_lieu, cap_nhat_luc, quy_cap_nhat, nam_cap_nhat,
        CASE
            WHEN pct_so_lieu >= 100
                THEN 'Hoàn thành'
            WHEN nam_hoan_thanh IS NOT NULL
                 AND nam_hoan_thanh < EXTRACT(YEAR FROM CURRENT_DATE)::int
                THEN 'Quá hạn'
            WHEN nam_hoan_thanh IS NOT NULL
                 AND nam_hoan_thanh > EXTRACT(YEAR FROM CURRENT_DATE)::int
                THEN 'Đúng tiến độ'
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 10
                 AND pct_so_lieu < 70
                THEN 'Chậm tiến độ'
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 7 AND 9
                 AND pct_so_lieu < 50
                THEN 'Chậm tiến độ'
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 4 AND 6
                 AND pct_so_lieu < 25
                THEN 'Chậm tiến độ'
            WHEN cap_nhat_luc IS NULL
                 AND EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                THEN 'Có rủi ro'
            WHEN EXTRACT(DAY FROM CURRENT_DATE) > 10
                 AND quy_cap_nhat IS NOT NULL
                 AND nam_cap_nhat = EXTRACT(YEAR FROM CURRENT_DATE)::int
                 AND quy_cap_nhat < EXTRACT(QUARTER FROM CURRENT_DATE)::int
                THEN 'Có rủi ro'
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 10 AND pct_so_lieu < 85
                THEN 'Có rủi ro'
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 7 AND 9
                 AND pct_so_lieu < 65
                THEN 'Có rủi ro'
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 4 AND 6
                 AND pct_so_lieu < 40
                THEN 'Có rủi ro'
            ELSE 'Đúng tiến độ'
        END AS trang_thai
    FROM kpi_l3
),
l2_rollup AS (
    SELECT
        mt2.id,
        ROUND(AVG(s.pct_so_lieu)::numeric, 2)::float AS pct_so_lieu
    FROM muc_tieu_nq mt2
    JOIN kpi_l3_status s ON s.muc_tieu_cha_id = mt2.id
    WHERE mt2.cap_do = 2
    GROUP BY mt2.id
),
l1_rollup AS (
    SELECT
        mt1.id,
        ROUND(AVG(r2.pct_so_lieu)::numeric, 2)::float AS pct_so_lieu
    FROM muc_tieu_nq mt1
    JOIN muc_tieu_nq c2 ON c2.muc_tieu_cha_id = mt1.id AND c2.cap_do = 2
    JOIN l2_rollup r2 ON r2.id = c2.id
    WHERE mt1.cap_do = 1
    GROUP BY mt1.id
)
SELECT
    s.id, s.ma_chi_tieu, s.ten, s.loai_chi_tieu, s.cap_do,
    s.muc_tieu_cha_id, s.nghi_quyet_id, s.gia_tri_muc_tieu, s.don_vi_do,
    s.don_vi_phu_trach_id, s.nam_hoan_thanh, s.can_bo_theo_doi_id,
    s.gia_tri_thuc_te_moi_nhat, s.pct_so_lieu, s.trang_thai, s.cap_nhat_luc
FROM kpi_l3_status s

UNION ALL

SELECT
    mt.id, mt.ma_chi_tieu, mt.ten, mt.loai_chi_tieu, mt.cap_do,
    mt.muc_tieu_cha_id, mt.nghi_quyet_id, mt.gia_tri_muc_tieu, mt.don_vi_do,
    mt.don_vi_phu_trach_id, mt.nam_hoan_thanh, mt.can_bo_theo_doi_id,
    NULL::float     AS gia_tri_thuc_te_moi_nhat,
    COALESCE(r2.pct_so_lieu, 0) AS pct_so_lieu,
    CASE
        WHEN COALESCE(r2.pct_so_lieu, 0) >= 100 THEN 'Hoàn thành'
        WHEN COALESCE(r2.pct_so_lieu, 0) < 40   THEN 'Chậm tiến độ'
        WHEN COALESCE(r2.pct_so_lieu, 0) < 60   THEN 'Có rủi ro'
        ELSE 'Đúng tiến độ'
    END AS trang_thai,
    NULL::timestamptz AS cap_nhat_luc
FROM muc_tieu_nq mt
LEFT JOIN l2_rollup r2 ON r2.id = mt.id
WHERE mt.cap_do = 2

UNION ALL

SELECT
    mt.id, mt.ma_chi_tieu, mt.ten, mt.loai_chi_tieu, mt.cap_do,
    mt.muc_tieu_cha_id, mt.nghi_quyet_id, mt.gia_tri_muc_tieu, mt.don_vi_do,
    mt.don_vi_phu_trach_id, mt.nam_hoan_thanh, mt.can_bo_theo_doi_id,
    NULL::float     AS gia_tri_thuc_te_moi_nhat,
    COALESCE(r1.pct_so_lieu, 0) AS pct_so_lieu,
    CASE
        WHEN COALESCE(r1.pct_so_lieu, 0) >= 100 THEN 'Hoàn thành'
        WHEN COALESCE(r1.pct_so_lieu, 0) < 40   THEN 'Chậm tiến độ'
        WHEN COALESCE(r1.pct_so_lieu, 0) < 60   THEN 'Có rủi ro'
        ELSE 'Đúng tiến độ'
    END AS trang_thai,
    NULL::timestamptz AS cap_nhat_luc
FROM muc_tieu_nq mt
LEFT JOIN l1_rollup r1 ON r1.id = mt.id
WHERE mt.cap_do = 1
""")


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_nq_tong_quan")
    op.drop_table('nq_lien_ket_cong_viec')
    op.drop_table('bang_theo_doi_chi_tieu')
    op.drop_table('muc_tieu_nq')
    op.drop_table('nghi_quyet')
