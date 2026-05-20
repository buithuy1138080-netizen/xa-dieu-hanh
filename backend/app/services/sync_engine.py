"""Bidirectional sync engine: Google Sheet ↔ IOC database.

Pull  = Sheet → IOC (upsert by key_field / key_col)
Push  = IOC → Sheet (clear range + rewrite all rows)
Webhook = same as pull but data comes from Apps Script payload
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.gsheet_sync import SyncConfig, SyncConflict, SyncLog
from app.models.kpi import KPI
from app.models.nq57 import NQ57Task
from app.models.task import Task
from app.services import data_mapper, gsheet_service

logger = logging.getLogger(__name__)

# ── Entity registry ───────────────────────────────────────────────────────────

_ENTITY_MODELS: dict[str, Any] = {
    "nq57": NQ57Task,
    "task": Task,
    "kpi": KPI,
}

# Fields to watch for conflict detection per entity
_CONFLICT_FIELDS: dict[str, list[str]] = {
    "nq57": ["progress", "status", "title", "deadline"],
    "task": ["progress", "status", "title"],
    "kpi": ["current_value", "status"],
}


# ── Public entry points ───────────────────────────────────────────────────────

async def run_sync(config_id: int, direction: str, triggered_by: str = "manual") -> SyncLog:
    async with AsyncSessionLocal() as db:
        config = await db.get(SyncConfig, config_id)
        if not config:
            raise ValueError(f"SyncConfig {config_id} not found")

        log = SyncLog(config_id=config_id, direction=direction, triggered_by=triggered_by)
        db.add(log)
        await db.flush()

        try:
            if direction in ("pull", "bidirectional"):
                await _pull(config, log, db)
            if direction in ("push", "bidirectional"):
                await _push(config, log, db)

            log.status = "done" if log.records_failed == 0 else "partial"
        except Exception as exc:
            log.status = "failed"
            log.error_msg = str(exc)
            logger.exception("Sync config=%s failed: %s", config_id, exc)
        finally:
            log.finished_at = datetime.now(timezone.utc)
            config.last_sync_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(log)

        return log


async def run_webhook_sync(config: SyncConfig, rows: list[dict[str, Any]], db: AsyncSession) -> SyncLog:
    """Process inbound webhook data (Apps Script → IOC)."""
    log = SyncLog(config_id=config.id, direction="webhook", triggered_by="webhook")
    db.add(log)
    await db.flush()

    try:
        log.records_read = len(rows)
        mappings = config.field_mappings or data_mapper.get_default_mappings(config.entity_type)
        # Webhook data rows are already dicts keyed by IOC field names (Apps Script maps them)
        # If they are keyed by column letters, go through sheet_row_to_ioc first
        is_col_keyed = rows and any(k in rows[0] for k in ["A", "B", "C"])
        if is_col_keyed:
            ioc_rows = [data_mapper.sheet_row_to_ioc(r, mappings, config.entity_type) for r in rows]
        else:
            ioc_rows = rows

        await _upsert_records(config, log, ioc_rows, db)
        log.status = "done" if log.records_failed == 0 else "partial"
    except Exception as exc:
        log.status = "failed"
        log.error_msg = str(exc)
        logger.exception("Webhook sync config=%s failed: %s", config.id, exc)
    finally:
        log.finished_at = datetime.now(timezone.utc)
        config.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

    return log


async def run_auto_sync_due() -> None:
    """Called by scheduler every 5 minutes; syncs all configs whose interval is due."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SyncConfig).where(
                SyncConfig.is_active == True,
                SyncConfig.auto_sync_minutes > 0,
            )
        )
        configs = result.scalars().all()

    for config in configs:
        now = datetime.now(timezone.utc)
        if config.last_sync_at:
            elapsed = (now - config.last_sync_at).total_seconds() / 60
            if elapsed < config.auto_sync_minutes:
                continue
        try:
            await run_sync(config.id, config.sync_direction, triggered_by="scheduled")
        except Exception as exc:
            logger.warning("Auto-sync config=%s error: %s", config.id, exc)


# ── Pull (Sheet → IOC) ────────────────────────────────────────────────────────

async def _pull(config: SyncConfig, log: SyncLog, db: AsyncSession) -> None:
    if not config.credentials_json or not config.sheet_id:
        raise ValueError("Thiếu credentials hoặc Sheet ID")

    rows = await asyncio.to_thread(
        gsheet_service.read_sheet,
        config.sheet_id, config.sheet_tab, config.data_range, config.credentials_json,
    )
    log.records_read += len(rows)

    mappings = config.field_mappings or data_mapper.get_default_mappings(config.entity_type)
    ioc_rows = [data_mapper.sheet_row_to_ioc(r, mappings, config.entity_type) for r in rows]
    await _upsert_records(config, log, ioc_rows, db)


# ── Push (IOC → Sheet) ────────────────────────────────────────────────────────

async def _push(config: SyncConfig, log: SyncLog, db: AsyncSession) -> None:
    if not config.credentials_json or not config.sheet_id:
        raise ValueError("Thiếu credentials hoặc Sheet ID")

    model = _ENTITY_MODELS.get(config.entity_type)
    if not model:
        raise ValueError(f"Entity type không hỗ trợ: {config.entity_type}")

    result = await db.execute(select(model))
    records = result.scalars().all()
    log.records_read += len(records)

    mappings = config.field_mappings or data_mapper.get_default_mappings(config.entity_type)
    if not mappings:
        raise ValueError("Không có field mappings được cấu hình")

    from app.services.gsheet_service import col_index
    max_col = max(col_index(m["sheet_col"]) for m in mappings) + 1

    sheet_rows = []
    for rec in records:
        rec_dict = {col.name: getattr(rec, col.name) for col in rec.__table__.columns}
        sheet_rows.append(data_mapper.ioc_record_to_sheet_row(rec_dict, mappings, max_col))

    if sheet_rows:
        await asyncio.to_thread(
            gsheet_service.clear_and_write,
            config.sheet_id, config.sheet_tab, config.data_range, sheet_rows, config.credentials_json,
        )
        log.records_updated = len(sheet_rows)


# ── Upsert helper ─────────────────────────────────────────────────────────────

async def _upsert_records(
    config: SyncConfig,
    log: SyncLog,
    ioc_rows: list[dict[str, Any]],
    db: AsyncSession,
) -> None:
    model = _ENTITY_MODELS.get(config.entity_type)
    if not model:
        raise ValueError(f"Entity type không hỗ trợ: {config.entity_type}")

    for idx, record in enumerate(ioc_rows):
        key_val = record.get(config.key_field)
        if not key_val:
            log.records_skipped += 1
            continue

        try:
            stmt = select(model).where(getattr(model, config.key_field) == key_val)
            existing = (await db.execute(stmt)).scalar_one_or_none()

            if existing is None:
                # --- create ---
                safe = _safe_fields(model, record)
                # Inject required created_by if model needs it
                if hasattr(model, "created_by") and "created_by" not in safe:
                    safe["created_by"] = config.created_by
                new_obj = model(**safe)
                db.add(new_obj)
                log.records_created += 1
            else:
                # --- update ---
                conflicts = await _detect_and_log_conflicts(
                    config, log, existing, record, idx + 2, db
                )
                if conflicts and config.conflict_resolution == "ioc_wins":
                    log.records_skipped += 1
                    continue

                for field, value in record.items():
                    if hasattr(existing, field) and field not in ("id", "created_by", "created_at"):
                        setattr(existing, field, value)
                log.records_updated += 1

        except Exception as exc:
            logger.warning("Upsert failed entity=%s key=%s: %s", config.entity_type, key_val, exc)
            log.records_failed += 1


def _safe_fields(model: Any, record: dict[str, Any]) -> dict[str, Any]:
    """Keep only fields that exist on the model table."""
    col_names = {c.name for c in model.__table__.columns}
    return {k: v for k, v in record.items() if k in col_names}


async def _detect_and_log_conflicts(
    config: SyncConfig,
    log: SyncLog,
    existing: Any,
    new_data: dict[str, Any],
    sheet_row: int,
    db: AsyncSession,
) -> list[SyncConflict]:
    if config.conflict_resolution == "sheet_wins":
        return []

    watch = _CONFLICT_FIELDS.get(config.entity_type, [])
    conflicts: list[SyncConflict] = []

    for field in watch:
        old_val = getattr(existing, field, None)
        new_val = new_data.get(field)
        if old_val is None or new_val is None:
            continue
        if str(old_val) == str(new_val):
            continue

        resolution = "pending" if config.conflict_resolution == "manual" else config.conflict_resolution
        conflict = SyncConflict(
            config_id=config.id,
            log_id=log.id,
            entity_type=config.entity_type,
            entity_id=getattr(existing, "id", None),
            sheet_row=sheet_row,
            field_name=field,
            ioc_value=str(old_val),
            sheet_value=str(new_val),
            ioc_updated_at=getattr(existing, "updated_at", None),
            resolution=resolution,
        )
        db.add(conflict)
        conflicts.append(conflict)

    log.records_conflict += len(conflicts)
    return conflicts
