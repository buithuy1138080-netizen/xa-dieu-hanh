export type KpiCLLoai     = 'quy' | 'nam' | 'nhiem_ky'
export type KpiCLTrangThai =
  | 'Chưa bắt đầu'
  | 'Đúng tiến độ'
  | 'Có rủi ro'
  | 'Chậm tiến độ'
  | 'Đạt mục tiêu'
  | 'Quá hạn'

export interface UserMin { id: number; username: string; full_name: string | null }
export interface DeptMin  { id: number; name: string; short_name: string | null }

export interface KpiCLRead {
  id:                  number
  ma_kpi:              string | null
  ten:                 string
  mo_ta:               string | null
  loai_kpi:            KpiCLLoai
  danh_muc:            string | null
  gia_tri_muc_tieu:    number
  gia_tri_thuc_te:     number
  pct_hoan_thanh:      number
  don_vi_do:           string | null
  trang_thai:          KpiCLTrangThai
  quy:                 number | null
  nam:                 number
  ten_nhiem_ky:        string | null
  han_hoan_thanh:      string | null
  don_vi_phu_trach_id: number | null
  don_vi_phu_trach:    DeptMin | null
  nguoi_theo_doi_id:   number | null
  nguoi_theo_doi:      UserMin | null
  creator:             UserMin
  van_ban_id:          number | null
  nhiem_vu_id:         number | null
  chi_tieu_nq_id:      number | null
  created_at:          string
  updated_at:          string | null
}

export interface KpiCLCreate {
  ma_kpi?:              string
  ten:                  string
  mo_ta?:               string
  loai_kpi?:            KpiCLLoai
  danh_muc?:            string
  gia_tri_muc_tieu?:    number
  don_vi_do?:           string
  trang_thai?:          KpiCLTrangThai
  quy?:                 number | null
  nam:                  number
  ten_nhiem_ky?:        string
  han_hoan_thanh?:      string
  don_vi_phu_trach_id?: number | null
  nguoi_theo_doi_id?:   number | null
  van_ban_id?:          number | null
  nhiem_vu_id?:         number | null
  chi_tieu_nq_id?:      number | null
}

export interface KpiCLTienDoCreate {
  gia_tri: number
  ghi_chu?: string
  quy?:    number | null
  nam:     number
}

export interface KpiCLTienDoRead {
  id:         number
  kpi_id:     number
  gia_tri:    number
  ghi_chu:    string | null
  quy:        number | null
  nam:        number
  nguoi_cap_nhat: UserMin | null
  created_at: string
}

export interface KpiCLStats {
  tong:          number
  dat_muc_tieu:  number
  dung_tien_do:  number
  co_rui_ro:     number
  cham_tien_do:  number
  qua_han:       number
  chua_bat_dau:  number
  pct_tb:        number
  so_quy:        number
  so_nam:        number
  so_nhiem_ky:   number
}

export interface HeatmapCell {
  danh_muc: string
  period:   string
  avg_pct:  number
  count:    number
}

export interface HeatmapData {
  danh_mucs: string[]
  periods:   string[]
  cells:     HeatmapCell[]
}

export interface KpiCLRankItem {
  id:            number
  ma_kpi:        string | null
  ten:           string
  danh_muc:      string | null
  loai_kpi:      string
  pct_hoan_thanh: number
  trang_thai:    string
  don_vi_phu_trach_ten: string | null
}

export interface RankingData {
  top:    KpiCLRankItem[]
  bottom: KpiCLRankItem[]
}

export interface OverdueItem {
  id:             number
  ma_kpi:         string | null
  ten:            string
  danh_muc:       string | null
  loai_kpi:       string
  pct_hoan_thanh: number
  trang_thai:     string
  han_hoan_thanh: string | null
  don_vi_phu_trach_ten: string | null
  so_ngay_qua_han: number
}

export interface PaginatedKpiCL {
  items: KpiCLRead[]
  total: number
  page:  number
  size:  number
  pages: number
}
