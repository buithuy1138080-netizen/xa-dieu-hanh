import apiClient from './client'

export interface UnifiedKpiItem {
  source: 'standard' | 'strategic'
  id: number
  code: string | null
  title: string
  category: string | null
  unit: string | null
  progress: number
  target: number
  current: number
  status: string
  status_display: string
  year: number | null
  quarter: number | null
  deadline: string | null
  department_id: number | null
  department_name: string | null
}

export interface UnifiedKpiPage {
  items: UnifiedKpiItem[]
  total: number
  page: number
  size: number
  pages: number
}

export interface UnifiedKpiSummary {
  total: number
  standard_total: number
  strategic_total: number
  overall_avg_progress: number
  by_status: Record<string, number>
  by_source: Record<string, { total: number; avg_progress: number; by_status: Record<string, number> }>
}

export interface UnifiedKpiListParams {
  page?: number
  size?: number
  year?: number
  source?: 'standard' | 'strategic'
  status?: string
  search?: string
  sort_by?: 'progress' | 'title' | 'year'
  sort_dir?: 'asc' | 'desc'
}

export const kpiUnifiedApi = {
  list: (params?: UnifiedKpiListParams) =>
    apiClient.get<UnifiedKpiPage>('/kpi-unified', { params }),

  summary: (year?: number) =>
    apiClient.get<UnifiedKpiSummary>('/kpi-unified/summary', {
      params: year ? { year } : undefined,
    }),
}
