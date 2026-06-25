import { motion } from 'framer-motion'
import {
  AlertTriangle, BarChart3, Bell, CheckCircle2, Clock,
  FileText, ClipboardList, TrendingUp, Building2,
  ArrowRight, Activity, Target, Zap, CalendarRange,
} from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { memo, useMemo, useState } from 'react'
import { QK } from '../lib/queryKeys'
import { Link } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { dashboardApi } from '../api/dashboard'
import type { UnitPerformance } from '../api/dashboard'
import AppLayout from '../components/layout/AppLayout'
import { useAuthStore } from '../store/authStore'

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

const StatCard = memo(function StatCard({
  label, value, sub, colorClass, icon: Icon, href, delay = 0,
}: {
  label: string; value: number | string; sub?: string
  colorClass: string; icon: React.ElementType; href?: string; delay?: number
}) {
  const inner = (
    <motion.div
      initial={fadeUp.initial} animate={fadeUp.animate}
      transition={{ duration: 0.2, delay }}
      className="relative bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${colorClass} opacity-80`} />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-2">{label}</p>
            <p className="text-3xl font-bold text-slate-800 leading-none">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colorClass} group-hover:scale-105 transition-transform duration-200 shadow-lg`}>
            <Icon size={19} className="text-white" />
          </div>
        </div>
      </div>
    </motion.div>
  )
  return href ? <Link to={href} className="block">{inner}</Link> : inner
})

const SectionHeader = memo(function SectionHeader({ title, icon: Icon, href }: { title: string; icon: React.ElementType; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600" />
        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
          <Icon size={13} className="text-blue-600" />
        </div>
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-[0.1em]">{title}</h2>
      </div>
      {href && (
        <Link to={href} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-semibold transition-colors px-2.5 py-1 rounded-lg hover:bg-blue-50">
          Xem tất cả <ArrowRight size={11} />
        </Link>
      )}
    </div>
  )
})

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      <div className="skeleton h-7 w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="skeleton h-2.5 w-20" />
            <div className="skeleton h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-44 w-full" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <div className="skeleton h-4 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-2.5 w-full" />
              <div className="skeleton h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Helpers
function toISODate(d: Date) { return d.toISOString().slice(0, 10) }
function defaultRange() {
  const to = new Date()
  const from = new Date(); from.setDate(from.getDate() - 29)
  return { from: toISODate(from), to: toISODate(to) }
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const isAdminOrLeader = ['admin', 'leader'].includes(user?.role ?? '')

  const [dateFrom, setDateFrom] = useState(defaultRange().from)
  const [dateTo,   setDateTo]   = useState(defaultRange().to)
  const [appliedFrom, setAppliedFrom] = useState(dateFrom)
  const [appliedTo,   setAppliedTo]   = useState(dateTo)

  const handleApply = () => {
    if (dateFrom && dateTo) { setAppliedFrom(dateFrom); setAppliedTo(dateTo) }
  }

  const [summaryQ, timelineQ, unitQ] = useQueries({
    queries: [
      {
        queryKey: QK.dashboardSummary(appliedFrom, appliedTo),
        queryFn: () => dashboardApi.summary().then(r => r.data),
      },
      {
        queryKey: QK.dashboardTimeline({ days: 30, from: appliedFrom, to: appliedTo }),
        queryFn: () => dashboardApi.timeline(30, appliedFrom, appliedTo).then(r => r.data),
      },
      {
        queryKey: QK.dashboardUnitPerf({ from: appliedFrom, to: appliedTo }),
        queryFn: () => isAdminOrLeader
          ? dashboardApi.unitPerformance(appliedFrom, appliedTo).then(r => r.data)
          : Promise.resolve([] as UnitPerformance[]),
        enabled: isAdminOrLeader,
      },
    ],
  })

  const summaryData  = summaryQ.data
  const stats        = summaryData?.tasks        ?? null
  const overdue      = summaryData?.overdue_tasks ?? []
  const upcomingTasks = summaryData?.upcoming_tasks ?? []
  const directiveStats = summaryData?.directives ?? null
  const kpiStats     = summaryData?.kpi          ?? null
  const nq57Stats    = summaryData?.nq57         ?? null
  const docStats     = summaryData?.documents    ?? null
  const timeline     = timelineQ.data            ?? []
  const units        = unitQ.data                ?? []
  const loading      = summaryQ.isLoading
  const apiErrors    = summaryQ.isError ? ['Tổng quan hệ thống'] : []

  const taskPieData = useMemo(() => stats ? [
    { name: 'Chờ xử lý',     value: stats.pending,      color: '#94a3b8' },
    { name: 'Đang thực hiện', value: stats.in_progress,  color: '#3b82f6' },
    { name: 'Quá hạn',        value: stats.overdue,      color: '#f97316' },
    { name: 'Hoàn thành',     value: stats.completed,    color: '#22c55e' },
    { name: 'Đã huỷ',         value: stats.cancelled,    color: '#f87171' },
  ].filter(d => d.value > 0) : [], [stats])

  const completionRate = stats ? Math.round(stats.completion_rate) : 0

  if (loading) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-[1600px]">

        {/* API error banner */}
        {apiErrors.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl px-4 py-2.5">
            <span className="font-semibold">Một số dữ liệu chưa tải được:</span>
            <span>{apiErrors.join(', ')}</span>
            <button className="ml-auto text-amber-500 hover:text-amber-700" onClick={() => summaryQ.refetch()}>Thử lại</button>
          </div>
        )}

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Tổng quan IOC</h1>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Date range filter */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <CalendarRange size={14} className="text-blue-500 shrink-0" />
              <input
                type="date" value={dateFrom} max={dateTo}
                onChange={e => setDateFrom(e.target.value)}
                className="text-xs text-slate-700 bg-transparent border-none outline-none w-32 cursor-pointer"
              />
              <span className="text-slate-300 text-xs">—</span>
              <input
                type="date" value={dateTo} min={dateFrom} max={toISODate(new Date())}
                onChange={e => setDateTo(e.target.value)}
                className="text-xs text-slate-700 bg-transparent border-none outline-none w-32 cursor-pointer"
              />
              <button
                onClick={handleApply}
                className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-2.5 py-1 rounded-lg transition-colors"
              >
                Lọc
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700">Hệ thống hoạt động</span>
            </div>
          </div>
        </motion.div>

        {/* ── Row 1: Stat cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          <StatCard label="Tổng nhiệm vụ"   value={stats?.total ?? 0}       colorClass="bg-blue-500"    icon={Activity}      href="/tasks"      delay={0}    />
          <StatCard label="Chờ xử lý"        value={stats?.pending ?? 0}     colorClass="bg-slate-500"   icon={Clock}         href="/tasks"      delay={0.02} />
          <StatCard label="Đang thực hiện"   value={stats?.in_progress ?? 0} colorClass="bg-indigo-500"  icon={Zap}           href="/tasks"      delay={0.04} />
          <StatCard label="Hoàn thành"       value={stats?.completed ?? 0}   sub={`${completionRate}% tỷ lệ`} colorClass="bg-emerald-500" icon={CheckCircle2} delay={0.06} />
          <StatCard label="Quá hạn"          value={stats?.overdue ?? 0}     colorClass="bg-red-500"     icon={AlertTriangle} href="/overdue"    delay={0.08} />
          <StatCard label="Chỉ đạo"          value={directiveStats?.total ?? 0} sub={`${directiveStats?.active ?? 0} hoạt động`} colorClass="bg-amber-500" icon={ClipboardList} href="/directives" delay={0.1} />
          <StatCard label="Văn bản"          value={docStats?.total ?? '—'}  sub={docStats ? `${docStats.incoming} đến · ${docStats.outgoing} đi` : undefined} colorClass="bg-slate-500" icon={FileText} href="/documents"  delay={0.12} />
        </div>

        {/* ── Row 2: KPI + NQ57 + Pie ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* KPI widget */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <SectionHeader title="KPI" icon={TrendingUp} href="/kpi" />
            {kpiStats ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Tổng', v: kpiStats.total, tw: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200' },
                    { label: 'Đúng tiến độ', v: kpiStats.on_track, tw: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
                    { label: 'Có rủi ro', v: kpiStats.at_risk, tw: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
                    { label: 'Chậm', v: kpiStats.behind, tw: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
                  ].map(({ label, v, tw }) => (
                    <div key={label} className={`rounded-xl p-3 ${tw}`}>
                      <p className="text-[10px] opacity-60 mb-0.5 font-medium">{label}</p>
                      <p className="text-2xl font-bold leading-none">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Tiến độ TB</span>
                    <span className="font-semibold text-slate-700">{kpiStats.avg_progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${kpiStats.avg_progress}%` }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
                  </div>
                </div>
              </>
            ) : <p className="text-sm text-slate-300 py-8 text-center">Chưa có dữ liệu</p>}
          </motion.div>

          {/* NQ57 widget */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <SectionHeader title="Nghị quyết 57" icon={Building2} href="/nq57" />
            {nq57Stats ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Tổng', v: nq57Stats.total, tw: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200' },
                    { label: 'Đang thực hiện', v: nq57Stats.in_progress, tw: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
                    { label: 'Hoàn thành', v: nq57Stats.completed, tw: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
                    { label: 'Chậm tiến độ', v: nq57Stats.delayed, tw: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
                  ].map(({ label, v, tw }) => (
                    <div key={label} className={`rounded-xl p-3 ${tw}`}>
                      <p className="text-[10px] opacity-60 mb-0.5 font-medium">{label}</p>
                      <p className="text-2xl font-bold leading-none">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Tiến độ TB</span>
                    <span className="font-semibold text-slate-700">{nq57Stats.avg_progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${nq57Stats.avg_progress}%` }}
                      transition={{ duration: 0.5, delay: 0.25 }}
                      className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 rounded-full" />
                  </div>
                </div>
              </>
            ) : <p className="text-sm text-slate-300 py-8 text-center">Chưa có dữ liệu</p>}
          </motion.div>

          {/* Task pie chart */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <SectionHeader title="Trạng thái nhiệm vụ" icon={BarChart3} />
            {taskPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={taskPieData} cx="50%" cy="50%"
                      innerRadius={38} outerRadius={56} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {taskPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                  {taskPieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-500 truncate flex-1">{d.name}</span>
                      <span className="font-bold text-slate-700">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-slate-300 text-sm">Chưa có dữ liệu</div>
            )}
          </motion.div>
        </div>

        {/* ── Row 3: Timeline + Unit performance ── */}
        <div className={`grid grid-cols-1 gap-4 ${isAdminOrLeader ? 'lg:grid-cols-3' : ''}`}>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`${isAdminOrLeader ? 'lg:col-span-2' : ''} bg-white rounded-2xl border border-slate-100 shadow-sm p-5`}>
            <SectionHeader title="Hoạt động 30 ngày" icon={Activity} />
            {timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={timeline} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false}
                    tickFormatter={v => {
                      if (typeof v !== 'string') return String(v)
                      const parts = v.split('-')
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : v
                    }} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }}
                    labelFormatter={v => {
                      if (typeof v !== 'string') return String(v)
                      const parts = v.split('-')
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : v
                    }} />
                  <Area type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} fill="url(#gc)" name="Tạo mới" dot={false} />
                  <Area type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} fill="url(#gd)" name="Hoàn thành" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-44 text-slate-300 text-sm">Chưa có hoạt động</div>
            )}
          </motion.div>

          {isAdminOrLeader && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
              <SectionHeader title="Hiệu suất đơn vị" icon={Target} />
              {units.length > 0 ? (
                <div className="space-y-3">
                  {units.slice(0, 7).map(u => (
                    <div key={u.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium truncate" style={{ maxWidth: 130 }}>{u.name}</span>
                        <span className="text-slate-400 shrink-0 ml-1">{u.done}/{u.total}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${u.completion_rate}%` }}
                          transition={{ duration: 0.4 }}
                          className={`h-full rounded-full ${u.completion_rate >= 80 ? 'bg-emerald-400' : u.completion_rate >= 50 ? 'bg-blue-400' : 'bg-red-400'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-44 text-slate-300 text-sm">Chưa có dữ liệu</div>
              )}
            </motion.div>
          )}
        </div>

        {/* ── Row 4: Hôm nay cần làm ── */}
        {upcomingTasks.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Bell size={13} className="text-amber-500" />
                </div>
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-[0.1em]">Hôm nay & Sắp đến hạn</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {upcomingTasks.length}
                </span>
              </div>
              <Link to="/tasks" className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-semibold transition-colors px-2.5 py-1 rounded-lg hover:bg-blue-50">
                Xem tất cả <ArrowRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {upcomingTasks.map(t => {
                const isToday = t.days_left === 0
                const isTomorrow = t.days_left === 1
                const urgCls = isToday
                  ? 'border-red-200 bg-red-50/40'
                  : isTomorrow
                  ? 'border-orange-200 bg-orange-50/30'
                  : 'border-slate-200 bg-white'
                const badgeCls = isToday
                  ? 'bg-red-100 text-red-600'
                  : isTomorrow
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-slate-100 text-slate-500'
                const badgeLabel = isToday ? 'Hôm nay' : isTomorrow ? 'Ngày mai' : `${t.days_left} ngày`
                return (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    className={`flex items-start gap-3 p-3 rounded-xl border hover:shadow-sm transition-all group ${urgCls}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isToday ? 'bg-red-100' : isTomorrow ? 'bg-orange-100' : 'bg-slate-100'}`}>
                      <Bell size={12} className={isToday ? 'text-red-500' : isTomorrow ? 'text-orange-500' : 'text-slate-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-700 truncate group-hover:text-blue-600 transition leading-tight">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badgeCls}`}>{badgeLabel}</span>
                        {t.assignee_name && (
                          <span className="text-[10px] text-slate-400 truncate">{t.assignee_name}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      t.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                      t.priority === 'high'   ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-100 text-slate-400'}`}>
                      {t.priority === 'urgent' ? 'Khẩn' : t.priority === 'high' ? 'Cao' : 'TB'}
                    </span>
                  </Link>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* ── Row 5: Overdue list + Unit bar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <SectionHeader title="Nhiệm vụ quá hạn" icon={AlertTriangle} href="/overdue" />
            {overdue.length > 0 ? (
              <div className="space-y-1.5">
                {overdue.map(t => (
                  <Link to={`/tasks/${t.id}`} key={t.id}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition group">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                      <AlertTriangle size={13} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600 transition">{t.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t.assignee_name ?? 'Chưa giao'} · <span className="text-red-500 font-medium">+{t.days_overdue} ngày</span>
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      t.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                      t.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-100 text-slate-500'}`}>
                      {t.priority === 'urgent' ? 'Khẩn' : t.priority === 'high' ? 'Cao' : 'TB'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                <CheckCircle2 size={36} className="mb-2 text-emerald-300" />
                <p className="text-sm">Không có nhiệm vụ quá hạn</p>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <SectionHeader title="Nhiệm vụ theo đơn vị" icon={BarChart3} />
            {units.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={units.slice(0, 8)} layout="vertical"
                  margin={{ top: 2, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90}
                    tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                  <Bar dataKey="done" name="Hoàn thành" fill="#22c55e" radius={[0, 3, 3, 0]} maxBarSize={12} />
                  <Bar dataKey="total" name="Tổng NV" fill="#e2e8f0" radius={[0, 3, 3, 0]} maxBarSize={12} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-44 text-slate-300 text-sm">Chưa có dữ liệu</div>
            )}
          </motion.div>
        </div>

        {/* ── Row 6: Directive stats ── */}
        {directiveStats && directiveStats.total > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow">
            <SectionHeader title="Chỉ đạo điều hành" icon={ClipboardList} href="/directives" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Tổng', v: directiveStats.total, tw: 'bg-slate-50 text-slate-700' },
                { label: 'Đang hoạt động', v: directiveStats.active, tw: 'bg-blue-50 text-blue-700' },
                { label: 'Hoàn thành', v: directiveStats.completed, tw: 'bg-emerald-50 text-emerald-700' },
                { label: 'Quá hạn', v: directiveStats.overdue, tw: 'bg-red-50 text-red-600' },
                { label: 'Sắp đến hạn', v: directiveStats.near_deadline, tw: 'bg-amber-50 text-amber-700' },
              ].map(({ label, v, tw }) => (
                <div key={label} className={`rounded-xl p-4 text-center ${tw}`}>
                  <p className="text-2xl font-bold">{v}</p>
                  <p className="text-xs mt-1 opacity-60">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </AppLayout>
  )
}
