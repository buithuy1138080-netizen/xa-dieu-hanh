"""Replace ocr_documents.linked_task_ids JSON with proper junction table.

Revision ID: o8p9q0r1s2t3
Revises: n7o8p9q0r1s2
Create Date: 2026-05-20
"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'o8p9q0r1s2t3'
down_revision = 'n7o8p9q0r1s2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create junction table
    op.create_table(
        'ocr_document_tasks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('ocr_id', sa.Integer(), sa.ForeignKey('ocr_documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
    )
    op.create_index('ix_ocr_document_tasks_ocr_id', 'ocr_document_tasks', ['ocr_id'])
    op.create_index('ix_ocr_document_tasks_task_id', 'ocr_document_tasks', ['task_id'])

    # 2. Migrate existing JSON data → junction rows
    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT id, linked_task_ids FROM ocr_documents WHERE linked_task_ids IS NOT NULL AND linked_task_ids::text != 'null'")
    ).fetchall()

    for ocr_id, raw in rows:
        try:
            task_ids = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(task_ids, list):
                continue
            for task_id in task_ids:
                if not isinstance(task_id, int):
                    continue
                # Only insert if task still exists
                exists = conn.execute(
                    text("SELECT id FROM tasks WHERE id = :tid"), {"tid": task_id}
                ).scalar_one_or_none()
                if exists:
                    conn.execute(
                        text("INSERT INTO ocr_document_tasks (ocr_id, task_id) VALUES (:oid, :tid)"),
                        {"oid": ocr_id, "tid": task_id},
                    )
        except Exception:
            pass  # Skip malformed rows

    # 3. Drop the JSON column now that data is migrated
    op.drop_column('ocr_documents', 'linked_task_ids')


def downgrade() -> None:
    # Re-add JSON column and backfill from junction table
    op.add_column(
        'ocr_documents',
        sa.Column('linked_task_ids', sa.JSON(), nullable=True),
    )
    conn = op.get_bind()
    rows = conn.execute(
        text("SELECT ocr_id, task_id FROM ocr_document_tasks ORDER BY ocr_id, id")
    ).fetchall()

    from collections import defaultdict
    grouped: dict = defaultdict(list)
    for ocr_id, task_id in rows:
        grouped[ocr_id].append(task_id)

    for ocr_id, task_ids in grouped.items():
        conn.execute(
            text("UPDATE ocr_documents SET linked_task_ids = :v WHERE id = :id"),
            {"v": json.dumps(task_ids), "id": ocr_id},
        )

    op.drop_index('ix_ocr_document_tasks_task_id', table_name='ocr_document_tasks')
    op.drop_index('ix_ocr_document_tasks_ocr_id', table_name='ocr_document_tasks')
    op.drop_table('ocr_document_tasks')
