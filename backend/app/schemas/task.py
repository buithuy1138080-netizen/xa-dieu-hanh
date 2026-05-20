from __future__ import annotations

from datetime import datetime
from math import ceil
from typing import Generic, TypeVar

from pydantic import BaseModel

from app.schemas.user import UserRead

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    deadline: datetime | None = None
    assignee_id: int | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    deadline: datetime | None = None
    assignee_id: int | None = None


class TaskStatusUpdate(BaseModel):
    status: str


class TaskCommentCreate(BaseModel):
    content: str


class TaskCommentRead(BaseModel):
    id: int
    task_id: int
    content: str
    created_at: datetime
    user: UserRead

    model_config = {"from_attributes": True}


class TaskAttachmentRead(BaseModel):
    id: int
    task_id: int
    filename: str
    file_size: int
    created_at: datetime
    user: UserRead

    model_config = {"from_attributes": True}


class TaskAuditLogRead(BaseModel):
    id: int
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime
    user: UserRead

    model_config = {"from_attributes": True}


class TaskRead(TaskBase):
    id: int
    status: str
    creator_id: int
    created_at: datetime
    updated_at: datetime | None
    creator: UserRead
    assignee: UserRead | None

    model_config = {"from_attributes": True}


class TaskReadDetail(TaskRead):
    comments: list[TaskCommentRead]
    attachments: list[TaskAttachmentRead]
    audit_logs: list[TaskAuditLogRead]
