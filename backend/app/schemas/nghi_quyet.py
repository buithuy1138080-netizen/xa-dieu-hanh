from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ─── Shared mins ─────────────────────────────────────────────────────────────

class UserMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    username: str
    full_name: str | None


class DeptMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    short_name: str | None
    code: str | None


class StaffMin(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    full_name: str
    position: str | None
    employee_code: str | None


# ─── NghiQuyet ────────────────────────────────────────────────────────────────

class NghiQuyetCreate(BaseModel):
    ma_nghi_quyet: str | None = None
    ten: str
    mo_ta: str | None = None
    loai: str = "nghi_quyet"
    nam_bat_dau: int
    nam_ket_thuc: int
    ngay_ban_hanh: date | None = None


class NghiQuyetUpdate(BaseModel):
    ma_nghi_quyet: str | None = None
    ten: str | None = None
    mo_ta: str | None = None
    loai: str | None = None
    nam_bat_dau: int | None = None
    nam_ket_thuc: int | None = None
    ngay_ban_hanh: date | None = None


class NghiQuyetRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    ma_nghi_quyet: str | None
    ten: str
    mo_ta: str | None
    loai: str
    nam_bat_dau: int
    nam_ket_thuc: int
    ngay_ban_hanh: date | None
    creator: UserMin
    created_at: datetime
    updated_at: datetime | None


class NghiQuyetReadDetail(NghiQuyetRead):
    so_muc_tieu: int = 0
    so_kpi: int = 0


# ─── MucTieuNQ ───────────────────────────────────────────────────────────────

class MucTieuCreate(BaseModel):
    nghi_quyet_id: int
    muc_tieu_cha_id: int | None = None
    ma_chi_tieu: str | None = None
    ten: str
    mo_ta: str | None = None
    loai_chi_tieu: str | None = None
    cap_do: int = Field(default=1, ge=1, le=3)
    gia_tri_muc_tieu: float | None = None
    don_vi_do: str | None = None
    don_vi_phu_trach_id: int | None = None
    can_bo_theo_doi_id: int | None = None
    nam_hoan_thanh: int | None = None
    thu_tu: int = 0
    ghi_chu: str | None = None


class MucTieuUpdate(BaseModel):
    muc_tieu_cha_id: int | None = None
    ma_chi_tieu: str | None = None
    ten: str | None = None
    mo_ta: str | None = None
    loai_chi_tieu: str | None = None
    gia_tri_muc_tieu: float | None = None
    don_vi_do: str | None = None
    don_vi_phu_trach_id: int | None = None
    can_bo_theo_doi_id: int | None = None
    nam_hoan_thanh: int | None = None
    thu_tu: int | None = None
    ghi_chu: str | None = None


class MucTieuRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    nghi_quyet_id: int
    muc_tieu_cha_id: int | None
    ma_chi_tieu: str | None
    ten: str
    mo_ta: str | None
    loai_chi_tieu: str | None
    cap_do: int
    gia_tri_muc_tieu: float | None
    don_vi_do: str | None
    don_vi_phu_trach_id: int | None
    don_vi_phu_trach: DeptMin | None
    can_bo_theo_doi_id: int | None
    can_bo_theo_doi: StaffMin | None
    nam_hoan_thanh: int | None
    thu_tu: int
    ghi_chu: str | None
    creator: UserMin
    created_at: datetime
    updated_at: datetime | None


class MucTieuReadWithChildren(MucTieuRead):
    con: list["MucTieuReadWithChildren"] = []


MucTieuReadWithChildren.model_rebuild()


# ─── BangTheoDoi ─────────────────────────────────────────────────────────────

class BangTheoDoiCreate(BaseModel):
    chi_tieu_id: int
    gia_tri_thuc_te: float
    ghi_chu: str | None = None
    thang: int | None = Field(None, ge=1, le=12)
    quy: int | None = Field(None, ge=1, le=4)
    nam: int


class BangTheoDoiRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    chi_tieu_id: int
    gia_tri_thuc_te: float
    ghi_chu: str | None
    thang: int | None
    quy: int | None
    nam: int
    nguoi_cap_nhat: UserMin
    created_at: datetime


# ─── NQLienKet ───────────────────────────────────────────────────────────────

class NQLienKetCreate(BaseModel):
    chi_tieu_id: int
    loai_cong_viec: str
    cong_viec_id: int
    ghi_chu: str | None = None


class NQLienKetRead(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    chi_tieu_id: int
    loai_cong_viec: str
    cong_viec_id: int
    ghi_chu: str | None
    nguoi_lien_ket: UserMin
    created_at: datetime


# ─── Dashboard schemas ────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    tong_kpi: int
    dung_tien_do: int
    co_rui_ro: int
    cham_tien_do: int
    hoan_thanh: int
    qua_han: int
    tien_do_tb: float


class KPIBarItem(BaseModel):
    id: int
    ma_chi_tieu: str | None
    ten: str
    don_vi_do: str | None
    pct_so_lieu: float
    trang_thai: str


class TrangThaiDonutItem(BaseModel):
    trang_thai: str
    so_luong: int
    ty_le: float


class DashboardCharts(BaseModel):
    bar_chart: list[KPIBarItem]
    donut_chart: list[TrangThaiDonutItem]


class TopDelayedItem(BaseModel):
    id: int
    ma_chi_tieu: str | None
    ten: str
    don_vi_do: str | None
    gia_tri_thuc_te_moi_nhat: float
    gia_tri_muc_tieu: float | None
    pct_so_lieu: float
    trang_thai: str
    don_vi_phu_trach_ten: str | None
    don_vi_phu_trach_viet_tat: str | None
    cap_nhat_luc: datetime | None


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    size: int
    pages: int
