export interface UserMin {
  id: number
  username: string
  full_name: string | null
}

export interface DeptMin {
  id: number
  name: string
  short_name: string | null
  code: string | null
}

export interface StaffMin {
  id: number
  full_name: string
  position: string | null
  employee_code: string | null
}

export interface NghiQuyetRead {
  id: number
  ma_nghi_quyet: string | null
  ten: string
  mo_ta: string | null
  loai: string
  nam_bat_dau: number
  nam_ket_thuc: number
  ngay_ban_hanh: string | null
  creator: UserMin
  created_at: string
  updated_at: string | null
}

export interface NghiQuyetReadDetail extends NghiQuyetRead {
  so_muc_tieu: number
  so_kpi: number
}

export interface NghiQuyetCreate {
  ma_nghi_quyet?: string
  ten: string
  mo_ta?: string
  loai?: string
  nam_bat_dau: number
  nam_ket_thuc: number
  ngay_ban_hanh?: string
}

export interface MucTieuRead {
  id: number
  nghi_quyet_id: number
  muc_tieu_cha_id: number | null
  ma_chi_tieu: string | null
  ten: string
  mo_ta: string | null
  loai_chi_tieu: string | null
  cap_do: number
  gia_tri_muc_tieu: number | null
  don_vi_do: string | null
  don_vi_phu_trach_id: number | null
  don_vi_phu_trach: DeptMin | null
  can_bo_theo_doi_id: number | null
  can_bo_theo_doi: StaffMin | null
  nam_hoan_thanh: number | null
  thu_tu: number
  ghi_chu: string | null
  creator: UserMin
  created_at: string
  updated_at: string | null
}

export interface MucTieuReadWithChildren extends MucTieuRead {
  con: MucTieuReadWithChildren[]
}

export interface MucTieuCreate {
  nghi_quyet_id: number
  muc_tieu_cha_id?: number | null
  ma_chi_tieu?: string
  ten: string
  mo_ta?: string
  loai_chi_tieu?: string
  cap_do?: number
  gia_tri_muc_tieu?: number | null
  don_vi_do?: string
  don_vi_phu_trach_id?: number | null
  can_bo_theo_doi_id?: number | null
  nam_hoan_thanh?: number | null
  thu_tu?: number
  ghi_chu?: string
}

export interface BangTheoDoiCreate {
  chi_tieu_id: number
  gia_tri_thuc_te: number
  ghi_chu?: string
  thang?: number | null
  quy?: number | null
  nam: number
}

export interface BangTheoDoiRead {
  id: number
  chi_tieu_id: number
  gia_tri_thuc_te: number
  ghi_chu: string | null
  thang: number | null
  quy: number | null
  nam: number
  nguoi_cap_nhat: UserMin
  created_at: string
}

export interface DashboardSummary {
  tong_kpi: number
  dung_tien_do: number
  co_rui_ro: number
  cham_tien_do: number
  hoan_thanh: number
  qua_han: number
  tien_do_tb: number
}

export interface KPIBarItem {
  id: number
  ma_chi_tieu: string | null
  ten: string
  don_vi_do: string | null
  pct_so_lieu: number
  trang_thai: string
}

export interface TrangThaiDonutItem {
  trang_thai: string
  so_luong: number
  ty_le: number
}

export interface DashboardCharts {
  bar_chart: KPIBarItem[]
  donut_chart: TrangThaiDonutItem[]
}

export interface TopDelayedItem {
  id: number
  ma_chi_tieu: string | null
  ten: string
  don_vi_do: string | null
  gia_tri_thuc_te_moi_nhat: number
  gia_tri_muc_tieu: number | null
  pct_so_lieu: number
  trang_thai: string
  don_vi_phu_trach_ten: string | null
  don_vi_phu_trach_viet_tat: string | null
  cap_nhat_luc: string | null
}

export interface PaginatedNQ {
  items: NghiQuyetRead[]
  total: number
  page: number
  size: number
  pages: number
}
