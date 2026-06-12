from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
) -> User:
    """Extract JWT from HttpOnly cookie first, fall back to Authorization header."""
    token = access_token
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa đăng nhập",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Người dùng không hợp lệ")
    return user


# ── Role-based permission helpers ─────────────────────────────────────────────

def require_role(*allowed_roles: str):
    """Return a FastAPI dependency that enforces role membership."""
    async def _dep(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Chỉ {'/'.join(allowed_roles)} mới có thể thực hiện thao tác này",
            )
        return current_user
    return _dep


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ Admin mới có quyền này")
    return current_user


def require_admin_or_leader(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ Admin/Lãnh đạo mới có quyền này")
    return current_user


def require_manager_or_above(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "leader", "manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ Admin/Lãnh đạo/Quản lý mới có quyền này")
    return current_user
