import apiClient from './client'

export interface MeetingFile {
  id: number
  file_name: string
  file_size: number
  file_mime: string | null
  uploaded_at: string
}

export interface MeetingParticipant {
  id: number
  staff_id: number | null
  name: string | null
}

export interface Meeting {
  id: number
  title: string
  meeting_date: string
  location: string | null
  chair: string | null
  agenda: string | null
  created_at: string
  files: MeetingFile[]
  participants: MeetingParticipant[]
}

export interface MeetingListItem {
  id: number
  title: string
  meeting_date: string
  location: string | null
  chair: string | null
  file_count: number
  participant_count: number
}

export interface MeetingCreate {
  title: string
  meeting_date: string
  location?: string
  chair?: string
  agenda?: string
  participant_ids: number[]
}

export const meetingsApi = {
  list: (params?: { search?: string; page?: number; size?: number }) =>
    apiClient.get<{ total: number; items: MeetingListItem[] }>('/meetings', { params }),

  get: (id: number) =>
    apiClient.get<Meeting>(`/meetings/${id}`),

  create: (data: MeetingCreate) =>
    apiClient.post<Meeting>('/meetings', data),

  update: (id: number, data: Partial<MeetingCreate>) =>
    apiClient.put<Meeting>(`/meetings/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/meetings/${id}`),

  uploadFile: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post<MeetingFile>(`/meetings/${id}/files`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  deleteFile: (meetingId: number, fileId: number) =>
    apiClient.delete(`/meetings/${meetingId}/files/${fileId}`),

  getFileUrl: (meetingId: number, fileId: number) =>
    `/api/v1/meetings/${meetingId}/files/${fileId}`,

  downloadFile: (meetingId: number, fileId: number) =>
    apiClient.get(`/meetings/${meetingId}/files/${fileId}`, { responseType: 'blob' }),
}
