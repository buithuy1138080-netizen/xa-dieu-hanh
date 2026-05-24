from __future__ import annotations

from datetime import date, datetime
from math import ceil
from typing import Generic, TypeVar

from pydantic import BaseModel, Field, field_validator
from pydantic import AliasChoices

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int


class UserMin(BaseModel):
    id: int
    username: str
    full_name: str | None
    model_config = {"from_attributes": True}


class DeptMin(BaseModel):
    id: int
    name: str
    short_name: str | None
    code: str | None
    model_config = {"from_attributes": True}


class StaffMin(BaseModel):
    id: int
    full_name: str
    position: str | None
    employee_code: str | None
    model_config = {"from_attributes": True}


class TaskMin(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    deadline: datetime | None = Field(None, validation_alias=AliasChoices("due_date", "deadline"))
    assignee: UserMin | None
    model_config = {"from_attributes": True, "populate_by_name": True}


# ─── Document ─────────────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    doc_number: str | None = None
    title: str
    doc_type: str = "incoming"
    category: str | None = None
    issuer: str | None = None
    responsible_department_id: int | None = None
    coordinating_dept_ids: list[int] = []
    issue_date: date | None = None
    received_date: date | None = None
    deadline: datetime | None = None
    priority: str = "normal"
    summary: str | None = None
    assignee_id: int | None = None
    assignee_staff_id: int | None = None


class DocumentUpdate(BaseModel):
    doc_number: str | None = None
    title: str | None = None
    doc_type: str | None = None
    category: str | None = None
    issuer: str | None = None
    responsible_department_id: int | None = None
    coordinating_dept_ids: list[int] | None = None
    issue_date: date | None = None
    received_date: date | None = None
    deadline: datetime | None = None
    priority: str | None = None
    summary: str | None = None
    assignee_id: int | None = None
    assignee_staff_id: int | None = None


class DocumentStatusUpdate(BaseModel):
    status: str
    note: str | None = None


class DocumentRead(BaseModel):
    id: int
    doc_number: str | None
    title: str
    doc_type: str
    category: str | None
    issuer: str | None
    responsible_department_id: int | None
    responsible_department: DeptMin | None
    coordinating_dept_ids: list[int] = []

    @field_validator("coordinating_dept_ids", mode="before")
    @classmethod
    def _coerce_list(cls, v: object) -> list[int]:
        return v if v is not None else []
    issue_date: date | None
    received_date: date | None
    deadline: datetime | None
    status: str
    priority: str
    summary: str | None
    # AI extraction fields
    raw_text: str | None = None
    ai_processed: bool = False
    keywords: list[str] = []
    domain: str | None = None

    @field_validator("keywords", mode="before")
    @classmethod
    def _coerce_keywords(cls, v: object) -> list[str]:
        if v is None:
            return []
        if isinstance(v, list):
            return [str(i) for i in v]
        return []

    file_name: str | None
    file_size: int
    file_mime: str | None
    created_by: int
    assignee_id: int | None
    assignee_staff_id: int | None
    creator: UserMin
    assignee: UserMin | None
    assignee_staff: StaffMin | None
    created_at: datetime
    updated_at: datetime | None
    model_config = {"from_attributes": True}


# ─── Comments ─────────────────────────────────────────────────────────────────

class DocumentCommentCreate(BaseModel):
    content: str


class DocumentCommentRead(BaseModel):
    id: int
    content: str
    user: UserMin
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── History ──────────────────────────────────────────────────────────────────

class DocumentHistoryRead(BaseModel):
    id: int
    action: str
    old_status: str | None
    new_status: str | None
    note: str | None
    user: UserMin
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Linked Tasks ─────────────────────────────────────────────────────────────

class DocumentTaskRead(BaseModel):
    id: int
    task: TaskMin
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentTaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    deadline: datetime | None = None
    assignee_id: int | None = None
    lead_department_id: int | None = None


# ─── Detail ───────────────────────────────────────────────────────────────────

class DocumentReadDetail(DocumentRead):
    comments: list[DocumentCommentRead] = []
    history: list[DocumentHistoryRead] = []
    linked_tasks: list[DocumentTaskRead] = []
