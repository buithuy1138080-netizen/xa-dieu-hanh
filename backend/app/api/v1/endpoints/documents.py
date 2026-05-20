import shutil
from datetime import datetime, timezone
from math import ceil
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.department import Department
from app.models.document import Document, DocumentComment, DocumentHistory, DocumentTask
from app.models.staff import Staff
from app.models.task import Task, TaskAuditLog
from app.models.user import User
from app.schemas.document import (
    DocumentCommentCreate,
    DocumentCommentRead,
    DocumentCreate,
    DocumentHistoryRead,
    DocumentRead,
    DocumentReadDetail,
    DocumentStatusUpdate,
    DocumentTaskCreate,
    DocumentTaskRead,
    DocumentUpdate,
    PaginatedResponse,
)

from app.core.config import settings as _settings
router = APIRouter()
DOC_UPLOAD_DIR = Path(_settings.UPLOAD_DIR) / "documents"
DOC_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

VALID_STATUSES = {"pending", "processing", "done", "archived"}
VALID_TYPES = {"incoming", "outgoing", "internal"}
VALID_PRIORITIES = {"normal", "urgent", "very_urgent"}
ALLOWED_UPLOAD_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_doc_or_404(db: AsyncSession, doc_id: int) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.deleted_at.is_(None))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
    return doc


async def _doc_with_relations(db: AsyncSession, doc_id: int) -> Document:
    stmt = (
        select(Document)
        .options(
            selectinload(Document.creator),
            selectinload(Document.assignee),
            selectinload(Document.responsible_department),
            selectinload(Document.assignee_staff),
        )
        .where(Document.id == doc_id, Document.deleted_at.is_(None))
    )
    return (await db.execute(stmt)).scalar_one()


async def _doc_detail(db: AsyncSession, doc_id: int) -> Document:
    stmt = (
        select(Document)
        .options(
            selectinload(Document.creator),
            selectinload(Document.assignee),
            selectinload(Document.responsible_department),
            selectinload(Document.assignee_staff),
            selectinload(Document.comments).selectinload(DocumentComment.user),
            selectinload(Document.history).selectinload(DocumentHistory.user),
            selectinload(Document.linked_tasks)
            .selectinload(DocumentTask.task)
            .selectinload(Task.assignee),
        )
        .where(Document.id == doc_id, Document.deleted_at.is_(None))
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy văn bản")
    return doc


def _add_history(
    db: AsyncSession,
    doc_id: int,
    user_id: int,
    action: str,
    old_status: str | None = None,
    new_status: str | None = None,
    note: str | None = None,
) -> None:
    db.add(DocumentHistory(
        doc_id=doc_id,
        user_id=user_id,
        action=action,
        old_status=old_status,
        new_status=new_status,
        note=note,
    ))


# ─── List / Create ────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[DocumentRead])
async def list_documents(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
    search: str | None = Query(None),
    doc_type: str | None = Query(None),
    doc_status: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    issuer: str | None = Query(None),
    assignee_id: int | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Document.deleted_at.is_(None)]
    if search:
        conditions.append(or_(
            Document.title.ilike(f"%{search}%"),
            Document.doc_number.ilike(f"%{search}%"),
            Document.issuer.ilike(f"%{search}%"),
        ))
    if doc_type:
        conditions.append(Document.doc_type == doc_type)
    if doc_status:
        conditions.append(Document.status == doc_status)
    if priority:
        conditions.append(Document.priority == priority)
    if issuer:
        conditions.append(Document.issuer.ilike(f"%{issuer}%"))
    if assignee_id:
        conditions.append(Document.assignee_id == assignee_id)
    if from_date:
        from datetime import date
        try:
            conditions.append(Document.issue_date >= date.fromisoformat(from_date))
        except ValueError:
            pass
    if to_date:
        from datetime import date
        try:
            conditions.append(Document.issue_date <= date.fromisoformat(to_date))
        except ValueError:
            pass

    count_stmt = select(func.count(Document.id)).where(*conditions)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Document)
        .options(
            selectinload(Document.creator),
            selectinload(Document.assignee),
            selectinload(Document.responsible_department),
            selectinload(Document.assignee_staff),
        )
        .where(*conditions)
        .order_by(Document.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    docs = (await db.execute(stmt)).scalars().all()

    return PaginatedResponse(
        items=list(docs),
        total=total,
        page=page,
        size=size,
        pages=max(1, ceil(total / size)),
    )


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def create_document(
    body: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = Document(**body.model_dump(), created_by=current_user.id)
    db.add(doc)
    await db.flush()
    _add_history(db, doc.id, current_user.id, "created")
    await db.commit()
    return await _doc_with_relations(db, doc.id)


# ─── Detail / Update / Delete ────────────────────────────────────────────────

@router.get("/{doc_id}", response_model=DocumentReadDetail)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _doc_detail(db, doc_id)


@router.put("/{doc_id}", response_model=DocumentRead)
async def update_document(
    doc_id: int,
    body: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader", "manager"):
        raise HTTPException(403, "Cần quyền admin, leader hoặc manager để cập nhật văn bản")
    doc = await _get_doc_or_404(db, doc_id)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(doc, field, value)
    _add_history(db, doc.id, current_user.id, "updated")
    await db.commit()
    return await _doc_with_relations(db, doc_id)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader", "manager"):
        raise HTTPException(403, "Cần quyền admin, leader hoặc manager để xóa văn bản")
    doc = await _get_doc_or_404(db, doc_id)
    doc.deleted_at = datetime.now(timezone.utc)
    _add_history(db, doc.id, current_user.id, "deleted")
    await db.commit()


@router.post("/{doc_id}/restore", response_model=DocumentRead)
async def restore_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader để khôi phục văn bản")
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.deleted_at.isnot(None))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Không tìm thấy văn bản đã xóa")
    doc.deleted_at = None
    _add_history(db, doc.id, current_user.id, "restored")
    await db.commit()
    return await _doc_with_relations(db, doc_id)


# ─── Status ───────────────────────────────────────────────────────────────────

@router.patch("/{doc_id}/status", response_model=DocumentRead)
async def update_status(
    doc_id: int,
    body: DocumentStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader", "manager"):
        raise HTTPException(403, "Cần quyền admin, leader hoặc manager để thay đổi trạng thái văn bản")
    if body.status not in VALID_STATUSES:
        raise HTTPException(422, f"Trạng thái không hợp lệ: {body.status}")
    doc = await _get_doc_or_404(db, doc_id)
    old = doc.status
    doc.status = body.status
    _add_history(db, doc.id, current_user.id, "status_changed",
                 old_status=old, new_status=body.status, note=body.note)
    await db.commit()
    return await _doc_with_relations(db, doc_id)


# ─── File Upload / Serve ──────────────────────────────────────────────────────

@router.post("/{doc_id}/file", response_model=DocumentRead)
async def upload_file(
    doc_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_doc_or_404(db, doc_id)

    safe_name = Path(file.filename or "file").name
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise HTTPException(
            400,
            f"Định dạng file không được phép: '{ext or 'không rõ'}'. "
            f"Chấp nhận: {', '.join(sorted(ALLOWED_UPLOAD_EXTS))}"
        )

    doc_dir = DOC_UPLOAD_DIR / str(doc_id)
    doc_dir.mkdir(exist_ok=True)

    # remove old file
    if doc.file_path:
        old = Path(doc.file_path)
        if old.exists():
            old.unlink()
    file_path = doc_dir / safe_name
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc.file_name = safe_name
    doc.file_path = str(file_path)
    doc.file_size = file_path.stat().st_size
    doc.file_mime = file.content_type or "application/octet-stream"

    _add_history(db, doc.id, current_user.id, "file_uploaded", note=safe_name)
    await db.commit()
    return await _doc_with_relations(db, doc_id)


@router.get("/{doc_id}/file")
async def serve_file(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_doc_or_404(db, doc_id)
    if not doc.file_path:
        raise HTTPException(404, "Văn bản chưa có file đính kèm")
    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(404, "File không tồn tại trên server")

    mime = doc.file_mime or "application/octet-stream"
    disposition = "inline" if mime == "application/pdf" else "attachment"
    return FileResponse(
        path=str(path),
        filename=doc.file_name,
        media_type=mime,
        headers={"Content-Disposition": f'{disposition}; filename="{doc.file_name}"'},
    )


# ─── Comments ─────────────────────────────────────────────────────────────────

@router.post("/{doc_id}/comments", response_model=DocumentCommentRead,
             status_code=status.HTTP_201_CREATED)
async def add_comment(
    doc_id: int,
    body: DocumentCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_doc_or_404(db, doc_id)
    comment = DocumentComment(doc_id=doc_id, user_id=current_user.id, content=body.content)
    db.add(comment)
    _add_history(db, doc_id, current_user.id, "commented")
    await db.flush()
    await db.commit()
    stmt = (
        select(DocumentComment)
        .options(selectinload(DocumentComment.user))
        .where(DocumentComment.id == comment.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/{doc_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    doc_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentComment).where(
            DocumentComment.id == comment_id,
            DocumentComment.doc_id == doc_id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(404, "Không tìm thấy bình luận")
    if comment.user_id != current_user.id:
        raise HTTPException(403, "Không có quyền xóa bình luận này")
    await db.delete(comment)
    await db.commit()


# ─── Tasks from Document ──────────────────────────────────────────────────────

@router.post("/{doc_id}/tasks", response_model=DocumentTaskRead,
             status_code=status.HTTP_201_CREATED)
async def create_task_from_doc(
    doc_id: int,
    body: DocumentTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_doc_or_404(db, doc_id)

    from app.api.v1.endpoints.tasks import _next_task_code
    task_code = await _next_task_code(db)

    task = Task(
        task_code=task_code,
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=body.deadline,
        assignee_id=body.assignee_id,
        created_by=current_user.id,
        status="pending",
        progress_percent=0,
    )
    db.add(task)
    await db.flush()

    db.add(TaskAuditLog(
        task_id=task.id,
        user_id=current_user.id,
        action="created",
        new_value=f"Từ văn bản #{doc_id}",
    ))

    link = DocumentTask(doc_id=doc_id, task_id=task.id)
    db.add(link)
    _add_history(db, doc_id, current_user.id, "task_created", note=body.title)

    await db.flush()
    await db.commit()

    stmt = (
        select(DocumentTask)
        .options(
            selectinload(DocumentTask.task).selectinload(Task.assignee)
        )
        .where(DocumentTask.id == link.id)
    )
    return (await db.execute(stmt)).scalar_one()
