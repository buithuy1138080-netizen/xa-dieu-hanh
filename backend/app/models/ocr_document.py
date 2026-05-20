from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.task import Task
    from app.models.user import User


class OcrDocument(Base):
    __tablename__ = "ocr_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(512))
    file_type: Mapped[str] = mapped_column(String(10))   # pdf / jpg / png
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    page_count: Mapped[int] = mapped_column(Integer, default=1)

    # pending → processing → done / failed
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_msg: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Soft link to created Document (no FK constraint — document may be deleted)
    document_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    linked_tasks: Mapped[list[OcrDocumentTask]] = relationship(
        "OcrDocumentTask", back_populates="ocr_document", cascade="all, delete-orphan"
    )

    @property
    def linked_task_ids(self) -> list[int]:
        return [lt.task_id for lt in self.linked_tasks]


class OcrDocumentTask(Base):
    """Junction table linking an OcrDocument to the Tasks it created."""
    __tablename__ = "ocr_document_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ocr_id: Mapped[int] = mapped_column(
        ForeignKey("ocr_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )

    ocr_document: Mapped[OcrDocument] = relationship("OcrDocument", back_populates="linked_tasks")
    task: Mapped[Task] = relationship("Task")
