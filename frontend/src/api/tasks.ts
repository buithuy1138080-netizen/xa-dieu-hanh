import apiClient from './client'
import type { PaginatedResponse, Task, TaskComment, TaskCreate, TaskDetail, TaskStats, TaskUpdate } from '../types/task'

export interface TaskFilters {
  page?: number
  page_size?: number
  status?: string
  priority?: string
  assignee_id?: number
  lead_dept_id?: number
  supervising_user_id?: number
  incoming_document_id?: number
  outgoing_document_id?: number
  directive_id?: number
  program_id?: number
  coordinating_dept_id?: number
  overdue_only?: boolean
  due_before?: string
  due_after?: string
  search?: string
  sort_by?: string
  sort_dir?: string
}

export const tasksApi = {
  list: (filters: TaskFilters = {}) =>
    apiClient.get<PaginatedResponse<Task>>('/tasks', { params: filters }),

  get: (id: number) =>
    apiClient.get<TaskDetail>(`/tasks/${id}`),

  create: (data: TaskCreate) =>
    apiClient.post<Task>('/tasks', data),

  update: (id: number, data: TaskUpdate) =>
    apiClient.put<Task>(`/tasks/${id}`, data),

  updateStatus: (id: number, status: string, completion_note?: string) =>
    apiClient.patch<Task>(`/tasks/${id}/status`, { status, completion_note }),

  updateProgress: (id: number, progress_percent: number, completion_note?: string) =>
    apiClient.patch<Task>(`/tasks/${id}/progress`, { progress_percent, completion_note }),

  delete: (id: number) =>
    apiClient.delete(`/tasks/${id}`),

  stats: () =>
    apiClient.get<TaskStats>('/tasks/stats'),

  overdue: () =>
    apiClient.get<Task[]>('/tasks/overdue'),

  addComment: (taskId: number, content: string) =>
    apiClient.post<TaskComment>(`/tasks/${taskId}/comments`, { content }),

  deleteComment: (taskId: number, commentId: number) =>
    apiClient.delete(`/tasks/${taskId}/comments/${commentId}`),

  uploadAttachment: (taskId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post(`/tasks/${taskId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  deleteAttachment: (taskId: number, attachmentId: number) =>
    apiClient.delete(`/tasks/${taskId}/attachments/${attachmentId}`),

  addDepartment: (taskId: number, department_id: number, role = 'coordinating') =>
    apiClient.post(`/tasks/${taskId}/departments`, { department_id, role }),

  removeDepartment: (taskId: number, deptId: number) =>
    apiClient.delete(`/tasks/${taskId}/departments/${deptId}`),
}
