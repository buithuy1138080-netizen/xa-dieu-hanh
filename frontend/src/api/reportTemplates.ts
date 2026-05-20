import apiClient from './client'
import type { RenderRequest, ReportTemplate, ReportTemplateUpdate, VariableCatalog } from '../types/reportTemplate'

export const reportTemplatesApi = {
  list: (params?: { category?: string; active_only?: boolean }) =>
    apiClient.get<ReportTemplate[]>('/report-templates', { params }),

  get: (id: number) =>
    apiClient.get<ReportTemplate>(`/report-templates/${id}`),

  upload: (file: File, name: string, category: string, description = '') => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    form.append('category', category)
    form.append('description', description)
    return apiClient.post<ReportTemplate>('/report-templates', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  update: (id: number, body: ReportTemplateUpdate) =>
    apiClient.put<ReportTemplate>(`/report-templates/${id}`, body),

  activate: (id: number) =>
    apiClient.post<ReportTemplate>(`/report-templates/${id}/activate`),

  delete: (id: number) =>
    apiClient.delete(`/report-templates/${id}`),

  download: (id: number) =>
    apiClient.get(`/report-templates/${id}/download`, { responseType: 'blob' }),

  render: (id: number, body: RenderRequest) =>
    apiClient.post(`/report-templates/${id}/render`, body, { responseType: 'blob' }),

  variables: () =>
    apiClient.get<VariableCatalog>('/report-templates/variables'),

  categories: () =>
    apiClient.get<{ value: string; label: string }[]>('/report-templates/categories'),
}
