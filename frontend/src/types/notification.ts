export type NotificationType = 'reminder_3d' | 'reminder_1d' | 'overdue'

export interface NotificationItem {
  id: number
  task_id: number | null
  type: NotificationType | string
  title: string
  body: string
  is_read: boolean
  link_url: string | null
  created_at: string
}

export interface UnreadCount {
  count: number
}

export interface WsNotification {
  type: 'notification'
  id: number
  notification_type: string
  title: string
  body: string
  task_id: number | null
  link_url: string | null
}
