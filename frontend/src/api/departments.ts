import apiClient from './client'

export interface DeptRead {
  id: number
  code: string
  name: string
  short_name: string
  parent_id: number | null
  dept_type: string
  is_active: boolean
  sort_order: number
}

export const departmentsApi = {
  list: () => apiClient.get<DeptRead[]>('/departments'),
}
