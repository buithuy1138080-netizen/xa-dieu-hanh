"""OCR & AI Document Understanding endpoint."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.deps import get_current_user, get_db
from app.models.document import Document
from app.models.ocr_document import OcrDocument, OcrDocumentTask
from app.models.task import Task
from app.models.user import User
from app.schemas.ocr_document import (
    OcrConfirmRequest, OcrConfirmResult, OcrDocumentList,
    OcrDocumentRead, OcrUpdateAiResult,
)
from app.services import ai_parser_service, ocr_service

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}
_MAX_BYTES = 20 * 1024 * 1024  # 20 MB


async def _get_ocr_with_tasks(db: AsyncSession, ocr_id: int) -> OcrDocument | None:
    """Load OcrDocument with linked_tasks eagerly to avoid lazy-load in async context."""
    result = await db.execute(
        select(OcrDocument)
        .options(selectinload(OcrDocument.linked_tasks))
        .where(OcrDocument.id == ocr_id)
    )
    return result.scalar_one_or_none()


# ── Upload ──────────────────────────────────────────────────────────────────

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_for_ocr(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF/image file. OCR runs asynchronously; poll GET /ocr/{id}."""
    if current_user.role not in ("admin", "leader", "manager"):
        raise HTTPException(403, "Cần quyền admin, leader hoặc manager")
    fname = file.filename or "upload.bin"
    ext = Path(fname).suffix.lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(400, f"Chỉ hỗ trợ PDF, JPG, PNG. Nhận được: {ext or 'không rõ'}")

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(400, "File quá lớn (tối đa 20 MB)")

    file_path = ocr_service.save_upload(content, fname)

    doc = OcrDocument(
        filename=fname,
        file_path=str(file_path),
        file_type=ext.lstrip("."),
        file_size=len(content),
        status="pending",
        created_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(_run_ocr_pipeline, doc.id)
    return {"id": doc.id, "status": "pending", "filename": fname}


# ── Background OCR pipeline ─────────────────────────────────────────────────

async def _run_ocr_pipeline(ocr_id: int) -> None:
    async with AsyncSessionLocal() as db:
        doc: OcrDocument | None = await db.get(OcrDocument, ocr_id)
        if not doc:
            return
        try:
            doc.status = "processing"
            await db.commit()

            file_path = Path(doc.file_path)

            # Gemini Vision pipeline — runs OCR + AI extraction in one pass
            ai_result = await asyncio.to_thread(
                ai_parser_service.parse_file_with_vision, file_path
            )
            doc.ai_result = ai_result

            # Also store raw OCR text for search/display
            text, page_count = await asyncio.to_thread(
                ocr_service.ocr_file, file_path
            )
            doc.ocr_text = text
            doc.page_count = page_count

            # Duplicate detection against recent confirmed documents
            try:
                from app.services.duplicate_detector import is_duplicate
                from sqlalchemy import select as _select, and_
                recent = await db.execute(
                    _select(OcrDocument.ocr_text)
                    .where(
                        and_(
                            OcrDocument.confirmed_at.isnot(None),
                            OcrDocument.id != ocr_id,
                            OcrDocument.ocr_text.isnot(None),
                        )
                    )
                    .order_by(OcrDocument.created_at.desc())
                    .limit(50)
                )
                existing_texts = [r for r in recent.scalars().all() if r]
                if existing_texts and text:
                    is_dup, dup_idx, dup_score = is_duplicate(text, existing_texts)
                    if is_dup:
                        doc.ai_result = {
                            **ai_result,
                            "canh_bao": (ai_result.get("canh_bao") or []) + [{
                                "field": "duplicate",
                                "message": f"Có thể trùng lặp với tài liệu đã lưu (độ tương đồng: {dup_score:.0%})",
                            }],
                        }
            except Exception as dup_exc:
                logger.warning("Duplicate detection skipped: %s", dup_exc)

            doc.status = "done"
            doc.processed_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.exception("OCR pipeline failed for id=%s", ocr_id)
            doc.status = "failed"
            doc.error_msg = str(exc)[:500]

        await db.commit()


# ── List ────────────────────────────────────────────────────────────────────

class OcrListResponse(BaseModel):
    total: int
    items: list[OcrDocumentList]


@router.get("/", response_model=OcrListResponse)
async def list_ocr(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_cond = OcrDocument.created_by == current_user.id
    total = (await db.execute(
        select(func.count()).where(base_cond)
        .select_from(OcrDocument)
    )).scalar_one()
    items = (await db.execute(
        select(OcrDocument)
        .options(selectinload(OcrDocument.linked_tasks))
        .where(base_cond)
        .order_by(OcrDocument.created_at.desc())
        .offset(skip).limit(limit)
    )).scalars().all()
    return {"total": total, "items": items}


# ── Get single ──────────────────────────────────────────────────────────────

@router.get("/{ocr_id}", response_model=OcrDocumentRead)
async def get_ocr(
    ocr_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_ocr_with_tasks(db, ocr_id)
    if not doc or doc.created_by != current_user.id:
        raise HTTPException(404, "Không tìm thấy")
    return doc


# ── Update AI result (user edits before confirming) ─────────────────────────

@router.put("/{ocr_id}/ai-result", response_model=OcrDocumentRead)
async def update_ai_result(
    ocr_id: int,
    body: OcrUpdateAiResult,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_ocr_with_tasks(db, ocr_id)
    if not doc or doc.created_by != current_user.id:
        raise HTTPException(404, "Không tìm thấy")
    if doc.status not in ("done", "failed"):
        raise HTTPException(400, "Chỉ cập nhật được khi OCR đã hoàn thành")

    doc.ai_result = body.ai_result
    await db.commit()
    return await _get_ocr_with_tasks(db, ocr_id)


# ── Confirm — create Document + Tasks ───────────────────────────────────────

@router.post("/{ocr_id}/confirm", response_model=OcrConfirmResult)
async def confirm_ocr(
    ocr_id: int,
    body: OcrConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader", "manager"):
        raise HTTPException(403, "Cần quyền admin, leader hoặc manager")
    doc = await db.get(OcrDocument, ocr_id)
    if not doc or doc.created_by != current_user.id:
        raise HTTPException(404, "Không tìm thấy")
    if doc.status != "done":
        raise HTTPException(400, "OCR chưa hoàn thành")
    if doc.confirmed_at:
        raise HTTPException(400, "Tài liệu đã được xác nhận trước đó")

    ai = body.ai_result
    van_ban = ai.get("van_ban", {})
    nhiem_vu_list: list[dict] = ai.get("nhiem_vu", [])

    created_doc_id: int | None = None
    created_task_ids: list[int] = []

    # ── Create Document ─────────────────────────────────────────────────────
    if body.create_document and van_ban:
        from datetime import date as date_cls

        issue_date: date_cls | None = None
        raw_date = van_ban.get("ngay_ban_hanh")
        if raw_date:
            try:
                issue_date = date_cls.fromisoformat(raw_date)
            except ValueError:
                pass

        new_doc = Document(
            doc_number=van_ban.get("so_ky_hieu"),
            title=van_ban.get("trich_yeu") or doc.filename,
            doc_type="incoming",
            issuer=van_ban.get("co_quan_ban_hanh"),
            issue_date=issue_date,
            status="pending",
            priority=van_ban.get("uu_tien", "normal"),
            summary=van_ban.get("trich_yeu"),
            file_name=doc.filename,
            file_path=doc.file_path,
            file_size=doc.file_size,
            created_by=current_user.id,
        )
        db.add(new_doc)
        await db.flush()  # get ID without committing
        created_doc_id = new_doc.id

    # ── Create Tasks ─────────────────────────────────────────────────────────
    if body.create_tasks and nhiem_vu_list:
        indices = body.selected_task_indices or list(range(len(nhiem_vu_list)))
        from datetime import datetime as dt_cls, timezone as tz

        for idx in indices:
            if idx < 0 or idx >= len(nhiem_vu_list):
                continue
            t_data = nhiem_vu_list[idx]

            due: dt_cls | None = None
            raw_dl = t_data.get("deadline")
            if raw_dl:
                try:
                    from datetime import date as d_cls
                    due = dt_cls.combine(d_cls.fromisoformat(raw_dl), dt_cls.min.time()).replace(tzinfo=tz.utc)
                except ValueError:
                    pass

            prio_map = {"urgent": "urgent", "high": "high", "medium": "medium", "low": "low"}
            priority = prio_map.get(t_data.get("muc_uu_tien", ""), "medium")

            new_task = Task(
                title=t_data.get("ten_nhiem_vu", "Nhiệm vụ chưa đặt tên")[:300],
                description=t_data.get("mo_ta"),
                status="pending",
                priority=priority,
                due_date=due,
                incoming_document_id=created_doc_id,
                created_by=current_user.id,
            )
            db.add(new_task)
            await db.flush()
            created_task_ids.append(new_task.id)

    # ── Update OcrDocument ───────────────────────────────────────────────────
    doc.ai_result = ai
    doc.document_id = created_doc_id
    for task_id in created_task_ids:
        db.add(OcrDocumentTask(ocr_id=doc.id, task_id=task_id))
    doc.confirmed_at = datetime.now(timezone.utc)
    await db.commit()

    parts = []
    if created_doc_id:
        parts.append(f"văn bản #{created_doc_id}")
    if created_task_ids:
        parts.append(f"{len(created_task_ids)} nhiệm vụ")
    message = "Đã tạo " + " và ".join(parts) if parts else "Xác nhận thành công (không tạo hồ sơ)"

    return OcrConfirmResult(
        document_id=created_doc_id,
        task_ids=created_task_ids,
        message=message,
    )


# ── Delete ──────────────────────────────────────────────────────────────────

@router.delete("/{ocr_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ocr(
    ocr_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await db.get(OcrDocument, ocr_id)
    if not doc or doc.created_by != current_user.id:
        raise HTTPException(404, "Không tìm thấy")
    ocr_service.delete_file(doc.file_path)
    await db.delete(doc)
    await db.commit()


# ── OCR system status ────────────────────────────────────────────────────────

@router.get("/status/engine")
async def ocr_engine_status(_: User = Depends(get_current_user)):
    """Check what OCR/AI capabilities are available on this server."""
    from app.services.duplicate_detector import EMBEDDINGS_OK, SKLEARN_OK, NUMPY_OK
    from app.core.config import settings
    return {
        "paddleocr":       ocr_service.PADDLEOCR_OK,
        "pymupdf":         ocr_service.PYMUPDF_OK,
        "gemini_api":      bool(settings.GEMINI_API_KEY),
        "duplicate_detection": NUMPY_OK and (EMBEDDINGS_OK or SKLEARN_OK),
        "duplicate_backend": (
            "sentence-transformers" if EMBEDDINGS_OK
            else "tfidf" if SKLEARN_OK
            else "disabled"
        ),
    }
