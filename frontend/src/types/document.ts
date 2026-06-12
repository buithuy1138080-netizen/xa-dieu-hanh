export type DocType = 'incoming' | 'outgoing' | 'internal'
export type DocStatus = 'pending' | 'processing' | 'done' | 'archived'
export type DocPriority = 'normal' | 'urgent' | 'very_urgent'

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
}

export interface TaskMin {
  id: number
  title: string
  status: string
  priority: string
  deadline: string | null
  assignee: UserMin | null
}

export interface DocumentRead {
  id: number
  doc_number: string | null
  title: string
  doc_type: DocType
  category: string | null
  issuer: string | null
  responsible_department_id: number | null
  responsible_department: DeptMin | null
  coordinating_dept_ids: number[]
  issue_date: string | null
  received_date: string | null
  deadline: string | null
  status: DocStatus
  priority: DocPriority
  summary: string | null
  raw_text: string | null
  ai_processed: boolean
  keywords: string[]
  domain: string | null
  file_name: string | null
  file_size: number
  file_mime: string | null
  created_by: number
  assignee_id: number | null
  assignee_staff_id: number | null
  creator: UserMin
  assignee: UserMin | null
  assignee_staff: StaffMin | null
  created_at: string
  updated_at: string | null
}

export interface DocumentCommentRead {
  id: number
  content: string
  user: UserMin
  created_at: string
}

export interface DocumentHistoryRead {
  id: number
  action: string
  old_status: string | null
  new_status: string | null
  note: string | null
  user: UserMin
  created_at: string
}

export interface DocumentTaskRead {
  id: number
  task: TaskMin
  created_at: string
}

export interface DocumentReadDetail extends DocumentRead {
  comments: DocumentCommentRead[]
  history: DocumentHistoryRead[]
  linked_tasks: DocumentTaskRead[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface DocumentCreate {
  doc_number?: string
  title: string
  doc_type: DocType
  category?: string
  issuer?: string
  responsible_department_id?: number | null
  coordinating_dept_ids?: number[]
  issue_date?: string
  received_date?: string
  deadline?: string
  priority: DocPriority
  summary?: string
  assignee_id?: number | null
  assignee_staff_id?: number | null
  program_id?: number | null
}

export interface DocumentUpdate extends Partial<DocumentCreate> {}

export interface DocumentTaskCreate {
  title: string
  description?: string
  priority: string
  deadline?: string
  assignee_id?: number | null
  lead_department_id?: number | null
}

export interface AiParseResult {
  doc_number: string | null
  title: string | null
  issuer: string | null
  category: string | null
  issue_date: string | null
  summary: string | null
  summary_points: string[] | null
  keywords: string[] | null
}
