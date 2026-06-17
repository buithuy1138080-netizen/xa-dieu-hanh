import shutil
from datetime import date, datetime, timezone
from math import ceil
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin_or_leader
from app.models.staff import Staff
from app.models.directive import (
    Directive,
    DirectiveAttachment,
    DirectiveComment,
    DirectiveHistory,
    DirectiveTask,
    DirectiveUnit,
)
from app.models.task import Task, TaskAuditLog
from app.models.user import User
from app.schemas.directive import (
    DirectiveAttachmentRead,
    DirectiveCommentCreate,
    DirectiveCommentRead,
    DirectiveCreate,
    DirectiveHistoryRead,
    DirectiveRead,
    DirectiveReadDetail,
    DirectiveStatusUpdate,
    DirectiveTaskCreate,
    DirectiveTaskRead,
    DirectiveUnitCreate,
    DirectiveUnitRead,
    DirectiveUnitUpdate,
    DirectiveUpdate,
    PaginatedResponse,
)

from app.core.config import settings as _settings
router = APIRouter()
DIR_UPLOAD = Path(_settings.UPLOAD_DIR) / "directives"
DIR_UPLOAD.mkdir(parents=True, exist_ok=True)

VALID_STATUSES = {"draft", "active", "completed", "cancelled"}
ALLOWED_UPLOAD_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, directive_id: int) -> Directive:
    d = (await db.execute(
        select(Directive).where(Directive.id == directive_id, Directive.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Không tìm thấy chỉ đạo")
    return d


async def _with_relations(db: AsyncSession, directive_id: int) -> Directive:
    stmt = (
        select(Directive)
        .options(
            selectinload(Directive.issuer),
            selectinload(Directive.creator),
            selectinload(Directive.document),
            selectinload(Directive.assignee_staff),
            selectinload(Directive.responsible_department),
        )
        .where(Directive.id == directive_id)
    )
    return (await db.execute(stmt)).scalar_one()


async def _full_detail(db: AsyncSession, directive_id: int) -> Directive:
    from app.models.department import Department
    stmt = (
        select(Directive)
        .options(
            selectinload(Directive.issuer),
            selectinload(Directive.creator),
            selectinload(Directive.document),
            selectinload(Directive.assignee_staff),
            selectinload(Directive.responsible_department),
            selectinload(Directive.units).selectinload(DirectiveUnit.user),
            selectinload(Directive.units).selectinload(DirectiveUnit.department),
            selectinload(Directive.linked_tasks)
            .selectinload(DirectiveTask.task)
            .selectinload(Task.assignee),
            selectinload(Directive.comments).selectinload(DirectiveComment.user),
            selectinload(Directive.history).selectinload(DirectiveHistory.user),
            selectinload(Directive.attachments).selectinload(DirectiveAttachment.user),
        )
        .where(Directive.id == directive_id, Directive.deleted_at.is_(None))
    )
    d = (await db.execute(stmt)).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Không tìm thấy chỉ đạo")
    return d


def _add_history(
    db: AsyncSession,
    directive_id: int,
    user_id: int,
    action: str,
    old_status: str | None = None,
    new_status: str | None = None,
    old_progress: int | None = None,
    new_progress: int | None = None,
    note: str | None = None,
) -> None:
    db.add(DirectiveHistory(
        directive_id=directive_id, user_id=user_id, action=action,
        old_status=old_status, new_status=new_status,
        old_progress=old_progress, new_progress=new_progress, note=note,
    ))


async def _recalc_progress(db: AsyncSession, directive: Directive) -> int:
    units = (await db.execute(
        select(DirectiveUnit).where(DirectiveUnit.directive_id == directive.id)
    )).scalars().all()

    if units:
        new_prog = int(sum(u.progress for u in units) / len(units))
    else:
        rows = (await db.execute(
            select(Task.status)
            .join(DirectiveTask, DirectiveTask.task_id == Task.id)
            .where(
                DirectiveTask.directive_id == directive.id,
                Task.deleted_at.is_(None),
            )
        )).all()
        if rows:
            done = sum(1 for r in rows if r[0] == "completed")
            new_prog = int(done / len(rows) * 100)
        else:
            return directive.progress

    old_prog = directive.progress
    directive.progress = new_prog
    if new_prog >= 100 and directive.status == "active":
        directive.status = "completed"
        _add_history(db, directive.id, directive.issuer_id, "auto_completed",
                     old_status="active", new_status="completed",
                     old_progress=old_prog, new_progress=new_prog)
    return new_prog


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[DirectiveRead])
async def list_directives(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    dir_status: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    issuer_id: int | None = Query(None),
    overdue_only: bool = Query(False),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Directive.deleted_at.is_(None)]
    if search:
        conditions.append(or_(
            Directive.title.ilike(f"%{search}%"),
            Directive.content.ilike(f"%{search}%"),
        ))
    if dir_status:
        conditions.append(Directive.status == dir_status)
    if priority:
        conditions.append(Directive.priority == priority)
    if issuer_id:
        conditions.append(Directive.issuer_id == issuer_id)
    if overdue_only:
        now = datetime.now(timezone.utc)
        conditions.append(Directive.deadline.isnot(None))
        conditions.append(Directive.deadline < now)
        conditions.append(Directive.status == "active")
    if from_date:
        try:
            conditions.append(Directive.issued_date >= date.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        try:
            conditions.append(Directive.issued_date <= date.fromisoformat(to_date))
        except ValueError:
            pass

    # Lọc theo đơn vị: manager/staff chỉ thấy chỉ đạo của đơn vị mình (chủ trì + phối hợp)
    if current_user.role not in ("admin", "leader"):
        staff = (await db.execute(
            select(Staff).where(Staff.user_id == current_user.id)
        )).scalar_one_or_none()
        dept_id = staff.department_id if staff else None
        if dept_id:
            conditions.append(or_(
                Directive.responsible_department_id == dept_id,
                Directive.id.in_(
                    select(DirectiveUnit.directive_id).where(
                        DirectiveUnit.department_id == dept_id
                    )
                ),
            ))

    count_stmt = select(func.count(Directive.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Directive)
        .options(
            selectinload(Directive.issuer),
            selectinload(Directive.creator),
            selectinload(Directive.document),
            selectinload(Directive.assignee_staff),
            selectinload(Directive.responsible_department),
        )
        .where(*conditions)
        .order_by(Directive.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    directives = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse(
        items=list(directives),
        total=total,
        page=page,
        size=size,
        pages=max(1, ceil(total / size)),
    )


async def _add_coordinating_units(
    db: AsyncSession, directive_id: int, dept_ids: list[int]
) -> None:
    if not dept_ids:
        return
    from app.models.department import Department
    rows = (await db.execute(
        select(Department.id, Department.name, Department.short_name)
        .where(Department.id.in_(dept_ids))
    )).all()
    names = {r.id: r.short_name or r.name for r in rows}
    for dept_id in dept_ids:
        db.add(DirectiveUnit(
            directive_id=directive_id,
            unit_name=names.get(dept_id, f"Đơn vị #{dept_id}"),
            department_id=dept_id,
            role="Phối hợp",
            progress=0,
        ))


@router.post("", response_model=DirectiveRead, status_code=status.HTTP_201_CREATED)
async def create_directive(
    body: DirectiveCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    coordinating_ids = body.coordinating_dept_ids or []
    d = Directive(**body.model_dump(exclude={"coordinating_dept_ids"}), created_by=current_user.id, progress=0)
    db.add(d)
    await db.flush()
    await _add_coordinating_units(db, d.id, coordinating_ids)
    _add_history(db, d.id, current_user.id, "created", new_status=d.status)
    await db.commit()
    return await _with_relations(db, d.id)


# ─── Detail / Update / Delete ────────────────────────────────────────────────

@router.get("/{directive_id}", response_model=DirectiveReadDetail)
async def get_directive(
    directive_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _full_detail(db, directive_id)


@router.put("/{directive_id}", response_model=DirectiveRead)
async def update_directive(
    directive_id: int,
    body: DirectiveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    d = await _get_or_404(db, directive_id)
    changes = body.model_dump(exclude_unset=True, exclude={"coordinating_dept_ids"})
    for field, value in changes.items():
        setattr(d, field, value)
    if "coordinating_dept_ids" in body.model_fields_set:
        await db.execute(
            delete(DirectiveUnit).where(
                DirectiveUnit.directive_id == directive_id,
                DirectiveUnit.role == "Phối hợp",
            )
        )
        await _add_coordinating_units(db, directive_id, body.coordinating_dept_ids or [])
    _add_history(db, d.id, current_user.id, "updated")
    await db.commit()
    return await _with_relations(db, directive_id)


@router.delete("/{directive_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_directive(
    directive_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    d = await _get_or_404(db, directive_id)
    d.deleted_at = datetime.now(timezone.utc)
    _add_history(db, directive_id, current_user.id, "deleted")
    await db.commit()


@router.post("/{directive_id}/restore", response_model=DirectiveRead)
async def restore_directive(
    directive_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader để khôi phục chỉ đạo")
    d = (await db.execute(
        select(Directive).where(Directive.id == directive_id, Directive.deleted_at.isnot(None))
    )).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Không tìm thấy chỉ đạo đã xóa")
    d.deleted_at = None
    _add_history(db, directive_id, current_user.id, "restored")
    await db.commit()
    return await _with_relations(db, directive_id)


# ─── Status ───────────────────────────────────────────────────────────────────

@router.patch("/{directive_id}/status", response_model=DirectiveRead)
async def update_status(
    directive_id: int,
    body: DirectiveStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader", "manager", "staff"):
        raise HTTPException(403, "Không có quyền thay đổi trạng thái chỉ đạo")
    if current_user.role in ("manager", "staff") and body.status != "completed":
        raise HTTPException(403, "Quản lý/nhân viên chỉ được đánh dấu Hoàn thành")
    if body.status not in VALID_STATUSES:
        raise HTTPException(422, f"Trạng thái không hợp lệ: {body.status}")
    d = await _get_or_404(db, directive_id)
    old = d.status
    d.status = body.status
    _add_history(db, d.id, current_user.id, "status_changed",
                 old_status=old, new_status=body.status, note=body.note)
    await db.commit()
    return await _with_relations(db, directive_id)


# ─── Units ────────────────────────────────────────────────────────────────────

@router.post("/{directive_id}/units", response_model=DirectiveUnitRead,
             status_code=status.HTTP_201_CREATED)
async def add_unit(
    directive_id: int,
    body: DirectiveUnitCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    d = await _get_or_404(db, directive_id)
    unit = DirectiveUnit(directive_id=directive_id, **body.model_dump())
    db.add(unit)
    await db.flush()
    await _recalc_progress(db, d)
    _add_history(db, directive_id, current_user.id, "unit_added", note=body.unit_name)
    await db.commit()
    stmt = (
        select(DirectiveUnit)
        .options(selectinload(DirectiveUnit.user), selectinload(DirectiveUnit.department))
        .where(DirectiveUnit.id == unit.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.patch("/{directive_id}/units/{unit_id}", response_model=DirectiveUnitRead)
async def update_unit_progress(
    directive_id: int,
    unit_id: int,
    body: DirectiveUnitUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    unit = (await db.execute(
        select(DirectiveUnit).where(
            DirectiveUnit.id == unit_id,
            DirectiveUnit.directive_id == directive_id,
        )
    )).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị")

    old_prog = unit.progress
    unit.progress = max(0, min(100, body.progress))
    if body.note is not None:
        unit.note = body.note

    d = await _get_or_404(db, directive_id)
    new_prog = await _recalc_progress(db, d)

    _add_history(db, directive_id, current_user.id, "progress_updated",
                 old_progress=old_prog, new_progress=new_prog,
                 note=f"{unit.unit_name}: {old_prog}% → {unit.progress}%")
    await db.commit()

    stmt = (
        select(DirectiveUnit)
        .options(selectinload(DirectiveUnit.user), selectinload(DirectiveUnit.department))
        .where(DirectiveUnit.id == unit_id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/{directive_id}/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_unit(
    directive_id: int,
    unit_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    unit = (await db.execute(
        select(DirectiveUnit).where(
            DirectiveUnit.id == unit_id, DirectiveUnit.directive_id == directive_id
        )
    )).scalar_one_or_none()
    if not unit:
        raise HTTPException(404, "Không tìm thấy đơn vị")
    _add_history(db, directive_id, current_user.id, "unit_removed", note=unit.unit_name)
    await db.delete(unit)
    d = await _get_or_404(db, directive_id)
    await _recalc_progress(db, d)
    await db.commit()


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.post("/{directive_id}/tasks", response_model=DirectiveTaskRead,
             status_code=status.HTTP_201_CREATED)
async def create_task_from_directive(
    directive_id: int,
    body: DirectiveTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = await _get_or_404(db, directive_id)

    from app.api.v1.endpoints.tasks import _make_task_code

    task = Task(
        task_code=None,
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=body.deadline,
        assignee_id=body.assignee_id,
        assignee_staff_id=body.assignee_staff_id,
        created_by=current_user.id,
        status="pending",
        progress_percent=0,
        directive_id=directive_id,
    )
    db.add(task)
    await db.flush()
    task.task_code = _make_task_code(task.id)

    db.add(TaskAuditLog(
        task_id=task.id, user_id=current_user.id,
        action="created", new_value=f"Từ chỉ đạo #{directive_id}",
    ))

    link = DirectiveTask(directive_id=directive_id, task_id=task.id)
    db.add(link)
    _add_history(db, directive_id, current_user.id, "task_created", note=body.title)

    await _recalc_progress(db, d)
    await db.flush()
    await db.commit()

    stmt = (
        select(DirectiveTask)
        .options(selectinload(DirectiveTask.task).selectinload(Task.assignee))
        .where(DirectiveTask.id == link.id)
    )
    return (await db.execute(stmt)).scalar_one()


# ─── Comments ─────────────────────────────────────────────────────────────────

@router.post("/{directive_id}/comments", response_model=DirectiveCommentRead,
             status_code=status.HTTP_201_CREATED)
async def add_comment(
    directive_id: int,
    body: DirectiveCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_or_404(db, directive_id)
    c = DirectiveComment(directive_id=directive_id, user_id=current_user.id, content=body.content)
    db.add(c)
    _add_history(db, directive_id, current_user.id, "commented")
    await db.flush()
    await db.commit()
    stmt = (
        select(DirectiveComment)
        .options(selectinload(DirectiveComment.user))
        .where(DirectiveComment.id == c.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/{directive_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    directive_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = (await db.execute(
        select(DirectiveComment).where(
            DirectiveComment.id == comment_id,
            DirectiveComment.directive_id == directive_id,
        )
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Không tìm thấy bình luận")
    if c.user_id != current_user.id:
        raise HTTPException(403, "Không có quyền xóa bình luận này")
    await db.delete(c)
    await db.commit()


# ─── Attachments ──────────────────────────────────────────────────────────────

@router.post("/{directive_id}/attachments", response_model=DirectiveAttachmentRead,
             status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    directive_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_or_404(db, directive_id)
    original_name = Path(file.filename or "file").name
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise HTTPException(
            400,
            f"Định dạng file không được phép: '{ext or 'không rõ'}'. "
            f"Chấp nhận: {', '.join(sorted(ALLOWED_UPLOAD_EXTS))}"
        )
    import uuid as _uuid
    d_dir = DIR_UPLOAD / str(directive_id)
    d_dir.mkdir(exist_ok=True)
    stored_name = f"{_uuid.uuid4().hex}{ext}"
    file_path = d_dir / stored_name
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    att = DirectiveAttachment(
        directive_id=directive_id,
        user_id=current_user.id,
        filename=original_name,    # original name shown to user
        file_path=str(file_path),  # UUID-based path on disk
        file_size=file_path.stat().st_size,
        file_mime=file.content_type or "application/octet-stream",
    )
    db.add(att)
    _add_history(db, directive_id, current_user.id, "attachment_added", note=original_name)
    await db.flush()
    await db.commit()

    stmt = (
        select(DirectiveAttachment)
        .options(selectinload(DirectiveAttachment.user))
        .where(DirectiveAttachment.id == att.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/{directive_id}/attachments/{att_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    directive_id: int,
    att_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = (await db.execute(
        select(DirectiveAttachment).where(
            DirectiveAttachment.id == att_id,
            DirectiveAttachment.directive_id == directive_id,
        )
    )).scalar_one_or_none()
    if not att:
        raise HTTPException(404, "Không tìm thấy file")
    p = Path(att.file_path)
    if p.exists():
        p.unlink()
    _add_history(db, directive_id, current_user.id, "attachment_removed", note=att.filename)
    await db.delete(att)
    await db.commit()


@router.get("/{directive_id}/attachments/{att_id}/download")
async def download_attachment(
    directive_id: int,
    att_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = (await db.execute(
        select(DirectiveAttachment).where(
            DirectiveAttachment.id == att_id,
            DirectiveAttachment.directive_id == directive_id,
        )
    )).scalar_one_or_none()
    if not att:
        raise HTTPException(404, "Không tìm thấy file")
    p = Path(att.file_path)
    if not p.exists():
        raise HTTPException(404, "File không tồn tại")
    return FileResponse(path=str(p), filename=att.filename, media_type=att.file_mime or "application/octet-stream")
