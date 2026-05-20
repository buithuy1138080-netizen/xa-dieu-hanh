from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SyncConfig(Base):
    __tablename__ = "sync_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)   # nq57/task/kpi
    source_type: Mapped[str] = mapped_column(String(20), default="gsheet") # gsheet/apps_script

    # Google Sheet location
    sheet_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    sheet_tab: Mapped[str] = mapped_column(String(100), default="Sheet1")
    data_range: Mapped[str] = mapped_column(String(50), default="A2:Z1000")
    header_row: Mapped[int] = mapped_column(Integer, default=1)

    # Auth — store raw service-account JSON (admin responsibility to secure)
    auth_type: Mapped[str] = mapped_column(String(20), default="service_account")
    credentials_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Mapping & dedup
    field_mappings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    key_field: Mapped[str] = mapped_column(String(50), default="code")  # IOC field used as dedup key
    key_col: Mapped[str] = mapped_column(String(5), default="B")        # Sheet column of dedup key

    # Sync behaviour
    sync_direction: Mapped[str] = mapped_column(String(20), default="bidirectional")  # pull/push/bidirectional
    conflict_resolution: Mapped[str] = mapped_column(String(20), default="latest_wins")  # ioc_wins/sheet_wins/latest_wins/manual
    auto_sync_minutes: Mapped[int] = mapped_column(Integer, default=0)   # 0 = disabled

    # Webhook token — Apps Script posts here
    webhook_token: Mapped[str] = mapped_column(
        String(64), default=lambda: secrets.token_urlsafe(32), nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    config_id: Mapped[int] = mapped_column(ForeignKey("sync_configs.id", ondelete="CASCADE"), nullable=False, index=True)

    direction: Mapped[str] = mapped_column(String(20), nullable=False)   # push/pull/webhook/bidirectional
    status: Mapped[str] = mapped_column(String(20), default="running")   # running/done/failed/partial

    records_read: Mapped[int] = mapped_column(Integer, default=0)
    records_created: Mapped[int] = mapped_column(Integer, default=0)
    records_updated: Mapped[int] = mapped_column(Integer, default=0)
    records_skipped: Mapped[int] = mapped_column(Integer, default=0)
    records_failed: Mapped[int] = mapped_column(Integer, default=0)
    records_conflict: Mapped[int] = mapped_column(Integer, default=0)

    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    triggered_by: Mapped[str] = mapped_column(String(20), default="manual")  # manual/scheduled/webhook
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SyncConflict(Base):
    __tablename__ = "sync_conflicts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    config_id: Mapped[int] = mapped_column(ForeignKey("sync_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    log_id: Mapped[int | None] = mapped_column(ForeignKey("sync_logs.id", ondelete="SET NULL"), nullable=True)

    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sheet_row: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-based row in sheet

    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    ioc_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    sheet_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    ioc_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sheet_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    resolution: Mapped[str] = mapped_column(String(20), default="pending")  # pending/ioc_wins/sheet_wins/manual
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
