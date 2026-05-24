from datetime import date, datetime, timezone
from math import ceil

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import Task, TaskDepartment
from app.models.user import User
from app.schemas.kpi import (
    NQ57ProgressCreate,
    NQ57ProgressRead,
    NQ57Stats,
    NQ57TaskCreate,
    NQ57TaskRead,
    NQ57TaskReadDetail,
    NQ57TaskUpdate,
    PaginatedResponse,
)

router = APIRouter()

VALID_STATUSES = {"pending", "in_progress", "completed", "delayed", "cancelled"}
NQ57_GROUPS = [
    "Hạ tầng số",
    "Chính phủ số",
    "Kinh tế số",
    "Xã hội số",
    "An toàn thông tin",
    "Đổi mới sáng tạo",
    "Nhân lực số",
    "Khác",
]

_LIST_LOADS = [
    selectinload(Task.creator),
    selectinload(Task.assignee),
    selectinload(Task.assignee_staff),
    selectinload(Task.lead_department),
    selectinload(Task.departments).selectinload(TaskDepartment.department),
]

_DETAIL_LOADS = _LIST_LOADS + [
    selectinload(Task.incoming_document),
    selectinload(Task.outgoing_document),
    selectinload(Task.directive),
]


def _task_to_nq57(t: Task) -> dict:
    """Map Task fields → NQ57TaskRead-compatible dict."""
    deadline_date: date | None = None
    if t.due_date is not None:
        deadline_date = t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date

    coordinating_dept_ids: list[int] = [
        td.department_id for td in t.departments if td.role == "coordinating"
    ]

    dept = t.lead_department
    responsible_department = (
        {"id": dept.id, "name": dept.name,
         "short_name": getattr(dept, "short_name", None),
         "code": getattr(dept, "code", None)}
        if dept else None
    )

    user = t.assignee
    responsible_user = (
        {"id": user.id, "username": user.username, "full_name": user.full_name}
        if user else None
    )

    staff = t.assignee_staff
    responsible_staff = (
        {"id": staff.id, "full_name": staff.full_name,
         "position": staff.position, "employee_code": staff.employee_code,
         "department_id": staff.department_id}
        if staff else None
    )

    creator = t.creator
    creator_dict = (
        {"id": creator.id, "username": creator.username, "full_name": creator.full_name}
        if creator else {"id": t.created_by, "username": "", "full_name": None}
    )

    return {
        "id": t.id,
        "code": t.task_code,
        "title": t.title,
        "description": t.description,
        "group": t.task_group,
        "target": t.expected_output,
        "progress": t.progress_percent,
        "status": t.status,
        "start_date": t.start_date,
        "deadline": deadline_date,
        "responsible_unit": None,
        "responsible_department_id": t.lead_department_id,
        "responsible_department": responsible_department,
        "responsible_user_id": t.assignee_id,
        "responsible_user": responsible_user,
        "responsible_staff_id": t.assignee_staff_id,
        "responsible_staff": responsible_staff,
        "kpi": None,
        "coordinating_dept_ids": coordinating_dept_ids,
        "program_id": t.program_id,
        "incoming_document_id": t.incoming_document_id,
        "outgoing_document_id": t.outgoing_document_id,
        "directive_id": t.directive_id,
        "creator": creator_dict,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


async def _get_or_404(db: AsyncSession, task_id: int) -> Task:
    t = (await db.execute(
        select(Task).where(Task.id == task_id, Task.task_type == "nq57", Task.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Không tìm thấy nhiệm vụ NQ57")
    return t


async def _full_detail(db: AsyncSession, task_id: int) -> Task:
    stmt = (
        select(Task)
        .options(*_DETAIL_LOADS)
        .where(Task.id == task_id, Task.task_type == "nq57", Task.deleted_at.is_(None))
    )
    t = (await db.execute(stmt)).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Không tìm thấy nhiệm vụ NQ57")
    return t


async def _with_relations(db: AsyncSession, task_id: int) -> Task:
    stmt = (
        select(Task)
        .options(*_LIST_LOADS)
        .where(Task.id == task_id, Task.task_type == "nq57", Task.deleted_at.is_(None))
    )
    return (await db.execute(stmt)).scalar_one()


async def _set_departments(
    db: AsyncSession, task: Task,
    lead_dept_id: int | None,
    coordinating_ids: list[int],
) -> None:
    await db.execute(delete(TaskDepartment).where(TaskDepartment.task_id == task.id))
    await db.flush()
    if lead_dept_id:
        db.add(TaskDepartment(task_id=task.id, department_id=lead_dept_id, role="lead"))
    for dept_id in coordinating_ids:
        if dept_id != lead_dept_id:
            db.add(TaskDepartment(task_id=task.id, department_id=dept_id, role="coordinating"))


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[NQ57TaskRead])
async def list_nq57(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    nq57_status: str | None = Query(None, alias="status"),
    group: str | None = Query(None),
    overdue_only: bool = Query(False),
    department_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conditions = [Task.deleted_at.is_(None), Task.task_type == "nq57"]
    if search:
        conditions.append(or_(
            Task.title.ilike(f"%{search}%"),
            Task.task_code.ilike(f"%{search}%"),
        ))
    if nq57_status:
        if nq57_status == "delayed":
            today = datetime.now(timezone.utc)
            conditions.append(and_(
                Task.due_date.isnot(None),
                Task.due_date < today,
                Task.status != "completed",
            ))
        else:
            conditions.append(Task.status == nq57_status)
    if group:
        conditions.append(Task.task_group == group)
    if department_id:
        conditions.append(Task.lead_department_id == department_id)
    if overdue_only:
        today = datetime.now(timezone.utc)
        conditions.append(and_(
            Task.due_date.isnot(None),
            Task.due_date < today,
            Task.status != "completed",
        ))

    base_q = select(Task).where(*conditions)
    total = (await db.execute(select(func.count()).select_from(base_q.subquery()))).scalar_one()

    stmt = (
        base_q
        .options(*_LIST_LOADS)
        .order_by(Task.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    items = (await db.execute(stmt)).scalars().all()
    return PaginatedResponse(
        items=[NQ57TaskRead.model_validate(_task_to_nq57(t)) for t in items],
        total=total, page=page, size=size,
        pages=max(1, ceil(total / size)),
    )


@router.post("", response_model=NQ57TaskRead, status_code=status.HTTP_201_CREATED)
async def create_nq57(
    body: NQ57TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    due_date: datetime | None = None
    if body.deadline:
        due_date = datetime(body.deadline.year, body.deadline.month, body.deadline.day,
                            23, 59, 59, tzinfo=timezone.utc)

    t = Task(
        task_code=body.code,
        title=body.title,
        description=body.description,
        task_group=body.group,
        expected_output=body.target,
        progress_percent=body.progress,
        status=body.status if body.status != "delayed" else "in_progress",
        priority="medium",
        start_date=body.start_date,
        due_date=due_date,
        lead_department_id=body.responsible_department_id,
        assignee_id=body.responsible_user_id,
        assignee_staff_id=body.responsible_staff_id,
        incoming_document_id=body.incoming_document_id,
        outgoing_document_id=body.outgoing_document_id,
        directive_id=body.directive_id,
        program_id=body.program_id,
        task_type="nq57",
        created_by=current_user.id,
    )
    db.add(t)
    await db.flush()
    await _set_departments(db, t, body.responsible_department_id, body.coordinating_dept_ids)
    await db.commit()
    return NQ57TaskRead.model_validate(_task_to_nq57(await _with_relations(db, t.id)))


@router.get("/stats", response_model=NQ57Stats)
async def get_nq57_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = datetime.now(timezone.utc)
    base_cond = and_(Task.deleted_at.is_(None), Task.task_type == "nq57")
    row = (await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((Task.status == "pending",     1), else_=0)).label("pending"),
            func.sum(case((Task.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((Task.status == "completed",   1), else_=0)).label("completed"),
            func.sum(case(
                (and_(
                    Task.status != "completed",
                    Task.due_date.isnot(None),
                    Task.due_date < today,
                ), 1),
                else_=0,
            )).label("delayed"),
            func.avg(Task.progress_percent).label("avg_progress"),
        ).where(base_cond)
    )).one()
    return NQ57Stats(
        total=row.total or 0,
        pending=row.pending or 0,
        in_progress=row.in_progress or 0,
        completed=row.completed or 0,
        delayed=row.delayed or 0,
        avg_progress=round(float(row.avg_progress or 0), 1),
    )


@router.get("/groups", response_model=list[str])
async def get_groups(_: User = Depends(get_current_user)):
    return NQ57_GROUPS


# ─── Single task ──────────────────────────────────────────────────────────────

@router.get("/{task_id}", response_model=NQ57TaskReadDetail)
async def get_nq57(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = await _full_detail(db, task_id)
    d = _task_to_nq57(t)
    doc_in = t.incoming_document
    doc_out = t.outgoing_document
    directive = t.directive
    d["incoming_document"] = (
        {"id": doc_in.id, "doc_number": getattr(doc_in, "doc_number", None), "title": doc_in.title}
        if doc_in else None
    )
    d["outgoing_document"] = (
        {"id": doc_out.id, "doc_number": getattr(doc_out, "doc_number", None), "title": doc_out.title}
        if doc_out else None
    )
    d["directive"] = (
        {"id": directive.id, "title": directive.title}
        if directive else None
    )
    d["progress_entries"] = []
    return NQ57TaskReadDetail.model_validate(d)


@router.put("/{task_id}", response_model=NQ57TaskRead)
async def update_nq57(
    task_id: int,
    body: NQ57TaskUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = await _get_or_404(db, task_id)

    if body.code is not None:
        t.task_code = body.code
    if body.title is not None:
        t.title = body.title
    if body.description is not None:
        t.description = body.description
    if body.group is not None:
        t.task_group = body.group
    if body.target is not None:
        t.expected_output = body.target
    if body.progress is not None:
        t.progress_percent = body.progress
    if body.status is not None:
        t.status = body.status if body.status != "delayed" else "in_progress"
    if body.start_date is not None:
        t.start_date = body.start_date
    if body.deadline is not None:
        t.due_date = datetime(body.deadline.year, body.deadline.month, body.deadline.day,
                              23, 59, 59, tzinfo=timezone.utc)
    if body.responsible_department_id is not None:
        t.lead_department_id = body.responsible_department_id
    if body.responsible_user_id is not None:
        t.assignee_id = body.responsible_user_id
    if body.responsible_staff_id is not None:
        t.assignee_staff_id = body.responsible_staff_id
    if body.incoming_document_id is not None:
        t.incoming_document_id = body.incoming_document_id
    if body.outgoing_document_id is not None:
        t.outgoing_document_id = body.outgoing_document_id
    if body.directive_id is not None:
        t.directive_id = body.directive_id
    if body.program_id is not None:
        t.program_id = body.program_id
    if body.coordinating_dept_ids is not None:
        await _set_departments(db, t, t.lead_department_id, body.coordinating_dept_ids)

    await db.commit()
    return NQ57TaskRead.model_validate(_task_to_nq57(await _with_relations(db, t.id)))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nq57(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = await _get_or_404(db, task_id)
    t.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ─── Progress ─────────────────────────────────────────────────────────────────

@router.post("/{task_id}/progress", status_code=status.HTTP_201_CREATED)
async def record_progress(
    task_id: int,
    body: NQ57ProgressCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_or_404(db, task_id)
    prog = max(0, min(100, body.progress))
    t.progress_percent = prog
    if prog >= 100 and t.status != "completed":
        t.status = "completed"
    elif prog > 0 and t.status == "pending":
        t.status = "in_progress"

    await db.commit()
    return {
        "id": 0,
        "task_id": task_id,
        "progress": prog,
        "note": body.note,
        "user": {"id": current_user.id, "username": current_user.username, "full_name": current_user.full_name},
        "created_at": datetime.now(timezone.utc),
    }


# ── Excel Import ──────────────────────────────────────────────────────────────

@router.get("/import/template")
async def download_nq57_template(_: User = Depends(get_current_user)):
    from app.services.excel_import import nq57_template
    data = nq57_template()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=mau_import_nq57.xlsx"},
    )


@router.post("/import")
async def import_nq57_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.excel_import import parse_nq57
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Chỉ chấp nhận file .xlsx hoặc .xls")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "File không được vượt quá 5 MB")

    records, errors = parse_nq57(data)
    if not records and errors:
        raise HTTPException(422, {"errors": errors})

    imported = 0
    for r in records:
        deadline = None
        if r.get("deadline_str"):
            try:
                d = datetime.strptime(r["deadline_str"], "%d/%m/%Y").date()
                deadline = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=timezone.utc)
            except ValueError:
                pass
        task = Task(
            task_code=r.get("code"),
            title=r["title"],
            task_group=r.get("group"),
            expected_output=r.get("target"),
            description=None,
            progress_percent=r.get("progress", 0),
            status=r.get("status", "pending"),
            priority="medium",
            due_date=deadline,
            task_type="nq57",
            created_by=current_user.id,
        )
        db.add(task)
        imported += 1

    await db.commit()
    return {"imported": imported, "errors": errors}
