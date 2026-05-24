"""AI Tool Calling Framework — 14 tools that query existing service layer.

AI NEVER touches the database directly. All data flows through these functions,
which call existing SQLAlchemy queries via a shared AsyncSession.

Tool result size is capped at _MAX_CHARS to keep Gemini token costs low.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

_MAX_CHARS = 2500  # max chars per tool result returned to Gemini


def _trim(obj: Any, max_chars: int = _MAX_CHARS) -> str:
    """JSON-encode and trim long results to keep token usage low."""
    try:
        text = json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        text = str(obj)
    if len(text) > max_chars:
        text = text[:max_chars] + "…[truncated]"
    return text


def _today() -> date:
    return datetime.now(timezone.utc).date()


# ────────────────────────────────────────────────────────────────────────────
# DOCUMENT TOOLS
# ────────────────────────────────────────────────────────────────────────────

async def get_documents(db: AsyncSession, limit: int = 10) -> str:
    """Return latest documents (title, number, type, status, date)."""
    from app.models.document import Document
    rows = (await db.execute(
        select(Document)
        .order_by(desc(Document.created_at))
        .limit(min(limit, 30))
    )).scalars().all()
    data = [{
        "id": r.id,
        "so_van_ban": r.doc_number,
        "tieu_de": r.title,
        "loai": r.doc_type,
        "trang_thai": r.status,
        "ngay_ban_hanh": str(r.issue_date) if r.issue_date else None,
        "co_quan_ban_hanh": r.issuer,
        "han_xu_ly": str(r.deadline) if r.deadline else None,
    } for r in rows]
    return _trim({"tong_so": len(data), "van_ban": data})


async def search_documents(db: AsyncSession, keyword: str) -> str:
    """Search documents by keyword in title, number or summary."""
    from app.models.document import Document
    from sqlalchemy import or_, ilike
    kw = f"%{keyword}%"
    rows = (await db.execute(
        select(Document)
        .where(or_(
            Document.title.ilike(kw),
            Document.doc_number.ilike(kw),
            Document.summary.ilike(kw),
        ))
        .order_by(desc(Document.created_at))
        .limit(15)
    )).scalars().all()
    data = [{
        "id": r.id,
        "so_van_ban": r.doc_number,
        "tieu_de": r.title,
        "loai": r.doc_type,
        "trang_thai": r.status,
        "ngay_ban_hanh": str(r.issue_date) if r.issue_date else None,
        "tom_tat": (r.summary or "")[:300],
    } for r in rows]
    return _trim({"tu_khoa": keyword, "ket_qua": len(data), "van_ban": data})


async def summarize_document(db: AsyncSession, document_id: int) -> str:
    """Return full summary and AI result for a specific document."""
    from app.models.document import Document
    doc = await db.get(Document, document_id)
    if not doc:
        return json.dumps({"loi": f"Không tìm thấy văn bản #{document_id}"}, ensure_ascii=False)
    return _trim({
        "id": doc.id,
        "so_van_ban": doc.doc_number,
        "tieu_de": doc.title,
        "loai": doc.doc_type,
        "co_quan_ban_hanh": doc.issuer,
        "ngay_ban_hanh": str(doc.issue_date) if doc.issue_date else None,
        "han_xu_ly": str(doc.deadline) if doc.deadline else None,
        "trang_thai": doc.status,
        "uu_tien": doc.priority,
        "tom_tat": doc.summary,
        "noi_dung_chinh": (doc.raw_text or "")[:2000],
        "tu_khoa": doc.keywords,
        "linh_vuc": doc.domain,
    })


# ────────────────────────────────────────────────────────────────────────────
# TASK TOOLS
# ────────────────────────────────────────────────────────────────────────────

async def get_tasks(db: AsyncSession, status: str | None = None, limit: int = 20) -> str:
    """Return task list, optionally filtered by status."""
    from app.models.task import Task
    q = select(Task).order_by(desc(Task.created_at)).limit(min(limit, 50))
    if status:
        q = q.where(Task.status == status)
    rows = (await db.execute(q)).scalars().all()
    data = [{
        "id": r.id,
        "tieu_de": r.title,
        "trang_thai": r.status,
        "uu_tien": r.priority,
        "tien_do": r.progress_percent,
        "han_hoan_thanh": str(r.due_date) if r.due_date else None,
    } for r in rows]
    summary = {
        "tong_so": len(data),
        "hoan_thanh": sum(1 for t in data if t["trang_thai"] == "completed"),
        "dang_thuc_hien": sum(1 for t in data if t["trang_thai"] == "in_progress"),
        "cho_xu_ly": sum(1 for t in data if t["trang_thai"] == "pending"),
        "nhiem_vu": data,
    }
    return _trim(summary)


async def get_overdue_tasks(db: AsyncSession) -> str:
    """Return all overdue (past deadline, not completed) tasks."""
    from app.models.task import Task
    now = datetime.now(timezone.utc)
    rows = (await db.execute(
        select(Task)
        .where(
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date.isnot(None),
            Task.due_date < now,
        )
        .order_by(Task.due_date)
        .limit(50)
    )).scalars().all()
    data = [{
        "id": r.id,
        "tieu_de": r.title,
        "trang_thai": r.status,
        "uu_tien": r.priority,
        "tien_do": r.progress_percent,
        "han_hoan_thanh": str(r.due_date) if r.due_date else None,
        "so_ngay_tre": (now.date() - r.due_date.date()).days if r.due_date else None,
    } for r in rows]
    return _trim({"tong_qua_han": len(data), "nhiem_vu_qua_han": data})


async def get_upcoming_tasks(db: AsyncSession, days: int = 7) -> str:
    """Return tasks due within the next N days."""
    from app.models.task import Task
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)
    rows = (await db.execute(
        select(Task)
        .where(
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date.isnot(None),
            Task.due_date >= now,
            Task.due_date <= cutoff,
        )
        .order_by(Task.due_date)
        .limit(50)
    )).scalars().all()
    data = [{
        "id": r.id,
        "tieu_de": r.title,
        "trang_thai": r.status,
        "uu_tien": r.priority,
        "tien_do": r.progress_percent,
        "han_hoan_thanh": str(r.due_date) if r.due_date else None,
        "con_lai_ngay": (r.due_date.date() - now.date()).days if r.due_date else None,
    } for r in rows]
    return _trim({"nhiem_vu_sap_den_han": len(data), "trong_so_ngay": days, "nhiem_vu": data})


# ────────────────────────────────────────────────────────────────────────────
# NQ57 TOOLS
# ────────────────────────────────────────────────────────────────────────────

async def get_nq57_progress(db: AsyncSession) -> str:
    """Return NQ57 task progress overview."""
    from app.models.nq57 import NQ57Task
    rows = (await db.execute(
        select(NQ57Task).limit(100)
    )).scalars().all()
    total = len(rows)
    done = sum(1 for r in rows if r.status == "completed")
    in_prog = sum(1 for r in rows if r.status == "in_progress")
    pending = sum(1 for r in rows if r.status == "pending")
    delayed = sum(1 for r in rows if r.status in ("delayed", "overdue"))
    items = [{
        "id": r.id,
        "nq57_number": r.nq57_number,
        "trang_thai": r.status,
        "uu_tien": r.priority,
    } for r in rows[:20]]
    return _trim({
        "tong_so": total,
        "hoan_thanh": done,
        "dang_thuc_hien": in_prog,
        "cho_xu_ly": pending,
        "tre_han": delayed,
        "ty_le_hoan_thanh": f"{(done/total*100):.1f}%" if total else "0%",
        "chi_tiet": items,
    })


# ────────────────────────────────────────────────────────────────────────────
# KPI / TARGET TOOLS
# ────────────────────────────────────────────────────────────────────────────

async def get_targets(db: AsyncSession, year: int | None = None) -> str:
    """Return KPI list for the given year (default: current year)."""
    from app.models.kpi import KPI
    yr = year or _today().year
    rows = (await db.execute(
        select(KPI)
        .where(KPI.year == yr)
        .order_by(KPI.code)
        .limit(60)
    )).scalars().all()
    data = [{
        "id": r.id,
        "ma": r.code,
        "ten": r.title,
        "don_vi": r.unit,
        "muc_tieu": r.target_value,
        "hien_tai": r.current_value,
        "tien_do": r.progress,
        "trang_thai": r.status,
        "han": str(r.deadline) if r.deadline else None,
    } for r in rows]
    on_track = sum(1 for d in data if d["trang_thai"] == "on_track")
    at_risk = sum(1 for d in data if d["trang_thai"] == "at_risk")
    behind = sum(1 for d in data if d["trang_thai"] == "behind")
    return _trim({
        "nam": yr, "tong_so": len(data),
        "dung_tien_do": on_track, "co_nguy_co": at_risk, "cham_tien_do": behind,
        "chi_tieu": data,
    })


async def get_target_progress(db: AsyncSession, kpi_id: int) -> str:
    """Return progress history for a specific KPI."""
    from app.models.kpi import KPI, KPIProgress
    kpi = await db.get(KPI, kpi_id)
    if not kpi:
        return json.dumps({"loi": f"KPI #{kpi_id} không tồn tại"}, ensure_ascii=False)
    hist = (await db.execute(
        select(KPIProgress)
        .where(KPIProgress.kpi_id == kpi_id)
        .order_by(desc(KPIProgress.recorded_at))
        .limit(12)
    )).scalars().all()
    return _trim({
        "kpi": {"id": kpi.id, "ten": kpi.title, "don_vi": kpi.unit,
                "muc_tieu": kpi.target_value, "hien_tai": kpi.current_value,
                "tien_do": kpi.progress, "trang_thai": kpi.status},
        "lich_su": [{"ngay": str(h.recorded_at), "gia_tri": h.value, "ghi_chu": h.note}
                    for h in hist],
    })


# ────────────────────────────────────────────────────────────────────────────
# BUDGET TOOLS
# ────────────────────────────────────────────────────────────────────────────

async def get_budget_summary(db: AsyncSession, year: int | None = None) -> str:
    """Return budget allocation and spending summary from strategic projects."""
    from app.models.strategic import BudgetPlan, Disbursement
    yr = year or _today().year
    plans = (await db.execute(
        select(BudgetPlan).where(BudgetPlan.fiscal_year == yr).limit(50)
    )).scalars().all()
    total_budget = sum(p.total_budget for p in plans)
    total_allocated = sum(p.allocated_budget for p in plans)
    total_spent = sum(p.spent_budget for p in plans)
    total_remaining = sum(p.remaining_budget for p in plans)
    return _trim({
        "nam_tai_chinh": yr,
        "so_ke_hoach_ngan_sach": len(plans),
        "tong_ngan_sach": total_budget,
        "da_phan_bo": total_allocated,
        "da_giai_ngan": total_spent,
        "con_lai": total_remaining,
        "ty_le_giai_ngan": f"{(total_spent/total_budget*100):.1f}%" if total_budget else "0%",
        "chi_tiet": [{
            "id": p.id, "ma": p.budget_code,
            "ngan_sach": p.total_budget, "phan_bo": p.allocated_budget,
            "chi_tieu": p.spent_budget, "con_lai": p.remaining_budget,
            "trang_thai": p.budget_status,
        } for p in plans[:20]],
    })


# ────────────────────────────────────────────────────────────────────────────
# REPORT TOOLS
# ────────────────────────────────────────────────────────────────────────────

async def _build_period_stats(db: AsyncSession, from_date: date, to_date: date) -> dict:
    """Aggregate stats for a reporting period."""
    from app.models.task import Task
    from app.models.document import Document
    from app.models.kpi import KPI

    from_dt = datetime.combine(from_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    to_dt = datetime.combine(to_date, datetime.max.time()).replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    # Tasks
    task_rows = (await db.execute(
        select(Task).where(Task.created_at.between(from_dt, to_dt))
    )).scalars().all()
    overdue = (await db.execute(
        select(func.count()).select_from(Task)
        .where(Task.status.notin_(["completed", "cancelled"]),
               Task.due_date.isnot(None), Task.due_date < now)
    )).scalar_one()

    # Documents
    doc_count = (await db.execute(
        select(func.count()).select_from(Document)
        .where(Document.created_at.between(from_dt, to_dt))
    )).scalar_one()

    # KPIs summary
    kpis = (await db.execute(
        select(KPI).where(KPI.year == from_date.year).limit(50)
    )).scalars().all()

    task_done = sum(1 for t in task_rows if t.status == "completed")
    task_inprog = sum(1 for t in task_rows if t.status == "in_progress")
    task_pending = sum(1 for t in task_rows if t.status == "pending")

    return {
        "tu_ngay": str(from_date), "den_ngay": str(to_date),
        "nhiem_vu": {
            "tong": len(task_rows), "hoan_thanh": task_done,
            "dang_thuc_hien": task_inprog, "cho_xu_ly": task_pending, "qua_han": overdue,
        },
        "van_ban_moi": doc_count,
        "chi_tieu_kpi": {
            "tong": len(kpis),
            "dung_tien_do": sum(1 for k in kpis if k.status == "on_track"),
            "co_nguy_co": sum(1 for k in kpis if k.status == "at_risk"),
            "cham": sum(1 for k in kpis if k.status == "behind"),
            "hoan_thanh": sum(1 for k in kpis if k.status == "completed"),
        },
    }


async def generate_weekly_report(db: AsyncSession) -> str:
    """Generate a weekly summary report (current week Mon–Sun)."""
    today = _today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    stats = await _build_period_stats(db, monday, sunday)
    stats["loai_bao_cao"] = "Báo cáo tuần"
    stats["tuan"] = f"{monday} → {sunday}"
    return _trim(stats)


async def generate_monthly_report(db: AsyncSession, month: int | None = None, year: int | None = None) -> str:
    """Generate a monthly summary report."""
    import calendar
    today = _today()
    yr = year or today.year
    mo = month or today.month
    last_day = calendar.monthrange(yr, mo)[1]
    from_date = date(yr, mo, 1)
    to_date = date(yr, mo, last_day)
    stats = await _build_period_stats(db, from_date, to_date)
    stats["loai_bao_cao"] = "Báo cáo tháng"
    stats["thang"] = f"Tháng {mo}/{yr}"
    return _trim(stats)


async def generate_quarterly_report(db: AsyncSession, quarter: int | None = None, year: int | None = None) -> str:
    """Generate a quarterly summary report."""
    today = _today()
    yr = year or today.year
    q = quarter or ((today.month - 1) // 3 + 1)
    first_month = (q - 1) * 3 + 1
    last_month = first_month + 2
    import calendar
    from_date = date(yr, first_month, 1)
    to_date = date(yr, last_month, calendar.monthrange(yr, last_month)[1])
    stats = await _build_period_stats(db, from_date, to_date)
    stats["loai_bao_cao"] = "Báo cáo quý"
    stats["quy"] = f"Quý {q}/{yr}"
    return _trim(stats)


# ────────────────────────────────────────────────────────────────────────────
# DASHBOARD TOOL
# ────────────────────────────────────────────────────────────────────────────

async def get_dashboard_summary(db: AsyncSession) -> str:
    """Return comprehensive IOC dashboard: tasks, docs, KPIs, NQ57, budget."""
    from app.models.task import Task
    from app.models.document import Document
    from app.models.kpi import KPI
    from app.models.nq57 import NQ57Task
    from app.models.strategic import BudgetPlan

    now = datetime.now(timezone.utc)
    yr = now.year

    # Tasks
    task_total = (await db.execute(select(func.count()).select_from(Task))).scalar_one()
    task_done = (await db.execute(
        select(func.count()).select_from(Task).where(Task.status == "completed")
    )).scalar_one()
    task_overdue = (await db.execute(
        select(func.count()).select_from(Task)
        .where(Task.status.notin_(["completed", "cancelled"]),
               Task.due_date.isnot(None), Task.due_date < now)
    )).scalar_one()
    task_upcoming = (await db.execute(
        select(func.count()).select_from(Task)
        .where(Task.status.notin_(["completed", "cancelled"]),
               Task.due_date.isnot(None),
               Task.due_date.between(now, now + timedelta(days=7)))
    )).scalar_one()

    # Documents
    doc_total = (await db.execute(select(func.count()).select_from(Document))).scalar_one()
    doc_pending = (await db.execute(
        select(func.count()).select_from(Document).where(Document.status == "pending")
    )).scalar_one()

    # KPIs
    kpi_total = (await db.execute(
        select(func.count()).select_from(KPI).where(KPI.year == yr)
    )).scalar_one()
    kpi_on_track = (await db.execute(
        select(func.count()).select_from(KPI)
        .where(KPI.year == yr, KPI.status == "on_track")
    )).scalar_one()

    # NQ57
    nq57_total = (await db.execute(select(func.count()).select_from(NQ57Task))).scalar_one()
    nq57_done = (await db.execute(
        select(func.count()).select_from(NQ57Task).where(NQ57Task.status == "completed")
    )).scalar_one()

    # Budget
    plans = (await db.execute(
        select(BudgetPlan).where(BudgetPlan.fiscal_year == yr)
    )).scalars().all()
    budget_total = sum(p.total_budget for p in plans)
    budget_spent = sum(p.spent_budget for p in plans)

    return _trim({
        "thoi_gian": str(now.date()),
        "nhiem_vu": {
            "tong": task_total, "hoan_thanh": task_done,
            "qua_han": task_overdue, "sap_den_han": task_upcoming,
            "ty_le_hoan_thanh": f"{(task_done/task_total*100):.1f}%" if task_total else "0%",
        },
        "van_ban": {"tong": doc_total, "cho_xu_ly": doc_pending},
        "chi_tieu_kpi": {
            "nam": yr, "tong": kpi_total, "dung_tien_do": kpi_on_track,
            "ty_le_dat": f"{(kpi_on_track/kpi_total*100):.1f}%" if kpi_total else "0%",
        },
        "nghi_quyet_57": {
            "tong": nq57_total, "hoan_thanh": nq57_done,
            "ty_le": f"{(nq57_done/nq57_total*100):.1f}%" if nq57_total else "0%",
        },
        "ngan_sach": {
            "nam": yr, "tong": budget_total, "giai_ngan": budget_spent,
            "ty_le_giai_ngan": f"{(budget_spent/budget_total*100):.1f}%" if budget_total else "0%",
        },
    })


# ────────────────────────────────────────────────────────────────────────────
# TOOL REGISTRY — maps Gemini function names → Python callables
# ────────────────────────────────────────────────────────────────────────────

TOOL_REGISTRY: dict[str, Any] = {
    "get_documents": get_documents,
    "search_documents": search_documents,
    "summarize_document": summarize_document,
    "get_tasks": get_tasks,
    "get_overdue_tasks": get_overdue_tasks,
    "get_upcoming_tasks": get_upcoming_tasks,
    "get_nq57_progress": get_nq57_progress,
    "get_targets": get_targets,
    "get_target_progress": get_target_progress,
    "get_budget_summary": get_budget_summary,
    "generate_weekly_report": generate_weekly_report,
    "generate_monthly_report": generate_monthly_report,
    "generate_quarterly_report": generate_quarterly_report,
    "get_dashboard_summary": get_dashboard_summary,
}

# ────────────────────────────────────────────────────────────────────────────
# GEMINI FUNCTION DECLARATIONS (passed to Gemini API)
# ────────────────────────────────────────────────────────────────────────────

GEMINI_TOOL_DECLARATIONS = [
    {
        "name": "get_documents",
        "description": "Lấy danh sách văn bản mới nhất trong hệ thống IOC",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Số lượng văn bản cần lấy (tối đa 30)", "default": 10}
            },
        },
    },
    {
        "name": "search_documents",
        "description": "Tìm kiếm văn bản theo từ khóa trong tiêu đề, số hiệu, nội dung tóm tắt",
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {"type": "string", "description": "Từ khóa cần tìm kiếm"}
            },
            "required": ["keyword"],
        },
    },
    {
        "name": "summarize_document",
        "description": "Lấy toàn bộ thông tin và tóm tắt nội dung của một văn bản cụ thể",
        "parameters": {
            "type": "object",
            "properties": {
                "document_id": {"type": "integer", "description": "ID của văn bản"}
            },
            "required": ["document_id"],
        },
    },
    {
        "name": "get_tasks",
        "description": "Lấy danh sách nhiệm vụ, có thể lọc theo trạng thái",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Trạng thái nhiệm vụ: pending/in_progress/completed/cancelled",
                    "enum": ["pending", "in_progress", "completed", "cancelled"],
                },
                "limit": {"type": "integer", "description": "Số lượng (tối đa 50)", "default": 20},
            },
        },
    },
    {
        "name": "get_overdue_tasks",
        "description": "Lấy tất cả nhiệm vụ quá hạn (đã qua deadline nhưng chưa hoàn thành)",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_upcoming_tasks",
        "description": "Lấy nhiệm vụ sắp đến hạn trong N ngày tới",
        "parameters": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Số ngày tới cần kiểm tra (mặc định 7)", "default": 7}
            },
        },
    },
    {
        "name": "get_nq57_progress",
        "description": "Lấy tiến độ thực hiện Nghị quyết 57 — tổng số, hoàn thành, đang thực hiện, trễ hạn",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_targets",
        "description": "Lấy danh sách chỉ tiêu KPI theo năm",
        "parameters": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Năm cần xem (mặc định năm hiện tại)"}
            },
        },
    },
    {
        "name": "get_target_progress",
        "description": "Lấy lịch sử tiến độ của một chỉ tiêu KPI cụ thể",
        "parameters": {
            "type": "object",
            "properties": {
                "kpi_id": {"type": "integer", "description": "ID của chỉ tiêu KPI"}
            },
            "required": ["kpi_id"],
        },
    },
    {
        "name": "get_budget_summary",
        "description": "Lấy tổng hợp ngân sách: phân bổ, giải ngân, còn lại theo năm tài chính",
        "parameters": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Năm tài chính (mặc định năm hiện tại)"}
            },
        },
    },
    {
        "name": "generate_weekly_report",
        "description": "Tạo báo cáo tổng hợp tuần hiện tại (nhiệm vụ, văn bản, KPI)",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "generate_monthly_report",
        "description": "Tạo báo cáo tổng hợp tháng",
        "parameters": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Tháng (1-12, mặc định tháng hiện tại)"},
                "year": {"type": "integer", "description": "Năm (mặc định năm hiện tại)"},
            },
        },
    },
    {
        "name": "generate_quarterly_report",
        "description": "Tạo báo cáo tổng hợp quý",
        "parameters": {
            "type": "object",
            "properties": {
                "quarter": {"type": "integer", "description": "Quý (1-4, mặc định quý hiện tại)"},
                "year": {"type": "integer", "description": "Năm (mặc định năm hiện tại)"},
            },
        },
    },
    {
        "name": "get_dashboard_summary",
        "description": "Lấy tổng quan toàn bộ hệ thống IOC: nhiệm vụ, văn bản, KPI, NQ57, ngân sách",
        "parameters": {"type": "object", "properties": {}},
    },
]
