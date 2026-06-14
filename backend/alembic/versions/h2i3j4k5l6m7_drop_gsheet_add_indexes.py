"""Drop gsheet sync tables and add missing FK indexes.

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6, dd2e3f4a5b6c
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op

revision = 'h2i3j4k5l6m7'
down_revision = ('g1h2i3j4k5l6', 'dd2e3f4a5b6c')
branch_labels = None
depends_on = None


def _ci(name: str, table: str, cols: str) -> None:
    op.execute(f"""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename='{table}') THEN
                EXECUTE 'CREATE INDEX IF NOT EXISTS {name} ON {table} ({cols})';
            END IF;
        END $$;
    """)


def upgrade() -> None:
    # ── Drop GSheet sync tables (module removed) ─────────────────────────────
    op.execute("DROP TABLE IF EXISTS sync_conflicts CASCADE")
    op.execute("DROP TABLE IF EXISTS sync_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS sync_configs CASCADE")

    # ── kpis: missing indexes on FK and filter columns ────────────────────────
    _ci('ix_kpis_responsible_department_id', 'kpis', 'responsible_department_id')
    _ci('ix_kpis_responsible_user_id',       'kpis', 'responsible_user_id')
    _ci('ix_kpis_created_by',                'kpis', 'created_by')
    _ci('ix_kpis_program_id',                'kpis', 'program_id')
    _ci('ix_kpis_strategic_project_id',      'kpis', 'strategic_project_id')

    # ── nq57_tasks: missing indexes ───────────────────────────────────────────
    _ci('ix_nq57_tasks_kpi_id',                  'nq57_tasks', 'kpi_id')
    _ci('ix_nq57_tasks_directive_id',             'nq57_tasks', 'directive_id')
    _ci('ix_nq57_tasks_incoming_document_id',     'nq57_tasks', 'incoming_document_id')
    _ci('ix_nq57_tasks_outgoing_document_id',     'nq57_tasks', 'outgoing_document_id')
    _ci('ix_nq57_tasks_responsible_department_id','nq57_tasks', 'responsible_department_id')
    _ci('ix_nq57_tasks_created_by',               'nq57_tasks', 'created_by')

    # ── strategic_projects: missing indexes ───────────────────────────────────
    _ci('ix_strategic_projects_project_manager_id', 'strategic_projects', 'project_manager_id')
    _ci('ix_strategic_projects_created_by',         'strategic_projects', 'created_by')

    # ── muc_tieu_nq: missing indexes ──────────────────────────────────────────
    _ci('ix_muc_tieu_nq_don_vi_phu_trach_id', 'muc_tieu_nq', 'don_vi_phu_trach_id')
    _ci('ix_muc_tieu_nq_can_bo_theo_doi_id',  'muc_tieu_nq', 'can_bo_theo_doi_id')
    _ci('ix_muc_tieu_nq_created_by',          'muc_tieu_nq', 'created_by')

    # ── programs: missing indexes ─────────────────────────────────────────────
    _ci('ix_programs_created_by',          'programs', 'created_by')
    _ci('ix_programs_source_document_id',  'programs', 'source_document_id')

    # ── tasks: source_document_id ─────────────────────────────────────────────
    _ci('ix_tasks_source_document_id', 'tasks', 'source_document_id')

    # ── directives: doc_id ────────────────────────────────────────────────────
    _ci('ix_directives_doc_id', 'directives', 'doc_id')


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_directives_doc_id")
    op.execute("DROP INDEX IF EXISTS ix_tasks_source_document_id")
    op.execute("DROP INDEX IF EXISTS ix_programs_source_document_id")
    op.execute("DROP INDEX IF EXISTS ix_programs_created_by")
    op.execute("DROP INDEX IF EXISTS ix_muc_tieu_nq_created_by")
    op.execute("DROP INDEX IF EXISTS ix_muc_tieu_nq_can_bo_theo_doi_id")
    op.execute("DROP INDEX IF EXISTS ix_muc_tieu_nq_don_vi_phu_trach_id")
    op.execute("DROP INDEX IF EXISTS ix_strategic_projects_created_by")
    op.execute("DROP INDEX IF EXISTS ix_strategic_projects_project_manager_id")
    op.execute("DROP INDEX IF EXISTS ix_nq57_tasks_created_by")
    op.execute("DROP INDEX IF EXISTS ix_nq57_tasks_responsible_department_id")
    op.execute("DROP INDEX IF EXISTS ix_nq57_tasks_outgoing_document_id")
    op.execute("DROP INDEX IF EXISTS ix_nq57_tasks_incoming_document_id")
    op.execute("DROP INDEX IF EXISTS ix_nq57_tasks_directive_id")
    op.execute("DROP INDEX IF EXISTS ix_nq57_tasks_kpi_id")
    op.execute("DROP INDEX IF EXISTS ix_kpis_strategic_project_id")
    op.execute("DROP INDEX IF EXISTS ix_kpis_program_id")
    op.execute("DROP INDEX IF EXISTS ix_kpis_created_by")
    op.execute("DROP INDEX IF EXISTS ix_kpis_responsible_user_id")
    op.execute("DROP INDEX IF EXISTS ix_kpis_responsible_department_id")
    # GSheet tables: cannot restore dropped tables in downgrade
