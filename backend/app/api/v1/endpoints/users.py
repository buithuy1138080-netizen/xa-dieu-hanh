from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_manager_or_above
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.user import UserPublic, UserRead
from app.services.audit import write_audit

router = APIRouter()

VALID_ROLES = {"admin", "leader", "manager", "staff"}


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


@router.get("/names", response_model=list[UserPublic])
async def list_user_names(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Minimal user list for dropdowns/assignee selects. Accessible to all roles."""
    result = await db.execute(
        select(User).where(User.is_active.is_(True)).order_by(User.full_name)
    )
    return result.scalars().all()


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager_or_above),
):
    """Full user list with roles/email. Manager+ only."""
    result = await db.execute(select(User).order_by(User.full_name))
    return result.scalars().all()


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(403, "Chỉ admin mới có thể thay đổi quyền người dùng")
    if body.role and body.role not in VALID_ROLES:
        raise HTTPException(422, f"Vai trò không hợp lệ. Các giá trị hợp lệ: {VALID_ROLES}")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Không tìm thấy người dùng")

    changes: dict = {}
    if body.full_name is not None:
        changes["full_name"] = {"from": user.full_name, "to": body.full_name}
        user.full_name = body.full_name
    if body.role is not None:
        changes["role"] = {"from": user.role, "to": body.role}
        user.role = body.role
    if body.is_active is not None:
        changes["is_active"] = {"from": user.is_active, "to": body.is_active}
        user.is_active = body.is_active

    if changes:
        await write_audit(
            db,
            action="user_update",
            user_id=current_user.id,
            username=current_user.username,
            resource_type="user",
            resource_id=user.id,
            resource_name=user.username,
            details={"changes": changes},
            request=request,
        )

    await db.commit()
    await db.refresh(user)
    return user


@router.get("/audit-logs", response_model=list[dict])
async def list_audit_logs(
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    user_id: int | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Xem audit log hệ thống. Chỉ admin."""
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    if action:
        q = q.where(AuditLog.action == action)
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "username": r.username,
            "action": r.action,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "resource_name": r.resource_name,
            "details": r.details,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if isinstance(r.created_at, datetime) else r.created_at,
        }
        for r in rows
    ]
