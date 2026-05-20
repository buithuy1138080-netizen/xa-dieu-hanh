import apiClient from './client'
import type {
  SyncConfigCreate,
  SyncConfigRead,
  SyncConfigUpdate,
  SyncConflictRead,
  SyncLogRead,
  SyncStats,
} from '../types/gsheet'

const BASE = '/sync'

export const syncApi = {
  // ── Configs ───────────────────────────────────────────────────────────────
  createConfig: (body: SyncConfigCreate) =>
    apiClient.post<SyncConfigRead>(`${BASE}/configs`, body),

  listConfigs: () =>
    apiClient.get<SyncConfigRead[]>(`${BASE}/configs`),

  getConfig: (id: number) =>
    apiClient.get<SyncConfigRead>(`${BASE}/configs/${id}`),

  updateConfig: (id: number, body: SyncConfigUpdate) =>
    apiClient.put<SyncConfigRead>(`${BASE}/configs/${id}`, body),

  deleteConfig: (id: number) =>
    apiClient.delete(`${BASE}/configs/${id}`),

  testConnection: (id: number) =>
    apiClient.post<{ ok: boolean; title?: string; tabs?: string[]; error?: string }>(
      `${BASE}/configs/${id}/test-connection`
    ),

  triggerSync: (id: number, direction = 'pull') =>
    apiClient.post<SyncLogRead>(`${BASE}/configs/${id}/trigger`, { direction }),

  getConfigLogs: (id: number, limit = 20) =>
    apiClient.get<SyncLogRead[]>(`${BASE}/configs/${id}/logs`, { params: { limit } }),

  // ── Logs ──────────────────────────────────────────────────────────────────
  getAllLogs: (limit = 50) =>
    apiClient.get<SyncLogRead[]>(`${BASE}/logs`, { params: { limit } }),

  // ── Conflicts ─────────────────────────────────────────────────────────────
  getConflicts: (resolution = 'pending') =>
    apiClient.get<SyncConflictRead[]>(`${BASE}/conflicts`, { params: { resolution } }),

  resolveConflict: (id: number, resolution: 'ioc_wins' | 'sheet_wins') =>
    apiClient.post(`${BASE}/conflicts/${id}/resolve`, { resolution }),

  // ── Stats & helpers ───────────────────────────────────────────────────────
  getStats: () =>
    apiClient.get<SyncStats>(`${BASE}/stats`),

  getDefaultMappings: (entityType: string) =>
    apiClient.get<Array<{ ioc_field: string; sheet_col: string; transform: string | null }>>(
      `${BASE}/default-mappings/${entityType}`
    ),
}
