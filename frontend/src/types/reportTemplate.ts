export type TemplateCategory = 'nq57' | 'weekly' | 'monthly' | 'directive' | 'kpi' | 'custom'
export type TemplateFileExt = 'xlsx' | 'docx'
export type RenderFormat = 'xlsx' | 'docx' | 'pdf'

export const CATEGORY_LABELS: Record<string, string> = {
  nq57:      'Báo cáo NQ57',
  weekly:    'Báo cáo tuần',
  monthly:   'Báo cáo tháng',
  directive: 'Báo cáo chỉ đạo',
  kpi:       'Báo cáo KPI',
  custom:    'Mẫu tùy chỉnh',
}

export interface ReportTemplate {
  id: number
  name: string
  category: TemplateCategory
  description: string | null
  file_ext: TemplateFileExt
  file_size: number | null
  variables: string[]
  list_variables: string[]
  version: number
  is_active: boolean
  created_by: number
  created_at: string
  updated_at: string | null
}

export interface ReportTemplateUpdate {
  name?: string
  description?: string
  is_active?: boolean
}

export interface RenderRequest {
  period_from: string   // YYYY-MM-DD
  period_to: string     // YYYY-MM-DD
  format: RenderFormat
}

export interface VariableInfo {
  name: string
  description: string
  example: string
}

export interface VariableCatalog {
  scalars: VariableInfo[]
  lists: VariableInfo[]
}
