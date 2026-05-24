import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3, Bell, BookTemplate, Briefcase, Building,
  CheckSquare, ChevronRight, ClipboardList, FileText,
  LayoutDashboard, LogOut,
  PanelLeftClose, PanelLeftOpen,
  Shield, Target, Users, X,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import type { User } from '../../types'

interface Props { onClose?: () => void }

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
      { to: '/dashboard', label: 'Tổng quan IOC', icon: LayoutDashboard },
      { to: '/tasks',     label: 'Nhiệm vụ',       icon: CheckSquare },
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
    label: 'CHƯƠNG TRÌNH & NQ',
    items: [
      { to: '/programs',  label: 'Chương trình / NQ',  icon: Shield },
      // /nq57 still accessible via URL; merged into Programs with filter
      { to: '/strategic', label: 'Dự án Chiến lược',   icon: Briefcase },
    ],
  },
  {
    label: 'CHỈ TIÊU KPI',
    items: [
      { to: '/kpi', label: 'KPI & Chỉ tiêu', icon: Target },
      // /kpi-cl (KPI Chiến lược) accessible via URL for admin/leader
    ],
  },
  {
    label: 'BÁO CÁO & CÔNG CỤ',
    items: [
      { to: '/bao-cao',     label: 'Báo cáo tự động', icon: BarChart3 },
      { to: '/mau-bao-cao', label: 'Mẫu báo cáo',     icon: BookTemplate },
      // /dong-bo accessible via URL for admin
      { to: '/zalo',        label: 'Zalo Thông báo',   icon: Bell,     allowedRoles: ['admin', 'leader'] },
    ],
  },
  {
    label: 'TỔ CHỨC',
    items: [
      { to: '/departments', label: 'Đơn vị',          icon: Building },
      { to: '/staff',       label: 'Nhân sự & Tài khoản', icon: Users, allowedRoles: ['admin', 'leader', 'manager'] },
      // /users (tài khoản) accessible via URL for admin
    ],
  },
]

function canAccess(item: NavItem, user: User | null) {
  if (!item.allowedRoles) return true
  if (!user) return false
  return item.allowedRoles.includes(user.role)
}

function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#0284c7'][Math.abs(h) % 7]
}

function roleBadge(role: string) {
  return {
    admin:   { cls: 'bg-red-100 text-red-700',       label: 'Admin' },
    leader:  { cls: 'bg-purple-100 text-purple-700', label: 'Lãnh đạo' },
    manager: { cls: 'bg-blue-100 text-blue-700',     label: 'Quản lý' },
  }[role] ?? { cls: 'bg-slate-100 text-slate-600', label: 'NV' }
}

/* ── Ripple hook ──────────────────────────────────────────── */
interface Ripple { id: number; x: number; y: number }

function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const counter = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const trigger = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const id = ++counter.current
    setRipples(r => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }])
    const t = setTimeout(() => setRipples(r => r.filter(x => x.id !== id)), 600)
    timers.current.push(t)
  }, [])

  return { ripples, trigger }
}

/* ── Sidebar component ────────────────────────────────────── */
export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { ripples, trigger } = useRipple()

  const handleLogout = useCallback(() => { logout(); navigate('/login') }, [logout, navigate])
  const handleNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    trigger(e)
    onClose?.()
  }, [trigger, onClose])

  const displayName = user?.full_name ?? user?.username ?? 'A'
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarColor = colorHash(user?.username ?? 'a')
  const rb = roleBadge(user?.role ?? 'staff')

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 280 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col shrink-0 h-screen overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        boxShadow: '0 10px 40px rgba(15,23,42,0.08)',
        borderRight: '1px solid rgba(148,163,184,0.15)',
      }}
    >

      {/* ── Logo / Header ─────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-4 min-h-[72px] border-b border-slate-100">
        {/* Brand icon */}
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
            boxShadow: '0 8px 24px rgba(37,99,235,0.28)',
          }}
        >
          {/* Glass overlay */}
          <div className="absolute inset-0 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)' }} />
          <Shield size={17} className="text-white relative z-10 drop-shadow" />
        </div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="flex-1 min-w-0"
            >
              <p className="text-slate-800 font-bold text-[15px] leading-tight whitespace-nowrap tracking-tight">
                Điều Hành Cấp Xã
              </p>
              <p className="text-[11px] whitespace-nowrap mt-0.5 font-medium" style={{ color: '#94A3B8' }}>
                IOC • v2.0
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="ml-auto shrink-0 flex">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200"
            aria-label="Thu gọn menu"
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 sidebar-scroll">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter(item => canAccess(item, user ?? null))
          if (!visible.length) return null

          return (
            <div key={group.label} className="mb-1">
              {/* Group label */}
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="px-3 pt-4 pb-1.5 text-[10.5px] font-bold uppercase whitespace-nowrap select-none"
                    style={{ color: '#94A3B8', letterSpacing: '1.2px' }}
                  >
                    {group.label}
                  </motion.p>
                )}
              </AnimatePresence>

              {visible.map(({ to, label, icon: Icon, alert }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    `group relative flex items-center my-[3px] h-12 rounded-[14px] text-[13.5px] font-medium overflow-hidden select-none transition-all duration-200 border-l-4 ${
                      collapsed ? 'justify-center pl-0 pr-0 border-transparent' :
                      isActive
                        ? 'pl-3 pr-3 border-blue-600 text-blue-800'
                        : 'pl-3 pr-3 border-transparent text-slate-600 hover:text-slate-800'
                    }`
                  }
                  style={({ isActive }) => isActive && !collapsed ? {
                    background: 'linear-gradient(90deg, rgba(37,99,235,0.13) 0%, rgba(79,70,229,0.07) 100%)',
                    boxShadow: '0 4px 16px rgba(37,99,235,0.10)',
                  } : {}}
                >
                  {({ isActive }) => (
                    <>
                      {/* ── Ripple spots ── */}
                      {ripples.map(r => (
                        <span
                          key={r.id}
                          className="nav-ripple absolute rounded-full bg-blue-400/20 w-8 h-8 pointer-events-none"
                          style={{ left: r.x - 16, top: r.y - 16 }}
                        />
                      ))}

                      {/* ── Hover bg overlay ── */}
                      {!isActive && (
                        <span
                          className="absolute inset-0 rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          style={{ background: 'rgba(59,130,246,0.07)' }}
                        />
                      )}

                      {/* ── Sliding active bg (layoutId for smooth transition) ── */}
                      {isActive && !collapsed && (
                        <motion.span
                          layoutId="activeNavBg"
                          className="absolute inset-0 rounded-[12px]"
                          transition={{ duration: 0.22, ease: [0.4,0,0.2,1] }}
                        />
                      )}

                      {/* ── Content: icon + text (translates on hover) ── */}
                      <span
                        className={`relative z-10 flex items-center flex-1 min-w-0 transition-transform duration-200 ${
                          collapsed ? 'justify-center' : `gap-3 ${!isActive ? 'group-hover:translate-x-1' : ''}`
                        }`}
                      >
                        {/* Icon */}
                        <Icon
                          size={19}
                          className={`shrink-0 transition-colors duration-200 ${
                            alert        ? 'text-red-500' :
                            isActive     ? 'text-blue-600' :
                            'text-slate-400 group-hover:text-slate-600'
                          }`}
                        />

                        {/* Label */}
                        <AnimatePresence>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.13 }}
                              className="whitespace-nowrap flex-1 truncate"
                            >
                              {label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>

                      {/* ── Right side decorators ── */}
                      {!collapsed && (
                        <span className="relative z-10 flex items-center gap-1.5 ml-1 shrink-0">
                          {isActive && (
                            <ChevronRight size={13} className="text-blue-500" />
                          )}
                          {alert && !isActive && (
                            <span
                              className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white animate-pulse"
                              style={{ background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}
                            >
                              !
                            </span>
                          )}
                          {alert && isActive && (
                            <span
                              className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                              style={{ background: '#EF4444' }}
                            >
                              !
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* ── User footer ───────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 px-2 py-3">
        {/* User info row */}
        <div className={`flex items-center gap-3 px-1 mb-1 ${collapsed ? 'justify-center' : ''}`}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-w-0"
              >
                <p className="text-slate-800 text-[13px] font-semibold truncate leading-tight">{displayName}</p>
                <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mt-0.5 ${rb.cls}`}>
                  {rb.label}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Đăng xuất' : undefined}
          className={`flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 text-[13px] font-medium ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={15} className="shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap"
              >
                Đăng xuất
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
