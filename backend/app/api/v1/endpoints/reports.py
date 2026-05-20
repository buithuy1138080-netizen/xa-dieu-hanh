"""Automated Report endpoint."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.deps import get_current_user, get_db
from app.models.notification import Notification
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportCreate, ReportList, ReportRead
from app.services import ai_summary_service, export_service, report_engine

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Create report ──────────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ReportList)
async def create_report(
    body: ReportCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    label = report_engine.make_period_label(body.period_from, body.period_to, body.report_type)
    title = report_engine.make_report_title(body.report_type, label)

    rpt = Report(
        report_type=body.report_type,
        title=title,
        period_label=label,
        period_from=body.period_from,
        period_to=body.period_to,
        status="generating",
        created_by=current_user.id,
    )
    db.add(rpt)
    await db.commit()
    await db.refresh(rpt)

    background_tasks.add_task(_generate_report, rpt.id, current_user.id)
    return rpt


# ── Background report generation ──────────────────────────────────────────────

async def _generate_report(report_id: int, user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        rpt: Report | None = await db.get(Report, report_id)
        if not rpt:
            return
        try:
            data = await report_engine.collect_data(
                db, rpt.period_from, rpt.period_to, rpt.report_type
            )
            summary = ai_summary_service.generate_summary(data, rpt.report_type)

            rpt.summary_data = data
            rpt.ai_summary = summary
            rpt.status = "done"
            rpt.generated_at = datetime.now(timezone.utc)

            # In-app notification
            notif = Notification(
                user_id=user_id,
                type="report",
                title="Báo cáo đã sẵn sàng",
                body=f"Báo cáo \"{rpt.title}\" đã được tạo thành công.",
                link_url=f"/bao-cao/{report_id}",
            )
            db.add(notif)

        except Exception as exc:
            logger.exception("Report generation failed id=%s", report_id)
            rpt.status = "failed"
            rpt.error_msg = str(exc)[:500]

        await db.commit()


# ── List reports ───────────────────────────────────────────────────────────────

class ReportListResponse(BaseModel):
    total: int
    items: list[ReportList]


@router.get("/", response_model=ReportListResponse)
async def list_reports(
    report_type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = select(Report)
    if report_type:
        base = base.where(Report.report_type == report_type)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    items = (await db.execute(base.order_by(Report.created_at.desc()).offset(skip).limit(limit))).scalars().all()
    return {"total": total, "items": items}


# ── Get single report ─────────────────────────────────────────────────────────

@router.get("/{report_id}", response_model=ReportRead)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rpt = await db.get(Report, report_id)
    if not rpt:
        raise HTTPException(404, "Không tìm thấy báo cáo")
    return rpt


# ── Export endpoints ──────────────────────────────────────────────────────────

@router.post("/{report_id}/export/docx")
async def export_docx(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rpt = await db.get(Report, report_id)
    if not rpt or rpt.status != "done":
        raise HTTPException(400, "Báo cáo chưa sẵn sàng")

    path = await asyncio.to_thread(
        export_service.export_docx,
        report_id, rpt.title, rpt.period_label,
        rpt.summary_data or {}, rpt.ai_summary or {},
    )
    rpt.file_path_docx = path
    await db.commit()

    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=Path(path).name,
    )


@router.post("/{report_id}/export/xlsx")
async def export_xlsx(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rpt = await db.get(Report, report_id)
    if not rpt or rpt.status != "done":
        raise HTTPException(400, "Báo cáo chưa sẵn sàng")

    path = await asyncio.to_thread(
        export_service.export_xlsx,
        report_id, rpt.title, rpt.period_label,
        rpt.summary_data or {}, rpt.ai_summary or {},
    )
    rpt.file_path_xlsx = path
    await db.commit()

    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=Path(path).name,
    )


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rpt = await db.get(Report, report_id)
    if not rpt:
        raise HTTPException(404, "Không tìm thấy")
    await db.delete(rpt)
    await db.commit()


# ── Quick stats endpoint (for dashboard widget) ───────────────────────────────

@router.get("/stats/overview")
async def report_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Report.report_type, Report.status).order_by(Report.created_at.desc()).limit(100)
    rows = (await db.execute(q)).all()
    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r.report_type] = by_type.get(r.report_type, 0) + 1
    return {
        "total": len(rows),
        "by_type": by_type,
        "done": sum(1 for r in rows if r.status == "done"),
    }
