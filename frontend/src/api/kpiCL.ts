import apiClient from './client'
import type {
  HeatmapData, KpiCLCreate, KpiCLRead, KpiCLStats, KpiCLTienDoCreate,
  KpiCLTienDoRead, OverdueItem, PaginatedKpiCL, RankingData,
} from '../types/kpiCL'

const BASE = '/kpi-cl'

export const kpiCLApi = {
  // ─── CRUD ──────────────────────────────────────────────────────────────────
  list: (params?: {
    page?: number; size?: number; search?: string
    loai_kpi?: string; danh_muc?: string; trang_thai?: string
    nam?: number; quy?: number; ten_nhiem_ky?: string
  }) => apiClient.get<PaginatedKpiCL>(BASE, { params }),

  get:    (id: number) => apiClient.get<KpiCLRead>(`${BASE}/${id}`),
  create: (body: KpiCLCreate) => apiClient.post<KpiCLRead>(BASE, body),
  update: (id: number, body: Partial<KpiCLCreate>) => apiClient.put<KpiCLRead>(`${BASE}/${id}`, body),
  remove: (id: number) => apiClient.delete(`${BASE}/${id}`),

  // ─── Progress ──────────────────────────────────────────────────────────────
  addTienDo:  (id: number, body: KpiCLTienDoCreate) =>
    apiClient.post<KpiCLTienDoRead>(`${BASE}/${id}/tien-do`, body),
  listTienDo: (id: number) =>
    apiClient.get<KpiCLTienDoRead[]>(`${BASE}/${id}/tien-do`),

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  getStats: (params?: { nam?: number; loai_kpi?: string; danh_muc?: string; ten_nhiem_ky?: string }) =>
    apiClient.get<KpiCLStats>(`${BASE}/stats`, { params }),

  getHeatmap: (params: { nam: number; loai_kpi?: string; ten_nhiem_ky?: string }) =>
    apiClient.get<HeatmapData>(`${BASE}/heatmap`, { params }),

  getRanking: (params?: { nam?: number; loai_kpi?: string; ten_nhiem_ky?: string; top_n?: number }) =>
    apiClient.get<RankingData>(`${BASE}/ranking`, { params }),

  getOverdue: (params?: { nam?: number; limit?: number }) =>
    apiClient.get<OverdueItem[]>(`${BASE}/overdue`, { params }),

  // ─── Meta ──────────────────────────────────────────────────────────────────
  getDanhMuc:  () => apiClient.get<string[]>(`${BASE}/meta/danh-muc`),
  getNhiemKy:  () => apiClient.get<string[]>(`${BASE}/meta/nhiem-ky`),
}
