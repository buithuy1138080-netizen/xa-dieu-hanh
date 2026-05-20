import { Bell } from 'lucide-react'
import { useState } from 'react'
import type { NotificationItem } from '../../types/notification'
import NotificationPanel from './NotificationPanel'

interface Props {
  unreadCount: number
  notifications: NotificationItem[]
  onOpen: () => void
  onMarkRead: (id: number) => void
  onMarkAll: () => void
}

export default function NotificationBell({ unreadCount, notifications, onOpen, onMarkRead, onMarkAll }: Props) {
  const [open, setOpen] = useState(false)

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) onOpen()
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className={`relative p-2 rounded-xl transition-all ${open ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
        title="Thông báo"
      >
        <Bell
          size={18}
          className={unreadCount > 0 ? 'animate-wiggle' : ''}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <NotificationPanel
            notifications={notifications}
            onMarkRead={onMarkRead}
            onMarkAll={() => { onMarkAll(); setOpen(false) }}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    </div>
  )
}
