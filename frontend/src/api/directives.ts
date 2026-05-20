import apiClient from './client'
import type {
  DirectiveAttachmentRead,
  DirectiveCommentRead,
  DirectiveCreate,
  DirectiveRead,
  DirectiveReadDetail,
  DirectiveTaskCreate,
  DirectiveTaskRead,
  DirectiveUnitCreate,
  DirectiveUnitRead,
  PaginatedResponse,
} from '../types/directive'

export interface DirectiveListParams {
  page?: number
  size?: number
  search?: string
  status?: string
  priority?: string
  issuer_id?: number
  overdue_only?: boolean
}

export const directivesApi = {
  list: (params?: DirectiveListParams) =>
    apiClient.get<PaginatedResponse<DirectiveRead>>('/directives', { params }),

  get: (id: number) =>
    apiClient.get<DirectiveReadDetail>(`/directives/${id}`),

  create: (body: DirectiveCreate) =>
    apiClient.post<DirectiveRead>('/directives', body),

  update: (id: number, body: Partial<DirectiveCreate>) =>
    apiClient.put<DirectiveRead>(`/directives/${id}`, body),

  delete: (id: number) =>
    apiClient.delete(`/directives/${id}`),

  updateStatus: (id: number, status: string, note?: string) =>
    apiClient.patch<DirectiveRead>(`/directives/${id}/status`, { status, note }),

  // Units
  addUnit: (id: number, body: DirectiveUnitCreate) =>
    apiClient.post<DirectiveUnitRead>(`/directives/${id}/units`, body),

  updateUnitProgress: (id: number, unitId: number, progress: number, note?: string) =>
    apiClient.patch<DirectiveUnitRead>(`/directives/${id}/units/${unitId}`, { progress, note }),

  removeUnit: (id: number, unitId: number) =>
    apiClient.delete(`/directives/${id}/units/${unitId}`),

  // Tasks
  createTask: (id: number, body: DirectiveTaskCreate) =>
    apiClient.post<DirectiveTaskRead>(`/directives/${id}/tasks`, body),

  // Comments
  addComment: (id: number, content: string) =>
    apiClient.post<DirectiveCommentRead>(`/directives/${id}/comments`, { content }),

  deleteComment: (id: number, commentId: number) =>
    apiClient.delete(`/directives/${id}/comments/${commentId}`),

  // Attachments
  uploadAttachment: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<DirectiveAttachmentRead>(`/directives/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  deleteAttachment: (id: number, attId: number) =>
    apiClient.delete(`/directives/${id}/attachments/${attId}`),

  downloadAttachment: (id: number, attId: number) =>
    apiClient.get(`/directives/${id}/attachments/${attId}/download`, { responseType: 'blob' }),
}
