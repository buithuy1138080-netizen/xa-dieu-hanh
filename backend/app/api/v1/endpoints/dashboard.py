from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.types import Date

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import Task
from app.models.user import User

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total: int
    pending: int
    in_progress: int
    completed: int
    cancelled: int
    overdue: int
    completion_rate: float


class TimelinePoint(BaseModel):
    date: str
    created: int
    completed: int


class OverdueTaskOut(BaseModel):
    id: int
    title: str
    task_code: str | None = None
    due_date: str
    days_overdue: int
    priority: str
    assignee_name: str | None


class UpcomingTaskOut(BaseModel):
    id: int
    title: str
    task_code: str | None = None
    due_date: str
    days_left: int
    priority: str
    assignee_name: str | None


class UnitPerformanceOut(BaseModel):
    name: str
    total: int
    done: int
    overdue: int
    completion_rate: float


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = _now()
    row = (await db.execute(
        select(
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == "pending", 1), else_=0)).label("pending"),
            func.sum(case((Task.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((Task.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((Task.status == "cancelled", 1), else_=0)).label("cancelled"),
            func.sum(case(
                (and_(Task.due_date.isnot(None), Task.due_date < now,
                      Task.status.notin_(["completed", "cancelled"]),
                      Task.deleted_at.is_(None)), 1),
                else_=0,
            )).label("overdue"),
        ).where(Task.deleted_at.is_(None))
    )).one()

    total = int(row.total or 0)
    completed = int(row.completed or 0)
    return DashboardStats(
        total=total,
        pending=int(row.pending or 0),
        in_progress=int(row.in_progress or 0),
        completed=completed,
        cancelled=int(row.cancelled or 0),
        overdue=int(row.overdue or 0),
        completion_rate=round(completed / total * 100, 1) if total > 0 else 0.0,
    )


@router.get("/chart/timeline", response_model=list[TimelinePoint])
async def chart_timeline(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = _now()
    since = now - timedelta(days=days)

    created_rows = (await db.execute(
        select(cast(Task.created_at, Date).label("day"), func.count().label("cnt"))
        .where(Task.created_at >= since, Task.deleted_at.is_(None))
        .group_by(cast(Task.created_at, Date))
    )).all()
    created_map = {str(r.day): int(r.cnt) for r in created_rows}

    completed_rows = (await db.execute(
        select(cast(Task.completed_at, Date).label("day"), func.count().label("cnt"))
        .where(
            Task.status == "completed",
            Task.completed_at.isnot(None),
            Task.completed_at >= since,
            Task.deleted_at.is_(None),
        )
        .group_by(cast(Task.completed_at, Date))
    )).all()
    completed_map = {str(r.day): int(r.cnt) for r in completed_rows}

    result = []
    for i in range(days):
        d = (since + timedelta(days=i + 1)).date()
        result.append(TimelinePoint(
            date=d.strftime("%d/%m"),
            created=created_map.get(str(d), 0),
            completed=completed_map.get(str(d), 0),
        ))
    return result


@router.get("/overdue", response_model=list[OverdueTaskOut])
async def get_overdue(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = _now()
    tasks = (await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(
            Task.due_date.isnot(None),
            Task.due_date < now,
            Task.status.notin_(["completed", "cancelled"]),
            Task.deleted_at.is_(None),
        )
        .order_by(Task.due_date.asc())
        .limit(limit)
    )).scalars().all()

    result = []
    for t in tasks:
        dl = _aware(t.due_date)
        result.append(OverdueTaskOut(
            id=t.id,
            title=t.title,
            task_code=t.task_code,
            due_date=t.due_date.strftime("%d/%m/%Y"),
            days_overdue=max(0, (now - dl).days),
            priority=t.priority,
            assignee_name=(t.assignee.full_name or t.assignee.username) if t.assignee else None,
        ))
    return result


@router.get("/upcoming", response_model=list[UpcomingTaskOut])
async def get_upcoming(
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = _now()
    until = now + timedelta(days=days)
    tasks = (await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(
            Task.due_date.isnot(None),
            Task.due_date >= now,
            Task.due_date <= until,
            Task.status.notin_(["completed", "cancelled"]),
            Task.deleted_at.is_(None),
        )
        .order_by(Task.due_date.asc())
        .limit(10)
    )).scalars().all()

    result = []
    for t in tasks:
        dl = _aware(t.due_date)
        result.append(UpcomingTaskOut(
            id=t.id,
            title=t.title,
            task_code=t.task_code,
            due_date=t.due_date.strftime("%d/%m/%Y"),
            days_left=max(0, (dl - now).days),
            priority=t.priority,
            assignee_name=(t.assignee.full_name or t.assignee.username) if t.assignee else None,
        ))
    return result


@router.get("/unit-performance", response_model=list[UnitPerformanceOut])
async def get_unit_performance(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = _now()
    rows = (await db.execute(
        select(
            User.id,
            User.full_name,
            User.username,
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == "completed", 1), else_=0)).label("done"),
            func.sum(case(
                (and_(Task.due_date.isnot(None), Task.due_date < now,
                      Task.status.notin_(["completed", "cancelled"])), 1),
                else_=0,
            )).label("overdue"),
        )
        .join(Task, Task.assignee_id == User.id)
        .where(User.is_active.is_(True), Task.deleted_at.is_(None))
        .group_by(User.id, User.full_name, User.username)
        .order_by(func.count(Task.id).desc())
    )).all()

    result = []
    for r in rows:
        total = int(r.total or 0)
        done = int(r.done or 0)
        result.append(UnitPerformanceOut(
            name=r.full_name or r.username,
            total=total,
            done=done,
            overdue=int(r.overdue or 0),
            completion_rate=round(done / total * 100, 1) if total > 0 else 0.0,
        ))
    return result


# ─── Directive Stats ──────────────────────────────────────────────────────────

class DirectiveStatsOut(BaseModel):
    total: int
    active: int
    completed: int
    overdue: int
    near_deadline: int
    avg_progress: float


@router.get("/directive-stats", response_model=DirectiveStatsOut)
async def get_directive_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models.directive import Directive
    now = _now()
    soon = now + timedelta(days=7)

    row = (await db.execute(
        select(
            func.count(Directive.id).label("total"),
            func.sum(case((Directive.status == "active", 1), else_=0)).label("active"),
            func.sum(case((Directive.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case(
                (and_(Directive.deadline.isnot(None), Directive.deadline < now,
                      Directive.status == "active"), 1), else_=0,
            )).label("overdue"),
            func.sum(case(
                (and_(Directive.deadline.isnot(None), Directive.deadline >= now,
                      Directive.deadline <= soon, Directive.status == "active"), 1), else_=0,
            )).label("near_deadline"),
            func.avg(Directive.progress).label("avg_progress"),
        ).where(Directive.deleted_at.is_(None))
    )).one()

    return DirectiveStatsOut(
        total=int(row.total or 0),
        active=int(row.active or 0),
        completed=int(row.completed or 0),
        overdue=int(row.overdue or 0),
        near_deadline=int(row.near_deadline or 0),
        avg_progress=round(float(row.avg_progress or 0), 1),
    )


# ─── KPI + NQ57 Stats ────────────────────────────────────────────────────────

class KPIStatsOut(BaseModel):
    total: int
    on_track: int
    at_risk: int
    behind: int
    completed: int
    avg_progress: float
    overdue: int


class NQ57StatsOut(BaseModel):
    total: int
    pending: int
    in_progress: int
    completed: int
    delayed: int
    avg_progress: float


@router.get("/kpi-stats", response_model=KPIStatsOut)
async def get_kpi_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models.kpi import KPI
    from datetime import date as dt_date
    now = dt_date.today()

    row = (await db.execute(
        select(
            func.count(KPI.id).label("total"),
            func.sum(case((KPI.status == "on_track", 1), else_=0)).label("on_track"),
            func.sum(case((KPI.status == "at_risk", 1), else_=0)).label("at_risk"),
            func.sum(case((KPI.status == "behind", 1), else_=0)).label("behind"),
            func.sum(case((KPI.status == "completed", 1), else_=0)).label("completed"),
            func.avg(KPI.progress).label("avg_progress"),
            func.sum(case(
                (and_(KPI.deadline.isnot(None), KPI.deadline < now, KPI.status != "completed"), 1),
                else_=0,
            )).label("overdue"),
        )
    )).one()

    return KPIStatsOut(
        total=int(row.total or 0),
        on_track=int(row.on_track or 0),
        at_risk=int(row.at_risk or 0),
        behind=int(row.behind or 0),
        completed=int(row.completed or 0),
        avg_progress=round(float(row.avg_progress or 0), 1),
        overdue=int(row.overdue or 0),
    )


@router.get("/nq57-stats", response_model=NQ57StatsOut)
async def get_nq57_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models.nq57 import NQ57Task
    from datetime import date as dt_date
    now = dt_date.today()

    row = (await db.execute(
        select(
            func.count(NQ57Task.id).label("total"),
            func.sum(case((NQ57Task.status == "pending", 1), else_=0)).label("pending"),
            func.sum(case((NQ57Task.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((NQ57Task.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case(
                (and_(
                    NQ57Task.status != "completed",
                    NQ57Task.deadline.isnot(None),
                    NQ57Task.deadline < now,
                ), 1),
                else_=0,
            )).label("delayed"),
            func.avg(NQ57Task.progress).label("avg_progress"),
        )
    )).one()

    return NQ57StatsOut(
        total=int(row.total or 0),
        pending=int(row.pending or 0),
        in_progress=int(row.in_progress or 0),
        completed=int(row.completed or 0),
        delayed=int(row.delayed or 0),
        avg_progress=round(float(row.avg_progress or 0), 1),
    )
