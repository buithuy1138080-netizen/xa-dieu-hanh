"""add staff assignee and dept issuer to docs/directives

Revision ID: b3f1c2d4e5a6
Revises: e8fc9b4a22f0
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'b3f1c2d4e5a6'
down_revision = 'e8fc9b4a22f0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # assignee_staff_id on documents (person from staff table who handles the doc)
    op.add_column('documents', sa.Column(
        'assignee_staff_id', sa.Integer(),
        sa.ForeignKey('staff.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_documents_assignee_staff_id', 'documents', ['assignee_staff_id'])

    # assignee_staff_id on directives
    op.add_column('directives', sa.Column(
        'assignee_staff_id', sa.Integer(),
        sa.ForeignKey('staff.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_directives_assignee_staff_id', 'directives', ['assignee_staff_id'])

    # responsible_department_id already exists on documents (from a62eedeeec8b migration)
    # No need to add it again


def downgrade() -> None:
    op.drop_index('ix_directives_assignee_staff_id', 'directives')
    op.drop_column('directives', 'assignee_staff_id')

    op.drop_index('ix_documents_assignee_staff_id', 'documents')
    op.drop_column('documents', 'assignee_staff_id')
