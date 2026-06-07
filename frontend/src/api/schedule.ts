import apiClient from './client'
import type {
  LeaderMin,
  PaginatedSchedule,
  ReminderLog,
  ScheduleItemCreate,
  ScheduleItemRead,
  ScheduleItemUpdate,
  WeekView,
} from '../types/schedule'

const BASE = '/schedule'

export const scheduleApi = {
  // ── CRUD ──────────────────────────────────────────────────────────────────
  list: (params?: {
    page?: number; size?: number
    leader_id?: number; date_from?: string; date_to?: string; session?: string
  }) => apiClient.get<PaginatedSchedule>(BASE, { params }),

  get: (id: number) =>
    apiClient.get<ScheduleItemRead>(`${BASE}/${id}`),

  create: (body: ScheduleItemCreate) =>
    apiClient.post<ScheduleItemRead>(BASE, body),

  update: (id: number, body: ScheduleItemUpdate) =>
    apiClient.put<ScheduleItemRead>(`${BASE}/${id}`, body),

  remove: (id: number) =>
    apiClient.delete(`${BASE}/${id}`),

  // ── Week view ─────────────────────────────────────────────────────────────
  weekView: (weekStart: string, leaderId?: number) =>
    apiClient.get<WeekView>(`${BASE}/week`, {
      params: { week_start: weekStart, ...(leaderId ? { leader_id: leaderId } : {}) },
    }),

  // ── Leaders ───────────────────────────────────────────────────────────────
  leaders: () =>
    apiClient.get<LeaderMin[]>(`${BASE}/leaders`),

  // ── Reminder logs ─────────────────────────────────────────────────────────
  reminderLogs: (params?: {
    date_from?: string; date_to?: string; status?: string; leader_id?: number; limit?: number
  }) => apiClient.get<ReminderLog[]>(`${BASE}/reminders/logs`, { params }),

  // ── Export Excel ──────────────────────────────────────────────────────────
  exportExcel: (weekStart: string, leaderId?: number) =>
    apiClient.get(`${BASE}/export`, {
      params: { week_start: weekStart, ...(leaderId ? { leader_id: leaderId } : {}) },
      responseType: 'blob',
    }),
}
