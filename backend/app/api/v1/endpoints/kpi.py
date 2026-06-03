from datetime import date, datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin_or_leader
from app.models.department import Department
from app.models.kpi import KPI, KPIHistory, KPIProgress
from app.models.staff import Staff
from app.models.user import User
from app.schemas.kpi import (
    KPICreate,
    KPIHistoryRead,
    KPIProgressCreate,
    KPIProgressRead,
    KPIRead,
    KPIReadDetail,
    KPIStats,
    KPIUpdate,
    PaginatedResponse,
)

router = APIRouter()

VALID_STATUSES = {"on_track", "at_risk", "behind", "completed"}
VALID_PERIODS = {"monthly", "quarterly", "yearly", "five_year"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _calc_progress(current: float, target: float) -> float:
    if target <= 0:
        return 0.0
    return round(min(100.0, current / target * 100), 1)


async def _get_or_404(db: AsyncSession, kpi_id: int) -> KPI:
    k = (await db.execute(
        select(KPI).where(KPI.id == kpi_id, KPI.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not k:
        raise HTTPException(404, "Không tìm thấy KPI")
    return k


async def _full_detail(db: AsyncSession, kpi_id: int) -> KPI:
    stmt = (
        select(KPI)
        .options(
            selectinload(KPI.responsible_department),
            selectinload(KPI.responsible_user),
            selectinload(KPI.responsible_staff),
            selectinload(KPI.creator),
            selectinload(KPI.progress_entries).selectinload(KPIProgress.user),
            selectinload(KPI.history).selectinload(KPIHistory.user),
        )
        .where(KPI.id == kpi_id, KPI.deleted_at.is_(None))
    )
    k = (await db.execute(stmt)).scalar_one_or_none()
    if not k:
        raise HTTPException(404, "Không tìm thấy KPI")
    return k


async def _with_relations(db: AsyncSession, kpi_id: int) -> KPI:
    stmt = (
        select(KPI)
        .options(
            selectinload(KPI.responsible_department),
            selectinload(KPI.responsible_user),
            selectinload(KPI.responsible_staff),
            selectinload(KPI.creator),
        )
        .where(KPI.id == kpi_id, KPI.deleted_at.is_(None))
    )
    return (await db.execute(stmt)).scalar_one()


def _add_history(
    db, kpi_id: int, user_id: int, action: str,
    old_value: float | None = None, new_value: float | None = None,
    old_status: str | None = None, new_status: str | None = None,
    note: str | None = None,
) -> None:
    db.add(KPIHistory(
        kpi_id=kpi_id, user_id=user_id, action=action,
        old_value=old_value, new_value=new_value,
        old_status=old_status, new_status=new_status, note=note,
    ))


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[KPIRead])
async def list_kpis(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    kpi_status: str | None = Query(None, alias="status"),
    category: str | None = Query(None),
    period: str | None = Query(None),
    year: int | None = Query(None),
    responsible_unit: str | None = Query(None),
    overdue_only: bool = Query(False),
    program_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [KPI.deleted_at.is_(None)]

    # ── Role-based visibility: manager/staff only see KPIs of their dept ──────
    if current_user.role not in ("admin", "leader"):
        from app.models.staff import Staff as _Staff
        staff_row = (await db.execute(
            select(_Staff).where(_Staff.user_id == current_user.id)
        )).scalar_one_or_none()
        user_dept_id = staff_row.department_id if staff_row else None
        if user_dept_id:
            conditions.append(or_(
                KPI.responsible_department_id == user_dept_id,
                KPI.responsible_user_id == current_user.id,
                KPI.responsible_staff_id == (staff_row.id if staff_row else -1),
                KPI.created_by == current_user.id,
            ))
        else:
            conditions.append(or_(
                KPI.responsible_user_id == current_user.id,
                KPI.created_by == current_user.id,
            ))
    # ─────────────────────────────────────────────────────────────────────────
    if search:
        conditions.append(or_(
            KPI.title.ilike(f"%{search}%"),
            KPI.code.ilike(f"%{search}%"),
            KPI.responsible_unit.ilike(f"%{search}%"),
        ))
    if kpi_status:
        conditions.append(KPI.status == kpi_status)
    if category:
        conditions.append(KPI.category == category)
    if period:
        conditions.append(KPI.period == period)
    if year:
        conditions.append(KPI.year == year)
    if responsible_unit:
        conditions.append(KPI.responsible_unit.ilike(f"%{responsible_unit}%"))
    if program_id:
        conditions.append(KPI.program_id == program_id)
    if overdue_only:
        now = date.today()
        conditions.append(and_(
            KPI.deadline.isnot(None),
            KPI.deadline < now,
            KPI.status != "completed",
        ))

    base_q = select(KPI).where(*conditions)
    total = (await db.execute(select(func.count()).select_from(base_q.subquery()))).scalar_one()

    stmt = (
        base_q
        .options(
            selectinload(KPI.responsible_department),
            selectinload(KPI.responsible_user),
            selectinload(KPI.responsible_staff),
            selectinload(KPI.creator),
        )
        .order_by(KPI.year.desc(), KPI.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    items = (await db.execute(stmt)).scalars().all()
    return PaginatedResponse(
        items=items, total=total, page=page, size=size,
        pages=max(1, ceil(total / size)),
    )


@router.post("", response_model=KPIRead, status_code=status.HTTP_201_CREATED)
async def create_kpi(
    body: KPICreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # manager: can create KPI but only for their own department
    if current_user.role not in ("admin", "leader"):
        if current_user.role != "manager":
            raise HTTPException(403, "Bạn không có quyền thêm KPI")
        staff_row = (await db.execute(
            select(Staff).where(Staff.user_id == current_user.id)
        )).scalar_one_or_none()
        user_dept_id = staff_row.department_id if staff_row else None
        # If manager didn't specify dept, auto-assign their dept
        if not body.responsible_department_id:
            body = body.model_copy(update={"responsible_department_id": user_dept_id})
        elif body.responsible_department_id != user_dept_id:
            raise HTTPException(403, "Quản lý chỉ được thêm KPI cho đơn vị của mình")

    progress = _calc_progress(body.current_value, body.target_value)
    k = KPI(**body.model_dump(), created_by=current_user.id, progress=progress)
    if progress >= 100:
        k.status = "completed"
    db.add(k)
    await db.flush()  # get k.id before inserting history
    _add_history(db, k.id, current_user.id, "created",
                 new_value=body.current_value, new_status=k.status)
    await db.commit()
    return await _with_relations(db, k.id)


@router.get("/stats", response_model=KPIStats)
async def get_kpi_stats(
    year: int | None = Query(None),
    program_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    where = [KPI.deleted_at.is_(None)]
    if year:
        where.append(KPI.year == year)
    if program_id:
        where.append(KPI.program_id == program_id)

    row = (await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((KPI.status == "on_track",  1), else_=0)).label("on_track"),
            func.sum(case((KPI.status == "at_risk",   1), else_=0)).label("at_risk"),
            func.sum(case((KPI.status == "behind",    1), else_=0)).label("behind"),
            func.sum(case((KPI.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case(
                (and_(
                    KPI.deadline.isnot(None),
                    KPI.deadline < today,
                    KPI.status != "completed",
                ), 1), else_=0,
            )).label("overdue"),
            func.coalesce(func.avg(KPI.progress), 0).label("avg_progress"),
        ).where(*where)
    )).one()

    return KPIStats(
        total=row.total or 0,
        on_track=row.on_track or 0,
        at_risk=row.at_risk or 0,
        behind=row.behind or 0,
        completed=row.completed or 0,
        overdue=row.overdue or 0,
        avg_progress=round(float(row.avg_progress or 0), 1),
    )


@router.get("/chart", response_model=list[dict])
async def get_kpi_chart(
    year: int | None = Query(None),
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conds = [KPI.deleted_at.is_(None)]
    if year:
        conds.append(KPI.year == year)
    if category:
        conds.append(KPI.category == category)
    base = select(KPI).where(*conds)
    rows = (await db.execute(base.order_by(KPI.progress.asc()))).scalars().all()
    return [
        {
            "id": r.id,
            "title": r.title[:40],
            "code": r.code,
            "progress": r.progress,
            "target": r.target_value,
            "current": r.current_value,
            "status": r.status,
            "unit": r.unit,
            "category": r.category,
        }
        for r in rows
    ]


# ─── Single KPI ───────────────────────────────────────────────────────────────

@router.get("/{kpi_id}", response_model=KPIReadDetail)
async def get_kpi(
    kpi_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await _full_detail(db, kpi_id)


@router.put("/{kpi_id}", response_model=KPIRead)
async def update_kpi(
    kpi_id: int,
    body: KPIUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    k = await _get_or_404(db, kpi_id)

    # manager: can only update KPIs of their own department
    if current_user.role not in ("admin", "leader"):
        if current_user.role != "manager":
            raise HTTPException(403, "Bạn không có quyền sửa KPI")
        staff_row = (await db.execute(
            select(Staff).where(Staff.user_id == current_user.id)
        )).scalar_one_or_none()
        user_dept_id = staff_row.department_id if staff_row else None
        if k.responsible_department_id != user_dept_id and k.created_by != current_user.id:
            raise HTTPException(403, "Quản lý chỉ được sửa KPI của đơn vị mình")
    old_value = k.current_value
    old_status = k.status

    data = body.model_dump(exclude_none=True)
    for field, val in data.items():
        setattr(k, field, val)

    # Recalc progress
    k.progress = _calc_progress(k.current_value, k.target_value)
    if k.progress >= 100 and k.status != "completed":
        k.status = "completed"

    _add_history(db, k.id, current_user.id, "updated",
                 old_value=old_value, new_value=k.current_value,
                 old_status=old_status, new_status=k.status)
    await db.commit()
    return await _with_relations(db, k.id)


@router.delete("/{kpi_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kpi(
    kpi_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_leader),
):
    k = await _get_or_404(db, kpi_id)
    k.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ─── Progress entries ─────────────────────────────────────────────────────────

@router.post("/{kpi_id}/progress", response_model=KPIProgressRead,
             status_code=status.HTTP_201_CREATED)
async def record_progress(
    kpi_id: int,
    body: KPIProgressCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    k = await _get_or_404(db, kpi_id)
    old_value = k.current_value
    old_status = k.status

    # Update KPI current value
    k.current_value = body.value
    k.progress = _calc_progress(body.value, k.target_value)
    if k.progress >= 100 and k.status != "completed":
        k.status = "completed"

    entry = KPIProgress(kpi_id=kpi_id, value=body.value,
                        note=body.note, recorded_by=current_user.id)
    db.add(entry)
    _add_history(db, k.id, current_user.id, "progress_recorded",
                 old_value=old_value, new_value=body.value,
                 old_status=old_status, new_status=k.status,
                 note=body.note)
    await db.flush()
    await db.commit()
    stmt = (
        select(KPIProgress)
        .options(selectinload(KPIProgress.user))
        .where(KPIProgress.id == entry.id)
    )
    return (await db.execute(stmt)).scalar_one()


# ── Excel Import ──────────────────────────────────────────────────────────────

@router.get("/import/template")
async def download_kpi_template(_: User = Depends(get_current_user)):
    from app.services.excel_import import kpi_template
    data = kpi_template()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=mau_import_kpi.xlsx"},
    )


@router.post("/import")
async def import_kpi_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.excel_import import parse_kpi
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Chỉ chấp nhận file .xlsx hoặc .xls")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "File không được vượt quá 5 MB")

    records, errors = parse_kpi(data)
    if not records and errors:
        raise HTTPException(422, {"errors": errors})

    # Pre-load departments + staff for name-matching
    from app.models.department import Department
    from app.models.staff import Staff
    dept_rows = (await db.execute(select(Department).where(Department.is_active == True))).scalars().all()
    staff_rows = (await db.execute(select(Staff).where(Staff.is_active == True))).scalars().all()

    def _match_dept(name: str | None):
        if not name:
            return None
        n = name.strip().lower()
        for d in dept_rows:
            if (d.name or "").lower() == n or (d.short_name or "").lower() == n:
                return d.id
        return None

    def _match_staff(name: str | None):
        if not name:
            return None, None
        n = name.strip().lower()
        for s in staff_rows:
            if (s.full_name or "").lower() == n:
                return s.id, s.user_id
        return None, None

    imported = 0
    for r in records:
        deadline = None
        if r.get("deadline_str"):
            try:
                deadline = datetime.strptime(r["deadline_str"], "%d/%m/%Y").date()
            except ValueError:
                pass
        current_val = r["current_value"]
        target_val  = r["target_value"]
        progress    = round(min(100.0, current_val / target_val * 100), 1) if target_val > 0 else 0.0

        # Match department and staff by name from responsible_unit / responsible_person columns
        dept_id = _match_dept(r.get("responsible_unit"))
        staff_id, user_id = _match_staff(r.get("responsible_person"))

        kpi = KPI(
            code=r["code"],
            title=r["title"],
            category=r["category"],
            description=r.get("description"),
            unit=r["unit"],
            target_value=target_val,
            current_value=current_val,
            progress=progress,
            year=r["year"],
            period=r["period"],
            responsible_unit=r.get("responsible_unit"),
            responsible_department_id=dept_id,
            responsible_staff_id=staff_id,
            responsible_user_id=user_id,
            deadline=deadline,
            status="on_track",
            created_by=current_user.id,
        )
        db.add(kpi)
        imported += 1

    await db.commit()
    return {"imported": imported, "errors": errors}
