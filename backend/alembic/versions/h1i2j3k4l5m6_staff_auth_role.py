"""staff_auth_role — add role + password_hash to staff, data-migrate from users

Revision ID: h1i2j3k4l5m6
Revises: g9h8i7j6k5l4
Create Date: 2026-05-19 10:00:00.000000

Strategy:
  1. Add role + password_hash columns to staff
  2. Copy role + hashed_password from linked users → staff
  3. Create staff records for users that have no linked staff (e.g. admin)
  4. Link newly-created staff back to their users
"""
from alembic import op
import sqlalchemy as sa

revision = 'h1i2j3k4l5m6'
down_revision = 'g9h8i7j6k5l4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns
    op.add_column('staff', sa.Column('role', sa.String(20), nullable=False, server_default='staff'))
    op.add_column('staff', sa.Column('password_hash', sa.String(255), nullable=True))

    # 2. Copy role + password from linked users into staff
    op.execute("""
        UPDATE staff
        SET role          = u.role,
            password_hash = u.hashed_password
        FROM users u
        WHERE staff.user_id = u.id
    """)

    # 3. Create staff records for users that have NO linked staff (e.g. admin account)
    op.execute("""
        INSERT INTO staff (full_name, email, role, password_hash, is_active, employee_code, created_at)
        SELECT
            COALESCE(u.full_name, u.username)   AS full_name,
            u.email,
            u.role,
            u.hashed_password,
            u.is_active,
            'ADM' || u.id::text                 AS employee_code,
            NOW()
        FROM users u
        WHERE u.id NOT IN (
            SELECT user_id FROM staff WHERE user_id IS NOT NULL
        )
    """)

    # 4. Link back: set user_id for the newly inserted staff rows (matched by email)
    op.execute("""
        UPDATE staff
        SET user_id = u.id
        FROM users u
        WHERE staff.email = u.email
          AND staff.user_id IS NULL
    """)


def downgrade() -> None:
    op.drop_column('staff', 'password_hash')
    op.drop_column('staff', 'role')
