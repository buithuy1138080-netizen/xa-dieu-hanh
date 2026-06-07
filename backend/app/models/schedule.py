"""Lịch công tác — ScheduleItem + ScheduleReminder."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer,
    String, Text, Time, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ScheduleItem(Base):
    __tablename__ = "schedule_items"

    id: Mapped[int]          = mapped_column(Integer, primary_key=True, index=True)
    leader_id: Mapped[int]   = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)

    # Nội dung lịch
    title: Mapped[str]           = mapped_column(String(500), nullable=False)
    location: Mapped[str | None] = mapped_column(String(300))
    note: Mapped[str | None]     = mapped_column(Text)

    # Thời gian
    work_date: Mapped[date]      = mapped_column(Date, nullable=False, index=True)
    # session: sang / chieu / ca_ngay / toi
    session: Mapped[str]         = mapped_column(String(20), nullable=False, default="sang")
    start_time: Mapped[time | None] = mapped_column(Time)

    # Nhắc Zalo
    zalo_remind: Mapped[bool]           = mapped_column(Boolean, default=False, nullable=False)
    remind_before_minutes: Mapped[int]  = mapped_column(Integer, default=30, nullable=False)

    # Quản lý
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    # Relationships
    leader   = relationship("Staff", foreign_keys=[leader_id], lazy="select")
    creator  = relationship("User", foreign_keys=[created_by], lazy="select")
    reminders: Mapped[list["ScheduleReminder"]] = relationship(
        "ScheduleReminder", back_populates="schedule", cascade="all, delete-orphan"
    )


class ScheduleReminder(Base):
    __tablename__ = "schedule_reminders"

    id: Mapped[int]          = mapped_column(Integer, primary_key=True, index=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("schedule_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    leader_id: Mapped[int]   = mapped_column(Integer, nullable=False)

    zalo_user_id: Mapped[str | None] = mapped_column(String(100))
    recipient_phone: Mapped[str | None] = mapped_column(String(20))

    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # pending / sent / failed / skipped
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    error_msg: Mapped[str | None] = mapped_column(Text)
    zalo_msg_id: Mapped[str | None] = mapped_column(String(100))
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    schedule: Mapped["ScheduleItem"] = relationship("ScheduleItem", back_populates="reminders")
