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
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
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
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
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
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
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
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
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
    if current_user.role not in ("admin",):
        raise HTTPException(403, "Cần quyền admin")
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
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
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
    sent_logs  = [l for l in logs if l.status == "sent"]
    failed_logs = [l for l in logs if l.status == "failed"]
    return {
        "sent": len(sent_logs),
        "failed": len(failed_logs),
        "no_link": len(body.recipient_user_ids) - len(logs),
        "errors": [
            {"user_id": l.recipient_user_id, "error": l.error_msg or "Lỗi không xác định"}
            for l in failed_logs
        ],
    }


@router.post("/send-text")
async def send_text_direct(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Debug: Gửi OA message trực tiếp theo zalo_user_id (bỏ qua template).
    Body: {"zalo_user_id": "...", "text": "..."}
    """
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    zalo_user_id = body.get("zalo_user_id", "").strip()
    text = body.get("text", "").strip()
    if not zalo_user_id or not text:
        raise HTTPException(400, "Cần cung cấp zalo_user_id và text")
    cfg = (await db.execute(select(ZaloConfig).where(ZaloConfig.is_active == True).limit(1))).scalar_one_or_none()
    if not cfg or not cfg.access_token:
        raise HTTPException(400, "Zalo chưa cấu hình hoặc chưa có access_token")
    result = await zalo_api_service.send_oa_message(cfg.access_token, zalo_user_id, text)
    if result.get("error") != 0:
        raise HTTPException(400, f"Zalo trả về lỗi: {result.get('message', str(result))}")
    return {"ok": True, "zalo_response": result}


@router.post("/broadcast")
async def broadcast_message(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gửi thông báo văn bản thủ công đến nhiều user (OA message).
    Body: {"subject": "...", "text": "...", "recipient_user_ids": [1, 2, 3]}
    """
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    subject = body.get("subject", "Thông báo").strip()
    text = body.get("text", "").strip()
    recipient_user_ids: list[int] = body.get("recipient_user_ids", [])
    if not text:
        raise HTTPException(400, "Cần cung cấp nội dung text")
    if not recipient_user_ids:
        raise HTTPException(400, "Cần cung cấp danh sách recipient_user_ids")
    if len(recipient_user_ids) > 500:
        raise HTTPException(400, "Tối đa 500 người nhận mỗi lần gửi")
    logs = await zalo_notify_engine.notify_bulk(
        db=db,
        subject=subject,
        text=text,
        recipient_user_ids=recipient_user_ids,
        triggered_by="manual",
    )
    sent = sum(1 for l in logs if l.status == "sent")
    failed = sum(1 for l in logs if l.status == "failed")
    return {
        "sent": sent,
        "failed": failed,
        "no_link": len(recipient_user_ids) - len(logs),
    }


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
    """Webhook: auto-link staff and reply with task/document status."""
    import re as _re
    from datetime import date

    event_type = payload.get("event_name", "")
    if event_type != "user_send_text":
        return {"ok": True}

    sender = payload.get("sender", {})
    zalo_user_id = str(sender.get("id", "") or "")  # always string — Zalo IDs are 17-18 digits, exceeds JS Number precision
    text = (payload.get("message", {}).get("text", "") or "").strip()
    text_up = text.upper()

    if not zalo_user_id:
        return {"ok": True}

    cfg = (await db.execute(select(ZaloConfig).limit(1))).scalar_one_or_none()
    if not cfg or not cfg.access_token:
        return {"ok": True}

    async def reply(msg: str) -> None:
        result = await zalo_api_service.send_oa_message(cfg.access_token, zalo_user_id, msg)
        if result.get("error") != 0:
            logger.warning("Webhook reply failed user=%s: %s", zalo_user_id, result.get("message"))

    # Check if already linked
    link = (await db.execute(
        select(ZaloUserLink).where(ZaloUserLink.zalo_user_id == zalo_user_id)
    )).scalar_one_or_none()

    # Try link by employee code
    if not link and _re.match(r"^NS\d{3,}$", text_up):
        from app.models.staff import Staff
        staff = (await db.execute(
            select(Staff).where(Staff.employee_code == text_up)
        )).scalar_one_or_none()
        if staff and staff.user_id:
            link = (await db.execute(
                select(ZaloUserLink).where(ZaloUserLink.user_id == staff.user_id)
            )).scalar_one_or_none()
            if link:
                link.zalo_user_id = zalo_user_id
            else:
                link = ZaloUserLink(user_id=staff.user_id, zalo_user_id=zalo_user_id)
                db.add(link)
            await db.commit()
            await db.refresh(link)
            await reply(f"✅ Xin chào {staff.full_name}!\nĐã liên kết thành công.\nNhắn NHIEMVU hoặc VANBAN để xem thông tin.")
            return {"ok": True}
        else:
            await reply("❌ Không tìm thấy mã nhân viên. Vui lòng kiểm tra lại.")
            return {"ok": True}

    if not link:
        await reply("👋 Xin chào!\nVui lòng nhắn MÃ NHÂN VIÊN (VD: NS001) để liên kết tài khoản.")
        return {"ok": True}

    # Commands for linked users
    from app.models.task import Task
    from app.models.document import Document

    if text_up in ("NHIEMVU", "NV"):
        tasks = (await db.execute(
            select(Task).where(
                Task.assignee_id == link.user_id,
                Task.status.in_(["pending", "in_progress"]),
            ).order_by(Task.due_date).limit(5)
        )).scalars().all()
        if not tasks:
            await reply("✅ Bạn không có nhiệm vụ nào đang thực hiện.")
        else:
            today = date.today()
            lines = ["📋 NHIỆM VỤ ĐANG THỰC HIỆN:\n"]
            for t in tasks:
                due = t.due_date.date() if t.due_date else None
                overdue = f" ⚠️ QUÁ HẠN {(today - due).days} ngày" if due and due < today else ""
                lines.append(f"• {t.title}{overdue}")
            await reply("\n".join(lines))

    elif text_up in ("VANBAN", "VB"):
        docs = (await db.execute(
            select(Document).order_by(Document.created_at.desc()).limit(5)
        )).scalars().all()
        if not docs:
            await reply("📄 Chưa có văn bản nào.")
        else:
            lines = ["📄 VĂN BẢN MỚI NHẤT:\n"]
            for d in docs:
                lines.append(f"• [{d.doc_number or 'N/A'}] {d.summary or d.title or ''}")
            await reply("\n".join(lines))

    else:
        await reply(
            "📌 CÁC LỆNH:\n"
            "• NHIEMVU — Xem nhiệm vụ đang thực hiện\n"
            "• VANBAN — Xem văn bản mới nhất\n"
            "• NS001 — Liên kết tài khoản (thay NS001 bằng mã của bạn)"
        )

    return {"ok": True}


@router.get("/webhook")
async def zalo_webhook_verify():
    """Zalo webhook verification (GET request)."""
    return {"ok": True}


# ── OA Follower list ──────────────────────────────────────────────────────────

@router.get("/followers")
async def list_oa_followers(
    offset: int = 0,
    count: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch OA follower list from Zalo API and cross-reference with existing user links."""
    cfg = (await db.execute(
        select(ZaloConfig).where(ZaloConfig.is_active == True).limit(1)
    )).scalar_one_or_none()
    if not cfg or not cfg.access_token:
        raise HTTPException(400, "Chưa cấu hình Zalo hoặc chưa có access token")

    result = await zalo_api_service.get_followers(cfg.access_token, offset=offset, count=count)
    if result.get("error") != 0:
        raise HTTPException(400, f"Zalo lỗi: {result.get('message', str(result))}")

    data = result.get("data") or {}
    followers = data.get("followers") or []
    total = data.get("total", 0)

    # Only load links for the followers returned (not all links in DB)
    follower_zalo_ids = [str(f.get("user_id", "") or "") for f in followers if f.get("user_id")]
    existing = (await db.execute(
        select(ZaloUserLink).where(ZaloUserLink.zalo_user_id.in_(follower_zalo_ids))
    )).scalars().all() if follower_zalo_ids else []
    linked_map: dict[str, int] = {
        lnk.zalo_user_id: lnk.user_id
        for lnk in existing
        if lnk.zalo_user_id
    }

    return {
        "total": total,
        "offset": offset,
        "followers": [
            {
                # Zalo user_id is 17-18 digits — must return as string so JS JSON.parse doesn't lose precision
                "zalo_user_id": str(f.get("user_id", "") or ""),
                "display_name":  f.get("display_name", ""),
                "avatar":        f.get("avatar", ""),
                "linked_user_id": linked_map.get(str(f.get("user_id", "") or "")),
            }
            for f in followers
        ],
    }
