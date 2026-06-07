from datetime import datetime, timezone
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin_or_leader
from app.models.nghi_quyet import BangTheoDoi, MucTieuNQ, NghiQuyet, NQLienKetCongViec
from app.models.user import User
from app.schemas.nghi_quyet import (
    BangTheoDoiCreate,
    BangTheoDoiRead,
    DashboardCharts,
    DashboardSummary,
    KPIBarItem,
    MucTieuCreate,
    MucTieuRead,
    MucTieuReadWithChildren,
    MucTieuUpdate,
    NghiQuyetCreate,
    NghiQuyetRead,
    NghiQuyetReadDetail,
    NghiQuyetUpdate,
    NQLienKetCreate,
    NQLienKetRead,
    PaginatedResponse,
    TrangThaiDonutItem,
    TopDelayedItem,
)

router = APIRouter()

VALID_LOAI_NQ = {"nghi_quyet", "de_an", "ke_hoach"}
VALID_LOAI_CV = {"task", "document", "directive", "nq57_task"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_nq_or_404(db: AsyncSession, nq_id: int) -> NghiQuyet:
    nq = (await db.execute(
        select(NghiQuyet).where(NghiQuyet.id == nq_id, NghiQuyet.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not nq:
        raise HTTPException(404, "Không tìm thấy nghị quyết")
    return nq


async def _get_mt_or_404(db: AsyncSession, mt_id: int) -> MucTieuNQ:
    mt = (await db.execute(select(MucTieuNQ).where(MucTieuNQ.id == mt_id))).scalar_one_or_none()
    if not mt:
        raise HTTPException(404, "Không tìm thấy mục tiêu / chỉ tiêu")
    return mt


async def _mt_with_relations(db: AsyncSession, mt_id: int) -> MucTieuNQ:
    stmt = (
        select(MucTieuNQ)
        .options(
            selectinload(MucTieuNQ.don_vi_phu_trach),
            selectinload(MucTieuNQ.can_bo_theo_doi),
            selectinload(MucTieuNQ.creator),
        )
        .where(MucTieuNQ.id == mt_id)
    )
    mt = (await db.execute(stmt)).scalar_one_or_none()
    if not mt:
        raise HTTPException(404, "Không tìm thấy mục tiêu / chỉ tiêu")
    return mt


def _build_tree(nodes: list[MucTieuNQ]) -> list[MucTieuReadWithChildren]:
    # Build từ MucTieuRead (không có 'con') rồi chuyển sang dict để tránh
    # Pydantic truy cập lazy relationship MucTieuNQ.con → lỗi greenlet async.
    node_map: dict[int, MucTieuReadWithChildren] = {}
    for n in nodes:
        base = MucTieuRead.model_validate(n)
        item = MucTieuReadWithChildren.model_validate({**base.model_dump(), "con": []})
        node_map[n.id] = item

    # Build ancestor sets to detect circular muc_tieu_cha_id references.
    parent_of: dict[int, int] = {
        n.id: n.muc_tieu_cha_id
        for n in nodes
        if n.muc_tieu_cha_id and n.muc_tieu_cha_id in node_map
    }

    def _is_ancestor(child_id: int, ancestor_id: int) -> bool:
        visited: set[int] = set()
        cur = child_id
        while cur in parent_of:
            if cur in visited:
                return True  # cycle detected
            visited.add(cur)
            cur = parent_of[cur]
            if cur == ancestor_id:
                return True
        return False

    roots: list[MucTieuReadWithChildren] = []
    for n in nodes:
        item = node_map[n.id]
        pid = n.muc_tieu_cha_id
        if pid and pid in node_map and not _is_ancestor(pid, n.id):
            node_map[pid].con.append(item)
        else:
            roots.append(item)
    return roots


# ─── NghiQuyet overview (aggregate stats) ────────────────────────────────────

@router.get("/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Tổng quan toàn bộ nghị quyết/đề án/kế hoạch."""
    # Đếm theo loại
    count_by_loai = (await db.execute(
        select(NghiQuyet.loai, func.count().label("cnt"))
        .where(NghiQuyet.deleted_at.is_(None))
        .group_by(NghiQuyet.loai)
    )).all()

    # Tổng số mục tiêu và KPI
    from app.models.nghi_quyet import MucTieuNQ, BangTheoDoi
    total_muc_tieu = (await db.execute(
        select(func.count(MucTieuNQ.id))
        .join(NghiQuyet, MucTieuNQ.nghi_quyet_id == NghiQuyet.id)
        .where(NghiQuyet.deleted_at.is_(None))
    )).scalar_one() or 0

    # Tiến độ trung bình từ bảng theo dõi mới nhất
    from sqlalchemy import over
    avg_pct = (await db.execute(
        select(func.avg(BangTheoDoi.pct_so_lieu))
        .join(MucTieuNQ, BangTheoDoi.muc_tieu_id == MucTieuNQ.id)
        .join(NghiQuyet, MucTieuNQ.nghi_quyet_id == NghiQuyet.id)
        .where(NghiQuyet.deleted_at.is_(None))
    )).scalar_one() or 0

    # Trạng thái KPI
    status_counts = (await db.execute(
        select(MucTieuNQ.trang_thai, func.count().label("cnt"))
        .join(NghiQuyet, MucTieuNQ.nghi_quyet_id == NghiQuyet.id)
        .where(NghiQuyet.deleted_at.is_(None), MucTieuNQ.cap == 3)
        .group_by(MucTieuNQ.trang_thai)
    )).all()

    # Danh sách NQ có tiến độ (top 10)
    nqs = (await db.execute(
        select(
            NghiQuyet.id, NghiQuyet.ten, NghiQuyet.loai,
            NghiQuyet.nam_bat_dau, NghiQuyet.nam_ket_thuc,
            func.count(MucTieuNQ.id).label("so_kpi"),
            func.avg(BangTheoDoi.pct_so_lieu).label("tien_do"),
        )
        .outerjoin(MucTieuNQ, MucTieuNQ.nghi_quyet_id == NghiQuyet.id)
        .outerjoin(BangTheoDoi, BangTheoDoi.muc_tieu_id == MucTieuNQ.id)
        .where(NghiQuyet.deleted_at.is_(None))
        .group_by(NghiQuyet.id, NghiQuyet.ten, NghiQuyet.loai,
                  NghiQuyet.nam_bat_dau, NghiQuyet.nam_ket_thuc)
        .order_by(NghiQuyet.nam_ket_thuc.desc())
        .limit(10)
    )).all()

    return {
        "by_loai": {r.loai: r.cnt for r in count_by_loai},
        "total": sum(r.cnt for r in count_by_loai),
        "total_muc_tieu": total_muc_tieu,
        "avg_progress": round(float(avg_pct), 1),
        "status_counts": {r.trang_thai or "chua_cap_nhat": r.cnt for r in status_counts},
        "programs": [
            {
                "id": r.id, "ten": r.ten, "loai": r.loai,
                "nam_bat_dau": r.nam_bat_dau, "nam_ket_thuc": r.nam_ket_thuc,
                "so_kpi": r.so_kpi or 0,
                "tien_do": round(float(r.tien_do or 0), 1),
            }
            for r in nqs
        ],
    }


# ─── NghiQuyet list / create ─────────────────────────────────────────────────
# NOTE: tất cả static path (/dashboard-*, /muc-tieu) phải đứng TRƯỚC /{nq_id}

@router.get("", response_model=PaginatedResponse[NghiQuyetRead])
async def list_nghi_quyet(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    loai: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(NghiQuyet).options(selectinload(NghiQuyet.creator)).where(NghiQuyet.deleted_at.is_(None))
    if loai:
        q = q.where(NghiQuyet.loai == loai)
    q = q.order_by(NghiQuyet.nam_ket_thuc.desc(), NghiQuyet.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(q.order_by(None).subquery()))).scalar_one()
    items = (await db.execute(q.offset((page - 1) * size).limit(size))).scalars().all()
    return PaginatedResponse(items=items, total=total, page=page, size=size, pages=ceil(total / size))


@router.post("", response_model=NghiQuyetRead, status_code=201)
async def create_nghi_quyet(
    body: NghiQuyetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    if body.loai not in VALID_LOAI_NQ:
        raise HTTPException(422, f"loai phải là một trong: {VALID_LOAI_NQ}")
    if body.nam_bat_dau > body.nam_ket_thuc:
        raise HTTPException(422, "nam_bat_dau không được lớn hơn nam_ket_thuc")
    nq = NghiQuyet(**body.model_dump(), created_by=current_user.id)
    db.add(nq)
    await db.commit()
    await db.refresh(nq)
    stmt = select(NghiQuyet).options(selectinload(NghiQuyet.creator)).where(NghiQuyet.id == nq.id)
    return (await db.execute(stmt)).scalar_one()


# ─── Dashboard (PHẢI đứng TRƯỚC /{nq_id}) ────────────────────────────────────

def _nam_clause(nam: Optional[int]) -> str:
    """Trả về mệnh đề SQL lọc năm. Tránh asyncpg AmbiguousParameterError khi nam=None."""
    return "AND nam_hoan_thanh = :nam" if nam is not None else ""


@router.get("/dashboard-summary", response_model=DashboardSummary)
async def dashboard_summary(
    nghi_quyet_id: int = Query(..., description="ID nghị quyết"),
    nam: Optional[int] = Query(None, description="Lọc theo năm hoàn thành (bỏ trống = toàn nhiệm kỳ)"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_nq_or_404(db, nghi_quyet_id)
    params: dict = {"nq_id": nghi_quyet_id}
    if nam is not None:
        params["nam"] = nam

    # Dùng f-string để inject mệnh đề năm — tránh asyncpg AmbiguousParameterError với None
    sql_str = (
        "SELECT COUNT(*) AS tong_kpi,"
        " COUNT(*) FILTER (WHERE trang_thai = 'Đúng tiến độ') AS dung_tien_do,"
        " COUNT(*) FILTER (WHERE trang_thai = 'Có rủi ro') AS co_rui_ro,"
        " COUNT(*) FILTER (WHERE trang_thai = 'Chậm tiến độ') AS cham_tien_do,"
        " COUNT(*) FILTER (WHERE trang_thai = 'Hoàn thành') AS hoan_thanh,"
        " COUNT(*) FILTER (WHERE trang_thai = 'Quá hạn') AS qua_han,"
        " ROUND(COALESCE(AVG(pct_so_lieu), 0)::numeric, 2) AS tien_do_tb"
        " FROM v_nq_tong_quan"
        " WHERE cap_do = 3 AND nghi_quyet_id = :nq_id " + _nam_clause(nam)
    )
    sql = text(sql_str)
    row = (await db.execute(sql, params)).mappings().one()
    return DashboardSummary(
        tong_kpi=row["tong_kpi"],
        dung_tien_do=row["dung_tien_do"],
        co_rui_ro=row["co_rui_ro"],
        cham_tien_do=row["cham_tien_do"],
        hoan_thanh=row["hoan_thanh"],
        qua_han=row["qua_han"],
        tien_do_tb=float(row["tien_do_tb"]),
    )


@router.get("/dashboard-charts", response_model=DashboardCharts)
async def dashboard_charts(
    nghi_quyet_id: int = Query(...),
    nam: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_nq_or_404(db, nghi_quyet_id)

    nc = _nam_clause(nam)
    params: dict = {"nq_id": nghi_quyet_id}
    if nam is not None:
        params["nam"] = nam

    bar_rows = (await db.execute(text(
        "SELECT id, ma_chi_tieu, ten, don_vi_do, pct_so_lieu, trang_thai"
        " FROM v_nq_tong_quan"
        " WHERE cap_do = 3 AND nghi_quyet_id = :nq_id " + nc +
        " ORDER BY pct_so_lieu ASC"
    ), params)).mappings().all()

    donut_rows = (await db.execute(text(
        "SELECT trang_thai, COUNT(*) AS so_luong"
        " FROM v_nq_tong_quan"
        " WHERE cap_do = 3 AND nghi_quyet_id = :nq_id " + nc +
        " GROUP BY trang_thai ORDER BY so_luong DESC"
    ), params)).mappings().all()

    total_kpi = sum(r["so_luong"] for r in donut_rows) or 1
    return DashboardCharts(
        bar_chart=[
            KPIBarItem(
                id=r["id"], ma_chi_tieu=r["ma_chi_tieu"], ten=r["ten"],
                don_vi_do=r["don_vi_do"], pct_so_lieu=float(r["pct_so_lieu"]),
                trang_thai=r["trang_thai"],
            )
            for r in bar_rows
        ],
        donut_chart=[
            TrangThaiDonutItem(
                trang_thai=r["trang_thai"], so_luong=r["so_luong"],
                ty_le=round(r["so_luong"] / total_kpi * 100, 2),
            )
            for r in donut_rows
        ],
    )


@router.get("/dashboard-top-delayed", response_model=list[TopDelayedItem])
async def dashboard_top_delayed(
    nghi_quyet_id: int = Query(...),
    nam: Optional[int] = Query(None),
    limit: int = Query(5, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_nq_or_404(db, nghi_quyet_id)
    nc = _nam_clause(nam).replace("nam_hoan_thanh", "v.nam_hoan_thanh")
    params: dict = {"nq_id": nghi_quyet_id, "lim": limit}
    if nam is not None:
        params["nam"] = nam

    rows = (await db.execute(text(
        "SELECT v.id, v.ma_chi_tieu, v.ten, v.don_vi_do,"
        " v.gia_tri_thuc_te_moi_nhat, v.gia_tri_muc_tieu,"
        " v.pct_so_lieu, v.trang_thai, v.cap_nhat_luc,"
        " d.name AS don_vi_phu_trach_ten, d.short_name AS don_vi_phu_trach_viet_tat"
        " FROM v_nq_tong_quan v"
        " LEFT JOIN departments d ON d.id = v.don_vi_phu_trach_id"
        " WHERE v.cap_do = 3 AND v.nghi_quyet_id = :nq_id"
        " AND v.trang_thai IN ('Chậm tiến độ', 'Có rủi ro', 'Quá hạn') " + nc +
        " ORDER BY v.pct_so_lieu ASC LIMIT :lim"
    ), params)).mappings().all()

    return [
        TopDelayedItem(
            id=r["id"], ma_chi_tieu=r["ma_chi_tieu"], ten=r["ten"],
            don_vi_do=r["don_vi_do"],
            gia_tri_thuc_te_moi_nhat=float(r["gia_tri_thuc_te_moi_nhat"] or 0),
            gia_tri_muc_tieu=r["gia_tri_muc_tieu"],
            pct_so_lieu=float(r["pct_so_lieu"]),
            trang_thai=r["trang_thai"],
            don_vi_phu_trach_ten=r["don_vi_phu_trach_ten"],
            don_vi_phu_trach_viet_tat=r["don_vi_phu_trach_viet_tat"],
            cap_nhat_luc=r["cap_nhat_luc"],
        )
        for r in rows
    ]


# ─── MucTieuNQ CRUD (static paths trước) ─────────────────────────────────────

@router.post("/muc-tieu", response_model=MucTieuRead, status_code=201)
async def create_muc_tieu(
    body: MucTieuCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_leader),
):
    await _get_nq_or_404(db, body.nghi_quyet_id)
    if body.muc_tieu_cha_id:
        cha = await _get_mt_or_404(db, body.muc_tieu_cha_id)
        if cha.nghi_quyet_id != body.nghi_quyet_id:
            raise HTTPException(422, "Mục tiêu cha không thuộc cùng nghị quyết")
        if cha.cap_do >= 3:
            raise HTTPException(422, "Không thể thêm con vào chỉ tiêu cấp 3 (KPI)")
    mt = MucTieuNQ(**body.model_dump(), created_by=current_user.id)
    db.add(mt)
    await db.commit()
    await db.refresh(mt)
    return await _mt_with_relations(db, mt.id)


@router.put("/muc-tieu/{mt_id}", response_model=MucTieuRead)
async def update_muc_tieu(
    mt_id: int,
    body: MucTieuUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_leader),
):
    mt = await _get_mt_or_404(db, mt_id)
    data = body.model_dump(exclude_none=True)
    for field, val in data.items():
        setattr(mt, field, val)
    await db.commit()
    return await _mt_with_relations(db, mt_id)


@router.delete("/muc-tieu/{mt_id}", status_code=204)
async def delete_muc_tieu(
    mt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Không có quyền xóa mục tiêu")
    mt = await _get_mt_or_404(db, mt_id)
    await db.delete(mt)
    await db.commit()


@router.post("/muc-tieu/{mt_id}/theo-doi", response_model=BangTheoDoiRead, status_code=201)
async def add_theo_doi(
    mt_id: int,
    body: BangTheoDoiCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mt = await _get_mt_or_404(db, mt_id)
    if mt.cap_do != 3:
        raise HTTPException(422, "Chỉ có thể cập nhật số liệu cho chỉ tiêu cấp 3 (KPI)")
    td = BangTheoDoi(
        chi_tieu_id=mt_id,
        gia_tri_thuc_te=body.gia_tri_thuc_te,
        ghi_chu=body.ghi_chu,
        thang=body.thang,
        quy=body.quy,
        nam=body.nam,
        nguoi_cap_nhat_id=current_user.id,
    )
    db.add(td)
    await db.commit()
    await db.refresh(td)
    stmt = (
        select(BangTheoDoi)
        .options(selectinload(BangTheoDoi.nguoi_cap_nhat))
        .where(BangTheoDoi.id == td.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.get("/muc-tieu/{mt_id}/theo-doi", response_model=list[BangTheoDoiRead])
async def list_theo_doi(
    mt_id: int,
    nam: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_mt_or_404(db, mt_id)
    q = (
        select(BangTheoDoi)
        .options(selectinload(BangTheoDoi.nguoi_cap_nhat))
        .where(BangTheoDoi.chi_tieu_id == mt_id)
    )
    if nam:
        q = q.where(BangTheoDoi.nam == nam)
    q = q.order_by(BangTheoDoi.nam.desc(), BangTheoDoi.created_at.desc())
    return (await db.execute(q)).scalars().all()


@router.post("/muc-tieu/{mt_id}/lien-ket", response_model=NQLienKetRead, status_code=201)
async def add_lien_ket(
    mt_id: int,
    body: NQLienKetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_mt_or_404(db, mt_id)
    if body.loai_cong_viec not in VALID_LOAI_CV:
        raise HTTPException(422, f"loai_cong_viec phải là: {VALID_LOAI_CV}")
    lk = NQLienKetCongViec(
        chi_tieu_id=mt_id,
        loai_cong_viec=body.loai_cong_viec,
        cong_viec_id=body.cong_viec_id,
        ghi_chu=body.ghi_chu,
        nguoi_lien_ket_id=current_user.id,
    )
    db.add(lk)
    await db.commit()
    await db.refresh(lk)
    stmt = (
        select(NQLienKetCongViec)
        .options(selectinload(NQLienKetCongViec.nguoi_lien_ket))
        .where(NQLienKetCongViec.id == lk.id)
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/lien-ket/{lk_id}", status_code=204)
async def delete_lien_ket(
    lk_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lk = (await db.execute(
        select(NQLienKetCongViec).where(NQLienKetCongViec.id == lk_id)
    )).scalar_one_or_none()
    if not lk:
        raise HTTPException(404, "Không tìm thấy liên kết")
    await db.delete(lk)
    await db.commit()


# ─── NghiQuyet detail / update / delete (/{nq_id} CUỐI CÙNG) ─────────────────

@router.get("/{nq_id}", response_model=NghiQuyetReadDetail)
async def get_nghi_quyet(
    nq_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(NghiQuyet).options(selectinload(NghiQuyet.creator)).where(
        NghiQuyet.id == nq_id, NghiQuyet.deleted_at.is_(None)
    )
    nq = (await db.execute(stmt)).scalar_one_or_none()
    if not nq:
        raise HTTPException(404, "Không tìm thấy nghị quyết")
    so_muc_tieu = (await db.execute(
        select(func.count(MucTieuNQ.id)).where(MucTieuNQ.nghi_quyet_id == nq_id)
    )).scalar_one()
    so_kpi = (await db.execute(
        select(func.count(MucTieuNQ.id)).where(
            MucTieuNQ.nghi_quyet_id == nq_id, MucTieuNQ.cap_do == 3
        )
    )).scalar_one()
    result = NghiQuyetReadDetail.model_validate(nq)
    result.so_muc_tieu = so_muc_tieu
    result.so_kpi = so_kpi
    return result


@router.put("/{nq_id}", response_model=NghiQuyetRead)
async def update_nghi_quyet(
    nq_id: int,
    body: NghiQuyetUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_leader),
):
    nq = await _get_nq_or_404(db, nq_id)
    data = body.model_dump(exclude_none=True)
    if "loai" in data and data["loai"] not in VALID_LOAI_NQ:
        raise HTTPException(422, f"loai phải là một trong: {VALID_LOAI_NQ}")
    for field, val in data.items():
        setattr(nq, field, val)
    await db.commit()
    stmt = select(NghiQuyet).options(selectinload(NghiQuyet.creator)).where(
        NghiQuyet.id == nq_id, NghiQuyet.deleted_at.is_(None)
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/{nq_id}", status_code=204)
async def delete_nghi_quyet(
    nq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "leader"):
        raise HTTPException(403, "Không có quyền xóa nghị quyết")
    nq = await _get_nq_or_404(db, nq_id)
    nq.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.get("/{nq_id}/muc-tieu", response_model=list[MucTieuReadWithChildren])
async def get_tree(
    nq_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_nq_or_404(db, nq_id)
    stmt = (
        select(MucTieuNQ)
        .options(
            selectinload(MucTieuNQ.don_vi_phu_trach),
            selectinload(MucTieuNQ.can_bo_theo_doi),
            selectinload(MucTieuNQ.creator),
        )
        .where(MucTieuNQ.nghi_quyet_id == nq_id)
        .order_by(MucTieuNQ.cap_do, MucTieuNQ.thu_tu)
    )
    nodes = (await db.execute(stmt)).scalars().all()
    return _build_tree(list(nodes))
