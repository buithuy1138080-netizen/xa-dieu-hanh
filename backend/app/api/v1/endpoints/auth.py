"""Auth endpoints — login + me + refresh + logout.

Login accepts:
  - email  (staff.email)   → primary path, for UI users
  - username (users.username) → legacy/fallback for existing integrations
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.staff import Staff
from app.models.user import User
from app.schemas.user import Token, UserRead
from app.core.limiter import limiter
from app.services.audit import write_audit

router = APIRouter()

# ── Cookie helpers ────────────────────────────────────────────────────────────

_ACCESS_COOKIE_MAX_AGE  = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
_REFRESH_COOKIE_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60
_SECURE = settings.ENVIRONMENT == "production"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Write HttpOnly cookies for both tokens."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_SECURE,
        samesite="lax",
        max_age=_ACCESS_COOKIE_MAX_AGE,
        path="/api",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_SECURE,
        samesite="strict",
        max_age=_REFRESH_COOKIE_MAX_AGE,
        path="/api/v1/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token",  path="/api")
    response.delete_cookie("refresh_token", path="/api/v1/auth/refresh")


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Login by email (staff.email) OR username (users.username).
    Sets HttpOnly cookies AND returns tokens in body for backward compatibility.
    """
    login_input = form_data.username.strip()

    # ── Path A: staff login by email ──────────────────────────────────────────
    staff_result = await db.execute(
        select(Staff)
        .options(selectinload(Staff.user))
        .where(Staff.email == login_input)
    )
    staff = staff_result.scalar_one_or_none()

    if staff and staff.password_hash and verify_password(form_data.password, staff.password_hash):
        if not staff.is_active:
            await write_audit(db, "login_blocked", username=login_input, resource_type="auth", details={"reason": "account_locked"}, request=request)
            await db.commit()
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa")
        # Auto-create linked User if missing (handles legacy staff records)
        if not staff.user_id:
            email = staff.email or f"staff_{staff.id}@system.local"
            username = (email.split("@")[0] + str(staff.id))[:50]
            existing = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
            if existing:
                username = f"{username}_{staff.id}"
            user = User(username=username, email=email,
                        hashed_password=staff.password_hash,
                        full_name=staff.full_name, role=staff.role, is_active=staff.is_active)
            db.add(user)
            await db.flush()
            staff.user_id = user.id
            await db.commit()
        await write_audit(db, "login", user_id=staff.user_id, username=login_input, resource_type="auth", request=request)
        await db.commit()
        access_token  = create_access_token(subject=staff.user_id)
        refresh_token = create_refresh_token(subject=staff.user_id)
        _set_auth_cookies(response, access_token, refresh_token)
        return Token(access_token=access_token, refresh_token=refresh_token)

    # ── Path B: legacy login by username ─────────────────────────────────────
    user_result = await db.execute(
        select(User).where(User.username == login_input)
    )
    user = user_result.scalar_one_or_none()

    if user and verify_password(form_data.password, user.hashed_password):
        if not user.is_active:
            await write_audit(db, "login_blocked", user_id=user.id, username=login_input, resource_type="auth", details={"reason": "account_locked"}, request=request)
            await db.commit()
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa")
        await write_audit(db, "login", user_id=user.id, username=login_input, resource_type="auth", request=request)
        await db.commit()
        access_token  = create_access_token(subject=user.id)
        refresh_token = create_refresh_token(subject=user.id)
        _set_auth_cookies(response, access_token, refresh_token)
        return Token(access_token=access_token, refresh_token=refresh_token)

    await write_audit(db, "login_failed", username=login_input, resource_type="auth", details={"reason": "wrong_credentials"}, request=request)
    await db.commit()
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sai thông tin đăng nhập",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserRead)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return current user info, enriched with staff_id + department_id."""
    staff = (await db.execute(
        select(Staff).where(Staff.user_id == current_user.id)
    )).scalar_one_or_none()

    data = UserRead.model_validate(current_user)
    if staff:
        data.staff_id      = staff.id
        data.department_id = staff.department_id
        data.role          = staff.role or current_user.role
    return data


# ── Change password ───────────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password", status_code=200)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Người dùng đổi mật khẩu (yêu cầu nhập mật khẩu cũ)."""
    if len(body.new_password) < 8:
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất 8 ký tự")

    # Xác minh mật khẩu cũ — ưu tiên Staff.password_hash (giao diện login dùng)
    staff_row = (await db.execute(
        select(Staff).where(Staff.user_id == current_user.id)
    )).scalar_one_or_none()

    if staff_row and staff_row.password_hash:
        if not verify_password(body.old_password, staff_row.password_hash):
            raise HTTPException(400, "Mật khẩu cũ không đúng")
        new_hash = hash_password(body.new_password)
        staff_row.password_hash = new_hash
        current_user.hashed_password = new_hash
    else:
        if not current_user.hashed_password:
            raise HTTPException(400, "Tài khoản chưa có mật khẩu, vui lòng liên hệ quản trị viên")
        if not verify_password(body.old_password, current_user.hashed_password):
            raise HTTPException(400, "Mật khẩu cũ không đúng")
        new_hash = hash_password(body.new_password)
        current_user.hashed_password = new_hash
        if staff_row:
            staff_row.password_hash = new_hash

    await db.commit()
    return {"message": "Đổi mật khẩu thành công"}


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=Token)
@limiter.limit("5/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_cookie: Optional[str] = None,
):
    """Issue new tokens.  Reads refresh_token from:
    1. HttpOnly cookie 'refresh_token'  (preferred)
    2. JSON body { refresh_token: "..." }  (legacy / API clients)
    Sets new HttpOnly cookies AND returns tokens in body.
    """
    # 1. Try cookie
    refresh_cookie = request.cookies.get("refresh_token")

    # 2. Fall back to body
    token = refresh_cookie
    if not token:
        try:
            body_data = await request.json()
            token = body_data.get("refresh_token") if isinstance(body_data, dict) else None
        except Exception:
            pass

    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token không hợp lệ")

    try:
        payload = decode_token(token)
        if payload.get("typ") != "refresh":
            raise ValueError("not a refresh token")
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token không hợp lệ")

    user = (await db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại hoặc đã bị khóa")

    new_access  = create_access_token(subject=user_id)
    new_refresh = create_refresh_token(subject=user_id)
    _set_auth_cookies(response, new_access, new_refresh)
    return Token(access_token=new_access, refresh_token=new_refresh)


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=200)
async def logout(response: Response):
    """Clear auth cookies."""
    _clear_auth_cookies(response)
    return {"message": "Đăng xuất thành công"}
