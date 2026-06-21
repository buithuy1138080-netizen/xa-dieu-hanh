import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal
from app.models.notification import Notification
from app.models.task import Task

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone="UTC")

NOTIF_ICONS = {
    "reminder_3d": "⏰",
    "reminder_1d": "⚠️",
    "overdue":     "🚨",
}


async def _ensure_notif(
    db,
    user_id: int,
    task_id: int | None,
    ntype: str,
    title: str,
    body: str,
    link_url: str | None = None,
) -> Notification | None:
    conditions = [
        Notification.user_id == user_id,
        Notification.type == ntype,
    ]
    if task_id is not None:
        conditions.append(Notification.task_id == task_id)
    exists = (await db.execute(select(Notification).where(*conditions))).scalar_one_or_none()
    if exists:
        return None
    n = Notification(user_id=user_id, task_id=task_id, type=ntype,
                     title=title, body=body, link_url=link_url)
    db.add(n)
    return n


async def check_deadlines() -> None:
    from app.services.ws_manager import manager

    now = datetime.now(timezone.utc)
    created: list[tuple[int, Notification]] = []

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Task).where(
                    Task.due_date.isnot(None),
                    Task.deleted_at.is_(None),
                    Task.status.notin_(["completed", "cancelled"]),
                )
            )
            tasks = result.scalars().all()

            for task in tasks:
                target = task.assignee_id or task.created_by
                dl = task.due_date
                deadline_utc = dl if dl.tzinfo else dl.replace(tzinfo=timezone.utc)
                days = (deadline_utc - now).total_seconds() / 86400

                if days <= 0:
                    n = await _ensure_notif(
                        db, target, task.id, "overdue",
                        f"🚨 Quá hạn: {task.title}",
                        f"Nhiệm vụ đã quá hạn từ {dl.strftime('%d/%m/%Y')}",
                    )
                elif days <= 1:
                    n = await _ensure_notif(
                        db, target, task.id, "reminder_1d",
                        f"⚠️ Sắp đến hạn: {task.title}",
                        f"Nhiệm vụ đến hạn ngày mai ({dl.strftime('%d/%m/%Y')})",
                    )
                elif days <= 3:
                    n = await _ensure_notif(
                        db, target, task.id, "reminder_3d",
                        f"⏰ Nhắc nhở: {task.title}",
                        f"Nhiệm vụ đến hạn trong {int(days) + 1} ngày ({dl.strftime('%d/%m/%Y')})",
                    )
                else:
                    n = None

                if n:
                    created.append((target, n))

            # ── Directive deadline checks ──────────────────────────────────
            from app.models.directive import Directive, DirectiveUnit
            from sqlalchemy.orm import selectinload as sl

            dir_result = await db.execute(
                select(Directive)
                .options(sl(Directive.units))
                .where(
                    Directive.deadline.isnot(None),
                    Directive.status == "active",
                    Directive.deleted_at.is_(None),
                )
            )
            directives = dir_result.scalars().all()

            for directive in directives:
                dl = directive.deadline
                deadline_utc = dl if dl.tzinfo else dl.replace(tzinfo=timezone.utc)
                days = (deadline_utc - now).total_seconds() / 86400

                # Collect user IDs to notify: issuer + all unit users
                targets = {directive.issuer_id}
                for unit in directive.units:
                    if unit.user_id:
                        targets.add(unit.user_id)

                link = f"/directives/{directive.id}"

                for uid in targets:
                    if days <= 0:
                        n = await _ensure_notif(
                            db, uid, None, f"directive_overdue_{directive.id}",
                            f"Chỉ đạo quá hạn: {directive.title[:60]}",
                            f"Chỉ đạo đã quá hạn từ {dl.strftime('%d/%m/%Y')}",
                            link_url=link,
                        )
                    elif days <= 1:
                        n = await _ensure_notif(
                            db, uid, None, f"directive_1d_{directive.id}",
                            f"Chỉ đạo sắp đến hạn: {directive.title[:60]}",
                            f"Chỉ đạo đến hạn ngày mai ({dl.strftime('%d/%m/%Y')})",
                            link_url=link,
                        )
                    elif days <= 3:
                        n = await _ensure_notif(
                            db, uid, None, f"directive_3d_{directive.id}",
                            f"Nhắc nhở chỉ đạo: {directive.title[:60]}",
                            f"Chỉ đạo đến hạn trong {int(days) + 1} ngày ({dl.strftime('%d/%m/%Y')})",
                            link_url=link,
                        )
                    else:
                        n = None
                    if n:
                        created.append((uid, n))

            if created:
                await db.flush()
                payload = [
                    (uid, n.id, n.title, n.body, n.task_id, n.type, n.link_url)
                    for uid, n in created
                ]
                await db.commit()
                for uid, nid, title, body, task_id, ntype, link_url in payload:
                    await manager.send_to_user(uid, {
                        "type": "notification",
                        "id": nid,
                        "notification_type": ntype,
                        "title": title,
                        "body": body,
                        "task_id": task_id,
                        "link_url": link_url,
                    })
                log.info("Scheduler: sent %d notification(s)", len(created))
    except Exception:
        log.exception("check_deadlines job failed")


scheduler.add_job(
    check_deadlines,
    "interval",
    hours=1,
    id="check_deadlines",
    replace_existing=True,
    misfire_grace_time=60,
)


# ── Auto-report generation jobs ───────────────────────────────────────────────

async def _auto_generate_report(report_type: str) -> None:
    """Generate an automated report for the previous period."""
    from datetime import date, timedelta
    from app.models.report import Report as ReportModel
    from app.services import report_engine, ai_summary_service
    from sqlalchemy import select as sa_select

    today = date.today()

    if report_type == "monthly":
        # Previous month
        first_this = today.replace(day=1)
        period_to = first_this - timedelta(days=1)
        period_from = period_to.replace(day=1)
    elif report_type == "quarterly":
        # Previous quarter
        q = (today.month - 1) // 3  # 0=Q1,1=Q2,2=Q3,3=Q4 (previous)
        if q == 0: q = 4
        q_start_month = (q - 1) * 3 + 1
        from calendar import monthrange
        period_from = date(today.year if q < 4 else today.year - 1, q_start_month, 1)
        last_m = q_start_month + 2
        period_to = date(period_from.year, last_m, monthrange(period_from.year, last_m)[1])
    elif report_type == "annual":
        period_from = date(today.year - 1, 1, 1)
        period_to = date(today.year - 1, 12, 31)
    else:
        return

    try:
        async with AsyncSessionLocal() as db:
            # Find first admin user
            from app.models.user import User
            admin = (await db.execute(
                sa_select(User).where(User.role == "admin").limit(1)
            )).scalar_one_or_none()
            if not admin:
                log.warning("Auto-report: no admin user found, skipping")
                return

            # Skip if a report for this exact period already exists
            existing = (await db.execute(
                sa_select(ReportModel).where(
                    ReportModel.report_type == report_type,
                    ReportModel.period_from == period_from,
                    ReportModel.period_to == period_to,
                )
            )).scalar_one_or_none()
            if existing:
                log.info("Auto-report: already exists for %s %s–%s, skipping", report_type, period_from, period_to)
                return

            label = report_engine.make_period_label(period_from, period_to, report_type)
            title = report_engine.make_report_title(report_type, label)

            rpt = ReportModel(
                report_type=report_type,
                title=title,
                period_label=label,
                period_from=period_from,
                period_to=period_to,
                status="generating",
                created_by=admin.id,
            )
            db.add(rpt)
            await db.commit()
            await db.refresh(rpt)

            data = await report_engine.collect_data(db, period_from, period_to, report_type)
            summary = ai_summary_service.generate_summary(data, report_type)
            rpt.summary_data = data
            rpt.ai_summary = summary
            rpt.status = "done"
            rpt.generated_at = datetime.now(timezone.utc)

            notif = Notification(
                user_id=admin.id,
                type="report",
                title="Báo cáo tự động đã sẵn sàng",
                body=f"Hệ thống vừa tạo tự động: {title}",
                link_url=f"/bao-cao/{rpt.id}",
            )
            db.add(notif)
            await db.commit()
            log.info("Auto-report generated: %s (id=%s)", title, rpt.id)
    except Exception:
        log.exception("Auto-report failed: type=%s", report_type)


# Monthly: 1st of each month at 07:00
scheduler.add_job(
    _auto_generate_report,
    "cron",
    args=["monthly"],
    day=1, hour=7, minute=0,
    id="auto_report_monthly",
    replace_existing=True,
    misfire_grace_time=3600,
)

# Quarterly: Jan/Apr/Jul/Oct 1st at 07:30
scheduler.add_job(
    _auto_generate_report,
    "cron",
    args=["quarterly"],
    month="1,4,7,10", day=1, hour=7, minute=30,
    id="auto_report_quarterly",
    replace_existing=True,
    misfire_grace_time=3600,
)

# Annual: Jan 1st at 08:00
scheduler.add_job(
    _auto_generate_report,
    "cron",
    args=["annual"],
    month=1, day=1, hour=8, minute=0,
    id="auto_report_annual",
    replace_existing=True,
    misfire_grace_time=3600,
)


# ── Zalo notification jobs ────────────────────────────────────────────────────

async def _zalo_task_warnings() -> None:
    """Send Zalo alerts for tasks overdue or due within 3 days.

    Groups tasks per user into a single consolidated message to avoid
    flooding the same recipient with many individual notifications.
    """
    from collections import defaultdict
    from app.models.task import Task
    from app.models.zalo import ZaloConfig, ZaloUserLink
    from app.services import zalo_api_service
    from app.services.zalo_notify_engine import _ensure_token_valid

    today = datetime.now(timezone.utc)
    warning_cutoff = today + timedelta(days=3)

    try:
        async with AsyncSessionLocal() as db:
            cfg = (await db.execute(
                select(ZaloConfig).where(ZaloConfig.is_active == True).limit(1)
            )).scalar_one_or_none()
            if not cfg or not cfg.access_token:
                return
            has_uid = (await db.execute(
                select(ZaloUserLink).where(
                    ZaloUserLink.zalo_user_id.isnot(None),
                    ZaloUserLink.is_active == True,
                ).limit(1)
            )).scalar_one_or_none()
            if not has_uid:
                log.debug("Zalo task warnings: no users with zalo_user_id, skipping")
                return

            await _ensure_token_valid(db, cfg)

            # Collect overdue tasks grouped by recipient
            overdue_by_user: dict[int, list[Task]] = defaultdict(list)
            result = await db.execute(
                select(Task).where(
                    Task.due_date.isnot(None),
                    Task.deleted_at.is_(None),
                    Task.due_date < today,
                    Task.status.notin_(["completed", "cancelled"]),
                )
            )
            for task in result.scalars().all():
                overdue_by_user[task.assignee_id or task.created_by].append(task)

            # Collect upcoming tasks grouped by recipient
            warning_by_user: dict[int, list[Task]] = defaultdict(list)
            result2 = await db.execute(
                select(Task).where(
                    Task.due_date.isnot(None),
                    Task.deleted_at.is_(None),
                    Task.due_date >= today,
                    Task.due_date <= warning_cutoff,
                    Task.status.notin_(["completed", "cancelled"]),
                )
            )
            for task in result2.scalars().all():
                warning_by_user[task.assignee_id or task.created_by].append(task)

            all_user_ids = set(overdue_by_user) | set(warning_by_user)
            if not all_user_ids:
                return

            # Batch load ZaloUserLinks
            links_result = await db.execute(
                select(ZaloUserLink).where(
                    ZaloUserLink.user_id.in_(all_user_ids),
                    ZaloUserLink.zalo_user_id.isnot(None),
                    ZaloUserLink.is_active == True,
                )
            )
            links = {lnk.user_id: lnk.zalo_user_id for lnk in links_result.scalars()}

            sent = failed = 0
            for user_id in all_user_ids:
                zalo_uid = links.get(user_id)
                if not zalo_uid:
                    continue

                lines: list[str] = []
                overdue_tasks = overdue_by_user.get(user_id, [])
                warn_tasks = warning_by_user.get(user_id, [])

                if overdue_tasks:
                    lines.append("⚠️ NHIỆM VỤ QUÁ HẠN:")
                    for t in overdue_tasks[:10]:
                        due_utc = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
                        days_late = max(0, (today - due_utc).days)
                        lines.append(f"• {t.title} ({days_late} ngày, hạn {t.due_date.strftime('%d/%m/%Y')})")
                    if len(overdue_tasks) > 10:
                        lines.append(f"  ... và {len(overdue_tasks) - 10} nhiệm vụ khác")

                if warn_tasks:
                    if lines:
                        lines.append("")
                    lines.append("⏰ SẮP ĐẾN HẠN (3 ngày):")
                    for t in warn_tasks[:10]:
                        due_utc = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
                        days_left = max(0, (due_utc - today).days)
                        lines.append(f"• {t.title} (còn {days_left} ngày, {t.due_date.strftime('%d/%m/%Y')})")
                    if len(warn_tasks) > 10:
                        lines.append(f"  ... và {len(warn_tasks) - 10} nhiệm vụ khác")

                if not lines:
                    continue

                lines.append("\nVui lòng cập nhật tiến độ trên IOC.")
                msg = "\n".join(lines)

                result_zalo = await zalo_api_service.send_oa_message(cfg.access_token, zalo_uid, msg)
                if result_zalo.get("error") == 0:
                    sent += 1
                else:
                    failed += 1
                    log.warning("Zalo task warnings failed user=%s: %s", user_id, result_zalo.get("message"))

            log.info("Zalo task warnings: sent=%d failed=%d", sent, failed)
    except Exception:
        log.exception("Zalo task warnings job failed")


async def _zalo_kpi_alerts() -> None:
    """Send Zalo KPI alerts for KPIs below 70%."""
    from app.models.kpi import KPI
    from app.models.zalo import ZaloConfig, ZaloUserLink
    from app.services.zalo_notify_engine import notify_event

    try:
        async with AsyncSessionLocal() as db:
            cfg = (await db.execute(
                select(ZaloConfig).where(ZaloConfig.is_active == True).limit(1)
            )).scalar_one_or_none()
            if not cfg or not cfg.access_token:
                return
            has_uid = (await db.execute(
                select(ZaloUserLink).where(
                    ZaloUserLink.zalo_user_id.isnot(None),
                    ZaloUserLink.is_active == True,
                ).limit(1)
            )).scalar_one_or_none()
            if not has_uid:
                return
            result = await db.execute(
                select(KPI).where(
                    KPI.progress < 70,
                    KPI.status.notin_(["completed"]),
                )
            )
            kpi_sent = kpi_failed = 0
            for kpi in result.scalars().all():
                recipients = []
                if kpi.responsible_user_id:
                    recipients.append(kpi.responsible_user_id)
                if kpi.created_by and kpi.created_by not in recipients:
                    recipients.append(kpi.created_by)
                if not recipients:
                    continue
                logs = await notify_event(
                    db, "kpi_low",
                    context={
                        "kpi_title": kpi.title or "",
                        "progress": round(kpi.progress, 1),
                        "target": round(kpi.target_value, 1),
                    },
                    recipient_user_ids=recipients,
                    entity_type="kpi", entity_id=kpi.id,
                    triggered_by="scheduler", dedup_hours=48,
                )
                for l in logs:
                    if l.status == "sent":
                        kpi_sent += 1
                    else:
                        kpi_failed += 1
            log.info("Zalo KPI alerts: sent=%d failed=%d", kpi_sent, kpi_failed)
    except Exception:
        log.exception("Zalo KPI alerts job failed")


# Hourly task warnings (06:00–22:00)
scheduler.add_job(
    _zalo_task_warnings,
    "cron",
    hour="6-22",
    minute=15,
    id="zalo_task_warnings",
    replace_existing=True,
    misfire_grace_time=300,
)

# Daily KPI alert at 08:30
scheduler.add_job(
    _zalo_kpi_alerts,
    "cron",
    hour=8, minute=30,
    id="zalo_kpi_alerts",
    replace_existing=True,
    misfire_grace_time=1800,
)


# ── Auto-mark overdue tasks ───────────────────────────────────────────────────

async def _mark_overdue_tasks() -> None:
    """Auto-set status='overdue' for tasks whose due_date has passed."""
    from app.models.task import Task

    today = datetime.now(timezone.utc)
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Task).where(
                    Task.due_date.isnot(None),
                    Task.deleted_at.is_(None),
                    Task.due_date < today,
                    Task.status.in_(["pending", "in_progress"]),
                )
            )
            tasks = result.scalars().all()
            count = len(tasks)
            for task in tasks:
                task.status = "overdue"
            if count:
                await db.commit()
                log.info("Auto-marked %d tasks as overdue", count)
    except Exception:
        log.exception("Mark overdue tasks job failed")


# Daily at 00:05
scheduler.add_job(
    _mark_overdue_tasks,
    "cron",
    hour=0, minute=5,
    id="mark_overdue_tasks",
    replace_existing=True,
    misfire_grace_time=3600,
)


# ── Notification & log cleanup ────────────────────────────────────────────────

_NOTIF_RETENTION_DAYS = 90   # keep read notifications for 90 days
_ZALO_LOG_RETENTION_DAYS = 90


async def _cleanup_old_records() -> None:
    """Delete stale notifications and Zalo logs to prevent unbounded table growth."""
    from app.models.zalo import ZaloLog

    cutoff = datetime.now(timezone.utc) - timedelta(days=_NOTIF_RETENTION_DAYS)
    zalo_cutoff = datetime.now(timezone.utc) - timedelta(days=_ZALO_LOG_RETENTION_DAYS)

    try:
        async with AsyncSessionLocal() as db:
            # Remove read notifications older than retention window
            notif_result = await db.execute(
                delete(Notification).where(
                    Notification.is_read.is_(True),
                    Notification.created_at < cutoff,
                )
            )
            # Remove Zalo delivery logs older than retention window
            zalo_result = await db.execute(
                delete(ZaloLog).where(ZaloLog.created_at < zalo_cutoff)
            )
            await db.commit()
            log.info(
                "Cleanup: removed %d notifications, %d zalo_logs",
                notif_result.rowcount,
                zalo_result.rowcount,
            )
    except Exception:
        log.exception("Cleanup job failed")


# Daily at 03:00 (low-traffic window)
scheduler.add_job(
    _cleanup_old_records,
    "cron",
    hour=3, minute=0,
    id="cleanup_old_records",
    replace_existing=True,
    misfire_grace_time=3600,
)


# ── Nhắc lịch công tác qua Zalo ──────────────────────────────────────────────

async def _send_schedule_reminders() -> None:
    """Gửi nhắc lịch công tác Zalo — chạy mỗi 5 phút."""
    from app.models.schedule import ScheduleItem, ScheduleReminder
    from app.models.zalo import ZaloConfig
    from app.services import zalo_api_service
    from sqlalchemy import update as sa_update

    now = datetime.now(timezone.utc)

    try:
        async with AsyncSessionLocal() as db:
            # Kiểm tra Zalo config
            cfg = (await db.execute(
                select(ZaloConfig).where(ZaloConfig.is_active == True).limit(1)
            )).scalar_one_or_none()
            if not cfg or not cfg.access_token:
                return

            # Lấy reminders sắp đến hạn (window: -10 phút đến +1 phút)
            reminders = (await db.execute(
                select(ScheduleReminder)
                .join(ScheduleItem, ScheduleReminder.schedule_id == ScheduleItem.id)
                .where(
                    ScheduleReminder.status == "pending",
                    ScheduleReminder.scheduled_at >= now - timedelta(minutes=10),
                    ScheduleReminder.scheduled_at <= now + timedelta(minutes=1),
                    ScheduleItem.deleted_at.is_(None),
                )
            )).scalars().all()

            if not reminders:
                return

            log.info("Schedule reminders: %d cần gửi", len(reminders))

            for reminder in reminders:
                if not reminder.zalo_user_id:
                    await db.execute(
                        sa_update(ScheduleReminder)
                        .where(ScheduleReminder.id == reminder.id)
                        .values(status="skipped", error_msg="Chưa liên kết Zalo")
                    )
                    continue

                # Lấy thông tin lịch
                item = await db.get(ScheduleItem, reminder.schedule_id)
                if not item:
                    continue

                # Render nội dung
                session_map = {"sang": "Sáng", "chieu": "Chiều", "ca_ngay": "Cả ngày", "toi": "Tối"}
                session_lbl = session_map.get(item.session, item.session)
                time_str = item.start_time.strftime("%H:%M") if item.start_time else ""
                date_str = item.work_date.strftime("%d/%m/%Y")

                before = reminder.scheduled_at
                diff = (datetime.combine(item.work_date, item.start_time or datetime.min.time())
                        .replace(tzinfo=timezone.utc) - now)
                diff_min = max(0, int(diff.total_seconds() / 60))
                if diff_min >= 60:
                    time_left = f"{diff_min // 60} giờ {diff_min % 60} phút" if diff_min % 60 else f"{diff_min // 60} giờ"
                else:
                    time_left = f"{diff_min} phút"

                msg = (
                    f"📅 NHẮC LỊCH CÔNG TÁC\n\n"
                    f"🕐 {session_lbl}{' ' + time_str if time_str else ''} ngày {date_str}\n"
                    f"📋 {item.title}\n"
                )
                if item.location:
                    msg += f"📍 {item.location}\n"
                msg += f"\nCòn {time_left} nữa.\n— Hệ thống IOC"

                try:
                    result = await zalo_api_service.send_oa_message(
                        cfg.access_token, reminder.zalo_user_id, msg
                    )
                    if result.get("error") == 0:
                        await db.execute(
                            sa_update(ScheduleReminder)
                            .where(ScheduleReminder.id == reminder.id)
                            .values(
                                status="sent",
                                sent_at=now,
                                zalo_msg_id=str((result.get("data") or {}).get("msg_id", "")),
                            )
                        )
                        log.info("Schedule reminder sent: id=%s leader=%s", reminder.id, reminder.leader_id)
                    else:
                        err = result.get("message", str(result))[:300]
                        new_retry = reminder.retry_count + 1
                        new_status = "failed" if new_retry >= 3 else "pending"
                        new_scheduled = now + timedelta(minutes=5) if new_status == "pending" else reminder.scheduled_at
                        await db.execute(
                            sa_update(ScheduleReminder)
                            .where(ScheduleReminder.id == reminder.id)
                            .values(
                                status=new_status,
                                error_msg=err,
                                retry_count=new_retry,
                                scheduled_at=new_scheduled,
                            )
                        )
                        log.warning("Schedule reminder failed id=%s err=%s retry=%s", reminder.id, err, new_retry)
                except Exception as exc:
                    log.warning("Schedule reminder exception id=%s: %s", reminder.id, exc)

            await db.commit()
    except Exception:
        log.exception("_send_schedule_reminders job failed")


# Gửi nhắc lịch mỗi 5 phút (06:00 – 22:00)
scheduler.add_job(
    _send_schedule_reminders,
    "interval",
    minutes=5,
    id="schedule_zalo_remind",
    replace_existing=True,
    misfire_grace_time=120,
)
