import { AlertTriangle, BarChart2, CheckSquare, LayoutDashboard, TrendingUp } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const BOTTOM_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks',     label: 'Nhiệm vụ',  icon: CheckSquare },
  { to: '/overdue',   label: 'Quá hạn',   icon: AlertTriangle, alert: true },
  { to: '/kpi',       label: 'KPI',       icon: TrendingUp },
  { to: '/bao-cao',   label: 'Báo cáo',   icon: BarChart2 },
]

export default function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-[#0d1526] border-t border-white/8 flex items-stretch safe-area-bottom">
      {BOTTOM_NAV.map(({ to, label, icon: Icon, alert }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors min-h-[56px] ${
              isActive ? 'text-blue-400' : 'text-slate-500 active:bg-white/5'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <Icon size={18} className={alert && !isActive ? 'text-red-400' : undefined} />
                {alert && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-400 border border-[#0d1526]" />
                )}
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                )}
              </div>
              <span className="truncate w-full text-center px-0.5">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
