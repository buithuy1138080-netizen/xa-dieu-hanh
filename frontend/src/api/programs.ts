import apiClient, { cachedGet } from './client'

export interface Tag {
  id: number
  code: string
  name: string
  color: string
  icon: string | null
  tag_type: string
  parent_id: number | null
  is_active: boolean
  sort_order: number
}

export interface Program {
  id: number
  code: string
  name: string
  short_name: string | null
  program_type: string
  tag_id: number | null
  issued_date: string | null
  effective_date: string | null
  end_date: string | null
  issuing_body: string | null
  scope: string
  status: string
  description: string | null
  target_summary: string | null
  fiscal_year: number | null
  review_cycle: string | null
  source_document_id: number | null
  created_at: string
}

export interface ProgramDashboard {
  program: Program
  stats: {
    task_total: number
    task_done: number
    task_in_progress: number
    task_pending: number
    task_overdue: number
    task_completion_rate: number
    task_avg_progress: number
    kpi_total: number
    kpi_avg_progress: number
    kpi_completed: number
    kpi_at_risk: number
    kpi_behind: number
    doc_count: number
  }
  alerts: {
    task_id: number
    task_code: string | null
    title: string
    due_date: string | null
    priority: string
    alert_type: 'overdue' | 'due_soon'
  }[]
  groups: {
    name: string
    key: string
    total: number
    done: number
    avg_progress: number
  }[]
}

export interface ProgramTask {
  id: number
  task_code: string | null
  title: string
  status: string
  priority: string
  priority_label: string
  progress_percent: number
  due_date: string | null
  assignee: { id: number; full_name: string | null } | null
  lead_department: { id: number; name: string; short_name: string | null } | null
  is_overdue: boolean
}

export interface ProgramKpi {
  id: number
  title: string
  unit: string | null
  target_value: number
  current_value: number
  progress: number
  status: string
  year: number
  field: string | null
  threshold_red: number
  threshold_yellow: number
}

export interface ProgramDocument {
  link_id: number
  link_type: string
  note: string | null
  linked_at: string
  document: {
    id: number
    doc_number: string | null
    title: string
    doc_type: string | null
    status: string | null
    issued_date: string | null
  }
}

export interface DocumentProgramLink {
  id: number
  link_type: string
  note: string | null
  created_at: string
  program: { id: number; code: string; name: string; short_name: string | null; status: string }
}

export interface SpawnRequest {
  spawn_type: 'task' | 'kpi'
  program_id?: number
  title: string
  description?: string
  expected_output?: string
  due_date?: string
  priority?: string
  assignee_id?: number
  kpi_title?: string
  unit?: string
  target_value?: number
  year?: number
  field?: string
}

export interface SpawnResult {
  spawn_type: string
  object_id: number
  title: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pages: number
}

export const tagsApi = {
  list: (params?: { tag_type?: string; active_only?: boolean }) =>
    apiClient.get<Tag[]>('/tags', { params }),
  create: (data: Partial<Tag>) => apiClient.post<Tag>('/tags', data),
  update: (id: number, data: Partial<Tag>) => apiClient.put<Tag>(`/tags/${id}`, data),
}

export const programsApi = {
  list: (params?: { status?: string; program_type?: string }) =>
    cachedGet<Program[]>('/programs', params),
  get: (id: number) => apiClient.get<Program>(`/programs/${id}`),
  create: (data: Partial<Program>) => apiClient.post<Program>('/programs', data),
  update: (id: number, data: Partial<Program>) => apiClient.put<Program>(`/programs/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/programs/${id}`),

  dashboard: (id: number) =>
    apiClient.get<ProgramDashboard>(`/programs/${id}/dashboard`),

  tasks: (id: number, params?: {
    status?: string; priority?: string; lead_dept_id?: number
    search?: string; overdue_only?: boolean; page?: number; size?: number
  }) => apiClient.get<PaginatedResponse<ProgramTask>>(`/programs/${id}/tasks`, { params }),

  kpis: (id: number, params?: { status?: string; year?: number; page?: number; size?: number }) =>
    apiClient.get<PaginatedResponse<ProgramKpi>>(`/programs/${id}/kpis`, { params }),

  documents: (id: number, params?: { link_type?: string }) =>
    apiClient.get<ProgramDocument[]>(`/programs/${id}/documents`, { params }),
}

export const documentTagsApi = {
  list: (docId: number) => apiClient.get<Tag[]>(`/documents/${docId}/tags`),
  add: (docId: number, tagId: number, note?: string) =>
    apiClient.post(`/documents/${docId}/tags`, { tag_id: tagId, note }),
  remove: (docId: number, tagId: number) =>
    apiClient.delete(`/documents/${docId}/tags/${tagId}`),
}

export const documentProgramsApi = {
  list: (docId: number) => apiClient.get<DocumentProgramLink[]>(`/documents/${docId}/programs`),
  link: (docId: number, programId: number, linkType = 'implements', note?: string) =>
    apiClient.post(`/documents/${docId}/programs`, { program_id: programId, link_type: linkType, note }),
  unlink: (docId: number, programId: number) =>
    apiClient.delete(`/documents/${docId}/programs/${programId}`),
}

export const spawnApi = {
  spawn: (docId: number, data: SpawnRequest) =>
    apiClient.post<SpawnResult>(`/documents/${docId}/spawn`, data),
}
