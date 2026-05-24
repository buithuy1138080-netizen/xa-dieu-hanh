import apiClient from './client'
import type {
  AiParseResult,
  DocumentCommentRead,
  DocumentCreate,
  DocumentRead,
  DocumentReadDetail,
  DocumentTaskCreate,
  DocumentTaskRead,
  DocumentUpdate,
  PaginatedResponse,
} from '../types/document'

export interface DocListParams {
  page?: number
  size?: number
  search?: string
  doc_type?: string
  status?: string
  priority?: string
  issuer?: string
  assignee_id?: number
  from_date?: string
  to_date?: string
}

export const documentsApi = {
  list: (params?: DocListParams) =>
    apiClient.get<PaginatedResponse<DocumentRead>>('/documents', { params }),

  get: (id: number) =>
    apiClient.get<DocumentReadDetail>(`/documents/${id}`),

  create: (body: DocumentCreate) =>
    apiClient.post<DocumentRead>('/documents', body),

  update: (id: number, body: DocumentUpdate) =>
    apiClient.put<DocumentRead>(`/documents/${id}`, body),

  delete: (id: number) =>
    apiClient.delete(`/documents/${id}`),

  updateStatus: (id: number, status: string, note?: string) =>
    apiClient.patch<DocumentRead>(`/documents/${id}/status`, { status, note }),

  uploadFile: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<DocumentRead>(`/documents/${id}/file`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getFileUrl: (id: number) => `/api/v1/documents/${id}/file`,

  downloadFile: (id: number) =>
    apiClient.get(`/documents/${id}/file`, { responseType: 'blob' }),

  addComment: (id: number, content: string) =>
    apiClient.post<DocumentCommentRead>(`/documents/${id}/comments`, { content }),

  deleteComment: (docId: number, commentId: number) =>
    apiClient.delete(`/documents/${docId}/comments/${commentId}`),

  createTask: (id: number, body: DocumentTaskCreate) =>
    apiClient.post<DocumentTaskRead>(`/documents/${id}/tasks`, body),

  upload: (file: File, doc_type = 'incoming') => {
    const form = new FormData()
    form.append('file', file)
    form.append('doc_type', doc_type)
    return apiClient.post<import('../types/document').DocumentRead>('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  export: (params?: DocListParams) =>
    apiClient.get('/documents/export', { params, responseType: 'blob' }),

  aiParse: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<AiParseResult>('/documents/ai-parse', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
