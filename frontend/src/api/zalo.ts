import apiClient from './client'
import type {
  ZaloConfigRead,
  ZaloConfigUpsert,
  ZaloLogRead,
  ZaloSendRequest,
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
    apiClient.post<{ sent: number; failed: number; no_link: number }>(`${BASE}/send`, body),

  getLogs: (params?: { limit?: number; notif_type?: string; status?: string }) =>
    apiClient.get<ZaloLogRead[]>(`${BASE}/logs`, { params }),

  getStats: () =>
    apiClient.get<ZaloStats>(`${BASE}/stats`),
}
