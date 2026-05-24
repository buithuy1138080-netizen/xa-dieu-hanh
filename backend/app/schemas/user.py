from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str | None = None
    role: str = "staff"


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int
    email: str  # override: DB may store synthetic emails that don't pass strict validation
    is_active: bool
    created_at: datetime
    # Staff context — populated by /auth/me when a linked staff record exists
    staff_id: int | None = None
    department_id: int | None = None

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
