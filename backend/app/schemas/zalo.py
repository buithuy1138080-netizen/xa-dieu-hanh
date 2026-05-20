from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


# ── ZaloConfig ────────────────────────────────────────────────────────────────

class ZaloConfigUpsert(BaseModel):
    app_id: str
    app_secret: str
    oa_id: str
    access_token: str = ""
    refresh_token: str = ""
    is_active: bool = True


class ZaloConfigRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    app_id: str
    oa_id: str
    has_access_token: bool = False
    has_refresh_token: bool = False
    token_expiry: datetime | None
    is_active: bool
    created_at: datetime


# ── ZaloTemplate ──────────────────────────────────────────────────────────────

class ZaloTemplateCreate(BaseModel):
    name: str
    notif_type: str
    channel: str = "oa_message"
    subject: str
    content: str
    variables: list[str] | None = None
    zns_template_id: str | None = None
    is_active: bool = True


class ZaloTemplateUpdate(BaseModel):
    name: str | None = None
    channel: str | None = None
    subject: str | None = None
    content: str | None = None
    variables: list[str] | None = None
    zns_template_id: str | None = None
    is_active: bool | None = None


class ZaloTemplateRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    notif_type: str
    channel: str
    subject: str
    content: str
    variables: list | None
    zns_template_id: str | None
    is_active: bool
    is_default: bool
    created_at: datetime


# ── ZaloLog ───────────────────────────────────────────────────────────────────

class ZaloLogRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    template_id: int | None
    recipient_user_id: int | None
    recipient_phone: str
    notif_type: str
    subject: str
    content_rendered: str
    status: str
    error_msg: str | None
    zalo_msg_id: str | None
    triggered_by: str
    entity_type: str | None
    entity_id: int | None
    sent_at: datetime | None
    created_at: datetime


# ── ZaloUserLink ──────────────────────────────────────────────────────────────

class ZaloUserLinkUpsert(BaseModel):
    user_id: int
    zalo_phone: str | None = None
    zalo_user_id: str | None = None
    is_active: bool = True


class ZaloUserLinkRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    user_id: int
    zalo_phone: str | None
    zalo_user_id: str | None
    is_verified: bool
    is_active: bool
    created_at: datetime


# ── Manual send ───────────────────────────────────────────────────────────────

class ZaloSendRequest(BaseModel):
    notif_type: str
    recipient_user_ids: list[int]
    context: dict[str, Any] = {}
    entity_type: str | None = None
    entity_id: int | None = None


# ── Stats ─────────────────────────────────────────────────────────────────────

class ZaloStats(BaseModel):
    total_sent: int
    sent_today: int
    failed_today: int
    users_linked: int
    pending_conflicts: int = 0
