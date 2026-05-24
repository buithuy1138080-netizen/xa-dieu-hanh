from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.document import Document
    from app.models.directive import Directive
    from app.models.staff import Staff
    from app.models.user import User


class Task(Base):
    __tablename__ = "tasks"

    # ── Core ──────────────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_code: Mapped[str | None] = mapped_column(String(30), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    content_summary: Mapped[str | None] = mapped_column(Text)

    # ── Status & Priority ─────────────────────────────────────────────────────
    # status: pending | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # priority: low | medium | high | urgent
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium", index=True)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)

    # ── Time ─────────────────────────────────────────────────────────────────
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── Source tracking ───────────────────────────────────────────────────────
    incoming_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    outgoing_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    directive_id: Mapped[int | None] = mapped_column(
        ForeignKey("directives.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    program_id: Mapped[int | None] = mapped_column(
        ForeignKey("programs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # ── 6 Rõ ─────────────────────────────────────────────────────────────────
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── People ────────────────────────────────────────────────────────────────
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    supervising_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # ── Department ────────────────────────────────────────────────────────────
    lead_department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # ── Classification (task_type discriminates nq57 vs regular) ──────────────
    task_type: Mapped[str] = mapped_column(String(20), default="regular", index=True)
    task_group: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Settings ─────────────────────────────────────────────────────────────
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    overdue_warning: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_note: Mapped[str | None] = mapped_column(Text)

    # ── Soft delete ───────────────────────────────────────────────────────────
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # ── Relationships ─────────────────────────────────────────────────────────
    parent: Mapped["Task | None"] = relationship("Task", foreign_keys=[parent_task_id], remote_side="Task.id", lazy="noload", overlaps="subtasks")
    subtasks: Mapped[list["Task"]] = relationship("Task", foreign_keys=[parent_task_id], lazy="noload", overlaps="parent")

    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    updater: Mapped[User | None] = relationship("User", foreign_keys=[updated_by])
    assignee: Mapped[User | None] = relationship("User", foreign_keys=[assignee_id])
    assignee_staff: Mapped[Staff | None] = relationship("Staff", foreign_keys=[assignee_staff_id])
    supervisor: Mapped[User | None] = relationship("User", foreign_keys=[supervising_user_id])
    lead_department: Mapped[Department | None] = relationship("Department", foreign_keys=[lead_department_id])
    incoming_document: Mapped[Document | None] = relationship("Document", foreign_keys=[incoming_document_id])
    outgoing_document: Mapped[Document | None] = relationship("Document", foreign_keys=[outgoing_document_id])
    directive: Mapped[Directive | None] = relationship("Directive", foreign_keys=[directive_id])

    departments: Mapped[list[TaskDepartment]] = relationship(
        "TaskDepartment", back_populates="task", cascade="all, delete-orphan"
    )
    comments: Mapped[list[TaskComment]] = relationship(
        "TaskComment", back_populates="task", cascade="all, delete-orphan"
    )
    attachments: Mapped[list[TaskAttachment]] = relationship(
        "TaskAttachment", back_populates="task", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list[TaskAuditLog]] = relationship(
        "TaskAuditLog", back_populates="task", cascade="all, delete-orphan"
    )


class TaskDepartment(Base):
    """Junction table — một nhiệm vụ có thể có nhiều đơn vị với vai trò khác nhau."""
    __tablename__ = "task_departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # role: lead | coordinating
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="coordinating")

    task: Mapped[Task] = relationship("Task", back_populates="departments")
    department: Mapped[Department] = relationship("Department")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="comments")
    user: Mapped[User] = relationship("User")


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="attachments")
    user: Mapped[User] = relationship("User")


class TaskAuditLog(Base):
    __tablename__ = "task_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    field: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship("Task", back_populates="audit_logs")
    user: Mapped[User] = relationship("User")
