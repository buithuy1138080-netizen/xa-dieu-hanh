export type ZaloChannel = 'oa_message' | 'zns'
export type ZaloLogStatus = 'pending' | 'sent' | 'failed' | 'delivered'

export const NOTIF_TYPE_LABELS: Record<string, string> = {
  task_overdue:  '⚠️ Nhiệm vụ quá hạn',
  task_warning:  '⏰ Nhiệm vụ sắp đến hạn',
  kpi_low:       '📊 KPI thấp',
  report_done:   '📋 Báo cáo hoàn thành',
  directive_new: '📌 Chỉ đạo mới',
  document_new:  '📄 Văn bản mới',
  system_alert:  '🔔 Cảnh báo hệ thống',
  broadcast:     '📢 Thông báo điều hành',
}

export const STATUS_LABELS: Record<ZaloLogStatus, string> = {
  pending:   'Chờ gửi',
  sent:      'Đã gửi',
  failed:    'Thất bại',
  delivered: 'Đã nhận',
}

export interface ZaloConfigRead {
  id: number
  app_id: string
  oa_id: string
  has_access_token: boolean
  has_refresh_token: boolean
  token_expiry: string | null
  is_active: boolean
  created_at: string
}

export interface ZaloConfigUpsert {
  app_id: string
  app_secret: string
  oa_id: string
  access_token?: string
  refresh_token?: string
  is_active?: boolean
}

export interface ZaloTemplateRead {
  id: number
  name: string
  notif_type: string
  channel: ZaloChannel
  subject: string
  content: string
  variables: string[] | null
  zns_template_id: string | null
  is_active: boolean
  is_default: boolean
  created_at: string
}

export interface ZaloTemplateCreate {
  name: string
  notif_type: string
  channel?: ZaloChannel
  subject: string
  content: string
  variables?: string[]
  zns_template_id?: string
  is_active?: boolean
}

export interface ZaloTemplateUpdate {
  name?: string
  channel?: ZaloChannel
  subject?: string
  content?: string
  variables?: string[]
  zns_template_id?: string
  is_active?: boolean
}

export interface ZaloLogRead {
  id: number
  template_id: number | null
  recipient_user_id: number | null
  recipient_phone: string
  notif_type: string
  subject: string
  content_rendered: string
  status: ZaloLogStatus
  error_msg: string | null
  zalo_msg_id: string | null
  triggered_by: string
  entity_type: string | null
  entity_id: number | null
  sent_at: string | null
  created_at: string
}

export interface ZaloUserLinkRead {
  id: number
  user_id: number
  zalo_phone: string | null
  zalo_user_id: string | null
  is_verified: boolean
  is_active: boolean
  created_at: string
}

export interface ZaloUserLinkUpsert {
  user_id: number
  zalo_phone?: string
  zalo_user_id?: string
  is_active?: boolean
}

export interface ZaloSendRequest {
  notif_type: string
  recipient_user_ids: number[]
  context?: Record<string, string>
  entity_type?: string
  entity_id?: number
}

export interface ZaloStats {
  total_sent: number
  sent_today: number
  failed_today: number
  users_linked: number
}
