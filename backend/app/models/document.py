from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.staff import Staff
    from app.models.task import Task
    from app.models.user import User


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    doc_number: Mapped[str | None] = mapped_column(String(100), index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(30), nullable=False, default="incoming", index=True)
    category: Mapped[str | None] = mapped_column(String(50))
    issuer: Mapped[str | None] = mapped_column(String(200), index=True)
    issue_date: Mapped[date | None] = mapped_column(Date)
    received_date: Mapped[date | None] = mapped_column(Date)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", index=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    summary: Mapped[str | None] = mapped_column(Text)

    file_name: Mapped[str | None] = mapped_column(String(255))
    file_path: Mapped[str | None] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    file_mime: Mapped[str | None] = mapped_column(String(100))

    # Source tracking — outgoing doc may originate from incoming doc or directive
    source_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_directive_id: Mapped[int | None] = mapped_column(
        ForeignKey("directives.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Responsible department (relational)
    responsible_department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee_staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL"), nullable=True, index=True
    )

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    assignee: Mapped[User | None] = relationship("User", foreign_keys=[assignee_id])
    assignee_staff: Mapped[Staff | None] = relationship("Staff", foreign_keys=[assignee_staff_id])
    source_document: Mapped[Document | None] = relationship("Document", foreign_keys=[source_document_id], remote_side="Document.id")
    responsible_department: Mapped[Department | None] = relationship("Department", foreign_keys=[responsible_department_id])
    comments: Mapped[list[DocumentComment]] = relationship(
        "DocumentComment", back_populates="document", cascade="all, delete-orphan"
    )
    history: Mapped[list[DocumentHistory]] = relationship(
        "DocumentHistory", back_populates="document", cascade="all, delete-orphan",
        order_by="DocumentHistory.created_at.desc()",
    )
    linked_tasks: Mapped[list[DocumentTask]] = relationship(
        "DocumentTask", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentComment(Base):
    __tablename__ = "document_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship("Document", back_populates="comments")
    user: Mapped[User] = relationship("User")


class DocumentHistory(Base):
    __tablename__ = "document_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship("Document", back_populates="history")
    user: Mapped[User] = relationship("User")


class DocumentTask(Base):
    __tablename__ = "document_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False, index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship("Document", back_populates="linked_tasks")
    task: Mapped[Task] = relationship("Task")
