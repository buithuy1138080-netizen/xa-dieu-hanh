from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.gsheet_sync import SyncConfig, SyncConflict, SyncLog
from app.models.user import User
from app.schemas.gsheet_sync import (
    ConflictResolveRequest,
    SyncConfigCreate,
    SyncConfigRead,
    SyncConfigUpdate,
    SyncConflictRead,
    SyncLogRead,
    SyncTriggerRequest,
    WebhookPayload,
)
from app.core.encryption import decrypt_field, encrypt_field
from app.services import data_mapper, gsheet_service, sync_engine

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _config_read(config: SyncConfig) -> SyncConfigRead:
    d = {
        col.name: getattr(config, col.name)
        for col in SyncConfig.__table__.columns
        if col.name != "credentials_json"
    }
    d["has_credentials"] = bool(config.credentials_json)
    return SyncConfigRead.model_validate(d)


def _get_credentials(config: SyncConfig) -> str | None:
    """Decrypt credentials_json for use in service calls."""
    return decrypt_field(config.credentials_json)


# ── Sync Config CRUD ──────────────────────────────────────────────────────────

@router.post("/configs", response_model=SyncConfigRead)
async def create_config(
    body: SyncConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    if body.field_mappings is None:
        body = body.model_copy(update={"field_mappings": data_mapper.get_default_mappings(body.entity_type)})

    data = body.model_dump()
    if data.get("credentials_json"):
        data["credentials_json"] = encrypt_field(data["credentials_json"])
    config = SyncConfig(**data, created_by=current_user.id)
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return _config_read(config)


@router.get("/configs", response_model=list[SyncConfigRead])
async def list_configs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SyncConfig).order_by(SyncConfig.created_at.desc()))
    return [_config_read(c) for c in result.scalars().all()]


@router.get("/configs/{config_id}", response_model=SyncConfigRead)
async def get_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await db.get(SyncConfig, config_id)
    if not config:
        raise HTTPException(404, "Không tìm thấy cấu hình")
    return _config_read(config)


@router.put("/configs/{config_id}", response_model=SyncConfigRead)
async def update_config(
    config_id: int,
    body: SyncConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    config = await db.get(SyncConfig, config_id)
    if not config:
        raise HTTPException(404, "Không tìm thấy cấu hình")
    for field, val in body.model_dump(exclude_unset=True).items():
        if field == "credentials_json" and val:
            val = encrypt_field(val)
        setattr(config, field, val)
    await db.commit()
    await db.refresh(config)
    return _config_read(config)


@router.delete("/configs/{config_id}")
async def delete_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    config = await db.get(SyncConfig, config_id)
    if not config:
        raise HTTPException(404, "Không tìm thấy cấu hình")
    await db.delete(config)
    await db.commit()
    return {"ok": True}


# ── Connection test ───────────────────────────────────────────────────────────

@router.post("/configs/{config_id}/test-connection")
async def test_connection(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    config = await db.get(SyncConfig, config_id)
    if not config:
        raise HTTPException(404, "Không tìm thấy cấu hình")
    if not config.credentials_json or not config.sheet_id:
        return {"ok": False, "error": "Chưa có credentials hoặc Sheet ID"}
    result = await asyncio.to_thread(
        gsheet_service.check_connection, config.sheet_id, _get_credentials(config)
    )
    return result


# ── Manual sync trigger ───────────────────────────────────────────────────────

@router.post("/configs/{config_id}/trigger", response_model=SyncLogRead)
async def trigger_sync(
    config_id: int,
    body: SyncTriggerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    config = await db.get(SyncConfig, config_id)
    if not config:
        raise HTTPException(404, "Không tìm thấy cấu hình")
    if not config.is_active:
        raise HTTPException(400, "Cấu hình đang tắt")
    log = await sync_engine.run_sync(config_id, body.direction, triggered_by="manual")
    return SyncLogRead.model_validate(log)


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/configs/{config_id}/logs", response_model=list[SyncLogRead])
async def get_config_logs(
    config_id: int,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.config_id == config_id)
        .order_by(SyncLog.started_at.desc())
        .limit(limit)
    )
    return [SyncLogRead.model_validate(r) for r in result.scalars().all()]


@router.get("/logs", response_model=list[SyncLogRead])
async def get_all_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.started_at.desc()).limit(limit)
    )
    return [SyncLogRead.model_validate(r) for r in result.scalars().all()]


# ── Conflicts ─────────────────────────────────────────────────────────────────

@router.get("/conflicts", response_model=list[SyncConflictRead])
async def get_conflicts(
    resolution: str = "pending",
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SyncConflict)
        .where(SyncConflict.resolution == resolution)
        .order_by(SyncConflict.created_at.desc())
        .limit(limit)
    )
    return [SyncConflictRead.model_validate(r) for r in result.scalars().all()]


@router.post("/conflicts/{conflict_id}/resolve")
async def resolve_conflict(
    conflict_id: int,
    body: ConflictResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    conflict = await db.get(SyncConflict, conflict_id)
    if not conflict:
        raise HTTPException(404, "Không tìm thấy xung đột")
    conflict.resolution = body.resolution
    conflict.resolved_by = current_user.id
    conflict.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ── Webhook (Apps Script → IOC) ───────────────────────────────────────────────

@router.post("/webhook/{webhook_token}")
async def webhook_receive(
    webhook_token: str,
    payload: WebhookPayload,
    db: AsyncSession = Depends(get_db),
):
    """Apps Script calls this to push data changes into IOC.

    Example Apps Script code:
        var url = 'https://your-server/api/v1/sync/webhook/<token>';
        UrlFetchApp.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify({ action: 'upsert', data: rows })
        });
    """
    result = await db.execute(
        select(SyncConfig).where(
            SyncConfig.webhook_token == webhook_token,
            SyncConfig.is_active == True,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(403, "Token không hợp lệ hoặc cấu hình đã tắt")

    log = await sync_engine.run_webhook_sync(config, payload.data, db)
    return {
        "ok": True,
        "log_id": log.id,
        "created": log.records_created,
        "updated": log.records_updated,
        "failed": log.records_failed,
    }


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    configs_total = (await db.execute(select(func.count(SyncConfig.id)))).scalar() or 0
    configs_active = (
        await db.execute(select(func.count(SyncConfig.id)).where(SyncConfig.is_active == True))
    ).scalar() or 0
    logs_total = (await db.execute(select(func.count(SyncLog.id)))).scalar() or 0
    pending_conflicts = (
        await db.execute(
            select(func.count(SyncConflict.id)).where(SyncConflict.resolution == "pending")
        )
    ).scalar() or 0
    return {
        "configs_total": configs_total,
        "configs_active": configs_active,
        "logs_total": logs_total,
        "pending_conflicts": pending_conflicts,
    }


# ── Default mappings helper ───────────────────────────────────────────────────

@router.get("/default-mappings/{entity_type}")
async def get_default_mappings(
    entity_type: str,
    current_user: User = Depends(get_current_user),
):
    return data_mapper.get_default_mappings(entity_type)
