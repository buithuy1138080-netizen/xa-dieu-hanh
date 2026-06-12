from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.department import Department
from app.models.staff import Staff
from app.models.strategic import BudgetPlan, Disbursement, FundingSource, ProjectDepartment, ProjectTaskLink, StrategicProject
from app.models.user import User
from app.schemas.strategic import (
    BudgetPlanCreate,
    BudgetPlanList,
    BudgetPlanOut,
    BudgetPlanUpdate,
    DisbursementCreate,
    DisbursementList,
    DisbursementOut,
    DisbursementUpdate,
    FundingSourceCreate,
    FundingSourceList,
    FundingSourceOut,
    FundingSourceUpdate,
    ProjectTaskLinkCreate,
    ProjectTaskLinkOut,
    StrategicDashboardStats,
    StrategicProjectCreate,
    StrategicProjectList,
    StrategicProjectOut,
    StrategicProjectUpdate,
)

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_project_or_404(db: AsyncSession, project_id: int) -> StrategicProject:
    row = (await db.execute(select(StrategicProject).where(StrategicProject.id == project_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Không tìm thấy dự án chiến lược")
    return row


async def _get_project_detail(db: AsyncSession, project_id: int) -> StrategicProject:
    stmt = (
        select(StrategicProject)
        .options(
            selectinload(StrategicProject.responsible_department),
            selectinload(StrategicProject.coordinating_departments),
            selectinload(StrategicProject.project_manager),
            selectinload(StrategicProject.project_manager_staff),
            selectinload(StrategicProject.creator),
            selectinload(StrategicProject.source_document),
        )
        .where(StrategicProject.id == project_id)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Không tìm thấy dự án chiến lược")
    return row


async def _recalc_project_progress(db: AsyncSession, project_id: int) -> None:
    """Recalculate strategic project progress from average of linked task progress."""
    from app.models.task import Task

    project = await db.get(StrategicProject, project_id)
    if not project:
        return

    progresses = (await db.execute(
        select(Task.progress_percent).join(
            ProjectTaskLink, ProjectTaskLink.task_id == Task.id
        ).where(
            ProjectTaskLink.project_id == project_id,
            Task.deleted_at.is_(None),
        )
    )).scalars().all()

    if not progresses:
        return

    new_prog = int(sum(progresses) / len(progresses))
    if new_prog != project.progress_percent:
        project.progress_percent = new_prog


async def _get_budget_or_404(db: AsyncSession, budget_id: int) -> BudgetPlan:
    row = (await db.execute(select(BudgetPlan).where(BudgetPlan.id == budget_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Không tìm thấy kế hoạch ngân sách")
    return row


def _recalc_budget_status(bp: BudgetPlan) -> None:
    """Recompute budget_status based on current spent vs total. Does not commit."""
    if bp.spent_budget > bp.total_budget and bp.total_budget > 0:
        bp.budget_status = "over_budget"
    elif bp.budget_status == "over_budget":
        # Reset to active if it was previously over_budget but now within limits
        bp.budget_status = "active"


async def _get_budget_detail(db: AsyncSession, budget_id: int) -> BudgetPlan:
    stmt = (
        select(BudgetPlan)
        .options(selectinload(BudgetPlan.creator))
        .where(BudgetPlan.id == budget_id)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Không tìm thấy kế hoạch ngân sách")
    return row


# ─── Strategic Projects ──────────────────────────────────────────────────────

@router.get("/projects", response_model=StrategicProjectList)
async def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    project_status: str | None = None,
    project_type: str | None = None,
    priority_level: str | None = None,
    responsible_department_id: int | None = None,
    program_id: int | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(StrategicProject).options(
        selectinload(StrategicProject.responsible_department),
        selectinload(StrategicProject.coordinating_departments),
        selectinload(StrategicProject.project_manager),
        selectinload(StrategicProject.project_manager_staff),
        selectinload(StrategicProject.creator),
        selectinload(StrategicProject.source_document),
    )
    if project_status:
        stmt = stmt.where(StrategicProject.project_status == project_status)
    if project_type:
        stmt = stmt.where(StrategicProject.project_type == project_type)
    if priority_level:
        stmt = stmt.where(StrategicProject.priority_level == priority_level)
    if responsible_department_id:
        stmt = stmt.where(StrategicProject.responsible_department_id == responsible_department_id)
    if program_id:
        stmt = stmt.where(StrategicProject.program_id == program_id)
    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            or_(
                StrategicProject.project_name.ilike(q),
                StrategicProject.project_code.ilike(q),
            )
        )

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    items = (await db.execute(stmt.order_by(StrategicProject.created_at.desc()).offset(skip).limit(limit))).scalars().all()
    return {"total": total, "items": items}


@router.post("/projects", response_model=StrategicProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: StrategicProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coord_ids = body.coordinating_department_ids or []
    data = body.model_dump(exclude={'coordinating_department_ids'})
    project = StrategicProject(**data, created_by=current_user.id)
    db.add(project)
    await db.flush()
    for dept_id in coord_ids:
        db.add(ProjectDepartment(project_id=project.id, department_id=dept_id))
    await db.commit()
    return await _get_project_detail(db, project.id)


@router.get("/projects/stats", response_model=StrategicDashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()

    # Aggregate project counts + avg progress + overdue in one query
    proj_row = (await db.execute(
        select(
            func.count().label("total"),
            func.coalesce(func.avg(StrategicProject.progress_percent), 0).label("avg_progress"),
            func.sum(case(
                (and_(
                    StrategicProject.end_date.isnot(None),
                    StrategicProject.end_date < today,
                    StrategicProject.project_status.notin_(["completed", "cancelled"]),
                ), 1), else_=0,
            )).label("overdue"),
            func.sum(case((StrategicProject.project_status == "active",    1), else_=0)).label("active"),
            func.sum(case((StrategicProject.project_status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((StrategicProject.project_status == "on_hold",   1), else_=0)).label("on_hold"),
            func.sum(case((StrategicProject.project_status == "planning",  1), else_=0)).label("planning"),
        )
    )).one()
    n = proj_row.total or 0

    # Group breakdowns
    by_status = {r.k: r.n for r in (await db.execute(
        select(StrategicProject.project_status.label("k"), func.count().label("n"))
        .group_by(StrategicProject.project_status)
    )).all()}
    by_type = {r.k: r.n for r in (await db.execute(
        select(StrategicProject.project_type.label("k"), func.count().label("n"))
        .group_by(StrategicProject.project_type)
    )).all()}
    by_priority = {r.k: r.n for r in (await db.execute(
        select(StrategicProject.priority_level.label("k"), func.count().label("n"))
        .group_by(StrategicProject.priority_level)
    )).all()}

    # Budget totals
    bud_row = (await db.execute(
        select(
            func.coalesce(func.sum(BudgetPlan.total_budget),     0).label("total"),
            func.coalesce(func.sum(BudgetPlan.allocated_budget), 0).label("allocated"),
            func.coalesce(func.sum(BudgetPlan.spent_budget),     0).label("spent"),
        )
    )).one()
    total_budget    = float(bud_row.total)
    total_allocated = float(bud_row.allocated)
    total_spent     = float(bud_row.spent)

    # Top 5 slow active projects (DB-sorted, no Python sort)
    slow_rows = (await db.execute(
        select(
            StrategicProject.id,
            StrategicProject.project_name,
            StrategicProject.progress_percent,
            StrategicProject.end_date,
            StrategicProject.priority_level,
        )
        .where(
            StrategicProject.project_status == "active",
            StrategicProject.progress_percent < 50,
            StrategicProject.end_date.isnot(None),
            StrategicProject.end_date >= today,
        )
        .order_by(StrategicProject.progress_percent.asc())
        .limit(5)
    )).all()

    return StrategicDashboardStats(
        total_projects=n,
        active_projects=proj_row.active or 0,
        completed_projects=proj_row.completed or 0,
        on_hold_projects=proj_row.on_hold or 0,
        planning_projects=proj_row.planning or 0,
        total_budget=total_budget,
        total_allocated=total_allocated,
        total_spent=total_spent,
        total_remaining=total_budget - total_spent,
        disbursement_rate=round(total_spent / total_budget * 100, 1) if total_budget > 0 else 0.0,
        avg_progress=round(float(proj_row.avg_progress or 0), 1),
        overdue_projects=proj_row.overdue or 0,
        by_status=by_status,
        by_type=by_type,
        by_priority=by_priority,
        top_slow_projects=[
            {
                "id": r.id,
                "project_name": r.project_name,
                "progress_percent": r.progress_percent,
                "end_date": str(r.end_date),
                "priority_level": r.priority_level,
            }
            for r in slow_rows
        ],
    )


# ─── Project Documents (B3) ──────────────────────────────────────────────────

@router.get("/projects/{project_id}/documents")
async def list_project_documents(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.document import Document
    from app.models.strategic import DocumentStrategicProject
    await _get_project_or_404(db, project_id)
    rows = (await db.execute(
        select(DocumentStrategicProject)
        .options(selectinload(DocumentStrategicProject.document))
        .where(DocumentStrategicProject.project_id == project_id)
        .order_by(DocumentStrategicProject.created_at.desc())
    )).scalars().all()
    return [
        {
            "link_id": r.id,
            "link_type": r.link_type,
            "note": r.note,
            "linked_at": r.created_at.isoformat(),
            "document": {
                "id": r.document.id,
                "doc_number": r.document.doc_number,
                "title": r.document.title,
                "doc_type": r.document.doc_type,
                "status": r.document.status,
                "issued_date": r.document.issue_date.isoformat() if r.document.issue_date else None,
            },
        }
        for r in rows
    ]


@router.post("/projects/{project_id}/documents", status_code=status.HTTP_201_CREATED)
async def link_project_document(
    project_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.strategic import DocumentStrategicProject
    await _get_project_or_404(db, project_id)
    document_id: int = body.get("document_id")
    if not document_id:
        raise HTTPException(400, "document_id là bắt buộc")
    existing = (await db.execute(
        select(DocumentStrategicProject).where(
            DocumentStrategicProject.project_id == project_id,
            DocumentStrategicProject.document_id == document_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Văn bản đã được liên kết với dự án này")
    link = DocumentStrategicProject(
        project_id=project_id,
        document_id=document_id,
        link_type=body.get("link_type", "reference"),
        note=body.get("note"),
        created_by=current_user.id,
    )
    db.add(link)
    await db.commit()
    return {"ok": True, "link_id": link.id}


@router.delete("/projects/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_project_document(
    project_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.strategic import DocumentStrategicProject
    row = (await db.execute(
        select(DocumentStrategicProject).where(
            DocumentStrategicProject.project_id == project_id,
            DocumentStrategicProject.document_id == document_id,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Không tìm thấy liên kết")
    await db.delete(row)
    await db.commit()


# ─── Project CRUD ─────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}", response_model=StrategicProjectOut)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_project_detail(db, project_id)


@router.patch("/projects/{project_id}", response_model=StrategicProjectOut)
async def update_project(
    project_id: int,
    body: StrategicProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(db, project_id)
    update_data = body.model_dump(exclude_unset=True)

    coord_ids = update_data.pop('coordinating_department_ids', None)
    for k, v in update_data.items():
        setattr(project, k, v)

    if coord_ids is not None:
        await db.execute(
            delete(ProjectDepartment).where(ProjectDepartment.project_id == project_id)
        )
        for dept_id in coord_ids:
            db.add(ProjectDepartment(project_id=project_id, department_id=dept_id))

    await db.commit()
    return await _get_project_detail(db, project_id)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_project_or_404(db, project_id)
    await db.delete(project)
    await db.commit()


# ─── Budget Plans ────────────────────────────────────────────────────────────

@router.get("/budget-plans", response_model=BudgetPlanList)
async def list_budget_plans(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    project_id: int | None = None,
    fiscal_year: int | None = None,
    budget_status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(BudgetPlan).options(selectinload(BudgetPlan.creator))
    if project_id:
        stmt = stmt.where(BudgetPlan.project_id == project_id)
    if fiscal_year:
        stmt = stmt.where(BudgetPlan.fiscal_year == fiscal_year)
    if budget_status:
        stmt = stmt.where(BudgetPlan.budget_status == budget_status)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    items = (await db.execute(stmt.order_by(BudgetPlan.created_at.desc()).offset(skip).limit(limit))).scalars().all()
    return {"total": total, "items": items}


@router.post("/budget-plans", response_model=BudgetPlanOut, status_code=status.HTTP_201_CREATED)
async def create_budget_plan(
    body: BudgetPlanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_project_or_404(db, body.project_id)
    bp = BudgetPlan(**body.model_dump(), created_by=current_user.id)
    db.add(bp)
    await db.commit()
    await db.refresh(bp)
    return await _get_budget_detail(db, bp.id)


@router.get("/budget-plans/{budget_id}", response_model=BudgetPlanOut)
async def get_budget_plan(
    budget_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_budget_detail(db, budget_id)


@router.patch("/budget-plans/{budget_id}", response_model=BudgetPlanOut)
async def update_budget_plan(
    budget_id: int,
    body: BudgetPlanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bp = await _get_budget_or_404(db, budget_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(bp, k, v)
    await db.commit()
    return await _get_budget_detail(db, budget_id)


@router.delete("/budget-plans/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget_plan(
    budget_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bp = await _get_budget_or_404(db, budget_id)
    await db.delete(bp)
    await db.commit()


# ─── Funding Sources ─────────────────────────────────────────────────────────

@router.get("/funding-sources", response_model=FundingSourceList)
async def list_funding_sources(
    budget_plan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        await db.execute(
            select(FundingSource)
            .where(FundingSource.budget_plan_id == budget_plan_id)
            .order_by(FundingSource.id)
        )
    ).scalars().all()
    return {"total": len(items), "items": items}


@router.post("/funding-sources", response_model=FundingSourceOut, status_code=status.HTTP_201_CREATED)
async def create_funding_source(
    body: FundingSourceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_budget_or_404(db, body.budget_plan_id)
    fs = FundingSource(**body.model_dump(), created_by=current_user.id)
    db.add(fs)
    await db.commit()
    await db.refresh(fs)
    return fs


@router.patch("/funding-sources/{fs_id}", response_model=FundingSourceOut)
async def update_funding_source(
    fs_id: int,
    body: FundingSourceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = (await db.execute(select(FundingSource).where(FundingSource.id == fs_id))).scalar_one_or_none()
    if not fs:
        raise HTTPException(404, "Không tìm thấy nguồn vốn")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(fs, k, v)
    await db.commit()
    await db.refresh(fs)
    return fs


@router.delete("/funding-sources/{fs_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_funding_source(
    fs_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = (await db.execute(select(FundingSource).where(FundingSource.id == fs_id))).scalar_one_or_none()
    if not fs:
        raise HTTPException(404, "Không tìm thấy nguồn vốn")
    await db.delete(fs)
    await db.commit()


# ─── Disbursements ───────────────────────────────────────────────────────────

@router.get("/disbursements", response_model=DisbursementList)
async def list_disbursements(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    budget_plan_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Disbursement).options(selectinload(Disbursement.creator))
    if budget_plan_id:
        stmt = stmt.where(Disbursement.budget_plan_id == budget_plan_id)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    items = (await db.execute(stmt.order_by(Disbursement.disbursement_date.desc()).offset(skip).limit(limit))).scalars().all()
    return {"total": total, "items": items}


@router.post("/disbursements", response_model=DisbursementOut, status_code=status.HTTP_201_CREATED)
async def create_disbursement(
    body: DisbursementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_budget_or_404(db, body.budget_plan_id)
    d = Disbursement(**body.model_dump(), created_by=current_user.id)
    db.add(d)

    # auto-update spent_budget on budget_plan
    bp = await _get_budget_or_404(db, body.budget_plan_id)
    bp.spent_budget = (bp.spent_budget or 0.0) + body.disbursement_amount
    _recalc_budget_status(bp)

    await db.commit()
    await db.refresh(d)
    return d


@router.patch("/disbursements/{d_id}", response_model=DisbursementOut)
async def update_disbursement(
    d_id: int,
    body: DisbursementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = (await db.execute(
        select(Disbursement).options(selectinload(Disbursement.creator)).where(Disbursement.id == d_id)
    )).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Không tìm thấy khoản giải ngân")

    old_amount = d.disbursement_amount
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(d, k, v)

    if body.disbursement_amount is not None:
        bp = await _get_budget_or_404(db, d.budget_plan_id)
        bp.spent_budget = max(0.0, (bp.spent_budget or 0.0) - old_amount + body.disbursement_amount)
        _recalc_budget_status(bp)

    await db.commit()
    await db.refresh(d)
    return d


@router.delete("/disbursements/{d_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_disbursement(
    d_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = (await db.execute(select(Disbursement).where(Disbursement.id == d_id))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Không tìm thấy khoản giải ngân")
    bp = await _get_budget_or_404(db, d.budget_plan_id)
    bp.spent_budget = max(0.0, (bp.spent_budget or 0.0) - d.disbursement_amount)
    _recalc_budget_status(bp)
    await db.delete(d)
    await db.commit()


# ─── Project-Task Links ──────────────────────────────────────────────────────

@router.get("/projects/{project_id}/tasks", response_model=list[ProjectTaskLinkOut])
async def list_project_tasks(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_project_or_404(db, project_id)
    items = (
        await db.execute(select(ProjectTaskLink).where(ProjectTaskLink.project_id == project_id))
    ).scalars().all()
    return items


@router.post("/projects/{project_id}/tasks", response_model=ProjectTaskLinkOut, status_code=status.HTTP_201_CREATED)
async def link_task_to_project(
    project_id: int,
    task_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_project_or_404(db, project_id)
    existing = (
        await db.execute(
            select(ProjectTaskLink).where(
                and_(ProjectTaskLink.project_id == project_id, ProjectTaskLink.task_id == task_id)
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    link = ProjectTaskLink(project_id=project_id, task_id=task_id)
    db.add(link)
    await db.flush()
    await _recalc_project_progress(db, project_id)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/projects/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_task_from_project(
    project_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = (
        await db.execute(
            select(ProjectTaskLink).where(
                and_(ProjectTaskLink.project_id == project_id, ProjectTaskLink.task_id == task_id)
            )
        )
    ).scalar_one_or_none()
    if link:
        await db.delete(link)
        await db.flush()
        await _recalc_project_progress(db, project_id)
        await db.commit()
