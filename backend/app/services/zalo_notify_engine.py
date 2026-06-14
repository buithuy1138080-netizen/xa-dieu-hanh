"""Zalo Smart Notification Engine.

Public API:
  notify_event()  — send Zalo to a list of users for a named event type
  notify_bulk()   — send custom text to a list of users without a template
  seed_defaults() — insert default templates if not already present
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.zalo import ZaloConfig, ZaloLog, ZaloTemplate, ZaloUserLink
from app.services import zalo_api_service

logger = logging.getLogger(__name__)

# ── Default templates (seeded once on first use) ──────────────────────────────

_DEFAULT_TEMPLATES = [
    {
        "notif_type": "task_overdue",
        "name": "Nhiệm vụ quá hạn",
        "subject": "⚠️ Nhiệm vụ quá hạn",
        "content": "Nhiệm vụ [{task_title}] đã quá hạn {days_late} ngày (hạn: {due_date}). Vui lòng báo cáo tiến độ ngay.",
        "variables": ["task_title", "days_late", "due_date"],
        "channel": "oa_message",
    },
    {
        "notif_type": "task_warning",
        "name": "Nhiệm vụ sắp đến hạn",
        "subject": "⏰ Nhắc nhở nhiệm vụ",
        "content": "Nhiệm vụ [{task_title}] sắp đến hạn trong {days_left} ngày ({due_date}). Hãy cập nhật tiến độ.",
        "variables": ["task_title", "days_left", "due_date"],
        "channel": "oa_message",
    },
    {
        "notif_type": "kpi_low",
        "name": "KPI không đạt",
        "subject": "📊 Cảnh báo KPI thấp",
        "content": "KPI [{kpi_title}] đạt {progress}% so với mục tiêu {target}. Yêu cầu báo cáo giải trình và đề xuất giải pháp.",
        "variables": ["kpi_title", "progress", "target"],
        "channel": "oa_message",
    },
    {
        "notif_type": "report_done",
        "name": "Báo cáo hoàn thành",
        "subject": "📋 Báo cáo đã sẵn sàng",
        "content": "Báo cáo [{report_title}] kỳ {period} đã được tạo tự động. Vào IOC để xem chi tiết và tải xuống.",
        "variables": ["report_title", "period"],
        "channel": "oa_message",
    },
    {
        "notif_type": "directive_new",
        "name": "Chỉ đạo mới",
        "subject": "📌 Chỉ đạo mới",
        "content": "Có chỉ đạo mới: [{directive_title}]. Hạn thực hiện: {deadline}. Đơn vị: {unit}. Vui lòng vào IOC để xem chi tiết.",
        "variables": ["directive_title", "deadline", "unit"],
        "channel": "oa_message",
    },
    {
        "notif_type": "document_new",
        "name": "Văn bản mới",
        "subject": "📄 Văn bản mới",
        "content": "Văn bản mới [{doc_title}] đã được cập nhật vào hệ thống. Số ký hiệu: {doc_code}. Ngày ban hành: {issued_date}.",
        "variables": ["doc_title", "doc_code", "issued_date"],
        "channel": "oa_message",
    },
    {
        "notif_type": "system_alert",
        "name": "Cảnh báo hệ thống",
        "subject": "🔔 Thông báo hệ thống IOC",
        "content": "{message}",
        "variables": ["message"],
        "channel": "oa_message",
    },
    {
        "notif_type": "broadcast",
        "name": "Thông báo điều hành",
        "subject": "📢 Thông báo từ lãnh đạo",
        "content": "{title}\n\n{body}\n\n— {sender}",
        "variables": ["title", "body", "sender"],
        "channel": "oa_message",
    },
]


# ── Core engine ───────────────────────────────────────────────────────────────

async def notify_event(
    db: AsyncSession,
    notif_type: str,
    context: dict[str, Any],
    recipient_user_ids: list[int],
    entity_type: str | None = None,
    entity_id: int | None = None,
    triggered_by: str = "event",
    dedup_hours: int = 24,
) -> list[ZaloLog]:
    """Send Zalo notification to a list of users.

    Deduplication: skips sending if an identical log (same notif_type +
    entity_id + user) already exists within dedup_hours.
    Uses batch queries to avoid N+1 performance issues.
    """
    if not recipient_user_ids:
        return []

    config = await _get_active_config(db)
    if not config:
        return []

    template = await _get_template(db, notif_type)
    if not template:
        logger.debug("No active Zalo template for notif_type=%s", notif_type)
        return []

    await _ensure_token_valid(db, config)

    # ── Batch load: ZaloUserLinks for all recipients (eliminates N+1) ─────────
    links_result = await db.execute(
        select(ZaloUserLink).where(
            ZaloUserLink.user_id.in_(recipient_user_ids),
            ZaloUserLink.is_active == True,
        )
    )
    links_by_user: dict[int, ZaloUserLink] = {
        lnk.user_id: lnk for lnk in links_result.scalars()
    }

    # ── Batch dedup check (2 queries instead of 2N) ───────────────────────────
    deduped_sent: set[int] = set()
    deduped_failed: set[int] = set()
    if entity_id and dedup_hours > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=dedup_hours)
        failed_cutoff = datetime.now(timezone.utc) - timedelta(hours=max(dedup_hours, 2))

        sent_rows = await db.execute(
            select(ZaloLog.recipient_user_id).where(
                ZaloLog.recipient_user_id.in_(recipient_user_ids),
                ZaloLog.notif_type == notif_type,
                ZaloLog.entity_id == entity_id,
                ZaloLog.status == "sent",
                ZaloLog.sent_at >= cutoff,
            )
        )
        deduped_sent = {row[0] for row in sent_rows if row[0] is not None}

        failed_rows = await db.execute(
            select(ZaloLog.recipient_user_id).where(
                ZaloLog.recipient_user_id.in_(recipient_user_ids),
                ZaloLog.notif_type == notif_type,
                ZaloLog.entity_id == entity_id,
                ZaloLog.status == "failed",
                ZaloLog.created_at >= failed_cutoff,
            )
        )
        deduped_failed = {row[0] for row in failed_rows if row[0] is not None}

    # Render template once for all recipients
    rendered = _render(template.content, context)

    logs: list[ZaloLog] = []
    for user_id in recipient_user_ids:
        if user_id in deduped_sent or user_id in deduped_failed:
            continue

        link = links_by_user.get(user_id)
        phone = link.zalo_phone if link else None
        zalo_uid = link.zalo_user_id if link else None

        if not phone and not zalo_uid:
            logger.debug("Zalo skip user=%s: no phone or zalo_user_id", user_id)
            continue

        # For oa_message channel, zalo_user_id is required.
        if template.channel == "oa_message" and not zalo_uid:
            logger.debug(
                "Zalo skip user=%s notif=%s: channel=oa_message but no zalo_user_id. "
                "User must send a message to the OA first.",
                user_id, notif_type,
            )
            continue

        log = ZaloLog(
            template_id=template.id,
            recipient_user_id=user_id,
            recipient_phone=phone or "",
            notif_type=notif_type,
            subject=template.subject,
            content_rendered=rendered,
            status="pending",
            triggered_by=triggered_by,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        db.add(log)
        await db.flush()

        result = await _dispatch(config, template, zalo_uid, phone, rendered, context, f"log_{log.id}")

        if result.get("error") == 0:
            log.status = "sent"
            log.zalo_msg_id = str((result.get("data") or {}).get("msg_id", ""))
            log.sent_at = datetime.now(timezone.utc)
        else:
            log.status = "failed"
            log.error_msg = result.get("message", str(result))[:500]
            logger.warning("Zalo send failed user=%s type=%s: %s", user_id, notif_type, log.error_msg)

        logs.append(log)

    await db.commit()

    if logs:
        sent_count = sum(1 for l in logs if l.status == "sent")
        failed_count = len(logs) - sent_count
        logger.info(
            "Zalo notify_event type=%s sent=%d failed=%d skipped_dedup=%d",
            notif_type, sent_count, failed_count,
            len(deduped_sent) + len(deduped_failed),
        )

    return logs


async def notify_bulk(
    db: AsyncSession,
    subject: str,
    text: str,
    recipient_user_ids: list[int],
    triggered_by: str = "manual",
) -> list[ZaloLog]:
    """Send a raw text message (no template) to multiple users."""
    config = await _get_active_config(db)
    if not config:
        return []

    await _ensure_token_valid(db, config)

    # Batch load ZaloUserLinks (eliminates N+1)
    links_result = await db.execute(
        select(ZaloUserLink).where(
            ZaloUserLink.user_id.in_(recipient_user_ids),
            ZaloUserLink.is_active == True,
        )
    )
    links_by_user: dict[int, ZaloUserLink] = {
        lnk.user_id: lnk for lnk in links_result.scalars()
    }

    logs: list[ZaloLog] = []
    for user_id in recipient_user_ids:
        link = links_by_user.get(user_id)
        zalo_uid = link.zalo_user_id if link else None
        phone = link.zalo_phone if link else None
        if not zalo_uid and not phone:
            continue

        log = ZaloLog(
            template_id=None,
            recipient_user_id=user_id,
            recipient_phone=phone or "",
            notif_type="broadcast",
            subject=subject,
            content_rendered=text,
            status="pending",
            triggered_by=triggered_by,
        )
        db.add(log)
        await db.flush()

        if zalo_uid:
            result = await zalo_api_service.send_oa_message(config.access_token, zalo_uid, text)
        else:
            result = {"error": -1, "message": "No zalo_user_id for OA message"}

        if result.get("error") == 0:
            log.status = "sent"
            log.sent_at = datetime.now(timezone.utc)
        else:
            log.status = "failed"
            log.error_msg = result.get("message", "")[:500]

        logs.append(log)

    await db.commit()
    return logs


async def seed_defaults(db: AsyncSession, created_by: int) -> int:
    """Seed default templates. Returns count of inserted templates."""
    inserted = 0
    for tmpl in _DEFAULT_TEMPLATES:
        existing = (await db.execute(
            select(ZaloTemplate).where(ZaloTemplate.notif_type == tmpl["notif_type"])
        )).scalar_one_or_none()
        if existing:
            continue
        db.add(ZaloTemplate(**tmpl, is_default=True, created_by=created_by))
        inserted += 1
    if inserted:
        await db.commit()
    return inserted


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _get_active_config(db: AsyncSession) -> ZaloConfig | None:
    return (await db.execute(
        select(ZaloConfig).where(ZaloConfig.is_active == True).limit(1)
    )).scalar_one_or_none()


async def _get_template(db: AsyncSession, notif_type: str) -> ZaloTemplate | None:
    return (await db.execute(
        select(ZaloTemplate).where(
            ZaloTemplate.notif_type == notif_type,
            ZaloTemplate.is_active == True,
        ).limit(1)
    )).scalar_one_or_none()


def _render(content: str, context: dict[str, Any]) -> str:
    try:
        return content.format_map({k: str(v) for k, v in context.items()})
    except (KeyError, ValueError):
        return content


async def _dispatch(
    config: ZaloConfig,
    template: ZaloTemplate,
    zalo_uid: str | None,
    phone: str | None,
    rendered: str,
    context: dict,
    tracking_id: str,
) -> dict:
    if template.channel == "oa_message" and zalo_uid:
        return await zalo_api_service.send_oa_message(config.access_token, zalo_uid, rendered)
    if template.channel == "zns" and phone and template.zns_template_id:
        return await zalo_api_service.send_zns(
            config.access_token, phone, template.zns_template_id,
            {k: str(v) for k, v in context.items()}, tracking_id,
        )
    if zalo_uid:
        return await zalo_api_service.send_oa_message(config.access_token, zalo_uid, rendered)
    return {"error": -1, "message": "No valid send channel configured"}


async def _ensure_token_valid(db: AsyncSession, config: ZaloConfig) -> None:
    if not config.token_expiry:
        logger.debug("Zalo: token_expiry chưa set, dùng token hiện tại không kiểm tra hết hạn")
        return
    now = datetime.now(timezone.utc)
    expiry = config.token_expiry if config.token_expiry.tzinfo else config.token_expiry.replace(tzinfo=timezone.utc)
    if (expiry - now).total_seconds() > 3600:
        return
    if not config.refresh_token or not config.app_id or not config.app_secret:
        logger.warning(
            "Zalo: token sắp hết hạn (%s) nhưng không thể tự làm mới — thiếu refresh_token/app_id/app_secret. "
            "Vui lòng cập nhật token thủ công trong cấu hình Zalo.",
            expiry.strftime("%d/%m/%Y %H:%M UTC"),
        )
        return
    result = await zalo_api_service.refresh_token(config.app_id, config.app_secret, config.refresh_token)
    if "access_token" in result:
        config.access_token = result["access_token"]
        if "refresh_token" in result:
            config.refresh_token = result["refresh_token"]
        expires_in = int(result.get("expires_in", 3600))
        config.token_expiry = now + timedelta(seconds=expires_in)
        await db.commit()
        logger.info("Zalo OA token auto-refreshed thành công, hết hạn lúc %s",
                    config.token_expiry.strftime("%d/%m/%Y %H:%M UTC"))
    else:
        logger.warning(
            "Zalo OA token refresh thất bại — sẽ dùng token cũ (có thể đã hết hạn). Lỗi: %s",
            result.get("message", str(result)),
        )
