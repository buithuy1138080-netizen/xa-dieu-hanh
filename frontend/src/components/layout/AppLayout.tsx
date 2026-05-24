import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Menu, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../hooks/useNotifications'
import AiChatWidget from '../ai/AiChatWidget'
import MobileBottomNav from './MobileBottomNav'
import NotificationBell from './NotificationBell'
import Sidebar from './Sidebar'

interface Props {
  children: React.ReactNode
  title?: string
}

export default function AppLayout({ children }: Props) {
  const navigate = useNavigate()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { notifications, unreadCount, toasts, fetchNotifications, markRead, markAllRead, dismissToast } =
    useNotifications()

  const openSidebar  = useCallback(() => setMobileSidebarOpen(true), [])
  const closeSidebar = useCallback(() => setMobileSidebarOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — desktop: static; mobile: off-canvas drawer */}
      <div className={`
        fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0
        transition-transform duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onClose={closeSidebar} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top header */}
        <header className="h-14 bg-white border-b border-slate-200/80 shadow-sm flex items-center justify-between px-4 md:px-6 shrink-0 z-30">
          {/* Left */}
          <div className="flex items-center gap-3">
            <button
              onClick={openSidebar}
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors duration-150 active:scale-95"
              aria-label="Mở menu"
            >
              <Menu size={18} />
            </button>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm shadow-blue-500/30">
                <div className="w-3 h-3 rounded-sm border-2 border-white/80" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-slate-800 leading-none tracking-tight">Hệ Thống Điều Hành</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5 tracking-wide">Cấp Xã · IOC Platform</p>
              </div>
            </div>
            <div className="hidden sm:block h-4 w-px bg-slate-200 mx-1" />
            <span className="hidden sm:inline px-2.5 py-1 text-[10px] font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-sm shadow-blue-500/20 tracking-wider">
              IOC
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">LIVE</span>
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            <NotificationBell
              unreadCount={unreadCount}
              notifications={notifications}
              onOpen={fetchNotifications}
              onMarkRead={markRead}
              onMarkAll={markAllRead}
            />
          </div>
        </header>

        <main className="flex-1 overflow-auto thin-scroll pb-16 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />

      {/* AI Chat Widget */}
      <AiChatWidget />

      {/* Toast notifications */}
      <div className="fixed bottom-20 right-3 md:bottom-6 md:right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-24px)] md:max-w-none">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="pointer-events-auto bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-300/30 w-full md:w-[340px] flex overflow-hidden"
          >
            <div className="w-1 bg-gradient-to-b from-blue-500 to-indigo-600 shrink-0" />
            <div className="flex gap-3 items-start p-4 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                <Bell size={15} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-snug">{t.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{t.body}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0 items-end">
                {t.task_id && (
                  <button
                    onClick={() => { navigate(`/tasks/${t.task_id}`); dismissToast(t.id) }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap transition-colors"
                  >
                    Xem →
                  </button>
                )}
                <button
                  onClick={() => dismissToast(t.id)}
                  className="text-slate-300 hover:text-slate-500 transition-colors p-0.5 rounded"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
