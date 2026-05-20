import apiClient from './client'
import type {
  OcrAiResult, OcrConfirmRequest, OcrConfirmResult,
  OcrDocumentList, OcrDocumentRead, OcrEngineStatus, OcrUploadResponse,
} from '../types/ocr'

export interface OcrListResponse {
  total: number
  items: OcrDocumentList[]
}

const BASE = '/ocr'

export const ocrApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<OcrUploadResponse>(`${BASE}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  list: (skip = 0, limit = 20) =>
    apiClient.get<OcrListResponse>(BASE + '/', { params: { skip, limit } }),

  get: (id: number) =>
    apiClient.get<OcrDocumentRead>(`${BASE}/${id}`),

  updateAiResult: (id: number, ai_result: OcrAiResult) =>
    apiClient.put<OcrDocumentRead>(`${BASE}/${id}/ai-result`, { ai_result }),

  confirm: (id: number, body: OcrConfirmRequest) =>
    apiClient.post<OcrConfirmResult>(`${BASE}/${id}/confirm`, body),

  remove: (id: number) =>
    apiClient.delete(`${BASE}/${id}`),

  engineStatus: () =>
    apiClient.get<OcrEngineStatus>(`${BASE}/status/engine`),
}
