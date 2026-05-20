from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ZaloConfig(Base):
    """One-row config: Zalo OA credentials + token storage."""
    __tablename__ = "zalo_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    app_id: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    app_secret: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    oa_id: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    access_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False, default="")
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class ZaloTemplate(Base):
    """Message templates — one per notification type, customisable."""
    __tablename__ = "zalo_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    notif_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # notif_type: task_overdue | task_warning | kpi_low | report_done |
    #             directive_new | document_new | system_alert | broadcast

    channel: Mapped[str] = mapped_column(String(20), default="oa_message")
    # channel: oa_message (send to OA follower) | zns (send by phone)

    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # content uses Python str.format_map — e.g. "Nhiệm vụ {task_title} quá hạn {days_late} ngày"

    variables: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # e.g. ["task_title", "days_late", "due_date"]

    zns_template_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Zalo-issued ZNS template ID (required for channel=zns)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class ZaloLog(Base):
    """Per-message delivery audit log."""
    __tablename__ = "zalo_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("zalo_templates.id", ondelete="SET NULL"), nullable=True
    )
    recipient_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recipient_phone: Mapped[str] = mapped_column(String(20), nullable=False, default="")

    notif_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    content_rendered: Mapped[str] = mapped_column(Text, nullable=False, default="")

    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    # pending | sent | failed | delivered

    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    zalo_msg_id: Mapped[str | None] = mapped_column(String(200), nullable=True)

    triggered_by: Mapped[str] = mapped_column(String(20), default="event", nullable=False)
    # event | scheduler | manual

    entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ZaloUserLink(Base):
    """Links a system User to their Zalo contact info."""
    __tablename__ = "zalo_user_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    zalo_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # phone number registered on Zalo (for ZNS send)

    zalo_user_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Zalo OA follower user ID (for oa_message send)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
