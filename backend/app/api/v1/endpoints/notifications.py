from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationRead, UnreadCount
from app.schemas.task import PaginatedResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[NotificationRead])
async def list_notifications(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Notification.user_id == current_user.id]
    if unread_only:
        conditions.append(Notification.is_read.is_(False))

    total = (
        await db.execute(select(func.count(Notification.id)).where(*conditions))
    ).scalar_one()

    stmt = (
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    items = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse(
        items=list(items),
        total=total,
        page=page,
        size=size,
        pages=max(1, ceil(total / size)),
    )


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.user_id == current_user.id,
                Notification.is_read.is_(False),
            )
        )
    ).scalar_one()
    return UnreadCount(count=count)


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()


@router.patch("/{notif_id}/read", response_model=NotificationRead)
async def mark_read(
    notif_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.user_id == current_user.id,
        )
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")
    n.is_read = True
    await db.commit()
    await db.refresh(n)
    return n
