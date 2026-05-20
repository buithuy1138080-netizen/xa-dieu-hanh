"""Migrate coordinating_department_ids to project_departments junction table.

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-05-19
"""
import sqlalchemy as sa
from alembic import op

revision = 'j3k4l5m6n7o8'
down_revision = 'i2j3k4l5m6n7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create junction table
    op.create_table(
        'project_departments',
        sa.Column('project_id', sa.Integer,
                  sa.ForeignKey('strategic_projects.id', ondelete='CASCADE'),
                  primary_key=True, nullable=False),
        sa.Column('department_id', sa.Integer,
                  sa.ForeignKey('departments.id', ondelete='CASCADE'),
                  primary_key=True, nullable=False),
    )
    op.create_index('ix_project_departments_project_id', 'project_departments', ['project_id'])

    # 2. Migrate comma-separated data → junction rows (PostgreSQL PL/pgSQL)
    op.execute(sa.text("""
        DO $$
        DECLARE
            rec       RECORD;
            id_str    TEXT;
        BEGIN
            FOR rec IN
                SELECT id, coordinating_department_ids
                FROM   strategic_projects
                WHERE  coordinating_department_ids IS NOT NULL
                  AND  coordinating_department_ids <> ''
            LOOP
                FOREACH id_str IN ARRAY string_to_array(rec.coordinating_department_ids, ',')
                LOOP
                    id_str := trim(id_str);
                    IF id_str ~ '^[0-9]+$' THEN
                        INSERT INTO project_departments (project_id, department_id)
                        VALUES (rec.id, id_str::integer)
                        ON CONFLICT DO NOTHING;
                    END IF;
                END LOOP;
            END LOOP;
        END;
        $$
    """))

    # 3. Drop the old denormalised column
    op.drop_column('strategic_projects', 'coordinating_department_ids')


def downgrade() -> None:
    # Reverse: add column back, re-aggregate from junction table, drop junction table
    op.add_column('strategic_projects',
                  sa.Column('coordinating_department_ids', sa.String(500), nullable=True))

    op.execute(sa.text("""
        UPDATE strategic_projects sp
        SET    coordinating_department_ids = sub.ids
        FROM (
            SELECT project_id,
                   string_agg(department_id::text, ',') AS ids
            FROM   project_departments
            GROUP BY project_id
        ) sub
        WHERE sp.id = sub.project_id
    """))

    op.drop_index('ix_project_departments_project_id', table_name='project_departments')
    op.drop_table('project_departments')
