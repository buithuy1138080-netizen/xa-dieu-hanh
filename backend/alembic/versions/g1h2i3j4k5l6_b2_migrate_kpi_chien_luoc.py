"""b2: migrate kpi_chien_luoc data into kpis table

Revision ID: g1h2i3j4k5l6
Revises: f7a8b9c0d1e2
Create Date: 2026-06-12

The kpi_chien_luoc endpoint already writes to the kpis table (kpi_type='chien_luoc').
This migration migrates any legacy rows in kpi_chien_luoc that predate that refactor,
then migrates their progress history from kpi_cl_tien_do → kpi_progress.
Old tables are kept intact (no DROP).
"""
from alembic import op

revision = 'g1h2i3j4k5l6'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Migrate kpi_chien_luoc rows that don't already have a matching row in kpis
    op.execute("""
        INSERT INTO kpis (
            code, title, description, period, unit, category,
            target_value, current_value, progress, status,
            quarter, year, term_name, deadline,
            responsible_department_id, responsible_user_id, created_by,
            kpi_type, created_at, updated_at
        )
        SELECT
            cl.ma_kpi,
            cl.ten,
            cl.mo_ta,
            CASE cl.loai_kpi WHEN 'quy' THEN 'quarterly' ELSE 'yearly' END,
            cl.don_vi_do,
            cl.danh_muc,
            cl.gia_tri_muc_tieu,
            cl.gia_tri_thuc_te,
            cl.pct_hoan_thanh,
            CASE
                WHEN cl.pct_hoan_thanh >= 100           THEN 'completed'
                WHEN cl.trang_thai IN ('Có rủi ro')     THEN 'at_risk'
                WHEN cl.trang_thai IN ('Chậm tiến độ', 'Quá hạn') THEN 'behind'
                ELSE 'on_track'
            END,
            cl.quy,
            cl.nam,
            cl.ten_nhiem_ky,
            cl.han_hoan_thanh,
            cl.don_vi_phu_trach_id,
            cl.nguoi_theo_doi_id,
            cl.created_by,
            'chien_luoc',
            cl.created_at,
            cl.updated_at
        FROM kpi_chien_luoc cl
        WHERE NOT EXISTS (
            SELECT 1 FROM kpis k
            WHERE k.kpi_type = 'chien_luoc'
              AND k.created_by = cl.created_by
              AND k.year = cl.nam
              AND k.title = cl.ten
        )
    """)

    # Migrate progress history kpi_cl_tien_do → kpi_progress
    op.execute("""
        INSERT INTO kpi_progress (kpi_id, value, note, recorded_by, recorded_at)
        SELECT
            k.id,
            td.gia_tri,
            td.ghi_chu,
            COALESCE(td.nguoi_cap_nhat_id, cl.created_by),
            td.created_at
        FROM kpi_cl_tien_do td
        JOIN kpi_chien_luoc cl ON cl.id = td.kpi_id
        JOIN kpis k ON (
            k.kpi_type = 'chien_luoc'
            AND k.created_by = cl.created_by
            AND k.year = cl.nam
            AND k.title = cl.ten
        )
        WHERE NOT EXISTS (
            SELECT 1 FROM kpi_progress p
            WHERE p.kpi_id = k.id
              AND p.value = td.gia_tri
              AND p.recorded_at = td.created_at
        )
    """)


def downgrade() -> None:
    # Data migrations are not reversible without knowing which rows were inserted.
    # The kpi_chien_luoc source tables are untouched so data is preserved there.
    pass
