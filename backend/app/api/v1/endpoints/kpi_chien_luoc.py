from datetime import date
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.kpi import KPI
from app.models.kpi_chien_luoc import KpiCL, KpiCLTienDo
from app.models.task import Task
from app.models.user import User
from app.schemas.kpi_chien_luoc import (
    HeatmapCell, HeatmapData, KpiCLCreate, KpiCLRankItem, KpiCLRead,
    KpiCLStats, KpiCLTienDoCreate, KpiCLTienDoRead, KpiCLUpdate,
    OverdueItem, PaginatedKpiCL, RankingData,
)

router = APIRouter()

VALID_LOAI  = {"quy", "nam", "nhiem_ky"}
VALID_TRANG_THAI = {
    "Chưa bắt đầu", "Đúng tiến độ", "Có rủi ro",
    "Chậm tiến độ", "Đạt mục tiêu", "Quá hạn",
}


async def _validate_soft_fks(
    db: AsyncSession,
    van_ban_id: int | None,
    nhiem_vu_id: int | None,
    chi_tieu_nq_id: int | None,
) -> None:
    """Validate soft-FK references exist before saving."""
    if van_ban_id is not None:
        exists = (await db.execute(
            select(Document.id).where(Document.id == van_ban_id)
        )).scalar_one_or_none()
        if not exists:
            raise HTTPException(422, f"van_ban_id={van_ban_id} không tồn tại trong bảng documents")

    if nhiem_vu_id is not None:
        exists = (await db.execute(
            select(Task.id).where(Task.id == nhiem_vu_id, Task.deleted_at.is_(None))
        )).scalar_one_or_none()
        if not exists:
            raise HTTPException(422, f"nhiem_vu_id={nhiem_vu_id} không tồn tại trong bảng tasks")

    if chi_tieu_nq_id is not None:
        exists = (await db.execute(
            select(KPI.id).where(KPI.id == chi_tieu_nq_id)
        )).scalar_one_or_none()
        if not exists:
            raise HTTPException(422, f"chi_tieu_nq_id={chi_tieu_nq_id} không tồn tại trong bảng kpis")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _compute_status(pct: float, han: Optional[date]) -> str:
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


def _recalc(kpi: KpiCL) -> None:
    if kpi.gia_tri_muc_tieu and kpi.gia_tri_muc_tieu > 0:
        kpi.pct_hoan_thanh = max(0.0, min(100.0, round((kpi.gia_tri_thuc_te / kpi.gia_tri_muc_tieu) * 100, 2)))
    else:
        kpi.pct_hoan_thanh = 0.0
    kpi.trang_thai = _compute_status(kpi.pct_hoan_thanh, kpi.han_hoan_thanh)


def _with_relations(stmt):
    return stmt.options(
        selectinload(KpiCL.don_vi_phu_trach),
        selectinload(KpiCL.nguoi_theo_doi),
        selectinload(KpiCL.creator),
    )


async def _get_or_404(db: AsyncSession, kpi_id: int) -> KpiCL:
    kpi = (await db.execute(_with_relations(
        select(KpiCL).where(KpiCL.id == kpi_id)
    ))).scalar_one_or_none()
    if not kpi:
        raise HTTPException(404, "Không tìm thấy KPI chiến lược")
    return kpi


# ─── Dashboard (static routes FIRST) ─────────────────────────────────────────

@router.get("/stats", response_model=KpiCLStats)
async def get_stats(
    nam:         Optional[int] = None,
    loai_kpi:    Optional[str] = None,
    danh_muc:    Optional[str] = None,
    ten_nhiem_ky: Optional[str] = None,
    db:          AsyncSession  = Depends(get_db),
    _:           User          = Depends(get_current_user),
):
    q = select(KpiCL)
    if nam:         q = q.where(KpiCL.nam == nam)
    if loai_kpi:    q = q.where(KpiCL.loai_kpi == loai_kpi)
    if danh_muc:    q = q.where(KpiCL.danh_muc == danh_muc)
    if ten_nhiem_ky: q = q.where(KpiCL.ten_nhiem_ky == ten_nhiem_ky)

    rows = (await db.execute(q)).scalars().all()
    total = len(rows)
    pct_values = [r.pct_hoan_thanh for r in rows]

    def cnt(tt): return sum(1 for r in rows if r.trang_thai == tt)

    return KpiCLStats(
        tong=total,
        dat_muc_tieu=cnt("Đạt mục tiêu"),
        dung_tien_do=cnt("Đúng tiến độ"),
        co_rui_ro=cnt("Có rủi ro"),
        cham_tien_do=cnt("Chậm tiến độ"),
        qua_han=cnt("Quá hạn"),
        chua_bat_dau=cnt("Chưa bắt đầu"),
        pct_tb=round(sum(pct_values) / total, 2) if total else 0.0,
        so_quy=sum(1 for r in rows if r.loai_kpi == "quy"),
        so_nam=sum(1 for r in rows if r.loai_kpi == "nam"),
        so_nhiem_ky=sum(1 for r in rows if r.loai_kpi == "nhiem_ky"),
    )


@router.get("/heatmap", response_model=HeatmapData)
async def get_heatmap(
    nam:         int            = Query(..., description="Năm hiển thị heatmap"),
    loai_kpi:    Optional[str]  = None,
    ten_nhiem_ky: Optional[str] = None,
    db:          AsyncSession   = Depends(get_db),
    _:           User           = Depends(get_current_user),
):
    q = select(KpiCL).where(KpiCL.nam == nam)
    if loai_kpi:     q = q.where(KpiCL.loai_kpi == loai_kpi)
    if ten_nhiem_ky: q = q.where(KpiCL.ten_nhiem_ky == ten_nhiem_ky)
    rows = (await db.execute(q)).scalars().all()

    # Build period label per row
    def period_label(r: KpiCL) -> str:
        if r.loai_kpi == "quy" and r.quy:
            return f"Q{r.quy}/{r.nam}"
        if r.loai_kpi == "nhiem_ky" and r.ten_nhiem_ky:
            return r.ten_nhiem_ky
        return str(r.nam)

    # Aggregate by (danh_muc, period)
    agg: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        cat = r.danh_muc or "Khác"
        period = period_label(r)
        key = (cat, period)
        agg.setdefault(key, []).append(r.pct_hoan_thanh)

    all_cats    = sorted({k[0] for k in agg})
    all_periods = sorted({k[1] for k in agg})

    cells = [
        HeatmapCell(
            danh_muc=cat,
            period=period,
            avg_pct=round(sum(vals) / len(vals), 1),
            count=len(vals),
        )
        for (cat, period), vals in agg.items()
    ]

    return HeatmapData(danh_mucs=all_cats, periods=all_periods, cells=cells)


@router.get("/ranking", response_model=RankingData)
async def get_ranking(
    nam:         Optional[int]  = None,
    loai_kpi:    Optional[str]  = None,
    ten_nhiem_ky: Optional[str] = None,
    top_n:       int            = Query(5, ge=1, le=20),
    db:          AsyncSession   = Depends(get_db),
    _:           User           = Depends(get_current_user),
):
    q = select(KpiCL).options(selectinload(KpiCL.don_vi_phu_trach))
    if nam:          q = q.where(KpiCL.nam == nam)
    if loai_kpi:     q = q.where(KpiCL.loai_kpi == loai_kpi)
    if ten_nhiem_ky: q = q.where(KpiCL.ten_nhiem_ky == ten_nhiem_ky)
    rows = (await db.execute(q)).scalars().all()

    def to_item(r: KpiCL) -> KpiCLRankItem:
        return KpiCLRankItem(
            id=r.id, ma_kpi=r.ma_kpi, ten=r.ten, danh_muc=r.danh_muc,
            loai_kpi=r.loai_kpi, pct_hoan_thanh=r.pct_hoan_thanh,
            trang_thai=r.trang_thai,
            don_vi_phu_trach_ten=(
                r.don_vi_phu_trach.short_name or r.don_vi_phu_trach.name
                if r.don_vi_phu_trach else None
            ),
        )

    sorted_desc = sorted(rows, key=lambda r: r.pct_hoan_thanh, reverse=True)
    sorted_asc  = sorted(rows, key=lambda r: r.pct_hoan_thanh)
    return RankingData(
        top=[to_item(r) for r in sorted_desc[:top_n]],
        bottom=[to_item(r) for r in sorted_asc[:top_n]],
    )


@router.get("/overdue", response_model=list[OverdueItem])
async def get_overdue(
    nam:      Optional[int] = None,
    limit:    int           = Query(10, ge=1, le=50),
    db:       AsyncSession  = Depends(get_db),
    _:        User          = Depends(get_current_user),
):
    today = date.today()
    q = (
        select(KpiCL)
        .options(selectinload(KpiCL.don_vi_phu_trach))
        .where(KpiCL.trang_thai == "Quá hạn")
        .order_by(KpiCL.pct_hoan_thanh.asc())
        .limit(limit)
    )
    if nam:
        q = q.where(KpiCL.nam == nam)
    rows = (await db.execute(q)).scalars().all()

    result = []
    for r in rows:
        ngay_qua = (today - r.han_hoan_thanh).days if r.han_hoan_thanh else 0
        result.append(OverdueItem(
            id=r.id, ma_kpi=r.ma_kpi, ten=r.ten, danh_muc=r.danh_muc,
            loai_kpi=r.loai_kpi, pct_hoan_thanh=r.pct_hoan_thanh,
            trang_thai=r.trang_thai, han_hoan_thanh=r.han_hoan_thanh,
            don_vi_phu_trach_ten=(
                r.don_vi_phu_trach.short_name or r.don_vi_phu_trach.name
                if r.don_vi_phu_trach else None
            ),
            so_ngay_qua_han=max(0, ngay_qua),
        ))
    return result


# ─── KpiCL CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedKpiCL)
async def list_kpi_cl(
    page:        int            = Query(1, ge=1),
    size:        int            = Query(20, ge=1, le=100),
    search:      Optional[str]  = None,
    loai_kpi:    Optional[str]  = None,
    danh_muc:    Optional[str]  = None,
    trang_thai:  Optional[str]  = None,
    nam:         Optional[int]  = None,
    quy:         Optional[int]  = None,
    ten_nhiem_ky: Optional[str] = None,
    db:          AsyncSession   = Depends(get_db),
    _:           User           = Depends(get_current_user),
):
    q = _with_relations(select(KpiCL))
    if search:       q = q.where(KpiCL.ten.ilike(f"%{search}%") | KpiCL.ma_kpi.ilike(f"%{search}%"))
    if loai_kpi:     q = q.where(KpiCL.loai_kpi == loai_kpi)
    if danh_muc:     q = q.where(KpiCL.danh_muc == danh_muc)
    if trang_thai:   q = q.where(KpiCL.trang_thai == trang_thai)
    if nam:          q = q.where(KpiCL.nam == nam)
    if quy:          q = q.where(KpiCL.quy == quy)
    if ten_nhiem_ky: q = q.where(KpiCL.ten_nhiem_ky == ten_nhiem_ky)
    q = q.order_by(KpiCL.loai_kpi, KpiCL.nam, KpiCL.danh_muc, KpiCL.ma_kpi)

    total = (await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))).scalar_one()
    items = (await db.execute(q.offset((page - 1) * size).limit(size))).scalars().all()
    return PaginatedKpiCL(
        items=items, total=total, page=page, size=size,
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
    await _validate_soft_fks(db, body.van_ban_id, body.nhiem_vu_id, body.chi_tieu_nq_id)
    kpi = KpiCL(**body.model_dump(), gia_tri_thuc_te=0.0, pct_hoan_thanh=0.0, created_by=current_user.id)
    _recalc(kpi)
    db.add(kpi)
    await db.commit()
    await db.refresh(kpi)
    return await _get_or_404(db, kpi.id)


@router.put("/{kpi_id}", response_model=KpiCLRead)
async def update_kpi_cl(
    kpi_id:       int,
    body:         KpiCLUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    await _validate_soft_fks(db, body.van_ban_id, body.nhiem_vu_id, body.chi_tieu_nq_id)
    kpi = await _get_or_404(db, kpi_id)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(kpi, field, val)
    _recalc(kpi)
    await db.commit()
    return await _get_or_404(db, kpi_id)


@router.delete("/{kpi_id}", status_code=204)
async def delete_kpi_cl(
    kpi_id:       int,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Cần quyền admin hoặc leader")
    kpi = await _get_or_404(db, kpi_id)
    await db.delete(kpi)
    await db.commit()


@router.get("/{kpi_id}", response_model=KpiCLRead)
async def get_kpi_cl(
    kpi_id: int,
    db:     AsyncSession = Depends(get_db),
    _:      User         = Depends(get_current_user),
):
    return await _get_or_404(db, kpi_id)


@router.post("/{kpi_id}/tien-do", response_model=KpiCLTienDoRead, status_code=201)
async def add_tien_do(
    kpi_id:       int,
    body:         KpiCLTienDoCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    kpi = await _get_or_404(db, kpi_id)
    entry = KpiCLTienDo(
        kpi_id=kpi_id,
        gia_tri=body.gia_tri,
        ghi_chu=body.ghi_chu,
        quy=body.quy,
        nam=body.nam,
        nguoi_cap_nhat_id=current_user.id,
    )
    db.add(entry)
    kpi.gia_tri_thuc_te = body.gia_tri
    _recalc(kpi)
    await db.commit()
    await db.refresh(entry)
    stmt = (
        select(KpiCLTienDo)
        .options(selectinload(KpiCLTienDo.nguoi_cap_nhat))
        .where(KpiCLTienDo.id == entry.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.get("/{kpi_id}/tien-do", response_model=list[KpiCLTienDoRead])
async def list_tien_do(
    kpi_id: int,
    db:     AsyncSession = Depends(get_db),
    _:      User         = Depends(get_current_user),
):
    await _get_or_404(db, kpi_id)
    rows = (await db.execute(
        select(KpiCLTienDo)
        .options(selectinload(KpiCLTienDo.nguoi_cap_nhat))
        .where(KpiCLTienDo.kpi_id == kpi_id)
        .order_by(KpiCLTienDo.created_at.desc())
    )).scalars().all()
    return rows


@router.get("/meta/danh-muc", response_model=list[str])
async def list_danh_muc(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(get_current_user),
):
    rows = (await db.execute(
        select(KpiCL.danh_muc).where(KpiCL.danh_muc.isnot(None)).distinct()
    )).scalars().all()
    return sorted(rows)


@router.get("/meta/nhiem-ky", response_model=list[str])
async def list_nhiem_ky(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(get_current_user),
):
    rows = (await db.execute(
        select(KpiCL.ten_nhiem_ky).where(KpiCL.ten_nhiem_ky.isnot(None)).distinct()
    )).scalars().all()
    return sorted(rows)
