from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: int
    task_id: int | None
    type: str
    title: str
    body: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCount(BaseModel):
    count: int
