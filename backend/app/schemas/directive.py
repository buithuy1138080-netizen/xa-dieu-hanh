from __future__ import annotations

from datetime import date, datetime
from math import ceil
from typing import Generic, TypeVar

from pydantic import AliasChoices, BaseModel, Field

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


class DocMin(BaseModel):
    id: int
    doc_number: str | None
    title: str
    doc_type: str
    model_config = {"from_attributes": True}


class StaffMin(BaseModel):
    id: int
    full_name: str
    position: str | None
    employee_code: str | None
    model_config = {"from_attributes": True}


class DeptMin(BaseModel):
    id: int
    name: str
    short_name: str | None
    model_config = {"from_attributes": True}


class TaskMin(BaseModel):
    id: int
    title: str
    status: str
    priority: str
    deadline: datetime | None = Field(None, validation_alias=AliasChoices("due_date", "deadline"))
    assignee: UserMin | None
    model_config = {"from_attributes": True, "populate_by_name": True}


# ─── Directive ────────────────────────────────────────────────────────────────

class DirectiveCreate(BaseModel):
    title: str
    content: str | None = None
    issuer_id: int
    status: str = "active"
    priority: str = "normal"
    issued_date: date | None = None
    deadline: datetime | None = None
    doc_id: int | None = None
    assignee_staff_id: int | None = None
    responsible_department_id: int | None = None
    coordinating_dept_ids: list[int] = []


class DirectiveUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    issuer_id: int | None = None
    priority: str | None = None
    issued_date: date | None = None
    deadline: datetime | None = None
    doc_id: int | None = None
    assignee_staff_id: int | None = None
    responsible_department_id: int | None = None
    coordinating_dept_ids: list[int] | None = None


class DirectiveStatusUpdate(BaseModel):
    status: str
    note: str | None = None


class DirectiveRead(BaseModel):
    id: int
    title: str
    content: str | None
    issuer_id: int
    status: str
    priority: str
    issued_date: date | None
    deadline: datetime | None
    progress: int
    doc_id: int | None
    assignee_staff_id: int | None
    responsible_department_id: int | None
    created_by: int
    issuer: UserMin
    creator: UserMin
    document: DocMin | None
    assignee_staff: StaffMin | None
    responsible_department: DeptMin | None
    created_at: datetime
    updated_at: datetime | None
    model_config = {"from_attributes": True}


# ─── Units ────────────────────────────────────────────────────────────────────

class DirectiveUnitCreate(BaseModel):
    unit_name: str
    role: str = "Thực hiện"
    department_id: int | None = None
    user_id: int | None = None
    progress: int = 0
    note: str | None = None


class DirectiveUnitUpdate(BaseModel):
    progress: int
    note: str | None = None


class DirectiveUnitRead(BaseModel):
    id: int
    unit_name: str
    role: str
    department_id: int | None
    user_id: int | None
    progress: int
    note: str | None
    department: DeptMin | None
    user: UserMin | None
    created_at: datetime
    updated_at: datetime | None
    model_config = {"from_attributes": True}


# ─── Tasks ────────────────────────────────────────────────────────────────────

class DirectiveTaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    deadline: datetime | None = None
    assignee_id: int | None = None
    assignee_staff_id: int | None = None


class DirectiveTaskRead(BaseModel):
    id: int
    task: TaskMin
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Comments ─────────────────────────────────────────────────────────────────

class DirectiveCommentCreate(BaseModel):
    content: str


class DirectiveCommentRead(BaseModel):
    id: int
    content: str
    user: UserMin
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── History ──────────────────────────────────────────────────────────────────

class DirectiveHistoryRead(BaseModel):
    id: int
    action: str
    old_status: str | None
    new_status: str | None
    old_progress: int | None
    new_progress: int | None
    note: str | None
    user: UserMin
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Attachments ──────────────────────────────────────────────────────────────

class DirectiveAttachmentRead(BaseModel):
    id: int
    filename: str
    file_size: int
    file_mime: str | None
    user: UserMin
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Detail ───────────────────────────────────────────────────────────────────

class DirectiveReadDetail(DirectiveRead):
    units: list[DirectiveUnitRead] = []
    linked_tasks: list[DirectiveTaskRead] = []
    comments: list[DirectiveCommentRead] = []
    history: list[DirectiveHistoryRead] = []
    attachments: list[DirectiveAttachmentRead] = []


# ─── Stats ────────────────────────────────────────────────────────────────────

class DirectiveStats(BaseModel):
    total: int
    active: int
    completed: int
    overdue: int
    near_deadline: int
    avg_progress: float
