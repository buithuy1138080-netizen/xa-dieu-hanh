"""add parent_task_id, task_type/group, kpi_type/term_name + migrate nq57 and kpicl data

Revision ID: y8z9a0b1c2d3
Revises: x7y8z9a0b1c2
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'y8z9a0b1c2d3'
down_revision = 'x7y8z9a0b1c2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Step 6: parent_task_id ────────────────────────────────────────────────
    op.add_column('tasks', sa.Column('parent_task_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_parent_task_id', 'tasks', 'tasks',
        ['parent_task_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_tasks_parent_task_id', 'tasks', ['parent_task_id'])

    # ── Step 7: task_type + task_group ───────────────────────────────────────
    op.add_column('tasks', sa.Column('task_type', sa.String(20), nullable=False, server_default='regular'))
    op.add_column('tasks', sa.Column('task_group', sa.String(100), nullable=True))
    op.create_index('ix_tasks_task_type', 'tasks', ['task_type'])

    # ── Step 8: kpi_type + term_name ─────────────────────────────────────────
    op.add_column('kpis', sa.Column('kpi_type', sa.String(20), nullable=False, server_default='regular'))
    op.add_column('kpis', sa.Column('term_name', sa.String(20), nullable=True))
    op.create_index('ix_kpis_kpi_type', 'kpis', ['kpi_type'])

    # ── Data migration: nq57_tasks → tasks ───────────────────────────────────
    op.execute("""
        INSERT INTO tasks (
            task_code, title, description, task_group, expected_output,
            status, priority, progress_percent, start_date, due_date,
            incoming_document_id, outgoing_document_id, directive_id, program_id,
            lead_department_id, assignee_id, assignee_staff_id,
            task_type, created_by, created_at, updated_at, deleted_at
        )
        SELECT
            code,
            title,
            description,
            "group",
            target,
            CASE WHEN status = 'delayed' THEN 'in_progress' ELSE status END,
            'medium',
            progress,
            start_date,
            CASE WHEN deadline IS NOT NULL
                 THEN (deadline::text || 'T23:59:59+00:00')::timestamptz
                 ELSE NULL END,
            incoming_document_id,
            outgoing_document_id,
            directive_id,
            program_id,
            responsible_department_id,
            responsible_user_id,
            responsible_staff_id,
            'nq57',
            created_by,
            created_at,
            updated_at,
            deleted_at
        FROM nq57_tasks
        WHERE NOT EXISTS (
            SELECT 1 FROM tasks
            WHERE task_type = 'nq57'
            AND task_code = nq57_tasks.code
            AND nq57_tasks.code IS NOT NULL
        )
        OR nq57_tasks.code IS NULL
    """)

    # ── Data migration: kpi_chien_luoc → kpis ────────────────────────────────
    op.execute("""
        INSERT INTO kpis (
            code, title, description, unit, category,
            target_value, current_value, progress,
            period, year, quarter,
            status, deadline,
            responsible_department_id, responsible_user_id,
            kpi_type, term_name,
            created_by, created_at, updated_at
        )
        SELECT
            ma_kpi,
            ten,
            mo_ta,
            don_vi_do,
            danh_muc,
            gia_tri_muc_tieu,
            gia_tri_thuc_te,
            pct_hoan_thanh,
            CASE loai_kpi
                WHEN 'nam'      THEN 'yearly'
                WHEN 'quy'      THEN 'quarterly'
                WHEN 'nhiem_ky' THEN 'yearly'
                ELSE 'yearly'
            END,
            nam,
            quy,
            CASE trang_thai
                WHEN 'Đạt mục tiêu' THEN 'completed'
                WHEN 'Có rủi ro'    THEN 'at_risk'
                WHEN 'Chậm tiến độ' THEN 'behind'
                WHEN 'Quá hạn'      THEN 'behind'
                ELSE 'on_track'
            END,
            han_hoan_thanh,
            don_vi_phu_trach_id,
            nguoi_theo_doi_id,
            'chien_luoc',
            ten_nhiem_ky,
            created_by,
            created_at,
            updated_at
        FROM kpi_chien_luoc
        WHERE NOT EXISTS (
            SELECT 1 FROM kpis
            WHERE kpi_type = 'chien_luoc'
            AND code = kpi_chien_luoc.ma_kpi
            AND kpi_chien_luoc.ma_kpi IS NOT NULL
        )
        OR kpi_chien_luoc.ma_kpi IS NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_kpis_kpi_type', 'kpis')
    op.drop_column('kpis', 'term_name')
    op.drop_column('kpis', 'kpi_type')

    op.drop_index('ix_tasks_task_type', 'tasks')
    op.drop_column('tasks', 'task_group')
    op.drop_column('tasks', 'task_type')

    op.drop_index('ix_tasks_parent_task_id', 'tasks')
    op.drop_constraint('fk_tasks_parent_task_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'parent_task_id')
    # Note: migrated nq57/kpi data is not removed on downgrade to preserve data
