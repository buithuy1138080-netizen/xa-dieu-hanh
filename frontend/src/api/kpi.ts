import apiClient from './client'
import type {
  KPIChartItem,
  KPICreate,
  KPIRead,
  KPIReadDetail,
  KPIStats,
  NQ57Stats,
  NQ57TaskCreate,
  NQ57TaskRead,
  NQ57TaskReadDetail,
  PaginatedResponse,
} from '../types/kpi'

export interface KPIListParams {
  page?: number
  size?: number
  search?: string
  status?: string
  category?: string
  period?: string
  year?: number
  overdue_only?: boolean
}

export interface NQ57ListParams {
  page?: number
  size?: number
  search?: string
  status?: string
  group?: string
  overdue_only?: boolean
}

export const kpiApi = {
  // KPI
  list: (params?: KPIListParams) =>
    apiClient.get<PaginatedResponse<KPIRead>>('/kpi', { params }),

  get: (id: number) =>
    apiClient.get<KPIReadDetail>(`/kpi/${id}`),

  create: (body: KPICreate) =>
    apiClient.post<KPIRead>('/kpi', body),

  update: (id: number, body: Partial<KPICreate>) =>
    apiClient.put<KPIRead>(`/kpi/${id}`, body),

  delete: (id: number) =>
    apiClient.delete(`/kpi/${id}`),

  stats: (year?: number) =>
    apiClient.get<KPIStats>('/kpi/stats', { params: year ? { year } : undefined }),

  chart: (params?: { year?: number; category?: string }) =>
    apiClient.get<KPIChartItem[]>('/kpi/chart', { params }),

  recordProgress: (id: number, value: number, note?: string) =>
    apiClient.post(`/kpi/${id}/progress`, { value, note }),

  // NQ57
  nq57List: (params?: NQ57ListParams) =>
    apiClient.get<PaginatedResponse<NQ57TaskRead>>('/nq57', { params }),

  nq57Get: (id: number) =>
    apiClient.get<NQ57TaskReadDetail>(`/nq57/${id}`),

  nq57Create: (body: NQ57TaskCreate) =>
    apiClient.post<NQ57TaskRead>('/nq57', body),

  nq57Update: (id: number, body: Partial<NQ57TaskCreate>) =>
    apiClient.put<NQ57TaskRead>(`/nq57/${id}`, body),

  nq57Delete: (id: number) =>
    apiClient.delete(`/nq57/${id}`),

  nq57Stats: () =>
    apiClient.get<NQ57Stats>('/nq57/stats'),

  nq57Groups: () =>
    apiClient.get<string[]>('/nq57/groups'),

  nq57RecordProgress: (id: number, progress: number, note?: string) =>
    apiClient.post(`/nq57/${id}/progress`, { progress, note }),
}
