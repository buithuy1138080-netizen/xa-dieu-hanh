export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface UserMin {
  id: number
  full_name: string | null
  username: string
}

export interface StaffMin {
  id: number
  full_name: string
  position: string | null
  employee_code: string | null
  department_id: number | null
}

export interface DeptMin {
  id: number
  name: string
  short_name: string | null
  code: string | null
}

export interface DocMin {
  id: number
  title: string
  doc_number: string | null
  summary: string | null
  raw_text: string | null
  issue_date: string | null
  received_date: string | null
  file_name: string | null
  file_mime: string | null
}

export interface DirectiveMin {
  id: number
  title: string
  content: string | null
  issued_date: string | null
  deadline: string | null
  priority: string | null
  progress: number
}

export interface TaskDepartment {
  id: number
  department_id: number
  role: string
  department: DeptMin | null
}

export interface TaskComment {
  id: number
  task_id: number
  user_id: number
  content: string
  created_at: string
  user: UserMin | null
}

export interface TaskAttachment {
  id: number
  task_id: number
  user_id: number
  filename: string
  file_path: string
  file_size: number
  created_at: string
}

export interface TaskAuditLog {
  id: number
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  user: UserMin | null
}

export interface Task {
  id: number
  task_code: string | null
  title: string
  description: string | null
  content_summary: string | null
  status: TaskStatus
  priority: TaskPriority
  progress_percent: number
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  incoming_document_id: number | null
  outgoing_document_id: number | null
  directive_id: number | null
  program_id: number | null
  parent_task_id: number | null
  task_type: string
  task_group: string | null
  created_by: number
  updated_by: number | null
  assignee_id: number | null
  assignee_staff_id: number | null
  supervising_user_id: number | null
  lead_department_id: number | null
  reminder_enabled: boolean
  overdue_warning: boolean
  completion_note: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string | null
  is_overdue: boolean
  is_project: boolean
  project_type: string | null
  budget_amount: number | null
  budget_disbursed: number | null
  project_ids: number[]
  subtasks_count: number
  creator: UserMin | null
  assignee: UserMin | null
  assignee_staff: StaffMin | null
  lead_department: DeptMin | null
}

export interface TaskDetail extends Task {
  updater: UserMin | null
  supervisor: UserMin | null
  incoming_document: DocMin | null
  outgoing_document: DocMin | null
  directive: DirectiveMin | null
  departments: TaskDepartment[]
  comments: TaskComment[]
  attachments: TaskAttachment[]
  audit_logs: TaskAuditLog[]
  subtasks: Task[]
}

export interface TaskStats {
  total: number
  pending: number
  in_progress: number
  completed: number
  cancelled: number
  overdue: number
  high_priority: number
  urgent_priority: number
  avg_progress: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface TaskCreate {
  title: string
  description?: string
  content_summary?: string
  priority: TaskPriority
  is_project?: boolean
  project_type?: string | null
  budget_amount?: number | null
  budget_disbursed?: number | null
  start_date?: string
  due_date?: string
  program_id?: number | null
  parent_task_id?: number | null
  incoming_document_id?: number
  outgoing_document_id?: number
  directive_id?: number
  assignee_id?: number
  assignee_staff_id?: number | null
  supervising_user_id?: number
  lead_department_id?: number
  coordinating_department_ids?: number[]
  reminder_enabled?: boolean
}

export interface TaskUpdate {
  title?: string
  description?: string
  content_summary?: string
  priority?: TaskPriority
  is_project?: boolean
  project_type?: string | null
  budget_amount?: number | null
  budget_disbursed?: number | null
  start_date?: string | null
  due_date?: string | null
  program_id?: number | null
  parent_task_id?: number | null
  incoming_document_id?: number | null
  outgoing_document_id?: number | null
  directive_id?: number | null
  assignee_id?: number | null
  assignee_staff_id?: number | null
  supervising_user_id?: number | null
  lead_department_id?: number | null
  coordinating_department_ids?: number[]
  reminder_enabled?: boolean
  completion_note?: string | null
}
