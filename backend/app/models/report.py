from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.report_template import ReportTemplate
    from app.models.user import User


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Type: monthly / quarterly / annual / kpi / executive / nq57
    report_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    period_label: Mapped[str] = mapped_column(String(60))   # "Tháng 5/2026"
    period_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_to: Mapped[date] = mapped_column(Date, nullable=False)

    # generating → done / failed
    status: Mapped[str] = mapped_column(String(20), default="generating", index=True)
    error_msg: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # JSON blobs produced by the report engine
    summary_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Optional exported files (stored in uploads/reports/)
    file_path_docx: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_path_xlsx: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Template used to render this report (nullable — auto-generated reports have no template)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("report_templates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    template: Mapped[ReportTemplate | None] = relationship("ReportTemplate", foreign_keys=[template_id])

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    creator: Mapped[User] = relationship("User", foreign_keys=[created_by])

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
