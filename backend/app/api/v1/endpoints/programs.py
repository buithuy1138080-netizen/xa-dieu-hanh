"""
programs.py — Tags + Programs (Chương trình/Nghị quyết) + sub-resource APIs cho NQ57 Dashboard.

Endpoints:
  GET    /tags
  POST   /tags
  PUT    /tags/{id}

  GET    /programs                      — danh sách
  POST   /programs                      — tạo
  GET    /programs/{id}                 — chi tiết cơ bản
  PUT    /programs/{id}                 — cập nhật
  GET    /programs/{id}/dashboard       — tổng hợp đầy đủ (NQ57 Dashboard)
  GET    /programs/{id}/tasks           — tasks của chương trình
  GET    /programs/{id}/kpis            — KPIs của chương trình
  GET    /programs/{id}/documents       — văn bản liên kết

  GET/POST/DELETE  /documents/{id}/tags
  GET/POST/DELETE  /documents/{id}/programs
  POST             /documents/{id}/spawn
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.kpi import KPI
from app.models.program import DocumentProgram, DocumentTag, Program, Tag
from app.models.task import Task
from app.models.user import User

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TagOut(BaseModel):
    id: int
    code: str
    name: str
    color: str
    icon: str | None
    tag_type: str
    parent_id: int | None
    is_active: bool
    sort_order: int
    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    code: str
    name: str
    color: str = "#3B82F6"
    icon: str | None = None
    tag_type: str = "program"
    parent_id: int | None = None
    sort_order: int = 0


class ProgramOut(BaseModel):
    id: int
    code: str
    name: str
    short_name: str | None
    program_type: str
    tag_id: int | None
    issued_date: date | None
    effective_date: date | None
    end_date: date | None
    issuing_body: str | None
    scope: str
    status: str
    description: str | None
    target_summary: str | None
    fiscal_year: int | None
    review_cycle: str | None
    source_document_id: int | None
    created_at: datetime
    model_config = {"from_attributes": True}


class ProgramCreate(BaseModel):
    code: str
    name: str
    short_name: str | None = None
    program_type: str = "nghi_quyet"
    tag_id: int | None = None
    issued_date: date | None = None
    effective_date: date | None = None
    end_date: date | None = None
    issuing_body: str | None = None
    scope: str = "xa"
    description: str | None = None
    target_summary: str | None = None
    fiscal_year: int | None = None
    review_cycle: str = "annual"
    source_document_id: int | None = None


class ProgramUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    status: str | None = None
    description: str | None = None
    target_summary: str | None = None
    fiscal_year: int | None = None
    review_cycle: str | None = None
    end_date: date | None = None
    issuing_body: str | None = None
    tag_id: int | None = None


class DocumentTagIn(BaseModel):
    tag_id: int
    note: str | None = None


class DocumentProgramIn(BaseModel):
    program_id: int
    link_type: str = "implements"
    note: str | None = None


class SpawnRequest(BaseModel):
    spawn_type: str           # "task" | "kpi"
    program_id: int | None = None
    title: str
    description: str | None = None
    expected_output: str | None = None
    due_date: datetime | None = None
    priority: str = "medium"
    assignee_id: int | None = None
    kpi_title: str | None = None
    unit: str | None = None
    target_value: float | None = None
    year: int | None = None
    field: str | None = None


class SpawnResult(BaseModel):
    spawn_type: str
    object_id: int
    title: str


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[TagOut])
async def list_tags(
    tag_type: str | None = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Tag).order_by(Tag.sort_order, Tag.name)
    if active_only:
        q = q.where(Tag.is_active.is_(True))
    if tag_type:
        q = q.where(Tag.tag_type == tag_type)
    return (await db.execute(q)).scalars().all()


@router.post("/tags", response_model=TagOut, status_code=201)
async def create_tag(
    body: TagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Chỉ admin/lãnh đạo mới tạo được tag")
    existing = (await db.execute(select(Tag).where(Tag.code == body.code))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Tag '{body.code}' đã tồn tại")
    tag = Tag(**body.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.put("/tags/{tag_id}", response_model=TagOut)
async def update_tag(
    tag_id: int,
    body: TagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Chỉ admin/lãnh đạo mới sửa được tag")
    tag = (await db.execute(select(Tag).where(Tag.id == tag_id))).scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "Không tìm thấy tag")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tag, k, v)
    await db.commit()
    await db.refresh(tag)
    return tag


# ── Programs CRUD ─────────────────────────────────────────────────────────────

@router.get("/programs", response_model=list[ProgramOut])
async def list_programs(
    status_filter: str | None = Query(None, alias="status"),
    program_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Program).where(Program.deleted_at.is_(None)).order_by(Program.issued_date.desc().nulls_last(), Program.name)
    if status_filter:
        q = q.where(Program.status == status_filter)
    if program_type:
        q = q.where(Program.program_type == program_type)
    return (await db.execute(q)).scalars().all()


@router.post("/programs", response_model=ProgramOut, status_code=201)
async def create_program(
    body: ProgramCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Chỉ admin/lãnh đạo mới tạo được chương trình")
    existing = (await db.execute(
        select(Program).where(Program.code == body.code)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Chương trình '{body.code}' đã tồn tại")
    prog = Program(**body.model_dump(), created_by=current_user.id)
    db.add(prog)
    await db.commit()
    await db.refresh(prog)
    return prog


@router.get("/programs/{program_id}", response_model=ProgramOut)
async def get_program(
    program_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    prog = (await db.execute(
        select(Program).where(Program.id == program_id, Program.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not prog:
        raise HTTPException(404, "Không tìm thấy chương trình")
    return prog


@router.put("/programs/{program_id}", response_model=ProgramOut)
async def update_program(
    program_id: int,
    body: ProgramUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prog = (await db.execute(
        select(Program).where(Program.id == program_id, Program.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not prog:
        raise HTTPException(404, "Không tìm thấy chương trình")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(prog, k, v)
    prog.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(prog)
    return prog


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(
    program_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Chỉ admin/lãnh đạo mới xóa được chương trình")
    prog = (await db.execute(
        select(Program).where(Program.id == program_id, Program.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not prog:
        raise HTTPException(404, "Không tìm thấy chương trình")
    prog.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ── Program Dashboard (NQ57 integration) ─────────────────────────────────────

@router.get("/programs/{program_id}/dashboard")
async def get_program_dashboard(
    program_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Tổng hợp đầy đủ cho NQ57 Dashboard:
    - Thông tin program
    - Stats: tasks, KPIs, documents
    - Cảnh báo: sắp hạn / quá hạn
    - Tiến độ nhóm
    """
    prog = (await db.execute(
        select(Program).where(Program.id == program_id, Program.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not prog:
        raise HTTPException(404, "Không tìm thấy chương trình")

    today = date.today()

    # ── Task stats ────────────────────────────────────────────────────────────
    task_row = (await db.execute(
        select(
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == "completed", 1), else_=0)).label("done"),
            func.sum(case((Task.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((Task.status == "pending", 1), else_=0)).label("pending"),
            func.sum(case((
                and_(
                    Task.status != "completed",
                    Task.due_date.isnot(None),
                    Task.due_date < today,
                ), 1), else_=0
            )).label("overdue"),
            func.avg(Task.progress_percent).label("avg_progress"),
        ).where(Task.program_id == program_id, Task.deleted_at.is_(None))
    )).one()

    task_total = int(task_row.total or 0)
    task_done  = int(task_row.done or 0)

    # ── KPI stats ─────────────────────────────────────────────────────────────
    kpi_row = (await db.execute(
        select(
            func.count(KPI.id).label("total"),
            func.avg(KPI.progress).label("avg_progress"),
            func.sum(case((KPI.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((KPI.status == "at_risk", 1), else_=0)).label("at_risk"),
            func.sum(case((KPI.status == "behind", 1), else_=0)).label("behind"),
        ).where(KPI.program_id == program_id)
    )).one()

    # ── Document count ────────────────────────────────────────────────────────
    doc_count = (await db.execute(
        select(func.count(DocumentProgram.id))
        .where(DocumentProgram.program_id == program_id)
    )).scalar_one()

    # ── Alerts: sắp hạn (≤7 ngày) + quá hạn ─────────────────────────────────
    from datetime import timedelta
    soon = today + timedelta(days=7)

    alert_tasks = (await db.execute(
        select(Task.id, Task.task_code, Task.title, Task.due_date, Task.status, Task.priority)
        .where(
            Task.program_id == program_id,
            Task.deleted_at.is_(None),
            Task.status != "completed",
            Task.due_date.isnot(None),
            Task.due_date <= soon,
        )
        .order_by(Task.due_date)
        .limit(20)
    )).all()

    alerts = [
        {
            "task_id": t.id,
            "task_code": t.task_code,
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "priority": t.priority,
            "alert_type": "overdue" if t.due_date and (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date) < today else "due_soon",
        }
        for t in alert_tasks
    ]

    # ── Group progress (theo priority) ───────────────────────────────────────
    group_rows = (await db.execute(
        select(
            Task.priority,
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == "completed", 1), else_=0)).label("done"),
            func.avg(Task.progress_percent).label("avg_progress"),
        )
        .where(Task.program_id == program_id, Task.deleted_at.is_(None))
        .group_by(Task.priority)
        .order_by(Task.priority)
    )).all()

    _priority_label = {"urgent": "Khẩn", "high": "Cao", "medium": "Trung bình", "low": "Thấp"}
    groups = [
        {
            "name": _priority_label.get(r.priority, r.priority or "Chưa phân loại"),
            "key": r.priority,
            "total": int(r.total or 0),
            "done": int(r.done or 0),
            "avg_progress": round(float(r.avg_progress or 0), 1),
        }
        for r in group_rows
    ]

    def _val(v: Any) -> Any:
        if isinstance(v, (date, datetime)):
            return v.isoformat()
        return v

    return {
        "program": {c.key: _val(getattr(prog, c.key)) for c in prog.__table__.columns},
        "stats": {
            "task_total":        task_total,
            "task_done":         task_done,
            "task_in_progress":  int(task_row.in_progress or 0),
            "task_pending":      int(task_row.pending or 0),
            "task_overdue":      int(task_row.overdue or 0),
            "task_completion_rate": round(task_done / task_total * 100, 1) if task_total else 0.0,
            "task_avg_progress": round(float(task_row.avg_progress or 0), 1),
            "kpi_total":         int(kpi_row.total or 0),
            "kpi_avg_progress":  round(float(kpi_row.avg_progress or 0), 1),
            "kpi_completed":     int(kpi_row.completed or 0),
            "kpi_at_risk":       int(kpi_row.at_risk or 0),
            "kpi_behind":        int(kpi_row.behind or 0),
            "doc_count":         int(doc_count or 0),
        },
        "alerts": alerts,
        "groups": groups,
    }


# ── Program sub-resources ─────────────────────────────────────────────────────

@router.get("/programs/{program_id}/tasks")
async def get_program_tasks(
    program_id: int,
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    lead_dept_id: int | None = Query(None),
    search: str | None = Query(None),
    overdue_only: bool = Query(False),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    q = (
        select(Task)
        .options(
            selectinload(Task.assignee),
            selectinload(Task.lead_department),
            selectinload(Task.assignee_staff),
        )
        .where(Task.program_id == program_id, Task.deleted_at.is_(None))
    )

    # ── Role-based visibility: same as list_tasks ─────────────────────────────
    if current_user.role not in ("admin", "leader"):
        from app.api.v1.endpoints.tasks import _get_user_dept_id
        from app.models.task import TaskDepartment as _TDept
        user_dept_id = await _get_user_dept_id(db, current_user.id)
        dept_ids = select(_TDept.task_id).where(
            _TDept.department_id == user_dept_id
        ) if user_dept_id else select(_TDept.task_id).where(False)
        q = q.where(or_(
            Task.lead_department_id == user_dept_id,
            Task.id.in_(dept_ids),
            Task.assignee_id == current_user.id,
            Task.created_by == current_user.id,
        ))
    # ─────────────────────────────────────────────────────────────────────────
    if status_filter:
        q = q.where(Task.status == status_filter)
    if priority:
        q = q.where(Task.priority == priority)
    if lead_dept_id:
        q = q.where(Task.lead_department_id == lead_dept_id)
    if search:
        like = f"%{search}%"
        q = q.where(or_(Task.title.ilike(like), Task.task_code.ilike(like)))
    if overdue_only:
        q = q.where(Task.status != "completed", Task.due_date.isnot(None), Task.due_date < now)

    total = (await db.execute(
        select(func.count()).select_from(q.subquery())
    )).scalar_one()

    tasks = (await db.execute(
        q.order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )).scalars().all()

    _plabel = {"urgent": "Khẩn", "high": "Cao", "medium": "Trung bình", "low": "Thấp"}

    def _fmt(t: Task) -> dict:
        return {
            "id": t.id,
            "task_code": t.task_code,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "progress_percent": t.progress_percent,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "priority_label": _plabel.get(t.priority, t.priority),
            "assignee": {"id": t.assignee.id, "full_name": t.assignee.full_name} if t.assignee else None,
            "lead_department": {
                "id": t.lead_department.id,
                "name": t.lead_department.name,
                "short_name": getattr(t.lead_department, "short_name", None),
            } if t.lead_department else None,
            "is_overdue": bool(
                t.due_date
                and t.status not in ("completed", "cancelled")
                and (t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)) < now
            ),
        }

    return {
        "items": [_fmt(t) for t in tasks],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // size)),
    }


@router.get("/programs/{program_id}/kpis")
async def get_program_kpis(
    program_id: int,
    status_filter: str | None = Query(None, alias="status"),
    year: int | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(KPI).where(KPI.program_id == program_id, KPI.deleted_at.is_(None))
    if status_filter:
        q = q.where(KPI.status == status_filter)
    if year:
        q = q.where(KPI.year == year)

    total = (await db.execute(
        select(func.count()).select_from(q.subquery())
    )).scalar_one()

    kpis = (await db.execute(
        q.order_by(KPI.field.asc().nulls_last(), KPI.title)
        .offset((page - 1) * size).limit(size)
    )).scalars().all()

    def _fmt(k: KPI) -> dict:
        return {
            "id": k.id,
            "title": k.title,
            "unit": k.unit,
            "target_value": k.target_value,
            "current_value": k.current_value,
            "progress": k.progress,
            "status": k.status,
            "year": k.year,
            "field": k.field,
            "threshold_red": k.threshold_red,
            "threshold_yellow": k.threshold_yellow,
        }

    return {
        "items": [_fmt(k) for k in kpis],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // size)),
    }


@router.get("/programs/{program_id}/documents")
async def get_program_documents(
    program_id: int,
    link_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        select(DocumentProgram)
        .options(selectinload(DocumentProgram.program))
        .where(DocumentProgram.program_id == program_id)
    )
    if link_type:
        q = q.where(DocumentProgram.link_type == link_type)

    links = (await db.execute(q.order_by(DocumentProgram.created_at.desc()))).scalars().all()

    # Load document details
    doc_ids = [lnk.document_id for lnk in links]
    docs_map: dict[int, Document] = {}
    if doc_ids:
        docs = (await db.execute(
            select(Document).where(Document.id.in_(doc_ids))
        )).scalars().all()
        docs_map = {d.id: d for d in docs}

    result = []
    for lnk in links:
        doc = docs_map.get(lnk.document_id)
        if not doc:
            continue
        result.append({
            "link_id": lnk.id,
            "link_type": lnk.link_type,
            "note": lnk.note,
            "linked_at": lnk.created_at.isoformat(),
            "document": {
                "id": doc.id,
                "doc_number": getattr(doc, "doc_number", None),
                "title": doc.title,
                "doc_type": getattr(doc, "doc_type", None),
                "status": getattr(doc, "status", None),
                "issued_date": getattr(doc, "issued_date", None),
            },
        })
    return result


# ── Document ↔ Tag ────────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/tags", response_model=list[TagOut])
async def get_document_tags(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Tag)
        .join(DocumentTag, DocumentTag.tag_id == Tag.id)
        .where(DocumentTag.document_id == doc_id)
        .order_by(Tag.sort_order)
    )).scalars().all()
    return rows


@router.post("/documents/{doc_id}/tags", status_code=201)
async def add_document_tag(
    doc_id: int,
    body: DocumentTagIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (await db.execute(
        select(DocumentTag).where(
            DocumentTag.document_id == doc_id, DocumentTag.tag_id == body.tag_id
        )
    )).scalar_one_or_none()
    if existing:
        return {"message": "Tag đã được gắn"}
    tag = (await db.execute(select(Tag).where(Tag.id == body.tag_id))).scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "Không tìm thấy tag")
    db.add(DocumentTag(document_id=doc_id, tag_id=body.tag_id, tagged_by=current_user.id, note=body.note))
    await db.commit()
    return {"message": "Đã gắn tag", "tag_id": body.tag_id}


@router.delete("/documents/{doc_id}/tags/{tag_id}", status_code=204)
async def remove_document_tag(
    doc_id: int, tag_id: int,
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user),
):
    dt = (await db.execute(
        select(DocumentTag).where(DocumentTag.document_id == doc_id, DocumentTag.tag_id == tag_id)
    )).scalar_one_or_none()
    if dt:
        await db.delete(dt)
        await db.commit()


# ── Document ↔ Program ────────────────────────────────────────────────────────

@router.get("/documents/{doc_id}/programs")
async def get_document_programs(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(DocumentProgram)
        .options(selectinload(DocumentProgram.program))
        .where(DocumentProgram.document_id == doc_id)
    )).scalars().all()
    return [
        {
            "id": r.id, "link_type": r.link_type, "note": r.note, "created_at": r.created_at,
            "program": {
                "id": r.program.id, "code": r.program.code,
                "name": r.program.name, "short_name": r.program.short_name,
                "status": r.program.status,
            },
        }
        for r in rows
    ]


@router.post("/documents/{doc_id}/programs", status_code=201)
async def link_document_program(
    doc_id: int,
    body: DocumentProgramIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prog = (await db.execute(select(Program).where(Program.id == body.program_id))).scalar_one_or_none()
    if not prog:
        raise HTTPException(404, "Không tìm thấy chương trình")
    db.add(DocumentProgram(
        document_id=doc_id, program_id=body.program_id,
        link_type=body.link_type, note=body.note, created_by=current_user.id,
    ))
    await db.commit()
    return {"message": "Đã liên kết", "program_id": body.program_id, "link_type": body.link_type}


@router.delete("/documents/{doc_id}/programs/{program_id}", status_code=204)
async def unlink_document_program(
    doc_id: int, program_id: int,
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user),
):
    dp = (await db.execute(
        select(DocumentProgram).where(
            DocumentProgram.document_id == doc_id, DocumentProgram.program_id == program_id
        )
    )).scalar_one_or_none()
    if dp:
        await db.delete(dp)
        await db.commit()


# ── Spawn: sinh nhiệm vụ / KPI từ văn bản ────────────────────────────────────

@router.post("/documents/{doc_id}/spawn", response_model=SpawnResult, status_code=201)
async def spawn_from_document(
    doc_id: int,
    body: SpawnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.spawn_type == "task":
        if not body.title:
            raise HTTPException(400, "Cần nhập tiêu đề nhiệm vụ")
        count = (await db.execute(select(func.count(Task.id)))).scalar_one()
        t = Task(
            task_code=f"NV-{(count + 1):04d}",
            title=body.title,
            description=body.description,
            expected_output=body.expected_output,
            due_date=body.due_date,
            priority=body.priority,
            status="pending",
            progress_percent=0,
            source_document_id=doc_id,
            program_id=body.program_id,
            assignee_id=body.assignee_id,
            created_by=current_user.id,
        )
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return SpawnResult(spawn_type="task", object_id=t.id, title=t.title)

    elif body.spawn_type == "kpi":
        if not body.kpi_title or body.target_value is None:
            raise HTTPException(400, "Cần nhập tên KPI và mục tiêu")
        from datetime import date as dt_date
        k = KPI(
            title=body.kpi_title, unit=body.unit,
            target_value=body.target_value, current_value=0.0, progress=0.0,
            year=body.year or dt_date.today().year, field=body.field,
            period="yearly", status="on_track",
            source_document_id=doc_id, program_id=body.program_id,
            created_by=current_user.id,
        )
        db.add(k)
        await db.commit()
        await db.refresh(k)
        return SpawnResult(spawn_type="kpi", object_id=k.id, title=k.title)

    raise HTTPException(400, "spawn_type phải là 'task' hoặc 'kpi'")
