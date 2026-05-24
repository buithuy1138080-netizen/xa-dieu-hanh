import apiClient from './client'

export interface DashboardStats {
  total: number
  pending: number
  in_progress: number
  completed: number
  cancelled: number
  overdue: number
  completion_rate: number
}

export interface TimelinePoint {
  date: string
  created: number
  completed: number
}

export interface OverdueTask {
  id: number
  title: string
  task_code: string | null
  due_date: string
  days_overdue: number
  priority: string
  assignee_name: string | null
}

export interface UpcomingTask {
  id: number
  title: string
  task_code: string | null
  due_date: string
  days_left: number
  priority: string
  assignee_name: string | null
}

export interface UnitPerformance {
  name: string
  total: number
  done: number
  overdue: number
  completion_rate: number
}

export interface DirectiveStats {
  total: number
  active: number
  completed: number
  overdue: number
  near_deadline: number
  avg_progress: number
}

export interface KPIStatsDash {
  total: number
  on_track: number
  at_risk: number
  behind: number
  completed: number
  avg_progress: number
  overdue: number
}

export interface NQ57StatsDash {
  total: number
  pending: number
  in_progress: number
  completed: number
  delayed: number
  avg_progress: number
}

export interface DocumentStats {
  total: number
  incoming: number
  outgoing: number
  pending: number
  processed: number
}

export interface DashboardSummary {
  tasks: DashboardStats
  documents: DocumentStats
  directives: DirectiveStats
  kpi: KPIStatsDash
  nq57: NQ57StatsDash
  overdue_tasks: OverdueTask[]
  upcoming_tasks: UpcomingTask[]
}

export const dashboardApi = {
  // Single call replacing 8 individual calls
  summary: () => apiClient.get<DashboardSummary>('/dashboard/summary'),
  // Individual calls kept for backwards compatibility / granular refresh
  stats: () => apiClient.get<DashboardStats>('/dashboard/stats'),
  timeline: (days = 30) =>
    apiClient.get<TimelinePoint[]>('/dashboard/chart/timeline', { params: { days } }),
  overdue: (limit = 8) =>
    apiClient.get<OverdueTask[]>('/dashboard/overdue', { params: { limit } }),
  upcoming: (days = 7) =>
    apiClient.get<UpcomingTask[]>('/dashboard/upcoming', { params: { days } }),
  unitPerformance: () => apiClient.get<UnitPerformance[]>('/dashboard/unit-performance'),
  directiveStats: () => apiClient.get<DirectiveStats>('/dashboard/directive-stats'),
  kpiStats: () => apiClient.get<KPIStatsDash>('/dashboard/kpi-stats'),
  nq57Stats: () => apiClient.get<NQ57StatsDash>('/dashboard/nq57-stats'),
  documentStats: () => apiClient.get<DocumentStats>('/dashboard/document-stats'),
}
