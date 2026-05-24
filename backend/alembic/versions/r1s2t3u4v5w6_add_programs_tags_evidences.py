"""Add tags, programs, document_tags, document_programs, evidences tables.
Also add program_id + source_document_id to tasks and kpis.

Revision ID: r1s2t3u4v5w6
Revises: q0r1s2t3u4v5
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'r1s2t3u4v5w6'
down_revision = 'q0r1s2t3u4v5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── tags ──────────────────────────────────────────────────────────────────
    op.create_table(
        'tags',
        sa.Column('id',         sa.Integer(),     primary_key=True),
        sa.Column('code',       sa.String(50),    nullable=False),
        sa.Column('name',       sa.String(200),   nullable=False),
        sa.Column('color',      sa.String(7),     server_default='#3B82F6'),
        sa.Column('icon',       sa.String(50),    nullable=True),
        sa.Column('tag_type',   sa.String(30),    server_default='program'),
        sa.Column('parent_id',  sa.Integer(),     sa.ForeignKey('tags.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_active',  sa.Boolean(),     server_default='true'),
        sa.Column('sort_order', sa.Integer(),     server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_tags_code',      'tags', ['code'],      unique=True)
    op.create_index('ix_tags_parent_id', 'tags', ['parent_id'], unique=False)

    # ── programs ──────────────────────────────────────────────────────────────
    op.create_table(
        'programs',
        sa.Column('id',                 sa.Integer(),   primary_key=True),
        sa.Column('code',               sa.String(50),  nullable=False),
        sa.Column('name',               sa.String(500), nullable=False),
        sa.Column('short_name',         sa.String(100), nullable=True),
        sa.Column('program_type',       sa.String(30),  server_default='nghi_quyet'),
        sa.Column('tag_id',             sa.Integer(),   sa.ForeignKey('tags.id',      ondelete='SET NULL'), nullable=True),
        sa.Column('issued_date',        sa.Date(),      nullable=True),
        sa.Column('effective_date',     sa.Date(),      nullable=True),
        sa.Column('end_date',           sa.Date(),      nullable=True),
        sa.Column('issuing_body',       sa.String(200), nullable=True),
        sa.Column('scope',              sa.String(30),  server_default='xa'),
        sa.Column('status',             sa.String(20),  server_default='active'),
        sa.Column('description',        sa.Text(),      nullable=True),
        sa.Column('source_document_id', sa.Integer(),   sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by',         sa.Integer(),   sa.ForeignKey('users.id'),    nullable=False),
        sa.Column('created_at',         sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('updated_at',         sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_programs_code',   'programs', ['code'],   unique=True)
    op.create_index('ix_programs_status', 'programs', ['status'], unique=False)
    op.create_index('ix_programs_tag_id', 'programs', ['tag_id'], unique=False)

    # ── document_tags ─────────────────────────────────────────────────────────
    op.create_table(
        'document_tags',
        sa.Column('id',          sa.Integer(), primary_key=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tag_id',      sa.Integer(), sa.ForeignKey('tags.id',      ondelete='CASCADE'), nullable=False),
        sa.Column('tagged_by',   sa.Integer(), sa.ForeignKey('users.id',     ondelete='SET NULL'), nullable=True),
        sa.Column('note',        sa.Text(),    nullable=True),
        sa.Column('tagged_at',   sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_doc_tags_document_id', 'document_tags', ['document_id'], unique=False)
    op.create_index('ix_doc_tags_tag_id',      'document_tags', ['tag_id'],      unique=False)
    op.create_unique_constraint('uq_document_tags', 'document_tags', ['document_id', 'tag_id'])

    # ── document_programs ─────────────────────────────────────────────────────
    op.create_table(
        'document_programs',
        sa.Column('id',          sa.Integer(), primary_key=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('program_id',  sa.Integer(), sa.ForeignKey('programs.id',  ondelete='CASCADE'), nullable=False),
        sa.Column('link_type',   sa.String(30), server_default='implements'),
        sa.Column('note',        sa.Text(),    nullable=True),
        sa.Column('created_by',  sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_doc_programs_document_id', 'document_programs', ['document_id'], unique=False)
    op.create_index('ix_doc_programs_program_id',  'document_programs', ['program_id'],  unique=False)

    # ── evidences ─────────────────────────────────────────────────────────────
    op.create_table(
        'evidences',
        sa.Column('id',            sa.Integer(),    primary_key=True),
        sa.Column('entity_type',   sa.String(30),   nullable=False),
        sa.Column('entity_id',     sa.Integer(),    nullable=False),
        sa.Column('title',         sa.String(500),  nullable=False),
        sa.Column('evidence_type', sa.String(30),   server_default='document'),
        sa.Column('file_name',     sa.String(255),  nullable=True),
        sa.Column('file_path',     sa.String(500),  nullable=True),
        sa.Column('file_size',     sa.Integer(),    server_default='0'),
        sa.Column('file_mime',     sa.String(100),  nullable=True),
        sa.Column('external_url',  sa.String(1000), nullable=True),
        sa.Column('description',   sa.Text(),       nullable=True),
        sa.Column('verified',      sa.Boolean(),    server_default='false'),
        sa.Column('verified_by',   sa.Integer(),    sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('verified_at',   sa.DateTime(timezone=True), nullable=True),
        sa.Column('uploaded_by',   sa.Integer(),    sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('uploaded_at',   sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_evidences_entity', 'evidences', ['entity_type', 'entity_id'], unique=False)

    # ── Extend tasks ──────────────────────────────────────────────────────────
    op.add_column('tasks', sa.Column('program_id',
        sa.Integer(), sa.ForeignKey('programs.id', ondelete='SET NULL'), nullable=True))
    op.add_column('tasks', sa.Column('source_document_id',
        sa.Integer(), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True))
    op.add_column('tasks', sa.Column('expected_output', sa.Text(), nullable=True))
    op.add_column('tasks', sa.Column('completion_condition', sa.Text(), nullable=True))
    op.add_column('tasks', sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tasks', sa.Column('confirmed_by',
        sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('tasks', sa.Column('rejection_note', sa.Text(), nullable=True))
    op.create_index('ix_tasks_program_id', 'tasks', ['program_id'], unique=False)

    # ── Extend kpis ───────────────────────────────────────────────────────────
    op.add_column('kpis', sa.Column('program_id',
        sa.Integer(), sa.ForeignKey('programs.id', ondelete='SET NULL'), nullable=True))
    op.add_column('kpis', sa.Column('source_document_id',
        sa.Integer(), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True))
    op.add_column('kpis', sa.Column('parent_kpi_id',
        sa.Integer(), sa.ForeignKey('kpis.id', ondelete='SET NULL'), nullable=True))
    op.add_column('kpis', sa.Column('level', sa.Integer(), server_default='1'))
    op.add_column('kpis', sa.Column('field', sa.String(100), nullable=True))
    op.add_column('kpis', sa.Column('baseline_value', sa.Float(), server_default='0'))
    op.add_column('kpis', sa.Column('threshold_red',    sa.Float(), server_default='50'))
    op.add_column('kpis', sa.Column('threshold_yellow', sa.Float(), server_default='80'))
    op.add_column('kpis', sa.Column('measurement_method', sa.Text(), nullable=True))
    op.create_index('ix_kpis_program_id',    'kpis', ['program_id'],    unique=False)
    op.create_index('ix_kpis_parent_kpi_id', 'kpis', ['parent_kpi_id'], unique=False)

    # ── Seed default tags ─────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO tags (code, name, color, icon, tag_type, sort_order) VALUES
        ('nq57',     'Nghị quyết 57-NQ/TW',          '#7C3AED', 'landmark',   'program', 1),
        ('de_an_06', 'Đề án 06 - VNeID',              '#2563EB', 'id-card',    'program', 2),
        ('cds',      'Chuyển đổi số',                 '#0891B2', 'cpu',        'topic',   3),
        ('khcn',     'Khoa học công nghệ',            '#059669', 'flask',      'topic',   4),
        ('attt',     'An toàn thông tin',              '#DC2626', 'shield',     'topic',   5),
        ('dvc',      'Dịch vụ công trực tuyến',       '#D97706', 'globe',      'topic',   6),
        ('ubnd',     'UBND xã - Chỉ đạo điều hành',  '#475569', 'building-2', 'program', 7),
        ('khan_cap', 'Khẩn cấp',                      '#EF4444', 'alert',      'urgency', 8)
        ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    # Xóa cột mở rộng
    for col in ['threshold_yellow', 'threshold_red', 'baseline_value', 'field',
                'level', 'parent_kpi_id', 'source_document_id', 'program_id',
                'measurement_method']:
        op.drop_column('kpis', col)

    for col in ['rejection_note', 'confirmed_by', 'confirmed_at',
                'completion_condition', 'expected_output',
                'source_document_id', 'program_id']:
        op.drop_column('tasks', col)

    op.drop_table('evidences')
    op.drop_table('document_programs')
    op.drop_table('document_tags')
    op.drop_table('programs')
    op.drop_table('tags')
