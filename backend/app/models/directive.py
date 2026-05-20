from __future__ import annotations

import shutil
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.document import Document
    from app.models.staff import Staff
    from app.models.task import Task
    from app.models.user import User


class Directive(Base):
    __tablename__ = "directives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    content: Mapped[str | None] = mapped_column(Text)
    issuer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    issued_date: Mapped[date | None] = mapped_column(Date)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    progress: Mapped[int] = mapped_column(Integer, default=0)
    doc_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    responsible_department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    assignee_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    issuer: Mapped[User] = relationship("User", foreign_keys=[issuer_id])
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    assignee_staff: Mapped[Staff | None] = relationship("Staff", foreign_keys=[assignee_staff_id])
    document: Mapped[Document | None] = relationship("Document", foreign_keys="[Directive.doc_id]")
    responsible_department: Mapped[Department | None] = relationship("Department", foreign_keys=[responsible_department_id])
    units: Mapped[list[DirectiveUnit]] = relationship(
        "DirectiveUnit", back_populates="directive", cascade="all, delete-orphan"
    )
    linked_tasks: Mapped[list[DirectiveTask]] = relationship(
        "DirectiveTask", back_populates="directive", cascade="all, delete-orphan"
    )
    comments: Mapped[list[DirectiveComment]] = relationship(
        "DirectiveComment", back_populates="directive", cascade="all, delete-orphan"
    )
    history: Mapped[list[DirectiveHistory]] = relationship(
        "DirectiveHistory", back_populates="directive", cascade="all, delete-orphan",
        order_by="DirectiveHistory.created_at.desc()",
    )
    attachments: Mapped[list[DirectiveAttachment]] = relationship(
        "DirectiveAttachment", back_populates="directive", cascade="all, delete-orphan"
    )


class DirectiveUnit(Base):
    __tablename__ = "directive_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    directive_id: Mapped[int] = mapped_column(ForeignKey("directives.id"), nullable=False, index=True)
    unit_name: Mapped[str] = mapped_column(String(200), nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="Thực hiện")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    directive: Mapped[Directive] = relationship("Directive", back_populates="units")
    user: Mapped[User | None] = relationship("User")
    department: Mapped[Department | None] = relationship("Department")


class DirectiveTask(Base):
    __tablename__ = "directive_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    directive_id: Mapped[int] = mapped_column(ForeignKey("directives.id"), nullable=False, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    directive: Mapped[Directive] = relationship("Directive", back_populates="linked_tasks")
    task: Mapped[Task] = relationship("Task")


class DirectiveComment(Base):
    __tablename__ = "directive_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    directive_id: Mapped[int] = mapped_column(ForeignKey("directives.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    directive: Mapped[Directive] = relationship("Directive", back_populates="comments")
    user: Mapped[User] = relationship("User")


class DirectiveHistory(Base):
    __tablename__ = "directive_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    directive_id: Mapped[int] = mapped_column(ForeignKey("directives.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str | None] = mapped_column(String(30))
    old_progress: Mapped[int | None] = mapped_column(Integer)
    new_progress: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    directive: Mapped[Directive] = relationship("Directive", back_populates="history")
    user: Mapped[User] = relationship("User")


class DirectiveAttachment(Base):
    __tablename__ = "directive_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    directive_id: Mapped[int] = mapped_column(ForeignKey("directives.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    file_mime: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    directive: Mapped[Directive] = relationship("Directive", back_populates="attachments")
    user: Mapped[User] = relationship("User")
