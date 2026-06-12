import apiClient from './client'
import type {
  BudgetPlan,
  BudgetPlanCreate,
  BudgetPlanList,
  BudgetPlanUpdate,
  Disbursement,
  DisbursementCreate,
  DisbursementList,
  DisbursementUpdate,
  FundingSource,
  FundingSourceCreate,
  FundingSourceList,
  ProjectDocumentLink,
  StrategicDashboardStats,
  StrategicProject,
  StrategicProjectCreate,
  StrategicProjectList,
  StrategicProjectUpdate,
} from '../types/strategic'
import type { KPIRead, KPICreate } from '../types/kpi'

const BASE = '/strategic'

// ── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectListParams {
  skip?: number
  limit?: number
  project_status?: string
  project_type?: string
  priority_level?: string
  responsible_department_id?: number
  program_id?: number
  search?: string
}

export const strategicApi = {
  listProjects: (params?: ProjectListParams): Promise<StrategicProjectList> =>
    apiClient.get(`${BASE}/projects`, { params }).then(r => r.data),

  getProject: (id: number): Promise<StrategicProject> =>
    apiClient.get(`${BASE}/projects/${id}`).then(r => r.data),

  createProject: (data: StrategicProjectCreate): Promise<StrategicProject> =>
    apiClient.post(`${BASE}/projects`, data).then(r => r.data),

  updateProject: (id: number, data: StrategicProjectUpdate): Promise<StrategicProject> =>
    apiClient.patch(`${BASE}/projects/${id}`, data).then(r => r.data),

  deleteProject: (id: number): Promise<void> =>
    apiClient.delete(`${BASE}/projects/${id}`).then(r => r.data),

  getDashboardStats: (): Promise<StrategicDashboardStats> =>
    apiClient.get(`${BASE}/projects/stats`).then(r => r.data),

  // ── Budget Plans ──────────────────────────────────────────────────────────

  listBudgetPlans: (params?: { project_id?: number; fiscal_year?: number; budget_status?: string; skip?: number; limit?: number }): Promise<BudgetPlanList> =>
    apiClient.get(`${BASE}/budget-plans`, { params }).then(r => r.data),

  getBudgetPlan: (id: number): Promise<BudgetPlan> =>
    apiClient.get(`${BASE}/budget-plans/${id}`).then(r => r.data),

  createBudgetPlan: (data: BudgetPlanCreate): Promise<BudgetPlan> =>
    apiClient.post(`${BASE}/budget-plans`, data).then(r => r.data),

  updateBudgetPlan: (id: number, data: BudgetPlanUpdate): Promise<BudgetPlan> =>
    apiClient.patch(`${BASE}/budget-plans/${id}`, data).then(r => r.data),

  deleteBudgetPlan: (id: number): Promise<void> =>
    apiClient.delete(`${BASE}/budget-plans/${id}`).then(r => r.data),

  // ── Funding Sources ───────────────────────────────────────────────────────

  listFundingSources: (budget_plan_id: number): Promise<FundingSourceList> =>
    apiClient.get(`${BASE}/funding-sources`, { params: { budget_plan_id } }).then(r => r.data),

  createFundingSource: (data: FundingSourceCreate): Promise<FundingSource> =>
    apiClient.post(`${BASE}/funding-sources`, data).then(r => r.data),

  updateFundingSource: (id: number, data: Partial<FundingSourceCreate>): Promise<FundingSource> =>
    apiClient.patch(`${BASE}/funding-sources/${id}`, data).then(r => r.data),

  deleteFundingSource: (id: number): Promise<void> =>
    apiClient.delete(`${BASE}/funding-sources/${id}`).then(r => r.data),

  // ── Disbursements ─────────────────────────────────────────────────────────

  listDisbursements: (params?: { budget_plan_id?: number; skip?: number; limit?: number }): Promise<DisbursementList> =>
    apiClient.get(`${BASE}/disbursements`, { params }).then(r => r.data),

  createDisbursement: (data: DisbursementCreate): Promise<Disbursement> =>
    apiClient.post(`${BASE}/disbursements`, data).then(r => r.data),

  updateDisbursement: (id: number, data: DisbursementUpdate): Promise<Disbursement> =>
    apiClient.patch(`${BASE}/disbursements/${id}`, data).then(r => r.data),

  deleteDisbursement: (id: number): Promise<void> =>
    apiClient.delete(`${BASE}/disbursements/${id}`).then(r => r.data),

  // ── Project KPIs (B1) ─────────────────────────────────────────────────────

  listProjectKpis: (projectId: number, params?: { year?: number; status?: string }): Promise<{ items: KPIRead[]; total: number }> =>
    apiClient.get('/kpis', { params: { ...params, strategic_project_id: projectId, size: 100 } }).then(r => r.data),

  createProjectKpi: (data: KPICreate): Promise<KPIRead> =>
    apiClient.post('/kpis', data).then(r => r.data),

  // ── Project Documents (B3) ────────────────────────────────────────────────

  listProjectDocuments: (projectId: number): Promise<ProjectDocumentLink[]> =>
    apiClient.get(`${BASE}/projects/${projectId}/documents`).then(r => r.data),

  linkProjectDocument: (projectId: number, documentId: number, linkType = 'reference', note?: string) =>
    apiClient.post(`${BASE}/projects/${projectId}/documents`, { document_id: documentId, link_type: linkType, note }).then(r => r.data),

  unlinkProjectDocument: (projectId: number, documentId: number) =>
    apiClient.delete(`${BASE}/projects/${projectId}/documents/${documentId}`).then(r => r.data),
}

export default strategicApi
