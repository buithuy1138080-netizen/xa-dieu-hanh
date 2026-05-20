from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.staff import Staff


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    short_name: Mapped[str | None] = mapped_column(String(50))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    dept_type: Mapped[str] = mapped_column(String(50), default="unit")  # unit/division/team
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    parent: Mapped[Department | None] = relationship("Department", remote_side="Department.id", foreign_keys=[parent_id])
    children: Mapped[list[Department]] = relationship("Department", back_populates="parent", foreign_keys=[parent_id])
    staff: Mapped[list[Staff]] = relationship("Staff", back_populates="department")
