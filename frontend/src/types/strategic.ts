export type ProjectType = 'project' | 'program' | 'plan' | 'digital_transform'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical'
export type BudgetStatus = 'draft' | 'approved' | 'active' | 'closed' | 'over_budget'
export type FundingType =
  | 'ngan_sach_tinh'
  | 'ngan_sach_xa'
  | 'trung_uong'
  | 'von_dau_tu'
  | 'xa_hoi_hoa'
  | 'tai_tro'

export interface UserMin {
  id: number
  username: string
  full_name: string | null
}

export interface DeptMin {
  id: number
  name: string
  short_name: string | null
}

export interface StaffMin {
  id: number
  full_name: string
  position: string | null
  employee_code: string | null
  department_id: number | null
}

// ── Strategic Project ────────────────────────────────────────────────────────

export interface StrategicProject {
  id: number
  project_code: string | null
  project_name: string
  project_type: ProjectType
  program_id: number | null
  nghi_quyet_id: number | null
  source_document_id: number | null
  source_document: { id: number; title: string; doc_number: string | null } | null
  muc_tieu_id: number | null
  description: string | null
  start_date: string | null
  end_date: string | null
  project_status: ProjectStatus
  priority_level: PriorityLevel
  progress_percent: number
  responsible_department_id: number | null
  coordinating_departments: DeptMin[]
  project_manager_id: number | null
  project_manager_staff_id: number | null
  responsible_department: DeptMin | null
  project_manager: UserMin | null
  project_manager_staff: StaffMin | null
  creator: UserMin | null
  created_at: string
  updated_at: string
}

export interface StrategicProjectCreate {
  project_code?: string
  project_name: string
  project_type?: ProjectType
  program_id?: number | null
  nghi_quyet_id?: number
  source_document_id?: number | null
  muc_tieu_id?: number
  description?: string
  start_date?: string
  end_date?: string
  project_status?: ProjectStatus
  priority_level?: PriorityLevel
  progress_percent?: number
  responsible_department_id?: number
  coordinating_department_ids?: number[]
  project_manager_id?: number
  project_manager_staff_id?: number | null
}

export interface StrategicProjectUpdate extends Partial<StrategicProjectCreate> {}

export interface StrategicProjectList {
  total: number
  items: StrategicProject[]
}

// ── Budget Plan ──────────────────────────────────────────────────────────────

export interface BudgetPlan {
  id: number
  budget_code: string | null
  project_id: number
  fiscal_year: number
  total_budget: number
  allocated_budget: number
  spent_budget: number
  remaining_budget: number
  budget_status: BudgetStatus
  note: string | null
  creator: UserMin | null
  created_at: string
  updated_at: string
}

export interface BudgetPlanCreate {
  budget_code?: string
  project_id: number
  fiscal_year: number
  total_budget?: number
  allocated_budget?: number
  spent_budget?: number
  budget_status?: BudgetStatus
  note?: string
}

export interface BudgetPlanUpdate extends Partial<Omit<BudgetPlanCreate, 'project_id'>> {}

export interface BudgetPlanList {
  total: number
  items: BudgetPlan[]
}

// ── Funding Source ───────────────────────────────────────────────────────────

export interface FundingSource {
  id: number
  budget_plan_id: number
  funding_source_name: string
  funding_type: FundingType
  funding_amount: number
  funding_year: number | null
  note: string | null
  created_at: string
}

export interface FundingSourceCreate {
  budget_plan_id: number
  funding_source_name: string
  funding_type?: FundingType
  funding_amount?: number
  funding_year?: number
  note?: string
}

export interface FundingSourceList {
  total: number
  items: FundingSource[]
}

// ── Disbursement ─────────────────────────────────────────────────────────────

export interface Disbursement {
  id: number
  disbursement_code: string | null
  budget_plan_id: number
  disbursement_date: string
  disbursement_amount: number
  evidence_file: string | null
  note: string | null
  creator: UserMin | null
  created_at: string
}

export interface DisbursementCreate {
  disbursement_code?: string
  budget_plan_id: number
  disbursement_date: string
  disbursement_amount: number
  evidence_file?: string
  note?: string
}

export interface DisbursementUpdate extends Partial<Omit<DisbursementCreate, 'budget_plan_id'>> {}

export interface DisbursementList {
  total: number
  items: Disbursement[]
}

// ── Dashboard Stats ──────────────────────────────────────────────────────────

export interface StrategicDashboardStats {
  total_projects: number
  active_projects: number
  completed_projects: number
  on_hold_projects: number
  planning_projects: number
  total_budget: number
  total_allocated: number
  total_spent: number
  total_remaining: number
  disbursement_rate: number
  avg_progress: number
  overdue_projects: number
  by_status: Record<string, number>
  by_type: Record<string, number>
  by_priority: Record<string, number>
  top_slow_projects: Array<{
    id: number
    project_name: string
    progress_percent: number
    end_date: string
    priority_level: PriorityLevel
  }>
}

// ── Labels ───────────────────────────────────────────────────────────────────

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  project: 'Dự án',
  program: 'Chương trình',
  plan: 'Kế hoạch',
  digital_transform: 'Chuyển đổi số',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Lập kế hoạch',
  active: 'Đang thực hiện',
  on_hold: 'Tạm dừng',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Cấp thiết',
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  draft: 'Dự thảo',
  approved: 'Đã duyệt',
  active: 'Hoạt động',
  closed: 'Đã đóng',
  over_budget: 'Vượt ngân sách',
}

export const FUNDING_TYPE_LABELS: Record<FundingType, string> = {
  ngan_sach_tinh: 'Ngân sách tỉnh',
  ngan_sach_xa: 'Ngân sách xã',
  trung_uong: 'Trung ương',
  von_dau_tu: 'Vốn đầu tư',
  xa_hoi_hoa: 'Xã hội hóa',
  tai_tro: 'Tài trợ',
}
