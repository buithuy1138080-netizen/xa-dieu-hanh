from datetime import date, datetime
from typing import Annotated, Optional
from pydantic import BaseModel, Field, field_validator

_VALID_LOAI_KPI = {"quy", "nam", "nhiem_ky"}


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


# ─── KpiCL ────────────────────────────────────────────────────────────────────

class KpiCLCreate(BaseModel):
    ma_kpi:              str | None  = None
    ten:                 str
    mo_ta:               str | None  = None
    loai_kpi:            str         = "nam"

    @field_validator("loai_kpi")
    @classmethod
    def _check_loai(cls, v: str) -> str:
        if v not in _VALID_LOAI_KPI:
            raise ValueError(f"loai_kpi phải là một trong: {sorted(_VALID_LOAI_KPI)}")
        return v
    danh_muc:            str | None  = None
    gia_tri_muc_tieu:    float       = 100.0
    don_vi_do:           str | None  = None
    # trang_thai is computed by the server from progress — not accepted from client
    quy:                 int | None  = Field(None, ge=1, le=4)
    nam:                 int
    ten_nhiem_ky:        str | None  = None
    han_hoan_thanh:      date | None = None
    don_vi_phu_trach_id: int | None  = None
    nguoi_theo_doi_id:   int | None  = None
    van_ban_id:          int | None  = None
    nhiem_vu_id:         int | None  = None
    chi_tieu_nq_id:      int | None  = None


class KpiCLUpdate(BaseModel):
    ma_kpi:              str | None  = None
    ten:                 str | None  = None
    mo_ta:               str | None  = None
    loai_kpi:            str | None  = None

    @field_validator("loai_kpi")
    @classmethod
    def _check_loai(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_LOAI_KPI:
            raise ValueError(f"loai_kpi phải là một trong: {sorted(_VALID_LOAI_KPI)}")
        return v
    danh_muc:            str | None  = None
    gia_tri_muc_tieu:    float | None = None
    don_vi_do:           str | None  = None
    # trang_thai is computed by the server from progress — not accepted from client
    quy:                 int | None  = Field(None, ge=1, le=4)
    nam:                 int | None  = None
    ten_nhiem_ky:        str | None  = None
    han_hoan_thanh:      date | None = None
    don_vi_phu_trach_id: int | None  = None
    nguoi_theo_doi_id:   int | None  = None
    van_ban_id:          int | None  = None
    nhiem_vu_id:         int | None  = None
    chi_tieu_nq_id:      int | None  = None


class KpiCLRead(BaseModel):
    model_config = {"from_attributes": True}
    id:                  int
    ma_kpi:              str | None
    ten:                 str
    mo_ta:               str | None
    loai_kpi:            str
    danh_muc:            str | None
    gia_tri_muc_tieu:    float
    gia_tri_thuc_te:     float
    pct_hoan_thanh:      float
    don_vi_do:           str | None
    trang_thai:          str
    quy:                 int | None
    nam:                 int
    ten_nhiem_ky:        str | None
    han_hoan_thanh:      date | None
    don_vi_phu_trach_id: int | None
    don_vi_phu_trach:    DeptMin | None
    nguoi_theo_doi_id:   int | None
    nguoi_theo_doi:      UserMin | None
    creator:             UserMin
    van_ban_id:          int | None
    nhiem_vu_id:         int | None
    chi_tieu_nq_id:      int | None
    created_at:          datetime
    updated_at:          datetime | None


# ─── Progress ─────────────────────────────────────────────────────────────────

class KpiCLTienDoCreate(BaseModel):
    gia_tri: float
    ghi_chu: str | None = None
    quy:     int | None = Field(None, ge=1, le=4)
    nam:     int


class KpiCLTienDoRead(BaseModel):
    model_config = {"from_attributes": True}
    id:         int
    kpi_id:     int
    gia_tri:    float
    ghi_chu:    str | None
    quy:        int | None
    nam:        int
    nguoi_cap_nhat: UserMin | None
    created_at: datetime


# ─── Dashboard ────────────────────────────────────────────────────────────────

class KpiCLStats(BaseModel):
    tong:           int
    dat_muc_tieu:   int
    dung_tien_do:   int
    co_rui_ro:      int
    cham_tien_do:   int
    qua_han:        int
    chua_bat_dau:   int
    pct_tb:         float
    # breakdown by type
    so_quy:         int
    so_nam:         int
    so_nhiem_ky:    int


class HeatmapCell(BaseModel):
    danh_muc: str
    period:   str   # "Q1/2025", "2025", "2025-2030"
    avg_pct:  float
    count:    int


class HeatmapData(BaseModel):
    danh_mucs: list[str]
    periods:   list[str]
    cells:     list[HeatmapCell]


class KpiCLRankItem(BaseModel):
    id:         int
    ma_kpi:     str | None
    ten:        str
    danh_muc:   str | None
    loai_kpi:   str
    pct_hoan_thanh: float
    trang_thai: str
    don_vi_phu_trach_ten: str | None


class RankingData(BaseModel):
    top:    list[KpiCLRankItem]
    bottom: list[KpiCLRankItem]


class OverdueItem(BaseModel):
    id:              int
    ma_kpi:          str | None
    ten:             str
    danh_muc:        str | None
    loai_kpi:        str
    pct_hoan_thanh:  float
    trang_thai:      str
    han_hoan_thanh:  date | None
    don_vi_phu_trach_ten: str | None
    so_ngay_qua_han: int


class PaginatedKpiCL(BaseModel):
    items:  list[KpiCLRead]
    total:  int
    page:   int
    size:   int
    pages:  int
