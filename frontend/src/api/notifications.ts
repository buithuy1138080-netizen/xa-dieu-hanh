import apiClient from './client'
import type { NotificationItem, UnreadCount } from '../types/notification'
import type { PaginatedResponse } from '../types/task'

export const notificationsApi = {
  list: (params?: { page?: number; size?: number; unread_only?: boolean }) =>
    apiClient.get<PaginatedResponse<NotificationItem>>('/notifications', { params }),

  unreadCount: () =>
    apiClient.get<UnreadCount>('/notifications/unread-count'),

  markRead: (id: number) =>
    apiClient.patch<NotificationItem>(`/notifications/${id}/read`),

  markAllRead: () =>
    apiClient.patch('/notifications/read-all'),
}
