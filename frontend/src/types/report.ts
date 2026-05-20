export type ReportType = 'monthly' | 'quarterly' | 'annual' | 'kpi' | 'executive' | 'nq57'
export type ReportStatus = 'generating' | 'done' | 'failed'

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  monthly:   'Báo cáo tháng',
  quarterly: 'Báo cáo quý',
  annual:    'Báo cáo năm',
  kpi:       'Báo cáo KPI',
  executive: 'Báo cáo điều hành lãnh đạo',
  nq57:      'Báo cáo NQ57',
}

// ── Summary data shapes ───────────────────────────────────────────────────────

export interface TaskStats {
  total: number
  completed: number
  in_progress: number
  pending: number
  cancelled: number
  overdue: number
  completion_rate: number
}

export interface DeptBreakdown {
  name: string
  total: number
  completed: number
  rate: number
}

export interface KpiByStatus {
  dat_muc_tieu: number
  dung_tien_do: number
  co_rui_ro: number
  cham_tien_do: number
  qua_han: number
  chua_bat_dau: number
}

export interface KpiByCategory {
  name: string
  count: number
  avg_pct: number
}

export interface KpiStats {
  total: number
  avg_pct: number
  by_status: KpiByStatus
  by_category: KpiByCategory[]
}

export interface DocStats {
  total: number
  processed: number
  by_type: Record<string, number>
}

export interface OverdueTask {
  id: number
  title: string
  due_date: string | null
  priority: string
  dept: string
  days_late: number
}

export interface Nq57Stats {
  total: number
  completed: number
  avg_progress: number
}

export interface ReportSummaryData {
  period: { from: string; to: string; label: string }
  tasks: TaskStats
  kpis: KpiStats
  documents: DocStats
  overdue_tasks: OverdueTask[]
  dept_breakdown: DeptBreakdown[]
  nq57: Nq57Stats
  generated_at: string
}

export interface AiSummary {
  tong_quat: string
  danh_gia_tien_do: string
  ton_tai_han_che: string
  nguyen_nhan: string
  kien_nghi: string
  nhiem_vu_trong_tam: string
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface ReportList {
  id: number
  report_type: ReportType
  title: string
  period_label: string
  period_from: string
  period_to: string
  status: ReportStatus
  error_msg?: string | null
  file_path_docx?: string | null
  file_path_xlsx?: string | null
  created_at: string
  generated_at?: string | null
}

export interface ReportRead extends ReportList {
  summary_data?: ReportSummaryData | null
  ai_summary?: AiSummary | null
  created_by: number
}

export interface ReportCreate {
  report_type: ReportType
  period_from: string   // ISO date
  period_to: string
}

export interface ReportStats {
  total: number
  done: number
  by_type: Record<string, number>
}
