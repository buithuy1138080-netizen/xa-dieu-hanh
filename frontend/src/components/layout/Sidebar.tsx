import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, BarChart2, Bell, BookOpen, BookTemplate, Building, Building2,
  CheckSquare, ChevronRight, ClipboardList, Columns3, FileText,
  Layers, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCw,
  ScanText, ScrollText, Shield, Target, TrendingUp, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { User } from '../../types'

interface Props {
  onClose?: () => void
}

// ── Navigation config ─────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  alert?: boolean
  allowedRoles?: string[]
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'ĐIỀU HÀNH',
    items: [
      { to: '/dashboard', label: 'Tổng quan IOC',  icon: LayoutDashboard },
      { to: '/tasks',     label: 'Nhiệm vụ',        icon: CheckSquare },
      { to: '/kanban',    label: 'Kanban Board',     icon: Columns3 },
      { to: '/overdue',   label: 'Quá hạn',          icon: AlertTriangle, alert: true },
    ],
  },
  {
    label: 'VĂN BẢN & CHỈ ĐẠO',
    items: [
      { to: '/documents',  label: 'Văn bản',  icon: FileText },
      { to: '/directives', label: 'Chỉ đạo',  icon: ClipboardList },
    ],
  },
  {
    label: 'CHỈ TIÊU & NGHỊ QUYẾT',
    items: [
      { to: '/kpi-tong-hop', label: 'KPI Tổng hợp',    icon: Layers },
      { to: '/kpi',          label: 'KPI & Chỉ tiêu', icon: TrendingUp },
      { to: '/nq57',         label: 'Nghị quyết 57',  icon: Building2 },
      { to: '/nghi-quyet',   label: 'NQ & Đề án',     icon: ScrollText },
      { to: '/kpi-cl',       label: 'KPI Chiến lược', icon: Target, allowedRoles: ['admin', 'leader'] },
    ],
  },
  {
    label: 'DỰ ÁN & KINH PHÍ',
    items: [
      { to: '/strategic', label: 'Dự án Chiến lược', icon: BookOpen },
    ],
  },
  {
    label: 'BÁO CÁO & CÔNG CỤ',
    items: [
      { to: '/bao-cao',     label: 'Báo cáo tự động', icon: BarChart2 },
      { to: '/mau-bao-cao', label: 'Mẫu báo cáo',     icon: BookTemplate },
      { to: '/ocr',         label: 'OCR & AI Văn bản', icon: ScanText, allowedRoles: ['admin', 'leader', 'manager'] },
      {
        to: '/dong-bo', label: 'Đồng bộ Sheet', icon: RefreshCw,
        allowedRoles: ['admin', 'leader'],
      },
      { to: '/zalo', label: 'Zalo Thông báo', icon: Bell, allowedRoles: ['admin', 'leader'] },
    ],
  },
  {
    label: 'TỔ CHỨC',
    items: [
      { to: '/departments', label: 'Đơn vị',  icon: Building },
      { to: '/staff',       label: 'Nhân sự',  icon: Users, allowedRoles: ['admin', 'leader', 'manager'] },
    ],
  },
]

function canAccess(item: NavItem, user: User | null): boolean {
  if (!item.allowedRoles) return true
  if (!user) return false
  return item.allowedRoles.includes(user.role)
}

function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  const colors = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#0284c7']
  return colors[Math.abs(h) % colors.length]
}

function roleBadgeColor(role: string) {
  switch (role) {
    case 'admin':   return 'bg-red-500/20 text-red-300'
    case 'leader':  return 'bg-purple-500/20 text-purple-300'
    case 'manager': return 'bg-blue-500/20 text-blue-300'
    default:        return 'bg-slate-500/20 text-slate-400'
  }
}

function roleLabelShort(role: string) {
  return { admin: 'Admin', leader: 'Lãnh đạo', manager: 'Quản lý', staff: 'NV' }[role] ?? role
}

export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  function handleLogout() { logout(); navigate('/login') }
  function handleNavClick() { onClose?.() }

  const displayName = user?.full_name ?? user?.username ?? 'A'
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarColor = colorHash(user?.username ?? 'a')

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 248 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="relative bg-[#0d1526] flex flex-col shrink-0 h-screen overflow-hidden"
      style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-4 py-4 min-h-[64px]" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/40">
          <Shield size={15} className="text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }} className="overflow-hidden flex-1 min-w-0">
              <p className="text-white font-bold text-[13px] leading-tight whitespace-nowrap tracking-tight">Điều Hành Cấp Xã</p>
              <p className="text-slate-500 text-[10px] whitespace-nowrap mt-0.5 tracking-wide">IOC · v2.0</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={() => setCollapsed(c => !c)} className="hidden md:flex ml-auto text-slate-600 hover:text-slate-300 transition-colors shrink-0 p-1 rounded-md hover:bg-white/5">
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        {onClose && (
          <button onClick={onClose} className="md:hidden ml-auto text-slate-600 hover:text-slate-300 transition-colors shrink-0 p-1 rounded-md hover:bg-white/5">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 overflow-y-auto py-3 scrollbar-none">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(item => canAccess(item, user ?? null))
          if (visibleItems.length === 0) return null
          return (
            <div key={group.label} className="mb-2">
              <AnimatePresence>
                {!collapsed && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                    className="px-4 pt-3 pb-1.5 text-[9.5px] font-bold tracking-[0.12em] text-slate-600 uppercase whitespace-nowrap">
                    {group.label}
                  </motion.p>
                )}
              </AnimatePresence>

              {visibleItems.map(({ to, label, icon: Icon, alert }) => (
                <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={handleNavClick}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 mx-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${
                      isActive ? 'bg-blue-600/15 text-blue-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
                    } ${collapsed ? 'justify-center' : ''}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div layoutId="sidebarActiveBar"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-blue-400 to-indigo-500 rounded-r-full" />
                      )}
                      <div className={`shrink-0 transition-transform duration-150 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                        <Icon size={16} className={alert ? 'text-red-400' : isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'} />
                      </div>
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                            className="whitespace-nowrap flex-1 truncate">
                            {label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {!collapsed && (
                        <>
                          {isActive && <ChevronRight size={11} className="text-blue-500 shrink-0" />}
                          {alert && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />}
                        </>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="relative" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className={`flex items-center gap-3 p-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-lg ring-2 ring-white/10" style={{ backgroundColor: avatarColor }}>
            {initials}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate leading-tight">{displayName}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${roleBadgeColor(user?.role ?? 'staff')}`}>
                  {roleLabelShort(user?.role ?? 'staff')}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={handleLogout} title={collapsed ? 'Đăng xuất' : undefined}
          className={`w-full flex items-center gap-3 px-4 py-2.5 mb-1 text-slate-600 hover:text-red-400 hover:bg-red-500/8 rounded-xl mx-auto transition-all text-xs font-medium ${collapsed ? 'justify-center w-12 mx-auto' : 'mx-2.5 w-[calc(100%-20px)]'}`}>
          <LogOut size={14} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                Đăng xuất
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
