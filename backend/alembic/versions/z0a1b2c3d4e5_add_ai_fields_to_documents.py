"""add ai fields to documents

Revision ID: z0a1b2c3d4e5
Revises: y8z9a0b1c2d3
Create Date: 2026-05-22

Adds:
  - raw_text   : full extracted text from OCR/parsing
  - ai_processed: flag — AI has analysed this document
  - keywords   : JSON array of extracted keywords
  - domain     : detected sector/domain (lĩnh vực)
"""
from alembic import op
import sqlalchemy as sa

revision = "z0a1b2c3d4e5"
down_revision = "y8z9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("raw_text", sa.Text(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column(
            "ai_processed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "documents",
        sa.Column(
            "keywords",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )
    op.add_column(
        "documents",
        sa.Column("domain", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "domain")
    op.drop_column("documents", "keywords")
    op.drop_column("documents", "ai_processed")
    op.drop_column("documents", "raw_text")
