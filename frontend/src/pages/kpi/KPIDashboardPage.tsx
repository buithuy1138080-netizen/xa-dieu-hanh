import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import apiClient from '../../api/client'
import { kpiApi } from '../../api/kpi'
import KPIStatusBadge from '../../components/kpi/KPIStatusBadge'
import AppLayout from '../../components/layout/AppLayout'
import type { KPIChartItem, KPICreate, KPIPeriod, KPIRead, KPIStats, KPIStatus } from '../../types/kpi'

interface DeptMin { id: number; name: string; short_name: string | null }
interface StaffItem { id: number; full_name: string; position: string | null; employee_code: string | null; department_id: number | null }

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR + 1]

const STATUS_PIE_COLORS: Record<KPIStatus, string> = {
  on_track: '#22c55e',
  at_risk:  '#f59e0b',
  behind:   '#ef4444',
  completed:'#3b82f6',
}

const CATEGORIES = ['Kinh tế', 'Xã hội', 'Hành chính', 'Môi trường', 'Hạ tầng', 'Văn hóa', 'An ninh', 'Khác']
const PERIODS: { value: KPIPeriod; label: string }[] = [
  { value: 'yearly', label: 'Năm' },
  { value: 'quarterly', label: 'Quý' },
  { value: 'monthly', label: 'Tháng' },
]
const STATUS_OPTS: { value: KPIStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'on_track', label: 'Đúng tiến độ' },
  { value: 'at_risk', label: 'Có rủi ro' },
  { value: 'behind', label: 'Chậm tiến độ' },
  { value: 'completed', label: 'Hoàn thành' },
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function ProgressRing({ progress, size = 64 }: { progress: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (progress / 100) * circ
  const color = progress >= 80 ? '#22c55e' : progress >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

export default function KPIDashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<KPIStats | null>(null)
  const [chart, setChart] = useState<KPIChartItem[]>([])
  const [kpis, setKpis] = useState<KPIRead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [depts, setDepts] = useState<DeptMin[]>([])
  const [staffList, setStaffList] = useState<StaffItem[]>([])

  // Filters
  const [year, setYear] = useState(CURRENT_YEAR)
  const [statusFilter, setStatusFilter] = useState<KPIStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 15

  // Form state
  const [form, setForm] = useState<KPICreate>({
    title: '', target_value: 100, current_value: 0,
    period: 'yearly', year: CURRENT_YEAR,
  })

  const loadAll = useCallback(async (p = 1, q = search) => {
    setLoading(true)
    try {
      const [s, c, k] = await Promise.allSettled([
        kpiApi.stats(year),
        kpiApi.chart({ year }),
        kpiApi.list({
          page: p, size: SIZE,
          year,
          search: q || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
        }),
      ])
      if (s.status === 'fulfilled') setStats(s.value.data)
      if (c.status === 'fulfilled') setChart(c.value.data)
      if (k.status === 'fulfilled') {
        setKpis(k.value.data.items)
        setTotal(k.value.data.total)
        setPage(p)
      }
    } finally {
      setLoading(false)
    }
  }, [year, statusFilter, categoryFilter, search])

  useEffect(() => { loadAll(1) }, [year, statusFilter, categoryFilter])
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => loadAll(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])
  useEffect(() => {
    apiClient.get<DeptMin[]>('/departments').then(r => setDepts(r.data)).catch(() => {})
    apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200').then(r => setStaffList(r.data.items)).catch(() => {})
  }, [])

  // Chart data for pie
  const pieData = stats ? [
    { name: 'Đúng tiến độ', value: stats.on_track,  color: STATUS_PIE_COLORS.on_track },
    { name: 'Có rủi ro',    value: stats.at_risk,   color: STATUS_PIE_COLORS.at_risk },
    { name: 'Chậm tiến độ', value: stats.behind,    color: STATUS_PIE_COLORS.behind },
    { name: 'Hoàn thành',   value: stats.completed, color: STATUS_PIE_COLORS.completed },
  ].filter(d => d.value > 0) : []

  // Bottom 5 slowest KPIs
  const slowest = [...chart].sort((a, b) => a.progress - b.progress).slice(0, 5)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await kpiApi.create(form)
      setShowForm(false)
      setForm({ title: '', target_value: 100, current_value: 0, period: 'yearly', year: CURRENT_YEAR })
      loadAll(1)
      navigate(`/kpi/${data.id}`)
    } finally {
      setSaving(false)
    }
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-xl">📊</div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">KPI Dashboard</h1>
              <p className="text-sm text-slate-500 mt-0.5">Theo dõi chỉ số hiệu quả thực thi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            >
              {YEARS.map(y => <option key={y} value={y}>Năm {y}</option>)}
            </select>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition"
            >
              + Thêm KPI
            </button>
          </div>
        </div>

        {/* KPI Stats Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Tổng KPI',       value: stats?.total ?? 0,     icon: '📋', cls: 'text-slate-700',  bg: 'bg-slate-50' },
            { label: 'Đúng tiến độ',   value: stats?.on_track ?? 0,  icon: '✅', cls: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Có rủi ro',      value: stats?.at_risk ?? 0,   icon: '⚠️', cls: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Chậm tiến độ',   value: stats?.behind ?? 0,    icon: '🔴', cls: 'text-red-600',   bg: 'bg-red-50' },
          ].map(c => (
            <div key={c.label} className={`rounded-2xl p-5 border border-slate-100 shadow-sm ${c.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{c.label}</p>
                  <p className={`text-4xl font-bold mt-1 ${c.cls}`}>{c.value}</p>
                </div>
                <span className="text-3xl">{c.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Additional stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Hoàn thành</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{stats?.completed ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Tiến độ TB</p>
            <p className="text-3xl font-bold text-violet-600 mt-1">{stats?.avg_progress ?? 0}%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Quá hạn</p>
            <p className="text-3xl font-bold text-red-500 mt-1">{stats?.overdue ?? 0}</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Bar chart - KPI progress */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Tiến độ tất cả KPI</h3>
            {chart.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-slate-400 text-sm">Chưa có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis
                    type="category" dataKey="title" width={120}
                    tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(v: unknown) => [`${v}%`, 'Tiến độ']}
                  />
                  <Bar dataKey="progress" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {chart.map((item) => (
                      <Cell
                        key={item.id}
                        fill={STATUS_PIE_COLORS[item.status] ?? '#94a3b8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pie chart - Status distribution */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Phân bổ trạng thái</h3>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                      paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v) => [v, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-500 flex-1">{d.name}</span>
                      <span className="font-bold text-slate-700">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Chưa có dữ liệu</div>
            )}
          </div>
        </div>

        {/* Bottom 5 slowest */}
        {slowest.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              🐢 Top KPI chậm tiến độ nhất
            </h3>
            <div className="space-y-3">
              {slowest.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1 transition"
                  onClick={() => navigate(`/kpi/${item.id}`)}
                >
                  <div className="shrink-0">
                    <ProgressRing progress={item.progress} size={48} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.category ?? '—'}
                      {item.unit && ` · Đơn vị: ${item.unit}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-700">{item.progress}%</p>
                    <p className="text-xs text-slate-400">{item.current}/{item.target} {item.unit ?? ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI List */}
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm KPI..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as KPIStatus | '')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none text-slate-600">
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none text-slate-600">
              <option value="">Tất cả nhóm</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Mã</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tên KPI</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Trạng thái</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Đơn vị</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Mục tiêu / TT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Tiến độ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && <tr><td colSpan={7} className="text-center py-12 text-slate-400">Đang tải...</td></tr>}
                {!loading && kpis.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-16">
                    <p className="text-3xl mb-2">📊</p>
                    <p className="text-slate-400">Chưa có KPI nào</p>
                  </td></tr>
                )}
                {!loading && kpis.map(k => (
                  <tr key={k.id} className="hover:bg-violet-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/kpi/${k.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{k.code ?? `KPI-${k.id}`}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-slate-800 line-clamp-2">{k.title}</p>
                      {k.category && <p className="text-xs text-slate-400 mt-0.5">{k.category}</p>}
                    </td>
                    <td className="px-4 py-3"><KPIStatusBadge status={k.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {k.responsible_department?.short_name ?? k.responsible_department?.name ?? k.responsible_unit ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {k.current_value} / {k.target_value} {k.unit ?? ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${k.progress}%`,
                              backgroundColor: STATUS_PIE_COLORS[k.status] ?? '#94a3b8',
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 font-semibold w-10 text-right">{k.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(k.deadline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Trang {page}/{pages} · {total} KPI</span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => loadAll(page - 1)}
                  className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">‹ Trước</button>
                <button disabled={page >= pages} onClick={() => loadAll(page + 1)}
                  className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Sau ›</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create KPI Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Thêm KPI mới</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mã KPI</label>
                  <input className={inp} value={form.code ?? ''} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="KPI-001" />
                </div>
                <div>
                  <label className={lbl}>Nhóm</label>
                  <select className={inp} value={form.category ?? ''} onChange={e => setForm(p => ({ ...p, category: e.target.value || undefined }))}>
                    <option value="">-- Chọn nhóm --</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Tên KPI *</label>
                <input required className={inp} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Tỷ lệ hộ nghèo giảm..." />
              </div>
              <div>
                <label className={lbl}>Mô tả</label>
                <textarea rows={2} className={inp} value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Mục tiêu *</label>
                  <input type="number" required className={inp} value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={lbl}>Thực hiện</label>
                  <input type="number" className={inp} value={form.current_value} onChange={e => setForm(p => ({ ...p, current_value: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={lbl}>Đơn vị tính</label>
                  <input className={inp} value={form.unit ?? ''} onChange={e => setForm(p => ({ ...p, unit: e.target.value || undefined }))} placeholder="%, người, tỷ..." />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Chu kỳ</label>
                  <select className={inp} value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value as KPIPeriod }))}>
                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Năm *</label>
                  <select className={inp} value={form.year} onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Hạn hoàn thành</label>
                  <input type="date" className={inp} value={form.deadline ?? ''} onChange={e => setForm(p => ({ ...p, deadline: e.target.value || null }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Đơn vị phụ trách</label>
                  <select
                    className={inp}
                    value={form.responsible_department_id ?? ''}
                    onChange={e => {
                      const deptId = e.target.value ? Number(e.target.value) : null
                      const dept = depts.find(d => d.id === deptId)
                      setForm(p => ({
                        ...p,
                        responsible_department_id: deptId,
                        responsible_unit: dept ? (dept.short_name ?? dept.name) : p.responsible_unit,
                      }))
                    }}
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Cán bộ phụ trách</label>
                  <select className={inp} value={form.responsible_staff_id ?? ''} onChange={e => setForm(p => ({ ...p, responsible_staff_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">-- Chưa xác định --</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}{s.position ? ` — ${s.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Hủy</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 transition">
                  {saving ? 'Đang lưu...' : 'Thêm KPI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
