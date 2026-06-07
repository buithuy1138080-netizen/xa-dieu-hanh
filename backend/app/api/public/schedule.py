"""Public schedule endpoint — no authentication required."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.schedule import ScheduleItem
from app.models.staff import Staff

router = APIRouter()

# Thứ tự hiển thị cố định
_SCHEDULE_LEADER_NAMES = [
    "Nguyễn Duy Hòa",
    "Bùi Thị Lý",
    "Bùi Minh Hải",
    "Nguyễn Tài Nghệ",
    "Phạm Thị Non",
]
_ORDER = {n: i for i, n in enumerate(_SCHEDULE_LEADER_NAMES)}


class _LeaderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    position: str | None = None


class _ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    location: str | None = None
    session: str
    start_time: str | None = None   # "HH:MM" hoặc None


@router.get("/schedule/week")
async def public_week_view(
    week_start: date = Query(..., description="Ngày đầu tuần (Thứ 2), YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """Lịch công tác tuần — không yêu cầu đăng nhập."""
    week_end = week_start + timedelta(days=6)
    days = [week_start + timedelta(days=i) for i in range(7)]

    # Lấy lịch trong tuần
    items = (await db.execute(
        select(ScheduleItem)
        .options(selectinload(ScheduleItem.leader))
        .where(
            ScheduleItem.deleted_at.is_(None),
            ScheduleItem.work_date >= week_start,
            ScheduleItem.work_date <= week_end,
        )
        .order_by(ScheduleItem.work_date, ScheduleItem.start_time.asc().nulls_last())
    )).scalars().all()

    # Lấy lãnh đạo
    leaders_raw = (await db.execute(
        select(Staff).where(
            Staff.is_active == True,
            Staff.full_name.in_(_SCHEDULE_LEADER_NAMES),
        )
    )).scalars().all()

    # Sort theo thứ tự tùy chỉnh, chỉ hiện leader có lịch
    leader_ids_with_items = {i.leader_id for i in items}
    leaders = sorted(
        [l for l in leaders_raw if l.id in leader_ids_with_items],
        key=lambda s: _ORDER.get(s.full_name, 999),
    )

    result = []
    for leader in leaders:
        by_day: dict[str, list] = {}
        for d in days:
            by_day[d.isoformat()] = [
                {
                    "id": it.id,
                    "title": it.title,
                    "location": it.location,
                    "session": it.session,
                    "start_time": it.start_time.strftime("%H:%M") if it.start_time else None,
                }
                for it in items
                if it.leader_id == leader.id and it.work_date == d
            ]
        result.append({
            "leader": {"id": leader.id, "full_name": leader.full_name, "position": leader.position},
            "days": by_day,
        })

    return {
        "week_start": week_start.isoformat(),
        "week_end":   week_end.isoformat(),
        "days":       [d.isoformat() for d in days],
        "leaders":    result,
    }
