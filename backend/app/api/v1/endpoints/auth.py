"""Auth endpoints — login + me.

Login accepts:
  - email  (staff.email)   → primary path, for UI users
  - username (users.username) → legacy/fallback for existing integrations
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.models.staff import Staff
from app.models.user import User
from app.schemas.user import Token, UserRead
from app.core.limiter import limiter

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """
    Login by email (staff.email) OR username (users.username).
    Primary path: email → staff.password_hash.
    Fallback: username → users.hashed_password (legacy).
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
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa")
        if staff.user_id:
            return Token(
                access_token=create_access_token(subject=staff.user_id),
                refresh_token=create_refresh_token(subject=staff.user_id),
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Tài khoản chưa được liên kết. Liên hệ admin.")

    # ── Path B: legacy login by username ─────────────────────────────────────
    user_result = await db.execute(
        select(User).where(User.username == login_input)
    )
    user = user_result.scalar_one_or_none()

    if user and verify_password(form_data.password, user.hashed_password):
        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị khóa")
        return Token(
            access_token=create_access_token(subject=user.id),
            refresh_token=create_refresh_token(subject=user.id),
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sai thông tin đăng nhập",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.get("/me", response_model=UserRead)
async def get_me(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Return current user info, enriched with staff_id + department_id."""
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token không hợp lệ",
                            headers={"WWW-Authenticate": "Bearer"})

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")

    # Enrich with staff context
    staff = (await db.execute(
        select(Staff).where(Staff.user_id == user_id)
    )).scalar_one_or_none()

    # Build response manually to include staff fields
    data = UserRead.model_validate(user)
    if staff:
        data.staff_id      = staff.id
        data.department_id = staff.department_id
        data.role          = staff.role or user.role
    return data


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=Token)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Issue a new access token using a valid refresh token."""
    try:
        payload = decode_token(body.refresh_token)
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

    return Token(
        access_token=create_access_token(subject=user_id),
        refresh_token=create_refresh_token(subject=user_id),
    )
