"""Report Template endpoint — upload, manage, and render dynamic templates."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as _settings
from app.core.deps import get_current_user, get_db
from app.models.report_template import ReportTemplate
from app.models.user import User
from app.schemas.report_template import (
    TEMPLATE_CATEGORIES,
    RenderRequest,
    ReportTemplateRead,
    ReportTemplateUpdate,
    VariableCatalog,
    VariableInfo,
)
from app.services import template_engine, variable_registry

logger = logging.getLogger(__name__)
router = APIRouter()

_TEMPLATE_DIR = Path(_settings.UPLOAD_DIR) / "templates"
_EXPORT_DIR   = Path(_settings.UPLOAD_DIR) / "reports"
_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
_MAX_SIZE_MB  = 20

ALLOWED_EXTS = {".xlsx", ".docx"}


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "leader"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chỉ admin/leader mới có thể thực hiện thao tác này")
    return user


def _to_read(obj: ReportTemplate) -> ReportTemplateRead:
    return ReportTemplateRead.from_orm(obj)


# ── List templates ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[ReportTemplateRead])
async def list_templates(
    category: str | None = Query(None),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(ReportTemplate).order_by(ReportTemplate.category, ReportTemplate.version.desc())
    if category:
        q = q.where(ReportTemplate.category == category)
    if active_only:
        q = q.where(ReportTemplate.is_active.is_(True))
    rows = (await db.execute(q)).scalars().all()
    return [_to_read(r) for r in rows]


# ── Variable catalog ───────────────────────────────────────────────────────────

@router.get("/variables", response_model=VariableCatalog)
async def get_variable_catalog(_: User = Depends(get_current_user)):
    scalars = [VariableInfo(**v) for v in variable_registry.SCALAR_CATALOG]
    lists   = [
        VariableInfo(
            name=v["name"],
            description=v["description"],
            example=v["example"],
        )
        for v in variable_registry.LIST_CATALOG
    ]
    return VariableCatalog(scalars=scalars, lists=lists)


# ── Categories ─────────────────────────────────────────────────────────────────

@router.get("/categories")
async def get_categories(_: User = Depends(get_current_user)):
    return [{"value": k, "label": v} for k, v in TEMPLATE_CATEGORIES.items()]


# ── Upload template ────────────────────────────────────────────────────────────

@router.post("", response_model=ReportTemplateRead, status_code=status.HTTP_201_CREATED)
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    category: str = Form(...),
    description: str = Form(""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    # Validate file extension
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTS:
        raise HTTPException(400, f"Chỉ hỗ trợ {', '.join(ALLOWED_EXTS)}")

    # Validate category
    if category not in TEMPLATE_CATEGORIES:
        raise HTTPException(400, f"Category không hợp lệ. Chọn: {list(TEMPLATE_CATEGORIES)}")

    # Read file
    content = await file.read()
    if len(content) > _MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File quá lớn (tối đa {_MAX_SIZE_MB}MB)")

    # Determine version
    existing = (await db.execute(
        select(ReportTemplate)
        .where(ReportTemplate.name == name, ReportTemplate.category == category)
        .order_by(ReportTemplate.version.desc())
        .limit(1)
    )).scalar_one_or_none()
    version = (existing.version + 1) if existing else 1

    # Save file
    cat_dir = _TEMPLATE_DIR / category
    cat_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^\w\-.]", "_", name)
    file_path = cat_dir / f"{safe_name}_v{version}{suffix}"
    file_path.write_bytes(content)

    # Parse variables from template
    scalars, lists = await asyncio.to_thread(
        template_engine.parse_variables, str(file_path)
    )

    tpl = ReportTemplate(
        name=name,
        category=category,
        description=description or None,
        file_ext=suffix.lstrip("."),
        file_path=str(file_path),
        file_size=len(content),
        variables_json=scalars,
        list_variables_json=lists,
        version=version,
        is_active=(version == 1),   # first version auto-activated
        created_by=current_user.id,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return _to_read(tpl)


# ── Get single template ────────────────────────────────────────────────────────

@router.get("/{template_id}", response_model=ReportTemplateRead)
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tpl = await db.get(ReportTemplate, template_id)
    if not tpl:
        raise HTTPException(404, "Không tìm thấy template")
    return _to_read(tpl)


# ── Update template metadata ───────────────────────────────────────────────────

@router.put("/{template_id}", response_model=ReportTemplateRead)
async def update_template(
    template_id: int,
    body: ReportTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    tpl = await db.get(ReportTemplate, template_id)
    if not tpl:
        raise HTTPException(404, "Không tìm thấy template")
    if body.name is not None:
        tpl.name = body.name
    if body.description is not None:
        tpl.description = body.description
    if body.is_active is not None:
        tpl.is_active = body.is_active
    tpl.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tpl)
    return _to_read(tpl)


# ── Activate template (set active, deactivate others of same name+category) ───

@router.post("/{template_id}/activate", response_model=ReportTemplateRead)
async def activate_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    tpl = await db.get(ReportTemplate, template_id)
    if not tpl:
        raise HTTPException(404, "Không tìm thấy template")

    # Deactivate all others with same name+category
    others = (await db.execute(
        select(ReportTemplate).where(
            ReportTemplate.name == tpl.name,
            ReportTemplate.category == tpl.category,
            ReportTemplate.id != template_id,
        )
    )).scalars().all()
    for o in others:
        o.is_active = False

    tpl.is_active = True
    tpl.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(tpl)
    return _to_read(tpl)


# ── Download original template file ───────────────────────────────────────────

@router.get("/{template_id}/download")
async def download_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tpl = await db.get(ReportTemplate, template_id)
    if not tpl:
        raise HTTPException(404, "Không tìm thấy template")
    path = Path(tpl.file_path)
    if not path.exists():
        raise HTTPException(404, "File template không tồn tại trên server")
    mime = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if tpl.file_ext == "xlsx"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(str(path), media_type=mime, filename=path.name)


# ── Render template → export file ─────────────────────────────────────────────

@router.post("/{template_id}/render")
async def render_template(
    template_id: int,
    body: RenderRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tpl = await db.get(ReportTemplate, template_id)
    if not tpl:
        raise HTTPException(404, "Không tìm thấy template")

    tpl_path = Path(tpl.file_path)
    if not tpl_path.exists():
        raise HTTPException(404, "File template không tồn tại trên server")

    # Parse period
    try:
        from datetime import date
        period_from = date.fromisoformat(body.period_from)
        period_to   = date.fromisoformat(body.period_to)
    except ValueError:
        raise HTTPException(400, "Định dạng ngày không hợp lệ (YYYY-MM-DD)")

    if period_from > period_to:
        raise HTTPException(400, "Ngày bắt đầu phải trước ngày kết thúc")

    # Resolve variables
    variables = await variable_registry.resolve_variables(db, period_from, period_to)

    # Choose output format
    fmt = body.format
    if fmt == "pdf" and tpl.file_ext != "docx":
        raise HTTPException(400, "Chỉ hỗ trợ export PDF từ template DOCX")

    # Determine output filename
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    _EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    if fmt == "xlsx" or (fmt == "pdf" and tpl.file_ext == "xlsx"):
        if tpl.file_ext != "xlsx":
            raise HTTPException(400, "Template này không phải XLSX")
        out_path = str(_EXPORT_DIR / f"tpl_{template_id}_{ts}.xlsx")
        await asyncio.to_thread(template_engine.render_xlsx, str(tpl_path), variables, out_path)
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=Path(out_path).name,
        )

    elif fmt == "docx":
        if tpl.file_ext != "docx":
            raise HTTPException(400, "Template này không phải DOCX")
        out_path = str(_EXPORT_DIR / f"tpl_{template_id}_{ts}.docx")
        await asyncio.to_thread(template_engine.render_docx, str(tpl_path), variables, out_path)
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=Path(out_path).name,
        )

    elif fmt == "pdf":
        out_path = str(_EXPORT_DIR / f"tpl_{template_id}_{ts}.pdf")
        actual_path = await asyncio.to_thread(
            template_engine.render_pdf, str(tpl_path), variables, out_path
        )
        actual_resolved = Path(actual_path).resolve()
        if not str(actual_resolved).startswith(str(Path(_settings.UPLOAD_DIR).resolve())):
            raise HTTPException(403, "Đường dẫn xuất không hợp lệ")
        is_pdf = actual_path.endswith(".pdf")
        mime = "application/pdf" if is_pdf else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return FileResponse(str(actual_resolved), media_type=mime, filename=actual_resolved.name)

    raise HTTPException(400, "Format không hợp lệ")


# ── Delete template ────────────────────────────────────────────────────────────

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_admin),
):
    tpl = await db.get(ReportTemplate, template_id)
    if not tpl:
        raise HTTPException(404, "Không tìm thấy template")
    # Remove file
    try:
        Path(tpl.file_path).unlink(missing_ok=True)
    except Exception:
        pass
    await db.delete(tpl)
    await db.commit()


