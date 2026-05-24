from datetime import date, datetime, timezone
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.kpi import KPI, KPIProgress
from app.models.user import User
from app.schemas.kpi_chien_luoc import (
    HeatmapCell, HeatmapData, KpiCLCreate, KpiCLRankItem, KpiCLRead,
    KpiCLStats, KpiCLTienDoCreate, KpiCLTienDoRead, KpiCLUpdate,
    OverdueItem, PaginatedKpiCL, RankingData,
)

router = APIRouter()

VALID_LOAI  = {"quy", "nam", "nhiem_ky"}

_LIST_LOADS = [
    selectinload(KPI.responsible_department),
    selectinload(KPI.responsible_user),
    selectinload(KPI.creator),
]


def _loai_to_period(loai: str) -> str:
    return "quarterly" if loai == "quy" else "yearly"


def _period_to_loai(k: KPI) -> str:
    if k.period == "quarterly":
        return "quy"
    if k.term_name:
        return "nhiem_ky"
    return "nam"


def _compute_vi_status(pct: float, han: Optional[date]) -> str:
    if pct >= 100:
        return "Đạt mục tiêu"
    if han and han < date.today() and pct < 100:
        return "Quá hạn"
    if pct >= 70:
        return "Đúng tiến độ"
    if pct >= 40:
        return "Có rủi ro"
    if pct > 0:
        return "Chậm tiến độ"
    return "Chưa bắt đầu"


def _vi_to_status(vi: str) -> str:
    return {
        "Đạt mục tiêu": "completed",
        "Có rủi ro":    "at_risk",
        "Chậm tiến độ": "behind",
        "Quá hạn":      "behind",
        "Đúng tiến độ": "on_track",
        "Chưa bắt đầu": "on_track",
    }.get(vi, "on_track")


def _recalc(k: KPI) -> None:
    if k.target_value and k.target_value > 0:
        k.progress = max(0.0, min(100.0, round((k.current_value / k.target_value) * 100, 2)))
    else:
        k.progress = 0.0
    vi = _compute_vi_status(k.progress, k.deadline)
    k.status = _vi_to_status(vi)


def _kpi_to_cl(k: KPI) -> dict:
    dept = k.responsible_department
    user = k.responsible_user
    creator = k.creator
    return {
        "id": k.id,
        "ma_kpi": k.code,
        "ten": k.title,
        "mo_ta": k.description,
        "loai_kpi": _period_to_loai(k),
        "danh_muc": k.category,
        "gia_tri_muc_tieu": k.target_value,
        "gia_tri_thuc_te": k.current_value,
        "pct_hoan_thanh": k.progress,
        "don_vi_do": k.unit,
        "trang_thai": _compute_vi_status(k.progress, k.deadline),
        "quy": k.quarter,
        "nam": k.year,
        "ten_nhiem_ky": k.term_name,
        "han_hoan_thanh": k.deadline,
        "don_vi_phu_trach_id": k.responsible_department_id,
        "don_vi_phu_trach": (
            {"id": dept.id, "name": dept.name, "short_name": getattr(dept, "short_name", None)}
            if dept else None
        ),
        "nguoi_theo_doi_id": k.responsible_user_id,
        "nguoi_theo_doi": (
            {"id": user.id, "username": user.username, "full_name": user.full_name}
            if user else None
        ),
        "creator": (
            {"id": creator.id, "username": creator.username, "full_name": creator.full_name}
            if creator else {"id": k.created_by, "username": "", "full_name": None}
        ),
        "van_ban_id": None,
        "nhiem_vu_id": None,
        "chi_tieu_nq_id": None,
        "created_at": k.created_at,
        "updated_at": k.updated_at,
    }


async def _get_or_404(db: AsyncSession, kpi_id: int) -> KPI:
    k = (await db.execute(
        select(KPI)
        .options(*_LIST_LOADS)
        .where(KPI.id == kpi_id, KPI.kpi_type == "chien_luoc", KPI.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not k:
        raise HTTPException(404, "Không tìm thấy KPI chiến lược")
    return k


# ─── Dashboard (static routes FIRST) ─────────────────────────────────────────

@router.get("/stats", response_model=KpiCLStats)
async def get_stats(
    nam:          Optional[int] = None,
    loai_kpi:     Optional[str] = None,
    danh_muc:     Optional[str] = None,
    ten_nhiem_ky: Optional[str] = None,
    db:           AsyncSession  = Depends(get_db),
    _:            User          = Depends(get_current_user),
):
    conds = [KPI.deleted_at.is_(None), KPI.kpi_type == "chien_luoc"]
    if nam:          conds.append(KPI.year == nam)
    if loai_kpi:
        if loai_kpi == "quy":
            conds.append(KPI.period == "quarterly")
        elif loai_kpi == "nhiem_ky":
            conds.append(KPI.term_name.isnot(None))
        else:
            conds.append(and_(KPI.period == "yearly", KPI.term_name.is_(None)))
    if danh_muc:     conds.append(KPI.category == danh_muc)
    if ten_nhiem_ky: conds.append(KPI.term_name == ten_nhiem_ky)

    rows = (await db.execute(select(KPI).where(*conds))).scalars().all()
    total = len(rows)

    def vi_status(k: KPI) -> str:
        return _compute_vi_status(k.progress, k.deadline)

    def cnt(tt: str) -> int:
        return sum(1 for r in rows if vi_status(r) == tt)

    return KpiCLStats(
        tong=total,
        dat_muc_tieu=cnt("Đạt mục tiêu"),
        dung_tien_do=cnt("Đúng tiến độ"),
        co_rui_ro=cnt("Có rủi ro"),
        cham_tien_do=cnt("Chậm tiến độ"),
        qua_han=cnt("Quá hạn"),
        chua_bat_dau=cnt("Chưa bắt đầu"),
        pct_tb=round(sum(r.progress for r in rows) / total, 2) if total else 0.0,
        so_quy=sum(1 for r in rows if r.period == "quarterly"),
        so_nam=sum(1 for r in rows if r.period == "yearly" and not r.term_name),
        so_nhiem_ky=sum(1 for r in rows if r.period == "yearly" and r.term_name),
    )


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap(
    nam:          int           = Query(..., description="Năm hiển thị heatmap"),
    loai_kpi:     Optional[str] = None,
    ten_nhiem_ky: Optional[str] = None,
    db:           AsyncSession  = Depends(get_db),
    _:            User          = Depends(get_current_user),
):
    conds = [KPI.deleted_at.is_(None), KPI.kpi_type == "chien_luoc", KPI.year == nam]
    if loai_kpi:
        if loai_kpi == "quy":
            conds.append(KPI.period == "quarterly")
        elif loai_kpi == "nhiem_ky":
            conds.append(KPI.term_name.isnot(None))
        else:
            conds.append(and_(KPI.period == "yearly", KPI.term_name.is_(None)))
    if ten_nhiem_ky:
        conds.append(KPI.term_name == ten_nhiem_ky)
    rows = (await db.execute(select(KPI).where(*conds))).scalars().all()

    def period_label(k: KPI) -> str:
        loai = _period_to_loai(k)
        if loai == "quy" and k.quarter:
            return f"Q{k.quarter}/{k.year}"
        if loai == "nhiem_ky" and k.term_name:
            return k.term_name
        return str(k.year)

    agg: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        cat = r.category or "Khác"
        period = period_label(r)
        key = (cat, period)
        agg.setdefault(key, []).append(r.progress)

    all_cats    = sorted({k[0] for k in agg})
    all_periods = sorted({k[1] for k in agg})

    cells = [
        HeatmapCell(
            danh_muc=cat, period=period,
            avg_pct=round(sum(vals) / len(vals), 1),
            count=len(vals),
        )
        for (cat, period), vals in agg.items()
    ]
    return HeatmapData(danh_mucs=all_cats, periods=all_periods, cells=cells)


@router.get("/ranking", response_model=RankingData)
async def get_ranking(
    nam:          Optional[int] = None,
    loai_kpi:     Optional[str] = None,
    ten_nhiem_ky: Optional[str] = None,
    top_n:        int           = Query(5, ge=1, le=20),
    db:           AsyncSession  = Depends(get_db),
    _:            User          = Depends(get_current_user),
):
    conds = [KPI.deleted_at.is_(None), KPI.kpi_type == "chien_luoc"]
    if nam: conds.append(KPI.year == nam)
    if ten_nhiem_ky: conds.append(KPI.term_name == ten_nhiem_ky)
    rows = (await db.execute(
        select(KPI).options(selectinload(KPI.responsible_department)).where(*conds)
    )).scalars().all()

    def to_item(k: KPI) -> KpiCLRankItem:
        dept = k.responsible_department
        return KpiCLRankItem(
            id=k.id, ma_kpi=k.code, ten=k.title, danh_muc=k.category,
            loai_kpi=_period_to_loai(k), pct_hoan_thanh=k.progress,
            trang_thai=_compute_vi_status(k.progress, k.deadline),
            don_vi_phu_trach_ten=(
                dept.short_name or dept.name if dept else None
            ),
        )

    sorted_desc = sorted(rows, key=lambda r: r.progress, reverse=True)
    sorted_asc  = sorted(rows, key=lambda r: r.progress)
    return RankingData(
        top=[to_item(r) for r in sorted_desc[:top_n]],
        bottom=[to_item(r) for r in sorted_asc[:top_n]],
    )


@router.get("/overdue", response_model=list[OverdueItem])
async def get_overdue(
    nam:   Optional[int] = None,
    limit: int           = Query(10, ge=1, le=50),
    db:    AsyncSession  = Depends(get_db),
    _:     User          = Depends(get_current_user),
):
    today = date.today()
    conds = [
        KPI.deleted_at.is_(None),
        KPI.kpi_type == "chien_luoc",
        KPI.deadline.isnot(None),
        KPI.deadline < today,
        KPI.status != "completed",
    ]
    if nam:
        conds.append(KPI.year == nam)
    rows = (await db.execute(
        select(KPI)
        .options(selectinload(KPI.responsible_department))
        .where(*conds)
        .order_by(KPI.progress.asc())
        .limit(limit)
    )).scalars().all()

    result = []
    for r in rows:
        ngay_qua = (today - r.deadline).days if r.deadline else 0
        dept = r.responsible_department
        result.append(OverdueItem(
            id=r.id, ma_kpi=r.code, ten=r.title, danh_muc=r.category,
            loai_kpi=_period_to_loai(r), pct_hoan_thanh=r.progress,
            trang_thai=_compute_vi_status(r.progress, r.deadline),
            han_hoan_thanh=r.deadline,
            don_vi_phu_trach_ten=(dept.short_name or dept.name if dept else None),
            so_ngay_qua_han=max(0, ngay_qua),
        ))
    return result


@router.get("/meta/danh-muc", response_model=list[str])
async def list_danh_muc(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(get_current_user),
):
    rows = (await db.execute(
        select(KPI.category)
        .where(KPI.kpi_type == "chien_luoc", KPI.category.isnot(None), KPI.deleted_at.is_(None))
        .distinct()
    )).scalars().all()
    return sorted(rows)


@router.get("/meta/nhiem-ky", response_model=list[str])
async def list_nhiem_ky(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(get_current_user),
):
    rows = (await db.execute(
        select(KPI.term_name)
        .where(KPI.kpi_type == "chien_luoc", KPI.term_name.isnot(None), KPI.deleted_at.is_(None))
        .distinct()
    )).scalars().all()
    return sorted(rows)


# ─── KpiCL CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedKpiCL)
async def list_kpi_cl(
    page:         int           = Query(1, ge=1),
    size:         int           = Query(20, ge=1, le=100),
    search:       Optional[str] = None,
    loai_kpi:     Optional[str] = None,
    danh_muc:     Optional[str] = None,
    trang_thai:   Optional[str] = None,
    nam:          Optional[int] = None,
    quy:          Optional[int] = None,
    ten_nhiem_ky: Optional[str] = None,
    db:           AsyncSession  = Depends(get_db),
    _:            User          = Depends(get_current_user),
):
    conds = [KPI.deleted_at.is_(None), KPI.kpi_type == "chien_luoc"]
    if search:
        conds.append(or_(KPI.title.ilike(f"%{search}%"), KPI.code.ilike(f"%{search}%")))
    if loai_kpi:
        if loai_kpi == "quy":
            conds.append(KPI.period == "quarterly")
        elif loai_kpi == "nhiem_ky":
            conds.append(KPI.term_name.isnot(None))
        else:
            conds.append(and_(KPI.period == "yearly", KPI.term_name.is_(None)))
    if danh_muc:     conds.append(KPI.category == danh_muc)
    if trang_thai:   conds.append(KPI.status == _vi_to_status(trang_thai))
    if nam:          conds.append(KPI.year == nam)
    if quy:          conds.append(KPI.quarter == quy)
    if ten_nhiem_ky: conds.append(KPI.term_name == ten_nhiem_ky)

    base_q = select(KPI).where(*conds)
    total = (await db.execute(select(func.count()).select_from(base_q.subquery()))).scalar_one()
    stmt = (
        base_q
        .options(*_LIST_LOADS)
        .order_by(KPI.year.desc(), KPI.created_at.desc())
        .offset((page - 1) * size).limit(size)
    )
    items = (await db.execute(stmt)).scalars().all()
    return PaginatedKpiCL(
        items=[KpiCLRead.model_validate(_kpi_to_cl(k)) for k in items],
        total=total, page=page, size=size,
        pages=ceil(total / size) if total else 1,
    )


@router.post("", response_model=KpiCLRead, status_code=201)
async def create_kpi_cl(
    body:         KpiCLCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    if body.loai_kpi not in VALID_LOAI:
        raise HTTPException(422, f"loai_kpi phải là: {VALID_LOAI}")

    k = KPI(
        code=body.ma_kpi,
        title=body.ten,
        description=body.mo_ta,
        category=body.danh_muc,
        unit=body.don_vi_do,
        target_value=body.gia_tri_muc_tieu,
        current_value=0.0,
        progress=0.0,
        period=_loai_to_period(body.loai_kpi),
        year=body.nam,
        quarter=body.quy,
        term_name=body.ten_nhiem_ky,
        deadline=body.han_hoan_thanh,
        responsible_department_id=body.don_vi_phu_trach_id,
        responsible_user_id=body.nguoi_theo_doi_id,
        kpi_type="chien_luoc",
        created_by=current_user.id,
        status="on_track",
    )
    _recalc(k)
    db.add(k)
    await db.commit()
    return KpiCLRead.model_validate(_kpi_to_cl(await _get_or_404(db, k.id)))


@router.put("/{kpi_id}", response_model=KpiCLRead)
async def update_kpi_cl(
    kpi_id:       int,
    body:         KpiCLUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    k = await _get_or_404(db, kpi_id)

    if body.ma_kpi is not None:       k.code = body.ma_kpi
    if body.ten is not None:          k.title = body.ten
    if body.mo_ta is not None:        k.description = body.mo_ta
    if body.loai_kpi is not None:     k.period = _loai_to_period(body.loai_kpi)
    if body.danh_muc is not None:     k.category = body.danh_muc
    if body.gia_tri_muc_tieu is not None: k.target_value = body.gia_tri_muc_tieu
    if body.don_vi_do is not None:    k.unit = body.don_vi_do
    if body.quy is not None:          k.quarter = body.quy
    if body.nam is not None:          k.year = body.nam
    if body.ten_nhiem_ky is not None: k.term_name = body.ten_nhiem_ky
    if body.han_hoan_thanh is not None: k.deadline = body.han_hoan_thanh
    if body.don_vi_phu_trach_id is not None: k.responsible_department_id = body.don_vi_phu_trach_id
    if body.nguoi_theo_doi_id is not None:   k.responsible_user_id = body.nguoi_theo_doi_id

    _recalc(k)
    await db.commit()
    return KpiCLRead.model_validate(_kpi_to_cl(await _get_or_404(db, kpi_id)))


@router.delete("/{kpi_id}", status_code=204)
async def delete_kpi_cl(
    kpi_id:       int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    k = await _get_or_404(db, kpi_id)
    k.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("/{kpi_id}", response_model=KpiCLRead)
async def get_kpi_cl(
    kpi_id: int,
    db:     AsyncSession = Depends(get_db),
    _:      User         = Depends(get_current_user),
):
    return KpiCLRead.model_validate(_kpi_to_cl(await _get_or_404(db, kpi_id)))


# ─── Progress (tien_do) ───────────────────────────────────────────────────────

@router.post("/{kpi_id}/tien-do", response_model=KpiCLTienDoRead, status_code=201)
async def add_tien_do(
    kpi_id:       int,
    body:         KpiCLTienDoCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    k = await _get_or_404(db, kpi_id)
    k.current_value = body.gia_tri
    _recalc(k)

    entry = KPIProgress(
        kpi_id=kpi_id,
        value=body.gia_tri,
        note=body.ghi_chu,
        recorded_by=current_user.id,
    )
    db.add(entry)
    await db.flush()
    await db.commit()
    await db.refresh(entry)

    return KpiCLTienDoRead(
        id=entry.id,
        kpi_id=entry.kpi_id,
        gia_tri=entry.value,
        ghi_chu=entry.note,
        quy=body.quy,
        nam=body.nam,
        nguoi_cap_nhat={"id": current_user.id, "username": current_user.username, "full_name": current_user.full_name},
        created_at=entry.recorded_at,
    )


@router.get("/{kpi_id}/tien-do", response_model=list[KpiCLTienDoRead])
async def list_tien_do(
    kpi_id: int,
    db:     AsyncSession = Depends(get_db),
    _:      User         = Depends(get_current_user),
):
    k = await _get_or_404(db, kpi_id)
    rows = (await db.execute(
        select(KPIProgress)
        .options(selectinload(KPIProgress.user))
        .where(KPIProgress.kpi_id == kpi_id)
        .order_by(KPIProgress.recorded_at.desc())
    )).scalars().all()

    return [
        KpiCLTienDoRead(
            id=r.id,
            kpi_id=r.kpi_id,
            gia_tri=r.value,
            ghi_chu=r.note,
            quy=k.quarter,
            nam=k.year,
            nguoi_cap_nhat=(
                {"id": r.user.id, "username": r.user.username, "full_name": r.user.full_name}
                if r.user else None
            ),
            created_at=r.recorded_at,
        )
        for r in rows
    ]
