"""
evidence.py — Minh chứng đa hình (gắn vào task / kpi / project).
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Evidence(Base):
    __tablename__ = "evidences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Polymorphic: task | kpi | project | nq57_task
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(30), default="document")
    # document | photo | report | meeting_minute | survey | link

    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    file_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    verifier: Mapped[User | None] = relationship("User", foreign_keys=[verified_by])
    uploader: Mapped[User | None] = relationship("User", foreign_keys=[uploaded_by])
