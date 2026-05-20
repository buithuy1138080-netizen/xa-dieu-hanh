from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class FieldMapping(BaseModel):
    ioc_field: str
    sheet_col: str   # Column letter: A, B, C ... or AA, AB ...
    transform: str | None = None   # date / int / float / status_nq57 / status_task / bool
    default: Any = None


class SyncConfigCreate(BaseModel):
    name: str
    entity_type: str                  # nq57 / task / kpi / document / staff / department
    source_type: str = "gsheet"       # gsheet / apps_script
    sheet_id: str | None = None
    sheet_tab: str = "Sheet1"
    data_range: str = "A2:Z1000"
    header_row: int = 1
    auth_type: str = "service_account"
    credentials_json: str | None = None
    field_mappings: list[dict[str, Any]] | None = None
    key_field: str = "code"
    key_col: str = "B"
    sync_direction: str = "bidirectional"
    conflict_resolution: str = "latest_wins"
    auto_sync_minutes: int = 0


class SyncConfigUpdate(BaseModel):
    name: str | None = None
    sheet_id: str | None = None
    sheet_tab: str | None = None
    data_range: str | None = None
    credentials_json: str | None = None
    field_mappings: list[dict[str, Any]] | None = None
    key_field: str | None = None
    key_col: str | None = None
    sync_direction: str | None = None
    conflict_resolution: str | None = None
    auto_sync_minutes: int | None = None
    is_active: bool | None = None


class SyncConfigRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    entity_type: str
    source_type: str
    sheet_id: str | None
    sheet_tab: str
    data_range: str
    auth_type: str
    has_credentials: bool = False   # computed in endpoint — not stored on model
    field_mappings: list | None
    key_field: str
    key_col: str
    sync_direction: str
    conflict_resolution: str
    auto_sync_minutes: int
    webhook_token: str
    is_active: bool
    last_sync_at: datetime | None
    created_at: datetime


class SyncLogRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    config_id: int
    direction: str
    status: str
    records_read: int
    records_created: int
    records_updated: int
    records_skipped: int
    records_failed: int
    records_conflict: int
    error_msg: str | None
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None


class SyncConflictRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    config_id: int
    log_id: int | None
    entity_type: str
    entity_id: int | None
    sheet_row: int | None
    field_name: str
    ioc_value: str | None
    sheet_value: str | None
    resolution: str
    created_at: datetime


class SyncTriggerRequest(BaseModel):
    direction: str = "pull"   # pull / push / bidirectional


class WebhookPayload(BaseModel):
    action: str = "upsert"   # upsert / delete
    data: list[dict[str, Any]]


class ConflictResolveRequest(BaseModel):
    resolution: str   # ioc_wins / sheet_wins


class ConnectionTestResult(BaseModel):
    ok: bool
    title: str | None = None
    tabs: list[str] | None = None
    error: str | None = None
