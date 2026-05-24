"""
program.py — Tags nghiệp vụ + Chương trình/Nghị quyết + liên kết văn bản.

Thiết kế theo mô hình "Kho văn bản trung tâm":
  - Tag: phân loại đa chiều (NQ57, CĐS, Đề án 06...)
  - Program: chương trình/nghị quyết tổng thể
  - DocumentTag: văn bản ↔ tag (many-to-many)
  - DocumentProgram: văn bản ↔ chương trình (many-to-many với link_type)
"""
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.user import User


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#3B82F6")   # hex
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tag_type: Mapped[str] = mapped_column(String(30), default="program")
    # program | topic | urgency | area
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("tags.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent: Mapped[Tag | None] = relationship(
        "Tag", remote_side="Tag.id", foreign_keys=[parent_id]
    )
    document_tags: Mapped[list[DocumentTag]] = relationship(
        "DocumentTag", back_populates="tag", cascade="all, delete-orphan"
    )


class DocumentTag(Base):
    __tablename__ = "document_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tagged_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    tagged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tag: Mapped[Tag] = relationship("Tag", back_populates="document_tags")
    tagger: Mapped[User | None] = relationship("User", foreign_keys=[tagged_by])


class Program(Base):
    """Chương trình/Nghị quyết/Đề án — cấp quản lý cao nhất."""
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    program_type: Mapped[str] = mapped_column(String(30), default="nghi_quyet")
    # nghi_quyet | de_an | ke_hoach | chuong_trinh
    tag_id: Mapped[int | None] = mapped_column(
        ForeignKey("tags.id", ondelete="SET NULL"), nullable=True, index=True
    )
    issued_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issuing_body: Mapped[str | None] = mapped_column(String(200), nullable=True)
    scope: Mapped[str] = mapped_column(String(30), default="xa")
    # xa | huyen | tinh | trung_uong
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    # active | closed | draft
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    review_cycle: Mapped[str | None] = mapped_column(String(20), default="annual")
    # annual | biannual | quarterly
    source_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    tag: Mapped[Tag | None] = relationship("Tag", foreign_keys=[tag_id])
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])
    document_links: Mapped[list[DocumentProgram]] = relationship(
        "DocumentProgram", back_populates="program", cascade="all, delete-orphan"
    )


class DocumentProgram(Base):
    """Liên kết văn bản ↔ chương trình (nhiều-nhiều, có loại liên kết)."""
    __tablename__ = "document_programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    program_id: Mapped[int] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_type: Mapped[str] = mapped_column(String(30), default="implements")
    # implements | amends | references | reports | guides
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    program: Mapped[Program] = relationship("Program", back_populates="document_links")
    linker: Mapped[User | None] = relationship("User", foreign_keys=[created_by])
