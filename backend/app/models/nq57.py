from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.directive import Directive
    from app.models.document import Document
    from app.models.kpi import KPI
    from app.models.program import Program
    from app.models.staff import Staff
    from app.models.user import User


class NQ57Task(Base):
    __tablename__ = "nq57_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)           # NQ57-001
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    group: Mapped[str | None] = mapped_column(String(100), nullable=True)         # Nhóm nhiệm vụ
    target: Mapped[str | None] = mapped_column(Text, nullable=True)               # Chỉ tiêu cần đạt

    progress: Mapped[int] = mapped_column(Integer, default=0)                     # 0-100 %
    status: Mapped[str] = mapped_column(String(20), default="pending")            # pending/in_progress/completed/delayed

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)

    responsible_unit: Mapped[str | None] = mapped_column(String(200), nullable=True)
    coordinating_dept_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    responsible_department_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    responsible_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    responsible_staff_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kpi_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("kpis.id", ondelete="SET NULL"), nullable=True
    )
    incoming_document_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    outgoing_document_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    directive_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("directives.id", ondelete="SET NULL"), nullable=True
    )
    program_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("programs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    responsible_department: Mapped[Department | None] = relationship("Department", foreign_keys=[responsible_department_id])
    responsible_user: Mapped[User | None] = relationship("User", foreign_keys=[responsible_user_id])
    responsible_staff: Mapped[Staff | None] = relationship("Staff", foreign_keys=[responsible_staff_id])
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    kpi: Mapped[KPI | None] = relationship("KPI", foreign_keys=[kpi_id])
    program: Mapped["Program | None"] = relationship("Program", foreign_keys=[program_id])
    incoming_document: Mapped["Document | None"] = relationship("Document", foreign_keys=[incoming_document_id])
    outgoing_document: Mapped["Document | None"] = relationship("Document", foreign_keys=[outgoing_document_id])
    directive: Mapped["Directive | None"] = relationship("Directive", foreign_keys=[directive_id])
    progress_entries: Mapped[list[NQ57Progress]] = relationship(
        "NQ57Progress", back_populates="task",
        cascade="all, delete-orphan",
        order_by="NQ57Progress.created_at.desc()",
    )


class NQ57Progress(Base):
    __tablename__ = "nq57_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("nq57_tasks.id", ondelete="CASCADE"), nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False)                # % mới
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[NQ57Task] = relationship("NQ57Task", back_populates="progress_entries")
    user: Mapped[User] = relationship("User", foreign_keys=[user_id])
