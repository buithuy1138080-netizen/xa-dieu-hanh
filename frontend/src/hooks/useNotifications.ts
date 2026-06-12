import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { notificationsApi } from '../api/notifications'
import { useAuthStore } from '../store/authStore'
import type { NotificationItem, WsNotification } from '../types/notification'

export interface Toast {
  id: number
  title: string
  body: string
  task_id: number | null
}

export function useNotifications() {
  const token = useAuthStore((s) => s.token)
  const user  = useAuthStore((s) => s.user)
  const setToken = useAuthStore((s) => s.setToken)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await notificationsApi.unreadCount()
      setUnreadCount(data.count)
    } catch {}
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await notificationsApi.list({ size: 50 })
      setNotifications(data.items)
      setUnreadCount(data.items.filter((n) => !n.is_read).length)
    } catch {}
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const markRead = useCallback(async (id: number) => {
    try {
      await notificationsApi.markRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {}
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {}
  }, [])

  // On page refresh: user is persisted but token is in-memory only.
  // Restore in-memory token from cookie session so WebSocket can connect.
  useEffect(() => {
    if (user && !token) {
      axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        .then(r => setToken(r.data.access_token))
        .catch(() => {})
    }
  }, [user, token, setToken])

  useEffect(() => {
    if (!token) return
    fetchUnreadCount()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/ws?token=${token}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data: WsNotification = JSON.parse(event.data)
        if (data.type !== 'notification') return
        setUnreadCount((c) => c + 1)
        const toast: Toast = { id: data.id, title: data.title, body: data.body, task_id: data.task_id }
        setToasts((prev) => [...prev, toast])
        setTimeout(() => dismissToast(toast.id), 6000)
      } catch {}
    }

    ws.onerror = () => {}

    return () => ws.close()
  }, [token, fetchUnreadCount, dismissToast])

  return {
    notifications,
    unreadCount,
    toasts,
    fetchNotifications,
    markRead,
    markAllRead,
    dismissToast,
  }
}
