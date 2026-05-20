export type KPIStatus = 'on_track' | 'at_risk' | 'behind' | 'completed'
export type KPIPeriod = 'monthly' | 'quarterly' | 'yearly'
export type NQ57Status = 'pending' | 'in_progress' | 'completed' | 'delayed'

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
  department_id: number | null
}

export interface KPIMin {
  id: number
  title: string
  progress: number
  status: KPIStatus
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface KPIRead {
  id: number
  code: string | null
  title: string
  description: string | null
  unit: string | null
  category: string | null
  target_value: number
  current_value: number
  progress: number
  period: KPIPeriod
  year: number
  quarter: number | null
  month: number | null
  status: KPIStatus
  deadline: string | null
  responsible_unit: string | null
  responsible_department_id: number | null
  responsible_department: DeptMin | null
  responsible_user: UserMin | null
  responsible_staff: StaffMin | null
  creator: UserMin
  created_at: string
  updated_at: string | null
}

export interface KPIProgressRead {
  id: number
  kpi_id: number
  value: number
  note: string | null
  user: UserMin
  recorded_at: string
}

export interface KPIHistoryRead {
  id: number
  action: string
  old_value: number | null
  new_value: number | null
  old_status: string | null
  new_status: string | null
  note: string | null
  user: UserMin
  created_at: string
}

export interface KPIReadDetail extends KPIRead {
  progress_entries: KPIProgressRead[]
  history: KPIHistoryRead[]
}

export interface KPICreate {
  code?: string
  title: string
  description?: string
  unit?: string
  category?: string
  target_value: number
  current_value: number
  period: KPIPeriod
  year: number
  quarter?: number | null
  month?: number | null
  status?: KPIStatus
  deadline?: string | null
  responsible_unit?: string
  responsible_department_id?: number | null
  responsible_user_id?: number | null
  responsible_staff_id?: number | null
}

export interface KPIStats {
  total: number
  on_track: number
  at_risk: number
  behind: number
  completed: number
  avg_progress: number
  overdue: number
}

export interface KPIChartItem {
  id: number
  title: string
  code: string | null
  progress: number
  target: number
  current: number
  status: KPIStatus
  unit: string | null
  category: string | null
}

// ─── NQ57 ────────────────────────────────────────────────────────────────────

export interface NQ57TaskRead {
  id: number
  code: string | null
  title: string
  description: string | null
  group: string | null
  target: string | null
  progress: number
  status: NQ57Status
  start_date: string | null
  deadline: string | null
  responsible_unit: string | null
  responsible_department_id: number | null
  responsible_department: DeptMin | null
  responsible_user: UserMin | null
  responsible_staff: StaffMin | null
  kpi: KPIMin | null
  creator: UserMin
  created_at: string
  updated_at: string | null
}

export interface NQ57ProgressRead {
  id: number
  task_id: number
  progress: number
  note: string | null
  user: UserMin
  created_at: string
}

export interface NQ57TaskReadDetail extends NQ57TaskRead {
  progress_entries: NQ57ProgressRead[]
}

export interface NQ57TaskCreate {
  code?: string
  title: string
  description?: string
  group?: string
  target?: string
  progress?: number
  status?: NQ57Status
  start_date?: string | null
  deadline?: string | null
  responsible_unit?: string
  responsible_department_id?: number | null
  responsible_user_id?: number | null
  responsible_staff_id?: number | null
  kpi_id?: number | null
}

export interface NQ57Stats {
  total: number
  pending: number
  in_progress: number
  completed: number
  delayed: number
  avg_progress: number
}

// ─── Generic ──────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}
