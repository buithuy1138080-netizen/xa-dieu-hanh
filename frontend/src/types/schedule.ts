export type ScheduleSession = 'sang' | 'chieu' | 'ca_ngay' | 'toi'
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export const SESSION_LABELS: Record<ScheduleSession, string> = {
  sang:    'Sáng',
  chieu:   'Chiều',
  ca_ngay: 'Cả ngày',
  toi:     'Tối',
}

export const SESSION_COLORS: Record<ScheduleSession, string> = {
  sang:    'bg-amber-100 text-amber-800',
  chieu:   'bg-blue-100 text-blue-800',
  ca_ngay: 'bg-green-100 text-green-800',
  toi:     'bg-indigo-100 text-indigo-800',
}

export const REMIND_OPTIONS = [
  { value: 15,   label: '15 phút trước' },
  { value: 30,   label: '30 phút trước' },
  { value: 60,   label: '1 giờ trước' },
  { value: 120,  label: '2 giờ trước' },
  { value: 1440, label: '1 ngày trước' },
]

export interface LeaderMin {
  id: number
  full_name: string
  position: string | null
  employee_code: string | null
}

export interface ScheduleItemRead {
  id: number
  leader_id: number
  leader: LeaderMin | null
  title: string
  location: string | null
  note: string | null
  work_date: string          // YYYY-MM-DD
  session: ScheduleSession
  start_time: string | null  // "HH:MM:SS"
  zalo_remind: boolean
  remind_before_minutes: number
  created_by: number | null
  created_at: string
  updated_at: string | null
}

export interface ScheduleItemCreate {
  leader_id: number
  title: string
  location?: string
  note?: string
  work_date: string
  session: ScheduleSession
  start_time?: string        // "HH:MM"
  zalo_remind: boolean
  remind_before_minutes: number
}

export interface ScheduleItemUpdate {
  leader_id?: number
  title?: string
  location?: string
  note?: string
  work_date?: string
  session?: ScheduleSession
  start_time?: string
  zalo_remind?: boolean
  remind_before_minutes?: number
}

export interface ReminderLog {
  id: number
  schedule_id: number
  leader_id: number
  zalo_user_id: string | null
  scheduled_at: string
  sent_at: string | null
  status: ReminderStatus
  error_msg: string | null
  retry_count: number
  created_at: string
}

export interface PaginatedSchedule {
  items: ScheduleItemRead[]
  total: number
  page: number
  size: number
  pages: number
}

export interface WeekDay {
  [dateKey: string]: ScheduleItemRead[]
}

export interface WeekLeaderRow {
  leader: LeaderMin
  days: WeekDay
}

export interface WeekView {
  week_start: string
  week_end: string
  days: string[]
  leaders: WeekLeaderRow[]
}
