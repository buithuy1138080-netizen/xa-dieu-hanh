import apiClient from './client'
import type {
  BangTheoDoiRead,
  DashboardCharts,
  DashboardSummary,
  MucTieuCreate,
  MucTieuRead,
  MucTieuReadWithChildren,
  NghiQuyetCreate,
  NghiQuyetRead,
  NghiQuyetReadDetail,
  PaginatedNQ,
  TopDelayedItem,
} from '../types/nghiQuyet'

export const nghiQuyetApi = {
  // ─── NghiQuyet CRUD ───────────────────────────────────────────────────────────
  list: (params?: { page?: number; size?: number; loai?: string }) =>
    apiClient.get<PaginatedNQ>('/nghi-quyet', { params }),

  get: (id: number) =>
    apiClient.get<NghiQuyetReadDetail>(`/nghi-quyet/${id}`),

  create: (body: NghiQuyetCreate) =>
    apiClient.post<NghiQuyetRead>('/nghi-quyet', body),

  update: (id: number, body: Partial<NghiQuyetCreate>) =>
    apiClient.put<NghiQuyetRead>(`/nghi-quyet/${id}`, body),

  remove: (id: number) =>
    apiClient.delete(`/nghi-quyet/${id}`),

  // ─── MucTieu ─────────────────────────────────────────────────────────────────
  getTree: (nqId: number) =>
    apiClient.get<MucTieuReadWithChildren[]>(`/nghi-quyet/${nqId}/muc-tieu`),

  createMucTieu: (body: MucTieuCreate) =>
    apiClient.post<MucTieuRead>('/nghi-quyet/muc-tieu', body),

  updateMucTieu: (id: number, body: Partial<Omit<MucTieuCreate, 'nghi_quyet_id'>>) =>
    apiClient.put<MucTieuRead>(`/nghi-quyet/muc-tieu/${id}`, body),

  deleteMucTieu: (id: number) =>
    apiClient.delete(`/nghi-quyet/muc-tieu/${id}`),

  // ─── BangTheoDoi ─────────────────────────────────────────────────────────────
  addTheoDoi: (chiTieuId: number, body: {
    gia_tri_thuc_te: number
    nam: number
    quy?: number | null
    thang?: number | null
    ghi_chu?: string
  }) =>
    apiClient.post<BangTheoDoiRead>(
      `/nghi-quyet/muc-tieu/${chiTieuId}/theo-doi`,
      { ...body, chi_tieu_id: chiTieuId },
    ),

  listTheoDoi: (chiTieuId: number, nam?: number) =>
    apiClient.get<BangTheoDoiRead[]>(
      `/nghi-quyet/muc-tieu/${chiTieuId}/theo-doi`,
      { params: nam ? { nam } : {} },
    ),

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  getSummary: (nqId: number, nam?: number | null) =>
    apiClient.get<DashboardSummary>('/nghi-quyet/dashboard-summary', {
      params: { nghi_quyet_id: nqId, ...(nam ? { nam } : {}) },
    }),

  getCharts: (nqId: number, nam?: number | null) =>
    apiClient.get<DashboardCharts>('/nghi-quyet/dashboard-charts', {
      params: { nghi_quyet_id: nqId, ...(nam ? { nam } : {}) },
    }),

  getTopDelayed: (nqId: number, limit = 5, nam?: number | null) =>
    apiClient.get<TopDelayedItem[]>('/nghi-quyet/dashboard-top-delayed', {
      params: { nghi_quyet_id: nqId, limit, ...(nam ? { nam } : {}) },
    }),
}
