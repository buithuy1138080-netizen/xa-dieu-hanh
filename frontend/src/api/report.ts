import apiClient from './client'
import type { ReportCreate, ReportList, ReportRead, ReportStats } from '../types/report'

const BASE = '/reports'

export interface ReportListResponse {
  total: number
  items: ReportList[]
}

export const reportApi = {
  create: (body: ReportCreate) =>
    apiClient.post<ReportList>(BASE + '/', body),

  list: (report_type?: string, skip = 0, limit = 30) =>
    apiClient.get<ReportListResponse>(BASE + '/', { params: { report_type, skip, limit } }),

  get: (id: number) =>
    apiClient.get<ReportRead>(`${BASE}/${id}`),

  remove: (id: number) =>
    apiClient.delete(`${BASE}/${id}`),

  stats: () =>
    apiClient.get<ReportStats>(`${BASE}/stats/overview`),

  exportDocx: (id: number) =>
    apiClient.post(`${BASE}/${id}/export/docx`, {}, { responseType: 'blob' }),

  exportXlsx: (id: number) =>
    apiClient.post(`${BASE}/${id}/export/xlsx`, {}, { responseType: 'blob' }),
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
