from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.models.zalo import ZaloConfig, ZaloLog, ZaloTemplate, ZaloUserLink
from app.schemas.zalo import (
    ZaloConfigRead,
    ZaloConfigUpsert,
    ZaloLogRead,
    ZaloSendRequest,
    ZaloStats,
    ZaloTemplateCreate,
    ZaloTemplateRead,
    ZaloTemplateUpdate,
    ZaloUserLinkRead,
    ZaloUserLinkUpsert,
)
from app.services import zalo_api_service, zalo_notify_engine

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Config ────────────────────────────────────────────────────────────────────

def _config_read(cfg: ZaloConfig) -> ZaloConfigRead:
    return ZaloConfigRead(
        id=cfg.id,
        app_id=cfg.app_id,
        oa_id=cfg.oa_id,
        has_access_token=bool(cfg.access_token),
        has_refresh_token=bool(cfg.refresh_token),
        token_expiry=cfg.token_expiry,
        is_active=cfg.is_active,
        created_at=cfg.created_at,
    )


@router.get("/config", response_model=ZaloConfigRead | None)
async def get_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cfg = (await db.execute(select(ZaloConfig).limit(1))).scalar_one_or_none()
    return _config_read(cfg) if cfg else None


@router.put("/config", response_model=ZaloConfigRead)
async def upsert_config(
    body: ZaloConfigUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    cfg = (await db.execute(select(ZaloConfig).limit(1))).scalar_one_or_none()
    if cfg:
        cfg.app_id = body.app_id
        cfg.app_secret = body.app_secret
        cfg.oa_id = body.oa_id
        if body.access_token:
            cfg.access_token = body.access_token
        if body.refresh_token:
            cfg.refresh_token = body.refresh_token
        cfg.is_active = body.is_active
    else:
        cfg = ZaloConfig(**body.model_dump(), created_by=current_user.id)
        db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return _config_read(cfg)


@router.post("/config/refresh-token", response_model=ZaloConfigRead)
async def refresh_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    cfg = (await db.execute(select(ZaloConfig).limit(1))).scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, "Chưa cấu hình Zalo")
    if not cfg.app_id or not cfg.app_secret or not cfg.refresh_token:
        raise HTTPException(400, "Thiếu app_id, app_secret hoặc refresh_token")
    result = await zalo_api_service.refresh_token(cfg.app_id, cfg.app_secret, cfg.refresh_token)
    if "access_token" not in result:
        raise HTTPException(400, f"Zalo trả về lỗi: {result.get('message', str(result))}")
    cfg.access_token = result["access_token"]
    if "refresh_token" in result:
        cfg.refresh_token = result["refresh_token"]
    from datetime import timedelta
    cfg.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=int(result.get("expires_in", 3600)))
    await db.commit()
    await db.refresh(cfg)
    return _config_read(cfg)


# ── Templates ─────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=list[ZaloTemplateRead])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(ZaloTemplate).order_by(ZaloTemplate.created_at))
    return [ZaloTemplateRead.model_validate(t) for t in result.scalars().all()]


@router.post("/templates", response_model=ZaloTemplateRead)
async def create_template(
    body: ZaloTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tmpl = ZaloTemplate(**body.model_dump(), created_by=current_user.id)
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return ZaloTemplateRead.model_validate(tmpl)


@router.put("/templates/{tmpl_id}", response_model=ZaloTemplateRead)
async def update_template(
    tmpl_id: int,
    body: ZaloTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = await db.get(ZaloTemplate, tmpl_id)
    if not tmpl:
        raise HTTPException(404, "Không tìm thấy mẫu tin nhắn")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(tmpl, field, val)
    await db.commit()
    await db.refresh(tmpl)
    return ZaloTemplateRead.model_validate(tmpl)


@router.delete("/templates/{tmpl_id}")
async def delete_template(
    tmpl_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tmpl = await db.get(ZaloTemplate, tmpl_id)
    if not tmpl:
        raise HTTPException(404, "Không tìm thấy mẫu tin nhắn")
    if tmpl.is_default:
        raise HTTPException(400, "Không thể xóa mẫu mặc định. Hãy tắt (is_active=false) thay thế.")
    await db.delete(tmpl)
    await db.commit()
    return {"ok": True}


@router.post("/templates/seed-defaults")
async def seed_default_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inserted = await zalo_notify_engine.seed_defaults(db, current_user.id)
    return {"inserted": inserted, "message": f"Đã thêm {inserted} mẫu mặc định"}


# ── User Links ────────────────────────────────────────────────────────────────

@router.get("/user-links", response_model=list[ZaloUserLinkRead])
async def list_user_links(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(ZaloUserLink).order_by(ZaloUserLink.user_id))
    return [ZaloUserLinkRead.model_validate(r) for r in result.scalars().all()]


@router.put("/user-links", response_model=ZaloUserLinkRead)
async def upsert_user_link(
    body: ZaloUserLinkUpsert,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    link = (await db.execute(
        select(ZaloUserLink).where(ZaloUserLink.user_id == body.user_id)
    )).scalar_one_or_none()
    if link:
        link.zalo_phone = body.zalo_phone
        link.zalo_user_id = body.zalo_user_id
        link.is_active = body.is_active
    else:
        link = ZaloUserLink(**body.model_dump())
        db.add(link)
    await db.commit()
    await db.refresh(link)
    return ZaloUserLinkRead.model_validate(link)


@router.delete("/user-links/{user_id}")
async def delete_user_link(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    link = (await db.execute(
        select(ZaloUserLink).where(ZaloUserLink.user_id == user_id)
    )).scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Không tìm thấy liên kết")
    await db.delete(link)
    await db.commit()
    return {"ok": True}


@router.post("/user-links/import-from-staff")
async def import_from_staff(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-populate ZaloUserLink from Staff.phone + Staff.user_id."""
    from app.models.staff import Staff
    result = await db.execute(
        select(Staff).where(
            Staff.user_id.isnot(None),
            Staff.phone.isnot(None),
            Staff.is_active == True,
        )
    )
    staff_list = result.scalars().all()
    imported = 0
    for s in staff_list:
        existing = (await db.execute(
            select(ZaloUserLink).where(ZaloUserLink.user_id == s.user_id)
        )).scalar_one_or_none()
        if existing:
            if not existing.zalo_phone:
                existing.zalo_phone = s.phone
        else:
            db.add(ZaloUserLink(user_id=s.user_id, zalo_phone=s.phone))
            imported += 1
    await db.commit()
    return {"imported": imported, "total_staff": len(staff_list)}


# ── Manual send ───────────────────────────────────────────────────────────────

@router.post("/send")
async def manual_send(
    body: ZaloSendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = await zalo_notify_engine.notify_event(
        db=db,
        notif_type=body.notif_type,
        context=body.context,
        recipient_user_ids=body.recipient_user_ids,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        triggered_by="manual",
        dedup_hours=0,   # manual send always goes through
    )
    sent = sum(1 for l in logs if l.status == "sent")
    failed = sum(1 for l in logs if l.status == "failed")
    return {"sent": sent, "failed": failed, "no_link": len(body.recipient_user_ids) - len(logs)}


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=list[ZaloLogRead])
async def get_logs(
    limit: int = 100,
    notif_type: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(ZaloLog).order_by(ZaloLog.created_at.desc()).limit(limit)
    if notif_type:
        stmt = stmt.where(ZaloLog.notif_type == notif_type)
    if status:
        stmt = stmt.where(ZaloLog.status == status)
    result = await db.execute(stmt)
    return [ZaloLogRead.model_validate(r) for r in result.scalars().all()]


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=ZaloStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from datetime import date
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)

    total_sent = (await db.execute(
        select(func.count(ZaloLog.id)).where(ZaloLog.status == "sent")
    )).scalar() or 0

    sent_today = (await db.execute(
        select(func.count(ZaloLog.id)).where(
            ZaloLog.status == "sent", ZaloLog.sent_at >= today_start
        )
    )).scalar() or 0

    failed_today = (await db.execute(
        select(func.count(ZaloLog.id)).where(
            ZaloLog.status == "failed", ZaloLog.created_at >= today_start
        )
    )).scalar() or 0

    users_linked = (await db.execute(
        select(func.count(ZaloUserLink.id)).where(ZaloUserLink.is_active == True)
    )).scalar() or 0

    return ZaloStats(
        total_sent=total_sent,
        sent_today=sent_today,
        failed_today=failed_today,
        users_linked=users_linked,
    )


# ── Webhook (receive events from Zalo OA) ────────────────────────────────────

@router.post("/webhook")
async def zalo_webhook(payload: dict, db: AsyncSession = Depends(get_db)):
    """Receive events from Zalo OA.
    When user sends their employee code (e.g. NS001), auto-link their Zalo UID.
    """
    event_type = payload.get("event_name", "")
    logger.debug("Zalo webhook event: %s", event_type)

    if event_type == "user_send_text":
        sender = payload.get("sender", {})
        zalo_user_id = sender.get("id", "")
        text = (payload.get("message", {}).get("text", "") or "").strip().upper()

        if not zalo_user_id:
            return {"ok": True}

        # Already linked?
        existing = (await db.execute(
            select(ZaloUserLink).where(ZaloUserLink.zalo_user_id == zalo_user_id)
        )).scalar_one_or_none()
        if existing:
            return {"ok": True}

        # Try match by employee code (e.g. "NS001")
        import re as _re
        cfg = (await db.execute(select(ZaloConfig).limit(1))).scalar_one_or_none()
        matched = False
        if _re.match(r"^NS\d{3,}$", text):
            from app.models.staff import Staff
            staff = (await db.execute(
                select(Staff).where(Staff.employee_code == text)
            )).scalar_one_or_none()
            if staff and staff.user_id:
                link = (await db.execute(
                    select(ZaloUserLink).where(ZaloUserLink.user_id == staff.user_id)
                )).scalar_one_or_none()
                if link:
                    link.zalo_user_id = zalo_user_id
                else:
                    db.add(ZaloUserLink(user_id=staff.user_id, zalo_user_id=zalo_user_id))
                await db.commit()
                matched = True
                logger.info("Auto-linked user_id=%s zalo_uid=%s via code %s", staff.user_id, zalo_user_id, text)

        # Reply to user
        if cfg and cfg.access_token:
            reply = "✅ Liên kết thành công! Bạn sẽ nhận thông báo từ hệ thống." if matched else \
                    "Xin chào! Vui lòng nhắn MÃ NHÂN VIÊN của bạn (VD: NS001) để liên kết nhận thông báo."
            await zalo_api_service.send_oa_message(cfg.access_token, zalo_user_id, reply)

    return {"ok": True}


@router.get("/webhook")
async def zalo_webhook_verify():
    """Zalo webhook verification (GET request)."""
    return {"ok": True}
