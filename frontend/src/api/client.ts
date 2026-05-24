import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
let _refreshing = false
let _waitQueue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const { refreshToken, setToken, logout } = useAuthStore.getState()
    if (!refreshToken) {
      logout()
      return Promise.reject(error)
    }

    if (_refreshing) {
      // Queue requests while a refresh is in flight
      return new Promise((resolve) => {
        _waitQueue.push((newToken: string) => {
          original.headers.Authorization = `Bearer ${newToken}`
          resolve(apiClient(original))
        })
      })
    }

    original._retry = true
    _refreshing = true

    try {
      const { data } = await axios.post('/api/v1/auth/refresh', {
        refresh_token: refreshToken,
      })
      setToken(data.access_token)
      // Also update refresh_token if rotated
      useAuthStore.setState({ refreshToken: data.refresh_token })

      original.headers.Authorization = `Bearer ${data.access_token}`
      _waitQueue.forEach((cb) => cb(data.access_token))
      _waitQueue = []
      return apiClient(original)
    } catch {
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
