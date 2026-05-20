export type DirectiveStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type DirectivePriority = 'normal' | 'urgent' | 'very_urgent'

export interface UserMin {
  id: number
  username: string
  full_name: string | null
}

export interface StaffMin {
  id: number
  full_name: string
  position: string | null
  employee_code: string | null
}

export interface DeptMin {
  id: number
  name: string
  short_name: string | null
}

export interface DocMin {
  id: number
  doc_number: string | null
  title: string
  doc_type: string
}

export interface TaskMin {
  id: number
  title: string
  status: string
  priority: string
  deadline: string | null
  assignee: UserMin | null
}

export interface DirectiveRead {
  id: number
  title: string
  content: string | null
  issuer_id: number
  status: DirectiveStatus
  priority: DirectivePriority
  issued_date: string | null
  deadline: string | null
  progress: number
  doc_id: number | null
  assignee_staff_id: number | null
  responsible_department_id: number | null
  created_by: number
  issuer: UserMin
  creator: UserMin
  document: DocMin | null
  assignee_staff: StaffMin | null
  responsible_department: DeptMin | null
  created_at: string
  updated_at: string | null
}

export interface DirectiveUnitRead {
  id: number
  unit_name: string
  role: string
  department_id: number | null
  user_id: number | null
  progress: number
  note: string | null
  department: DeptMin | null
  user: UserMin | null
  created_at: string
  updated_at: string | null
}

export interface DirectiveTaskRead {
  id: number
  task: TaskMin
  created_at: string
}

export interface DirectiveCommentRead {
  id: number
  content: string
  user: UserMin
  created_at: string
}

export interface DirectiveHistoryRead {
  id: number
  action: string
  old_status: string | null
  new_status: string | null
  old_progress: number | null
  new_progress: number | null
  note: string | null
  user: UserMin
  created_at: string
}

export interface DirectiveAttachmentRead {
  id: number
  filename: string
  file_size: number
  file_mime: string | null
  user: UserMin
  created_at: string
}

export interface DirectiveReadDetail extends DirectiveRead {
  units: DirectiveUnitRead[]
  linked_tasks: DirectiveTaskRead[]
  comments: DirectiveCommentRead[]
  history: DirectiveHistoryRead[]
  attachments: DirectiveAttachmentRead[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface DirectiveCreate {
  title: string
  content?: string
  issuer_id: number
  status?: DirectiveStatus
  priority?: DirectivePriority
  issued_date?: string
  deadline?: string
  doc_id?: number | null
  assignee_staff_id?: number | null
  responsible_department_id?: number | null
}

export interface DirectiveUpdate extends Partial<DirectiveCreate> {}

export interface DirectiveUnitCreate {
  unit_name: string
  role?: string
  department_id?: number | null
  user_id?: number | null
  progress?: number
  note?: string
}

export interface DirectiveTaskCreate {
  title: string
  description?: string
  priority: string
  deadline?: string
  assignee_id?: number | null
  assignee_staff_id?: number | null
}

export interface DirectiveStats {
  total: number
  active: number
  completed: number
  overdue: number
  near_deadline: number
  avg_progress: number
}
