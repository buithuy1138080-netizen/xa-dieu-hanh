"""Unified KPI view — aggregates all kpis (regular + chien_luoc).

Read-only. Both regular and chien_luoc data live in the kpis table now.
"""
from __future__ import annotations

from datetime import date
from math import ceil
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Float, Integer, cast, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.department import Department
from app.models.kpi import KPI
from app.models.user import User

router = APIRouter()

# ── Status normalization ───────────────────────────────────────────────────────

_STD_STATUS: dict[str, str] = {
    "on_track":  "on_track",
    "at_risk":   "at_risk",
    "behind":    "behind",
    "completed": "completed",
}

_STATUS_DISPLAY: dict[str, str] = {
    "completed":   "Đạt mục tiêu",
    "on_track":    "Đúng tiến độ",
    "at_risk":     "Có rủi ro",
    "behind":      "Chậm tiến độ",
    "overdue":     "Quá hạn",
    "not_started": "Chưa bắt đầu",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class UnifiedKpiItem(BaseModel):
    source: str           # "standard" | "strategic"
    id: int
    code: str | None
    title: str
    category: str | None
    unit: str | None
    progress: float       # 0–100 %
    target: float
    current: float
    status: str           # normalised
    status_display: str   # localised label
    year: int | None
    quarter: int | None
    deadline: date | None
    department_id: int | None
    department_name: str | None


class UnifiedKpiPage(BaseModel):
    items: list[UnifiedKpiItem]
    total: int
    page: int
    size: int
    pages: int


class UnifiedKpiSummary(BaseModel):
    total: int
    standard_total: int
    strategic_total: int
    overall_avg_progress: float
    by_status: dict[str, int]
    by_source: dict[str, dict[str, Any]]


# ── Converters ────────────────────────────────────────────────────────────────

def _from_kpi(k: KPI, source: str) -> UnifiedKpiItem:
    status = _STD_STATUS.get(k.status or "", "not_started")
    dept_name: str | None = None
    dept_id: int | None = None
    if hasattr(k, "responsible_department") and k.responsible_department:
        dept_id = k.responsible_department.id
        dept_name = k.responsible_department.short_name or k.responsible_department.name
    return UnifiedKpiItem(
        source=source,
        id=k.id,
        code=k.code,
        title=k.title,
        category=k.category,
        unit=k.unit,
        progress=round(float(k.progress or 0), 1),
        target=float(k.target_value or 0),
        current=float(k.current_value or 0),
        status=status,
        status_display=_STATUS_DISPLAY.get(status, status),
        year=k.year,
        quarter=k.quarter,
        deadline=k.deadline if hasattr(k, "deadline") else None,
        department_id=dept_id,
        department_name=dept_name,
    )


# ── Subquery builders ─────────────────────────────────────────────────────────

def _kpi_subq(kpi_type: str, source_label: str,
               year: int | None, status: str | None, search: str | None):
    raw_status = {v: k for k, v in _STD_STATUS.items()}.get(status) if status else None
    if status and raw_status is None and status not in _STD_STATUS.values():
        return None

    q = select(
        literal(source_label).label("source"),
        KPI.id.label("id"),
        KPI.code.label("code"),
        KPI.title.label("title"),
        cast(KPI.progress, Float).label("progress"),
        cast(KPI.target_value, Float).label("target"),
        cast(KPI.current_value, Float).label("current_val"),
        KPI.status.label("status_raw"),
        cast(KPI.year, Integer).label("year"),
        cast(KPI.quarter, Integer).label("quarter"),
        KPI.deadline.label("deadline"),
        KPI.responsible_department_id.label("department_id"),
    ).where(KPI.kpi_type == kpi_type, KPI.deleted_at.is_(None))

    if year:
        q = q.where(KPI.year == year)
    if raw_status:
        q = q.where(KPI.status == raw_status)
    if search:
        q = q.where(KPI.title.ilike(f"%{search}%"))
    return q


async def _fetch_by_type(
    db: AsyncSession, kpi_type: str, source: str,
    year: int | None, status: str | None, search: str | None,
) -> list[UnifiedKpiItem]:
    q = select(KPI).options(selectinload(KPI.responsible_department))
    q = q.where(KPI.kpi_type == kpi_type, KPI.deleted_at.is_(None))
    if year:
        q = q.where(KPI.year == year)
    if status:
        raw = {v: k for k, v in _STD_STATUS.items()}.get(status)
        if raw:
            q = q.where(KPI.status == raw)
        elif status not in _STD_STATUS.values():
            return []
    if search:
        q = q.where(KPI.title.ilike(f"%{search}%"))
    rows = (await db.execute(q)).scalars().all()
    return [_from_kpi(r, source) for r in rows]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=UnifiedKpiPage)
async def list_unified_kpi(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    year: int | None = None,
    source: str | None = Query(None, description="standard | strategic"),
    status: str | None = Query(None, description="on_track | at_risk | behind | completed"),
    search: str | None = None,
    sort_by: str = Query("progress", description="progress | title | year"),
    sort_dir: str = Query("asc"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> UnifiedKpiPage:
    parts = []
    if source != "strategic":
        sq = _kpi_subq("regular", "standard", year, status, search)
        if sq is not None:
            parts.append(sq)
    if source != "standard":
        sq = _kpi_subq("chien_luoc", "strategic", year, status, search)
        if sq is not None:
            parts.append(sq)

    if not parts:
        return UnifiedKpiPage(items=[], total=0, page=page, size=size, pages=1)

    combined = union_all(*parts).subquery()
    total: int = (await db.execute(select(func.count()).select_from(combined))).scalar_one()

    if total == 0:
        return UnifiedKpiPage(items=[], total=0, page=page, size=size, pages=1)

    if sort_by == "title":
        order_col = combined.c.title
    elif sort_by == "year":
        order_col = combined.c.year
    else:
        order_col = combined.c.progress
    order_expr = order_col.desc() if sort_dir == "desc" else order_col.asc()

    rows = (await db.execute(
        select(combined).order_by(order_expr).offset((page - 1) * size).limit(size)
    )).mappings().all()

    dept_ids = {r["department_id"] for r in rows if r["department_id"]}
    dept_map: dict[int, str] = {}
    if dept_ids:
        dept_rows = (await db.execute(
            select(Department.id, Department.name, Department.short_name)
            .where(Department.id.in_(dept_ids))
        )).all()
        dept_map = {r.id: (r.short_name or r.name) for r in dept_rows}

    items: list[UnifiedKpiItem] = []
    for r in rows:
        norm_status = _STD_STATUS.get(r["status_raw"] or "", "not_started")
        dept_id = r["department_id"]
        items.append(UnifiedKpiItem(
            source=r["source"],
            id=r["id"],
            code=r["code"],
            title=r["title"],
            category=None,
            unit=None,
            progress=round(float(r["progress"] or 0), 1),
            target=float(r["target"] or 0),
            current=float(r["current_val"] or 0),
            status=norm_status,
            status_display=_STATUS_DISPLAY.get(norm_status, norm_status),
            year=r["year"],
            quarter=r["quarter"],
            deadline=r["deadline"],
            department_id=dept_id,
            department_name=dept_map.get(dept_id) if dept_id else None,
        ))

    return UnifiedKpiPage(
        items=items, total=total, page=page, size=size,
        pages=ceil(total / size) if total else 1,
    )


@router.get("/summary", response_model=UnifiedKpiSummary)
async def unified_kpi_summary(
    year: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> UnifiedKpiSummary:
    std_items = await _fetch_by_type(db, "regular",     "standard",  year, None, None)
    cl_items  = await _fetch_by_type(db, "chien_luoc",  "strategic", year, None, None)
    all_items = std_items + cl_items
    total = len(all_items)

    by_status: dict[str, int] = {}
    for item in all_items:
        by_status[item.status] = by_status.get(item.status, 0) + 1

    avg = round(sum(i.progress for i in all_items) / total, 1) if total else 0.0

    def _src_summary(items: list[UnifiedKpiItem]) -> dict[str, Any]:
        n = len(items)
        return {
            "total": n,
            "avg_progress": round(sum(i.progress for i in items) / n, 1) if n else 0.0,
            "by_status": {
                s: sum(1 for i in items if i.status == s)
                for s in ("completed", "on_track", "at_risk", "behind")
                if any(i.status == s for i in items)
            },
        }

    return UnifiedKpiSummary(
        total=total,
        standard_total=len(std_items),
        strategic_total=len(cl_items),
        overall_avg_progress=avg,
        by_status=by_status,
        by_source={
            "standard":  _src_summary(std_items),
            "strategic": _src_summary(cl_items),
        },
    )
