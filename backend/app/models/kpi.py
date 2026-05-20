from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.staff import Staff
    from app.models.user import User


class KPI(Base):
    __tablename__ = "kpis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)       # %, người, tỷ đồng...
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Kinh tế, Xã hội...

    target_value: Mapped[float] = mapped_column(Float, default=100.0)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    progress: Mapped[float] = mapped_column(Float, default=0.0)               # % computed

    period: Mapped[str] = mapped_column(String(20), default="yearly")         # monthly/quarterly/yearly
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    quarter: Mapped[int | None] = mapped_column(Integer, nullable=True)       # 1-4
    month: Mapped[int | None] = mapped_column(Integer, nullable=True)         # 1-12

    status: Mapped[str] = mapped_column(String(20), default="on_track")       # on_track/at_risk/behind/completed
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)

    responsible_unit: Mapped[str | None] = mapped_column(String(200), nullable=True)
    responsible_department_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    responsible_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    responsible_staff_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    responsible_department: Mapped[Department | None] = relationship("Department", foreign_keys=[responsible_department_id])
    responsible_user: Mapped[User | None] = relationship("User", foreign_keys=[responsible_user_id])
    responsible_staff: Mapped[Staff | None] = relationship("Staff", foreign_keys=[responsible_staff_id])
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    progress_entries: Mapped[list[KPIProgress]] = relationship("KPIProgress", back_populates="kpi", cascade="all, delete-orphan", order_by="KPIProgress.recorded_at.desc()")
    history: Mapped[list[KPIHistory]] = relationship("KPIHistory", back_populates="kpi", cascade="all, delete-orphan", order_by="KPIHistory.created_at.desc()")


class KPIProgress(Base):
    __tablename__ = "kpi_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    kpi_id: Mapped[int] = mapped_column(Integer, ForeignKey("kpis.id", ondelete="CASCADE"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    kpi: Mapped[KPI] = relationship("KPI", back_populates="progress_entries")
    user: Mapped[User] = relationship("User", foreign_keys=[recorded_by])


class KPIHistory(Base):
    __tablename__ = "kpi_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    kpi_id: Mapped[int] = mapped_column(Integer, ForeignKey("kpis.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    old_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    new_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    old_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    kpi: Mapped[KPI] = relationship("KPI", back_populates="history")
    user: Mapped[User] = relationship("User", foreign_keys=[user_id])
