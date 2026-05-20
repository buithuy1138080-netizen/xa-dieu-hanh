from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User

TEMPLATE_CATEGORIES = ["nq57", "weekly", "monthly", "directive", "kpi", "custom"]


class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    file_ext: Mapped[str] = mapped_column(String(10), nullable=False)   # xlsx | docx
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Discovered variables (populated on upload)
    variables_json: Mapped[list | None] = mapped_column(JSON, nullable=True)        # scalar var names
    list_variables_json: Mapped[list | None] = mapped_column(JSON, nullable=True)   # loop var names

    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
