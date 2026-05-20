from datetime import date
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.department import Department
from app.models.kpi import KPI
from app.models.nq57 import NQ57Progress, NQ57Task
from app.models.staff import Staff
from app.models.user import User
from app.schemas.kpi import (
    NQ57ProgressCreate,
    NQ57ProgressRead,
    NQ57Stats,
    NQ57TaskCreate,
    NQ57TaskRead,
    NQ57TaskReadDetail,
    NQ57TaskUpdate,
    PaginatedResponse,
)

router = APIRouter()

VALID_STATUSES = {"pending", "in_progress", "completed", "delayed"}
NQ57_GROUPS = [
    "Hạ tầng số",
    "Chính phủ số",
    "Kinh tế số",
    "Xã hội số",
    "An toàn thông tin",
    "Đổi mới sáng tạo",
    "Nhân lực số",
    "Khác",
]


async def _get_or_404(db: AsyncSession, task_id: int) -> NQ57Task:
    t = (await db.execute(select(NQ57Task).where(NQ57Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Không tìm thấy nhiệm vụ NQ57")
    return t


async def _full_detail(db: AsyncSession, task_id: int) -> NQ57Task:
    stmt = (
        select(NQ57Task)
        .options(
            selectinload(NQ57Task.responsible_department),
            selectinload(NQ57Task.responsible_user),
            selectinload(NQ57Task.responsible_staff),
            selectinload(NQ57Task.creator),
            selectinload(NQ57Task.kpi),
            selectinload(NQ57Task.progress_entries).selectinload(NQ57Progress.user),
        )
        .where(NQ57Task.id == task_id)
    )
    t = (await db.execute(stmt)).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Không tìm thấy nhiệm vụ NQ57")
    return t


async def _with_relations(db: AsyncSession, task_id: int) -> NQ57Task:
    stmt = (
        select(NQ57Task)
        .options(
            selectinload(NQ57Task.responsible_department),
            selectinload(NQ57Task.responsible_user),
            selectinload(NQ57Task.responsible_staff),
            selectinload(NQ57Task.creator),
            selectinload(NQ57Task.kpi),
        )
        .where(NQ57Task.id == task_id)
    )
    return (await db.execute(stmt)).scalar_one()


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[NQ57TaskRead])
async def list_nq57(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    nq57_status: str | None = Query(None, alias="status"),
    group: str | None = Query(None),
    overdue_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conditions = []
    if search:
        conditions.append(or_(
            NQ57Task.title.ilike(f"%{search}%"),
            NQ57Task.code.ilike(f"%{search}%"),
            NQ57Task.responsible_unit.ilike(f"%{search}%"),
        ))
    if nq57_status:
        conditions.append(NQ57Task.status == nq57_status)
    if group:
        conditions.append(NQ57Task.group == group)
    if overdue_only:
        now = date.today()
        conditions.append(and_(
            NQ57Task.deadline.isnot(None),
            NQ57Task.deadline < now,
            NQ57Task.status != "completed",
        ))

    base_q = select(NQ57Task).where(*conditions) if conditions else select(NQ57Task)
    total = (await db.execute(select(func.count()).select_from(base_q.subquery()))).scalar_one()

    stmt = (
        base_q
        .options(
            selectinload(NQ57Task.responsible_department),
            selectinload(NQ57Task.responsible_user),
            selectinload(NQ57Task.creator),
            selectinload(NQ57Task.kpi),
        )
        .order_by(NQ57Task.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    items = (await db.execute(stmt)).scalars().all()
    return PaginatedResponse(
        items=items, total=total, page=page, size=size,
        pages=max(1, ceil(total / size)),
    )


@router.post("", response_model=NQ57TaskRead, status_code=status.HTTP_201_CREATED)
async def create_nq57(
    body: NQ57TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.kpi_id:
        kpi = (await db.execute(select(KPI).where(KPI.id == body.kpi_id))).scalar_one_or_none()
        if not kpi:
            raise HTTPException(400, "KPI không tồn tại")
    t = NQ57Task(**body.model_dump(), created_by=current_user.id)
    db.add(t)
    await db.commit()
    return await _with_relations(db, t.id)


@router.get("/stats", response_model=NQ57Stats)
async def get_nq57_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    row = (await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((NQ57Task.status == "pending",     1), else_=0)).label("pending"),
            func.sum(case((NQ57Task.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((NQ57Task.status == "completed",   1), else_=0)).label("completed"),
            func.sum(case(
                (and_(
                    NQ57Task.status != "completed",
                    NQ57Task.deadline.isnot(None),
                    NQ57Task.deadline < today,
                ), 1),
                else_=0,
            )).label("delayed"),
            func.avg(NQ57Task.progress).label("avg_progress"),
        )
    )).one()
    return NQ57Stats(
        total=row.total or 0,
        pending=row.pending or 0,
        in_progress=row.in_progress or 0,
        completed=row.completed or 0,
        delayed=row.delayed or 0,
        avg_progress=round(float(row.avg_progress or 0), 1),
    )


@router.get("/groups", response_model=list[str])
async def get_groups(_: User = Depends(get_current_user)):
    return NQ57_GROUPS


# ─── Single task ──────────────────────────────────────────────────────────────

@router.get("/{task_id}", response_model=NQ57TaskReadDetail)
async def get_nq57(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await _full_detail(db, task_id)


@router.put("/{task_id}", response_model=NQ57TaskRead)
async def update_nq57(
    task_id: int,
    body: NQ57TaskUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = await _get_or_404(db, task_id)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(t, field, val)
    await db.commit()
    return await _with_relations(db, t.id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nq57(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = await _get_or_404(db, task_id)
    await db.delete(t)
    await db.commit()


# ─── Progress ─────────────────────────────────────────────────────────────────

@router.post("/{task_id}/progress", response_model=NQ57ProgressRead,
             status_code=status.HTTP_201_CREATED)
async def record_progress(
    task_id: int,
    body: NQ57ProgressCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_or_404(db, task_id)
    prog = max(0, min(100, body.progress))
    t.progress = prog
    if prog >= 100 and t.status != "completed":
        t.status = "completed"
    elif prog > 0 and t.status == "pending":
        t.status = "in_progress"

    entry = NQ57Progress(task_id=task_id, progress=prog,
                         note=body.note, user_id=current_user.id)
    db.add(entry)
    await db.flush()
    await db.commit()
    stmt = (
        select(NQ57Progress)
        .options(selectinload(NQ57Progress.user))
        .where(NQ57Progress.id == entry.id)
    )
    return (await db.execute(stmt)).scalar_one()
