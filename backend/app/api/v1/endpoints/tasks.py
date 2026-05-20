from __future__ import annotations

import shutil
import uuid
from datetime import date, datetime, timezone
from math import ceil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.staff import Staff
from app.models.task import Task, TaskAuditLog, TaskAttachment, TaskComment, TaskDepartment
from app.models.user import User

router = APIRouter()

from app.core.config import settings as _settings
UPLOAD_DIR = Path(_settings.UPLOAD_DIR) / "tasks"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

VALID_STATUSES   = {"pending", "in_progress", "completed", "cancelled"}
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}
ALLOWED_UPLOAD_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"}
VALID_SORT_COLS  = {"created_at", "updated_at", "due_date", "title", "priority", "status", "progress_percent"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeptMin(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    short_name: str | None = None
    code: str | None = None


class UserMin(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str | None = None
    username: str


class StaffMin(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    position: str | None = None
    employee_code: str | None = None
    department_id: int | None = None


class DocMin(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    doc_number: str | None = None


class DirectiveMin(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str


class TaskDeptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    department_id: int
    role: str
    department: DeptMin | None = None


class TaskCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    user_id: int
    content: str
    created_at: datetime
    user: UserMin | None = None


class TaskAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    user_id: int
    filename: str
    file_path: str
    file_size: int
    created_at: datetime


class TaskAuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime
    user: UserMin | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_code: str | None = None
    title: str
    description: str | None = None
    content_summary: str | None = None
    status: str
    priority: str
    progress_percent: int
    start_date: date | None = None
    due_date: datetime | None = None
    completed_at: datetime | None = None
    incoming_document_id: int | None = None
    outgoing_document_id: int | None = None
    directive_id: int | None = None
    created_by: int
    updated_by: int | None = None
    assignee_id: int | None = None
    assignee_staff_id: int | None = None
    supervising_user_id: int | None = None
    lead_department_id: int | None = None
    reminder_enabled: bool
    overdue_warning: bool
    completion_note: str | None = None
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None
    is_overdue: bool = False
    creator: UserMin | None = None
    assignee: UserMin | None = None
    assignee_staff: StaffMin | None = None
    lead_department: DeptMin | None = None


class TaskReadDetail(TaskRead):
    updater: UserMin | None = None
    supervisor: UserMin | None = None
    incoming_document: DocMin | None = None
    outgoing_document: DocMin | None = None
    directive: DirectiveMin | None = None
    departments: list[TaskDeptRead] = []
    comments: list[TaskCommentRead] = []
    attachments: list[TaskAttachmentRead] = []
    audit_logs: list[TaskAuditRead] = []


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    content_summary: str | None = None
    priority: str = "medium"
    start_date: date | None = None
    due_date: datetime | None = None
    incoming_document_id: int | None = None
    outgoing_document_id: int | None = None
    directive_id: int | None = None
    assignee_id: int | None = None
    assignee_staff_id: int | None = None
    supervising_user_id: int | None = None
    lead_department_id: int | None = None
    coordinating_department_ids: list[int] = []
    reminder_enabled: bool = False


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    content_summary: str | None = None
    priority: str | None = None
    start_date: date | None = None
    due_date: datetime | None = None
    incoming_document_id: int | None = None
    outgoing_document_id: int | None = None
    directive_id: int | None = None
    assignee_id: int | None = None
    assignee_staff_id: int | None = None
    supervising_user_id: int | None = None
    lead_department_id: int | None = None
    coordinating_department_ids: list[int] | None = None
    reminder_enabled: bool | None = None
    completion_note: str | None = None


class TaskStatusUpdate(BaseModel):
    status: str
    completion_note: str | None = None


class TaskProgressUpdate(BaseModel):
    progress_percent: int
    completion_note: str | None = None


class TaskCommentCreate(BaseModel):
    content: str


class TaskDeptAdd(BaseModel):
    department_id: int
    role: str = "coordinating"


class TaskStats(BaseModel):
    total: int = 0
    pending: int = 0
    in_progress: int = 0
    completed: int = 0
    cancelled: int = 0
    overdue: int = 0
    high_priority: int = 0
    urgent_priority: int = 0
    avg_progress: float = 0.0


class PaginatedTasks(BaseModel):
    items: list[TaskRead]
    total: int
    page: int
    page_size: int
    pages: int


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _next_task_code(db: AsyncSession) -> str:
    """Generate next task code using MAX(id substring) to avoid race conditions."""
    year = datetime.now().year
    prefix = f"NV-{year}-"
    result = await db.execute(
        select(Task.task_code)
        .where(Task.task_code.like(f"{prefix}%"))
        .order_by(Task.task_code.desc())
        .limit(1)
    )
    last_code = result.scalar_one_or_none()
    if last_code:
        try:
            last_seq = int(last_code.split("-")[-1])
        except (ValueError, IndexError):
            last_seq = 0
        next_seq = last_seq + 1
    else:
        next_seq = 1
    return f"{prefix}{next_seq:04d}"


def _is_overdue(t: Task) -> bool:
    if t.status in ("completed", "cancelled"):
        return False
    if t.due_date is None:
        return False
    now = datetime.now(timezone.utc)
    due = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
    return due < now


def _to_read(t: Task) -> dict:
    d = {c.key: getattr(t, c.key) for c in t.__mapper__.column_attrs}
    d["is_overdue"] = _is_overdue(t)
    if hasattr(t, "creator") and t.creator is not None:
        d["creator"] = {"id": t.creator.id, "full_name": t.creator.full_name, "username": t.creator.username}
    else:
        d["creator"] = None
    if hasattr(t, "assignee") and t.assignee is not None:
        d["assignee"] = {"id": t.assignee.id, "full_name": t.assignee.full_name, "username": t.assignee.username}
    else:
        d["assignee"] = None
    if hasattr(t, "assignee_staff") and t.assignee_staff is not None:
        s = t.assignee_staff
        d["assignee_staff"] = {
            "id": s.id, "full_name": s.full_name,
            "position": s.position, "employee_code": s.employee_code,
            "department_id": s.department_id,
        }
    else:
        d["assignee_staff"] = None
    if hasattr(t, "lead_department") and t.lead_department is not None:
        ld = t.lead_department
        d["lead_department"] = {"id": ld.id, "name": ld.name, "short_name": getattr(ld, "short_name", None), "code": getattr(ld, "code", None)}
    else:
        d["lead_department"] = None
    return d


_DETAIL_LOADS = [
    selectinload(Task.creator),
    selectinload(Task.updater),
    selectinload(Task.assignee),
    selectinload(Task.assignee_staff),
    selectinload(Task.supervisor),
    selectinload(Task.lead_department),
    selectinload(Task.incoming_document),
    selectinload(Task.outgoing_document),
    selectinload(Task.directive),
    selectinload(Task.departments).selectinload(TaskDepartment.department),
    selectinload(Task.comments).selectinload(TaskComment.user),
    selectinload(Task.attachments),
    selectinload(Task.audit_logs).selectinload(TaskAuditLog.user),
]

_LIST_LOADS = [
    selectinload(Task.creator),
    selectinload(Task.assignee),
    selectinload(Task.assignee_staff),
    selectinload(Task.lead_department),
]


async def _get_task(db: AsyncSession, task_id: int, detail: bool = False) -> Task:
    loads = _DETAIL_LOADS if detail else _LIST_LOADS
    q = select(Task).where(Task.id == task_id, Task.deleted_at.is_(None))
    for ld in loads:
        q = q.options(ld)
    result = await db.execute(q)
    t = result.scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


async def _audit(
    db: AsyncSession, task_id: int, user_id: int,
    action: str, field: str | None = None,
    old: str | None = None, new: str | None = None
) -> None:
    log = TaskAuditLog(
        task_id=task_id, user_id=user_id, action=action,
        field=field, old_value=old, new_value=new,
    )
    db.add(log)


async def _set_departments(
    db: AsyncSession, task: Task,
    lead_dept_id: int | None,
    coordinating_ids: list[int],
) -> None:
    await db.execute(
        delete(TaskDepartment).where(TaskDepartment.task_id == task.id)
    )
    await db.flush()

    if lead_dept_id:
        db.add(TaskDepartment(task_id=task.id, department_id=lead_dept_id, role="lead"))
    for dept_id in coordinating_ids:
        if dept_id != lead_dept_id:
            db.add(TaskDepartment(task_id=task.id, department_id=dept_id, role="coordinating"))


def _calc_stats(rows: list[Task]) -> TaskStats:
    now = datetime.now(timezone.utc)
    s = TaskStats(total=len(rows))
    progresses = []
    for t in rows:
        st = t.status
        if st == "pending":
            s.pending += 1
        elif st == "in_progress":
            s.in_progress += 1
        elif st == "completed":
            s.completed += 1
        elif st == "cancelled":
            s.cancelled += 1
        if _is_overdue(t):
            s.overdue += 1
        if t.priority == "high":
            s.high_priority += 1
        elif t.priority == "urgent":
            s.urgent_priority += 1
        progresses.append(t.progress_percent)
    s.avg_progress = round(sum(progresses) / len(progresses), 1) if progresses else 0.0
    return s


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedTasks)
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str | None = None,
    priority: str | None = None,
    lead_dept_id: int | None = None,
    assignee_id: int | None = None,
    assignee_staff_id: int | None = None,
    supervising_user_id: int | None = None,
    incoming_document_id: int | None = None,
    outgoing_document_id: int | None = None,
    directive_id: int | None = None,
    overdue_only: bool = False,
    due_before: datetime | None = None,
    due_after: datetime | None = None,
    coordinating_dept_id: int | None = None,
    search: str | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Task).where(Task.deleted_at.is_(None))

    if status:
        q = q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
    if lead_dept_id:
        q = q.where(Task.lead_department_id == lead_dept_id)
    if assignee_id:
        q = q.where(Task.assignee_id == assignee_id)
    if assignee_staff_id:
        q = q.where(Task.assignee_staff_id == assignee_staff_id)
    if supervising_user_id:
        q = q.where(Task.supervising_user_id == supervising_user_id)
    if incoming_document_id:
        q = q.where(Task.incoming_document_id == incoming_document_id)
    if outgoing_document_id:
        q = q.where(Task.outgoing_document_id == outgoing_document_id)
    if directive_id:
        q = q.where(Task.directive_id == directive_id)
    if due_before:
        q = q.where(Task.due_date <= due_before)
    if due_after:
        q = q.where(Task.due_date >= due_after)
    if search:
        term = f"%{search}%"
        q = q.where(or_(Task.title.ilike(term), Task.task_code.ilike(term), Task.content_summary.ilike(term)))
    if coordinating_dept_id:
        sub = select(TaskDepartment.task_id).where(
            TaskDepartment.department_id == coordinating_dept_id,
            TaskDepartment.role == "coordinating",
        )
        q = q.where(Task.id.in_(sub))
    if overdue_only:
        now = datetime.now(timezone.utc)
        q = q.where(Task.due_date < now, Task.status.notin_(["completed", "cancelled"]))

    sort_col = sort_by if sort_by in VALID_SORT_COLS else "created_at"
    col = getattr(Task, sort_col)
    q = q.order_by(col.desc() if sort_dir == "desc" else col.asc())

    total_result = await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))
    total = total_result.scalar() or 0

    q = q.offset((page - 1) * page_size).limit(page_size)
    for ld in _LIST_LOADS:
        q = q.options(ld)

    rows = (await db.execute(q)).scalars().all()
    items = [TaskRead.model_validate(_to_read(t)) for t in rows]

    return PaginatedTasks(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total else 1,
    )


@router.post("", response_model=TaskRead, status_code=201)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {VALID_PRIORITIES}")

    task_code = await _next_task_code(db)
    t = Task(
        task_code=task_code,
        title=body.title,
        description=body.description,
        content_summary=body.content_summary,
        priority=body.priority,
        status="pending",
        progress_percent=0,
        start_date=body.start_date,
        due_date=body.due_date,
        incoming_document_id=body.incoming_document_id,
        outgoing_document_id=body.outgoing_document_id,
        directive_id=body.directive_id,
        created_by=current_user.id,
        assignee_id=body.assignee_id,
        assignee_staff_id=body.assignee_staff_id,
        supervising_user_id=body.supervising_user_id,
        lead_department_id=body.lead_department_id,
        reminder_enabled=body.reminder_enabled,
    )
    db.add(t)
    await db.flush()

    await _set_departments(db, t, body.lead_department_id, body.coordinating_department_ids)
    await _audit(db, t.id, current_user.id, "created")
    await db.commit()

    task = await _get_task(db, t.id, detail=False)
    return TaskRead.model_validate(_to_read(task))


@router.get("/stats", response_model=TaskStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = Task.deleted_at.is_(None)
    row = (await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((Task.status == "pending",     1), else_=0)).label("pending"),
            func.sum(case((Task.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((Task.status == "completed",   1), else_=0)).label("completed"),
            func.sum(case((Task.status == "cancelled",   1), else_=0)).label("cancelled"),
            func.sum(case((Task.priority == "high",      1), else_=0)).label("high_priority"),
            func.sum(case((Task.priority == "urgent",    1), else_=0)).label("urgent_priority"),
            func.avg(Task.progress_percent).label("avg_progress"),
        ).where(base)
    )).one()

    now = datetime.now(timezone.utc)
    overdue = (await db.execute(
        select(func.count()).where(
            base,
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date < now,
        )
    )).scalar_one()

    return TaskStats(
        total=row.total or 0,
        pending=row.pending or 0,
        in_progress=row.in_progress or 0,
        completed=row.completed or 0,
        cancelled=row.cancelled or 0,
        overdue=overdue,
        high_priority=row.high_priority or 0,
        urgent_priority=row.urgent_priority or 0,
        avg_progress=round(float(row.avg_progress or 0), 1),
    )


@router.get("/overdue", response_model=list[TaskRead])
async def get_overdue(
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    q = (
        select(Task)
        .where(
            Task.deleted_at.is_(None),
            Task.due_date < now,
            Task.status.notin_(["completed", "cancelled"]),
        )
        .order_by(Task.due_date.asc())
        .limit(limit)
    )
    for ld in _LIST_LOADS:
        q = q.options(ld)
    rows = (await db.execute(q)).scalars().all()
    return [TaskRead.model_validate(_to_read(t)) for t in rows]


@router.get("/{task_id}", response_model=TaskReadDetail)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_task(db, task_id, detail=True)
    d = _to_read(t)

    def _user_min(u: User | None) -> dict | None:
        if u is None:
            return None
        return {"id": u.id, "full_name": u.full_name, "username": u.username}

    def _doc_min(doc: Any) -> dict | None:
        if doc is None:
            return None
        return {"id": doc.id, "title": doc.title, "doc_number": getattr(doc, "doc_number", None)}

    def _dir_min(drv: Any) -> dict | None:
        if drv is None:
            return None
        return {"id": drv.id, "title": drv.title}

    d["updater"] = _user_min(t.updater)
    d["supervisor"] = _user_min(t.supervisor)
    d["incoming_document"] = _doc_min(t.incoming_document)
    d["outgoing_document"] = _doc_min(t.outgoing_document)
    d["directive"] = _dir_min(t.directive)
    d["departments"] = [
        {
            "id": td.id,
            "department_id": td.department_id,
            "role": td.role,
            "department": {"id": td.department.id, "name": td.department.name,
                           "short_name": getattr(td.department, "short_name", None),
                           "code": getattr(td.department, "code", None)} if td.department else None,
        }
        for td in t.departments
    ]
    d["comments"] = [
        {
            "id": c.id, "task_id": c.task_id, "user_id": c.user_id,
            "content": c.content, "created_at": c.created_at,
            "user": _user_min(c.user),
        }
        for c in t.comments
    ]
    d["attachments"] = [
        {
            "id": a.id, "task_id": a.task_id, "user_id": a.user_id,
            "filename": a.filename, "file_path": a.file_path,
            "file_size": a.file_size, "created_at": a.created_at,
        }
        for a in t.attachments
    ]
    d["audit_logs"] = [
        {
            "id": lg.id, "action": lg.action, "field": lg.field,
            "old_value": lg.old_value, "new_value": lg.new_value,
            "created_at": lg.created_at, "user": _user_min(lg.user),
        }
        for lg in t.audit_logs
    ]
    return TaskReadDetail.model_validate(d)


@router.put("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_task(db, task_id)

    if body.priority is not None and body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"priority must be one of {VALID_PRIORITIES}")

    fields = ["title", "description", "content_summary", "priority", "start_date", "due_date",
              "incoming_document_id", "outgoing_document_id", "directive_id",
              "assignee_id", "assignee_staff_id", "supervising_user_id", "lead_department_id",
              "reminder_enabled", "completion_note"]

    for f in fields:
        val = getattr(body, f)
        if val is not None:
            old = str(getattr(t, f))
            setattr(t, f, val)
            await _audit(db, t.id, current_user.id, "updated", f, old, str(val))

    t.updated_by = current_user.id

    if body.coordinating_department_ids is not None:
        await _set_departments(db, t, t.lead_department_id, body.coordinating_department_ids)

    await db.commit()
    task = await _get_task(db, t.id, detail=False)
    return TaskRead.model_validate(_to_read(task))


@router.patch("/{task_id}/status", response_model=TaskRead)
async def update_status(
    task_id: int,
    body: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"status must be one of {VALID_STATUSES}")

    t = await _get_task(db, task_id)
    old_status = t.status
    t.status = body.status
    t.updated_by = current_user.id

    if body.status == "completed":
        t.progress_percent = 100
        t.completed_at = datetime.now(timezone.utc)
        if body.completion_note:
            t.completion_note = body.completion_note
    else:
        if old_status == "completed":
            t.completed_at = None
        if body.status == "in_progress" and t.progress_percent == 0:
            t.progress_percent = 10

    await _audit(db, t.id, current_user.id, "status_changed", "status", old_status, body.status)
    await db.commit()

    task = await _get_task(db, t.id, detail=False)
    return TaskRead.model_validate(_to_read(task))


@router.patch("/{task_id}/progress", response_model=TaskRead)
async def update_progress(
    task_id: int,
    body: TaskProgressUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (0 <= body.progress_percent <= 100):
        raise HTTPException(400, "progress_percent must be 0-100")

    t = await _get_task(db, task_id)
    old_pct = t.progress_percent
    t.progress_percent = body.progress_percent
    t.updated_by = current_user.id

    if body.progress_percent == 100 and t.status not in ("completed", "cancelled"):
        t.status = "completed"
        t.completed_at = datetime.now(timezone.utc)
        if body.completion_note:
            t.completion_note = body.completion_note
    elif body.progress_percent > 0 and t.status == "pending":
        t.status = "in_progress"

    await _audit(db, t.id, current_user.id, "progress_updated", "progress_percent", str(old_pct), str(body.progress_percent))
    await db.commit()

    task = await _get_task(db, t.id, detail=False)
    return TaskRead.model_validate(_to_read(task))


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_task(db, task_id)
    t.deleted_at = datetime.now(timezone.utc)
    t.updated_by = current_user.id
    await _audit(db, t.id, current_user.id, "deleted")
    await db.commit()


# ── Comments ──────────────────────────────────────────────────────────────────

@router.post("/{task_id}/comments", response_model=TaskCommentRead, status_code=201)
async def add_comment(
    task_id: int,
    body: TaskCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_task(db, task_id)
    c = TaskComment(task_id=task_id, user_id=current_user.id, content=body.content)
    db.add(c)
    await db.flush()
    await _audit(db, task_id, current_user.id, "comment_added")
    await db.commit()

    q = select(TaskComment).where(TaskComment.id == c.id).options(selectinload(TaskComment.user))
    c = (await db.execute(q)).scalar_one()
    return TaskCommentRead.model_validate(c)


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    task_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaskComment).where(TaskComment.id == comment_id, TaskComment.task_id == task_id)
    )
    c = result.scalar_one_or_none()
    if c is None:
        raise HTTPException(404, "Comment not found")
    if c.user_id != current_user.id and current_user.role not in ("admin", "manager"):
        raise HTTPException(403, "Forbidden")
    await db.delete(c)
    await db.commit()


# ── Attachments ───────────────────────────────────────────────────────────────

@router.post("/{task_id}/attachments", response_model=TaskAttachmentRead, status_code=201)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_task(db, task_id)
    # Strip directory traversal — use only the bare filename, prefix with uuid
    safe_name = Path(file.filename or "file").name
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise HTTPException(
            400,
            f"Định dạng file không được phép: '{ext or 'không rõ'}'. "
            f"Chấp nhận: {', '.join(sorted(ALLOWED_UPLOAD_EXTS))}"
        )
    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    size = dest.stat().st_size

    a = TaskAttachment(
        task_id=task_id, user_id=current_user.id,
        filename=safe_name,
        file_path=str(dest), file_size=size,
    )
    db.add(a)
    await db.flush()
    await _audit(db, task_id, current_user.id, "attachment_added", "filename", None, file.filename)
    await db.commit()
    await db.refresh(a)
    return TaskAttachmentRead.model_validate(a)


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    task_id: int,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaskAttachment).where(TaskAttachment.id == attachment_id, TaskAttachment.task_id == task_id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(404, "Attachment not found")
    try:
        Path(a.file_path).unlink(missing_ok=True)
    except Exception:
        pass
    await db.delete(a)
    await db.commit()


# ── Departments ───────────────────────────────────────────────────────────────

@router.post("/{task_id}/departments", response_model=TaskDeptRead, status_code=201)
async def add_department(
    task_id: int,
    body: TaskDeptAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_task(db, task_id)
    existing = (await db.execute(
        select(TaskDepartment).where(
            TaskDepartment.task_id == task_id,
            TaskDepartment.department_id == body.department_id,
        )
    )).scalar_one_or_none()
    if existing:
        existing.role = body.role
        await db.commit()
        await db.refresh(existing)
        return TaskDeptRead.model_validate(existing)

    td = TaskDepartment(task_id=task_id, department_id=body.department_id, role=body.role)
    db.add(td)
    await db.commit()
    await db.refresh(td)
    return TaskDeptRead.model_validate(td)


@router.delete("/{task_id}/departments/{dept_id}", status_code=204)
async def remove_department(
    task_id: int,
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TaskDepartment).where(
            TaskDepartment.task_id == task_id,
            TaskDepartment.department_id == dept_id,
        )
    )
    td = result.scalar_one_or_none()
    if td is None:
        raise HTTPException(404, "Department link not found")
    await db.delete(td)
    await db.commit()
