import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // send HttpOnly cookies automatically
})

// Auto-refresh on 401
let _refreshing = false
let _waitQueue: Array<(success: boolean) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const { user, logout } = useAuthStore.getState()
    if (!user) {
      logout()
      return Promise.reject(error)
    }

    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _waitQueue.push((success) => {
          if (success) resolve(apiClient(original))
          else reject(error)
        })
      })
    }

    original._retry = true
    _refreshing = true

    try {
      // Refresh cookie is sent automatically via withCredentials
      const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
      // Update in-memory token for WebSocket
      useAuthStore.getState().setToken(data.access_token)
      _waitQueue.forEach((cb) => cb(true))
      _waitQueue = []
      return apiClient(original)
    } catch {
      _waitQueue.forEach((cb) => cb(false))
      _waitQueue = []
      logout()
      return Promise.reject(error)
    } finally {
      _refreshing = false
    }
  },
)

// ── Simple in-memory GET cache (TTL-based) ───────────────────────────────────
const _cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL: Record<string, number> = {
  '/departments':        5 * 60_000, // 5 min
  '/programs':           2 * 60_000, // 2 min
  '/staff':              2 * 60_000, // 2 min
}

export function cachedGet<T = any>(url: string, params?: Record<string, any>) {
  const ttl = Object.entries(CACHE_TTL).find(([k]) => url.startsWith(k))?.[1]
  if (!ttl) return apiClient.get<T>(url, { params })

  const key = url + (params ? JSON.stringify(params) : '')
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.ts < ttl) {
    return Promise.resolve({ data: hit.data as T })
  }
  return apiClient.get<T>(url, { params }).then(r => {
    _cache.set(key, { data: r.data, ts: Date.now() })
    return r
  })
}

export function invalidateCache(prefix: string) {
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k)
  }
}

export default apiClient
