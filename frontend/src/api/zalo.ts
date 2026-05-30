import apiClient from './client'
import type {
  ZaloConfigRead,
  ZaloConfigUpsert,
  ZaloFollowerList,
  ZaloLogRead,
  ZaloSendRequest,
  ZaloSendResult,
  ZaloStats,
  ZaloTemplateCreate,
  ZaloTemplateRead,
  ZaloTemplateUpdate,
  ZaloUserLinkRead,
  ZaloUserLinkUpsert,
} from '../types/zalo'

const BASE = '/zalo'

export const zaloApi = {
  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: () =>
    apiClient.get<ZaloConfigRead | null>(`${BASE}/config`),

  upsertConfig: (body: ZaloConfigUpsert) =>
    apiClient.put<ZaloConfigRead>(`${BASE}/config`, body),

  refreshToken: () =>
    apiClient.post<ZaloConfigRead>(`${BASE}/config/refresh-token`),

  // ── Templates ─────────────────────────────────────────────────────────────
  listTemplates: () =>
    apiClient.get<ZaloTemplateRead[]>(`${BASE}/templates`),

  createTemplate: (body: ZaloTemplateCreate) =>
    apiClient.post<ZaloTemplateRead>(`${BASE}/templates`, body),

  updateTemplate: (id: number, body: ZaloTemplateUpdate) =>
    apiClient.put<ZaloTemplateRead>(`${BASE}/templates/${id}`, body),

  deleteTemplate: (id: number) =>
    apiClient.delete(`${BASE}/templates/${id}`),

  seedDefaults: () =>
    apiClient.post<{ inserted: number; message: string }>(`${BASE}/templates/seed-defaults`),

  // ── User Links ────────────────────────────────────────────────────────────
  listUserLinks: () =>
    apiClient.get<ZaloUserLinkRead[]>(`${BASE}/user-links`),

  upsertUserLink: (body: ZaloUserLinkUpsert) =>
    apiClient.put<ZaloUserLinkRead>(`${BASE}/user-links`, body),

  deleteUserLink: (userId: number) =>
    apiClient.delete(`${BASE}/user-links/${userId}`),

  importFromStaff: () =>
    apiClient.post<{ imported: number; total_staff: number }>(`${BASE}/user-links/import-from-staff`),

  // ── Send & Logs ───────────────────────────────────────────────────────────
  send: (body: ZaloSendRequest) =>
    apiClient.post<ZaloSendResult>(`${BASE}/send`, body),

  /** Debug: gửi OA message trực tiếp theo zalo_user_id (bỏ qua template/userlink) */
  sendText: (body: { zalo_user_id: string; text: string }) =>
    apiClient.post<{ ok: boolean; zalo_response: Record<string, unknown> }>(`${BASE}/send-text`, body),

  /** Gửi broadcast text đến nhiều user */
  broadcast: (body: { subject: string; text: string; recipient_user_ids: number[] }) =>
    apiClient.post<ZaloSendResult>(`${BASE}/broadcast`, body),

  getLogs: (params?: { limit?: number; notif_type?: string; status?: string }) =>
    apiClient.get<ZaloLogRead[]>(`${BASE}/logs`, { params }),

  getStats: () =>
    apiClient.get<ZaloStats>(`${BASE}/stats`),

  /** Lấy danh sách người quan tâm OA từ Zalo API */
  getFollowers: (offset = 0, count = 50) =>
    apiClient.get<ZaloFollowerList>(`${BASE}/followers`, { params: { offset, count } }),
}
