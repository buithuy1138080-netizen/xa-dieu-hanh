"""Report Engine — collects and aggregates data from all IOC modules."""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Period label helper ────────────────────────────────────────────────────────

def make_period_label(period_from: date, period_to: date, report_type: str) -> str:
    y = period_from.year
    m = period_from.month
    if report_type == "monthly":
        return f"Tháng {m:02d}/{y}"
    if report_type == "quarterly":
        q = (m - 1) // 3 + 1
        q_label = ["I", "II", "III", "IV"][q - 1]
        return f"Quý {q_label}/{y}"
    if report_type == "annual":
        return f"Năm {y}"
    if report_type == "kpi":
        return f"KPI — {period_from.strftime('%d/%m/%Y')} đến {period_to.strftime('%d/%m/%Y')}"
    if report_type == "nq57":
        return f"NQ57 — Năm {y}"
    return f"{period_from.strftime('%d/%m/%Y')} – {period_to.strftime('%d/%m/%Y')}"


def make_report_title(report_type: str, period_label: str) -> str:
    from app.schemas.report import REPORT_TYPES
    base = REPORT_TYPES.get(report_type, "Báo cáo")
    return f"{base} — {period_label}"


# ── Main collect function ──────────────────────────────────────────────────────

async def collect_data(
    db: AsyncSession,
    period_from: date,
    period_to: date,
    report_type: str,
) -> dict[str, Any]:
    """Collect all data needed for a report. Returns a summary_data dict."""
    nq57     = await _nq57_stats(db)

    if report_type == "nq57":
        # NQ57 report uses NQ57Task stats, not general Task stats
        tasks    = await _nq57_task_stats(db)
        kpis_cl  = await _kpi_cl_stats(db, period_from, period_to)
        kpis_cl["avg_pct"] = tasks.get("avg_progress", 0.0)
        overdue  = await _nq57_overdue_tasks(db)
    else:
        tasks    = await _task_stats(db, period_from, period_to)
        kpis_cl  = await _kpi_cl_stats(db, period_from, period_to)
        overdue  = await _overdue_tasks(db)

    kpis_std     = await _kpi_standard_stats(db, period_from, period_to)
    docs         = await _document_stats(db, period_from, period_to)
    dept_bkd     = await _dept_breakdown(db, period_from, period_to)

    return {
        "period": {
            "from":  period_from.isoformat(),
            "to":    period_to.isoformat(),
            "label": make_period_label(period_from, period_to, report_type),
        },
        "tasks":          tasks,
        "kpis":           kpis_cl,    # KPI chiến lược (legacy key kept for compat)
        "kpis_standard":  kpis_std,   # KPI định kỳ (kpis table)
        "documents":      docs,
        "overdue_tasks":  overdue,
        "dept_breakdown": dept_bkd,
        "nq57":           nq57,
        "generated_at":   datetime.now(timezone.utc).isoformat(),
    }


# ── Task stats ─────────────────────────────────────────────────────────────────

async def _task_stats(db: AsyncSession, frm: date, to: date) -> dict:
    from app.models.task import Task
    from datetime import datetime as dt

    frm_dt = dt.combine(frm, dt.min.time()).replace(tzinfo=timezone.utc)
    to_dt  = dt.combine(to,  dt.max.time()).replace(tzinfo=timezone.utc)

    # Tasks relevant to the period: created in period OR due in period
    q = select(
        func.count().label("total"),
        func.sum(case((Task.status == "completed", 1), else_=0)).label("completed"),
        func.sum(case((Task.status == "in_progress", 1), else_=0)).label("in_progress"),
        func.sum(case((Task.status == "pending", 1), else_=0)).label("pending"),
        func.sum(case((Task.status == "cancelled", 1), else_=0)).label("cancelled"),
        func.sum(case(
            (Task.status != "completed", case(
                (Task.due_date < func.now(), 1), else_=0
            )),
            else_=0
        )).label("overdue"),
    ).where(
        Task.deleted_at.is_(None),
        (Task.created_at <= to_dt) &
        (
            (Task.due_date >= frm_dt) |
            (Task.created_at >= frm_dt)
        )
    )
    row = (await db.execute(q)).one()
    total = row.total or 0
    completed = row.completed or 0
    rate = round(completed / total * 100, 1) if total else 0.0

    return {
        "total":        total,
        "completed":    completed,
        "in_progress":  row.in_progress or 0,
        "pending":      row.pending or 0,
        "cancelled":    row.cancelled or 0,
        "overdue":      row.overdue or 0,
        "completion_rate": rate,
    }


# ── Department breakdown ────────────────────────────────────────────────────────

async def _dept_breakdown(db: AsyncSession, frm: date, to: date) -> list[dict]:
    from app.models.department import Department
    from app.models.task import Task
    from datetime import datetime as dt

    frm_dt = dt.combine(frm, dt.min.time()).replace(tzinfo=timezone.utc)
    to_dt  = dt.combine(to,  dt.max.time()).replace(tzinfo=timezone.utc)

    q = (
        select(
            Department.short_name.label("name"),
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == "completed", 1), else_=0)).label("completed"),
        )
        .join(Task, Task.lead_department_id == Department.id, isouter=True)
        .where(
            Task.deleted_at.is_(None),
            (Task.created_at >= frm_dt) & (Task.created_at <= to_dt)
        )
        .group_by(Department.id, Department.short_name)
        .order_by(func.count(Task.id).desc())
        .limit(10)
    )
    rows = (await db.execute(q)).all()
    result = []
    for r in rows:
        total = r.total or 0
        completed = r.completed or 0
        result.append({
            "name":      r.name or "Chưa phân",
            "total":     total,
            "completed": completed,
            "rate":      round(completed / total * 100, 1) if total else 0.0,
        })
    return result


# ── KPI Chiến lược stats (kpi_chien_luoc) ─────────────────────────────────────

async def _kpi_cl_stats(db: AsyncSession, frm: date, to: date) -> dict:
    try:
        from app.models.kpi_chien_luoc import KpiCL
    except ImportError:
        return {"total": 0, "avg_pct": 0, "by_status": {}, "by_category": []}

    # Filter by year(s) covered in the period
    years = list({frm.year, to.year})

    q = select(
        func.count().label("total"),
        func.avg(KpiCL.pct_hoan_thanh).label("avg_pct"),
        func.sum(case((KpiCL.trang_thai == "Đạt mục tiêu",  1), else_=0)).label("dat"),
        func.sum(case((KpiCL.trang_thai == "Đúng tiến độ",  1), else_=0)).label("dung"),
        func.sum(case((KpiCL.trang_thai == "Có rủi ro",     1), else_=0)).label("rui_ro"),
        func.sum(case((KpiCL.trang_thai == "Chậm tiến độ",  1), else_=0)).label("cham"),
        func.sum(case((KpiCL.trang_thai == "Quá hạn",       1), else_=0)).label("qua_han"),
        func.sum(case((KpiCL.trang_thai == "Chưa bắt đầu",  1), else_=0)).label("chua"),
    ).where(KpiCL.nam.in_(years))

    row = (await db.execute(q)).one()
    total = row.total or 0
    avg = round(float(row.avg_pct or 0), 1)

    # By category
    cat_q = (
        select(KpiCL.danh_muc.label("cat"), func.count().label("n"),
               func.avg(KpiCL.pct_hoan_thanh).label("avg"))
        .where(KpiCL.nam.in_(years))
        .group_by(KpiCL.danh_muc)
        .order_by(func.avg(KpiCL.pct_hoan_thanh).desc())
        .limit(8)
    )
    cats = (await db.execute(cat_q)).all()
    by_cat = [
        {"name": (r.cat or "Khác"), "count": r.n, "avg_pct": round(float(r.avg or 0), 1)}
        for r in cats
    ]

    return {
        "total":   total,
        "avg_pct": avg,
        "by_status": {
            "dat_muc_tieu":  row.dat or 0,
            "dung_tien_do":  row.dung or 0,
            "co_rui_ro":     row.rui_ro or 0,
            "cham_tien_do":  row.cham or 0,
            "qua_han":       row.qua_han or 0,
            "chua_bat_dau":  row.chua or 0,
        },
        "by_category": by_cat,
    }


# ── Document stats ─────────────────────────────────────────────────────────────

async def _document_stats(db: AsyncSession, frm: date, to: date) -> dict:
    from app.models.document import Document
    from datetime import datetime as dt

    frm_dt = dt.combine(frm, dt.min.time())
    to_dt  = dt.combine(to,  dt.max.time())

    q = select(
        func.count().label("total"),
        func.sum(case((Document.status == "done", 1), else_=0)).label("processed"),
    ).where(
        (Document.created_at >= frm_dt) & (Document.created_at <= to_dt)
    )
    row = (await db.execute(q)).one()

    # By type
    type_q = (
        select(Document.doc_type.label("t"), func.count().label("n"))
        .where((Document.created_at >= frm_dt) & (Document.created_at <= to_dt))
        .group_by(Document.doc_type)
    )
    types = (await db.execute(type_q)).all()

    return {
        "total":     row.total or 0,
        "processed": row.processed or 0,
        "by_type":   {r.t: r.n for r in types},
    }


# ── Overdue tasks (snapshot) ──────────────────────────────────────────────────

async def _overdue_tasks(db: AsyncSession) -> list[dict]:
    from app.models.department import Department
    from app.models.task import Task

    q = (
        select(
            Task.id, Task.title,
            Task.due_date, Task.priority,
            Department.short_name.label("dept_name"),
        )
        .join(Department, Task.lead_department_id == Department.id, isouter=True)
        .where(
            Task.deleted_at.is_(None),
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date < func.now(),
        )
        .order_by(Task.due_date.asc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    now = datetime.now(timezone.utc)
    result = []
    for r in rows:
        due = r.due_date
        if due and due.tzinfo is None:
            from datetime import timezone as tz
            due = due.replace(tzinfo=tz.utc)
        days_late = (now - due).days if due else 0
        result.append({
            "id":        r.id,
            "title":     r.title,
            "due_date":  r.due_date.isoformat() if r.due_date else None,
            "priority":  r.priority,
            "dept":      r.dept_name or "—",
            "days_late": days_late,
        })
    return result


# ── KPI Định kỳ stats (kpis table) ────────────────────────────────────────────

async def _kpi_standard_stats(db: AsyncSession, frm: date, to: date) -> dict:
    try:
        from app.models.kpi import KPI
    except ImportError:
        return {"total": 0, "avg_progress": 0, "by_status": {}}

    years = list({frm.year, to.year})
    q = select(
        func.count().label("total"),
        func.avg(KPI.progress).label("avg_progress"),
        func.sum(case((KPI.status == "completed",  1), else_=0)).label("completed"),
        func.sum(case((KPI.status == "on_track",   1), else_=0)).label("on_track"),
        func.sum(case((KPI.status == "at_risk",    1), else_=0)).label("at_risk"),
        func.sum(case((KPI.status == "behind",     1), else_=0)).label("behind"),
    ).where(KPI.year.in_(years))
    row = (await db.execute(q)).one()
    total = row.total or 0

    # Completion rate
    completed = row.completed or 0
    rate = round(completed / total * 100, 1) if total else 0.0

    return {
        "total":        total,
        "avg_progress": round(float(row.avg_progress or 0), 1),
        "completion_rate": rate,
        "by_status": {
            "completed": completed,
            "on_track":  row.on_track or 0,
            "at_risk":   row.at_risk or 0,
            "behind":    row.behind or 0,
        },
    }


# ── NQ57 stats ─────────────────────────────────────────────────────────────────

async def _nq57_stats(db: AsyncSession) -> dict:
    try:
        from app.models.nq57 import NQ57Task
    except ImportError:
        return {"total": 0, "completed": 0, "avg_progress": 0}

    q = select(
        func.count().label("total"),
        func.sum(case((NQ57Task.status == "completed", 1), else_=0)).label("completed"),
        func.avg(NQ57Task.progress).label("avg_progress"),
    )
    row = (await db.execute(q)).one()
    return {
        "total":       row.total or 0,
        "completed":   row.completed or 0,
        "avg_progress": round(float(row.avg_progress or 0), 1),
    }


async def _nq57_task_stats(db: AsyncSession) -> dict:
    """Task stats for NQ57 report — queries Task linked to NQ57 programs (same source as program dashboard)."""
    from app.models.task import Task
    from app.models.program import Program
    from datetime import datetime as dt, timezone

    now = dt.now(timezone.utc)
    q = select(
        func.count().label("total"),
        func.sum(case((Task.status == "completed",   1), else_=0)).label("completed"),
        func.sum(case((Task.status == "in_progress", 1), else_=0)).label("in_progress"),
        func.sum(case((Task.status == "pending",     1), else_=0)).label("pending"),
        func.sum(case((Task.status == "cancelled",   1), else_=0)).label("cancelled"),
        func.sum(case(
            (
                (Task.status != "completed") &
                (Task.status != "cancelled") &
                Task.due_date.isnot(None) &
                (Task.due_date < now),
                1
            ),
            else_=0
        )).label("overdue"),
        func.avg(Task.progress_percent).label("avg_progress"),
    ).join(Program, Task.program_id == Program.id).where(
        Task.deleted_at.is_(None),
        Program.code.ilike("%NQ57%"),
    )

    row = (await db.execute(q)).one()
    total     = row.total or 0
    completed = row.completed or 0
    rate      = round(completed / total * 100, 1) if total else 0.0

    return {
        "total":        total,
        "completed":    completed,
        "in_progress":  row.in_progress or 0,
        "pending":      row.pending or 0,
        "cancelled":    row.cancelled or 0,
        "overdue":      row.overdue or 0,
        "completion_rate": rate,
        "avg_progress": round(float(row.avg_progress or 0), 1),
    }


async def _nq57_overdue_tasks(db: AsyncSession) -> list[dict]:
    """Overdue tasks for NQ57 report — tasks linked to NQ57 programs."""
    from app.models.task import Task
    from app.models.program import Program
    from datetime import datetime as dt, timezone

    now = dt.now(timezone.utc)
    stmt = (
        select(Task.id, Task.title, Task.task_code, Task.due_date, Task.priority)
        .join(Program, Task.program_id == Program.id)
        .where(
            Task.deleted_at.is_(None),
            Program.code.ilike("%NQ57%"),
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date.isnot(None),
            Task.due_date < now,
        )
        .order_by(Task.due_date.asc())
        .limit(20)
    )
    rows = (await db.execute(stmt)).all()
    result = []
    for r in rows:
        due = r.due_date if r.due_date.tzinfo else r.due_date.replace(tzinfo=timezone.utc)
        days = max(0, int((now - due).total_seconds() / 86400))
        result.append({
            "id":           r.id,
            "title":        r.title,
            "task_code":    r.task_code,
            "due_date":     r.due_date.isoformat() if r.due_date else None,
            "days_overdue": days,
            "priority":     r.priority or "normal",
            "assignee_name": None,
        })
    return result
