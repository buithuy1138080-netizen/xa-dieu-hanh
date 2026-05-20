import { Bell, CheckCheck, Clock, AlertTriangle, Timer, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { NotificationItem } from '../../types/notification'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; cls: string; iconCls: string }> = {
  reminder_3d: { icon: Timer,         cls: 'bg-blue-50',   iconCls: 'text-blue-500 bg-blue-100' },
  reminder_1d: { icon: AlertTriangle, cls: 'bg-amber-50',  iconCls: 'text-amber-500 bg-amber-100' },
  overdue:     { icon: Clock,         cls: 'bg-red-50',    iconCls: 'text-red-500 bg-red-100' },
}

function fmtTime(d: string) {
  const now = Date.now()
  const diff = Math.floor((now - new Date(d).getTime()) / 60000)
  if (diff < 1) return 'Vừa xong'
  if (diff < 60) return `${diff} phút trước`
  if (diff < 1440) return `${Math.floor(diff / 60)} giờ trước`
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

interface Props {
  notifications: NotificationItem[]
  onMarkRead: (id: number) => void
  onMarkAll: () => void
  onClose: () => void
}

export default function NotificationPanel({ notifications, onMarkRead, onMarkAll, onClose }: Props) {
  const navigate = useNavigate()

  function handleClick(n: NotificationItem) {
    if (!n.is_read) onMarkRead(n.id)
    const dest = n.link_url ?? (n.task_id ? `/tasks/${n.task_id}` : null)
    if (dest) {
      navigate(dest)
      onClose()
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="absolute right-0 top-11 w-[340px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-slate-500" />
          <h3 className="font-semibold text-slate-800 text-sm">Thông báo</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAll}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              <CheckCheck size={11} />
              Đọc tất cả
            </button>
          )}
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
        {notifications.length === 0 && (
          <div className="flex flex-col items-center py-12 text-slate-300">
            <Bell size={28} className="mb-3 opacity-40" />
            <p className="text-sm font-medium text-slate-400">Không có thông báo</p>
            <p className="text-xs text-slate-300 mt-1">Mọi thứ đang ổn!</p>
          </div>
        )}
        {notifications.map((n) => {
          const cfg = TYPE_CONFIG[n.type] ?? { icon: Bell, cls: '', iconCls: 'text-slate-500 bg-slate-100' }
          const Icon = cfg.icon
          return (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 relative ${!n.is_read ? cfg.cls : ''}`}
            >
              {/* Left accent line for unread */}
              {!n.is_read && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-r" />
              )}

              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.iconCls}`}>
                <Icon size={14} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                  {n.title}
                </p>
                {n.body && (
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                )}
                <p className="text-[10px] text-slate-300 mt-1.5 flex items-center gap-1">
                  <Clock size={9} />
                  {fmtTime(n.created_at)}
                </p>
              </div>

              {!n.is_read && (
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2 ring-2 ring-blue-100" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
