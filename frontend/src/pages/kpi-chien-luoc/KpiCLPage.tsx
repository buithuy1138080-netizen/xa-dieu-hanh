import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import apiClient from '../../api/client'
import { kpiCLApi } from '../../api/kpiCL'
import AppLayout from '../../components/layout/AppLayout'
import type {
  DeptMin, HeatmapData, KpiCLCreate, KpiCLLoai, KpiCLRead, KpiCLStats,
  KpiCLTrangThai, OverdueItem, RankingData,
} from '../../types/kpiCL'

// ─── Constants ───────────────────────────────────────────────────────────────

const LOAI_OPTIONS = [
  { value: 'quy',       label: 'KPI Quý'          },
  { value: 'nam',       label: 'KPI Năm'           },
  { value: 'nhiem_ky',  label: 'KPI Nhiệm kỳ 5 năm' },
]

const TRANG_THAI_LIST: KpiCLTrangThai[] = [
  'Chưa bắt đầu', 'Đúng tiến độ', 'Có rủi ro', 'Chậm tiến độ', 'Đạt mục tiêu', 'Quá hạn',
]

const TRANG_THAI_COLOR: Record<string, string> = {
  'Chưa bắt đầu': '#94a3b8',
  'Đúng tiến độ': '#22c55e',
  'Có rủi ro':    '#f59e0b',
  'Chậm tiến độ': '#f97316',
  'Đạt mục tiêu': '#3b82f6',
  'Quá hạn':      '#ef4444',
}

const TRANG_THAI_CLS: Record<string, string> = {
  'Chưa bắt đầu': 'bg-slate-100 text-slate-600',
  'Đúng tiến độ': 'bg-green-100 text-green-700',
  'Có rủi ro':    'bg-amber-100 text-amber-700',
  'Chậm tiến độ': 'bg-orange-100 text-orange-700',
  'Đạt mục tiêu': 'bg-blue-100 text-blue-700',
  'Quá hạn':      'bg-red-100 text-red-700',
}

const DANH_MUC_SUGGESTIONS = [
  'Kinh tế', 'Văn hóa - Xã hội', 'Hành chính', 'Quốc phòng - An ninh', 'Môi trường',
  'Giáo dục', 'Y tế', 'Hạ tầng',
]

const THIS_YEAR = new Date().getFullYear()

function pctColor(pct: number): string {
  if (pct >= 90) return '#15803d'
  if (pct >= 70) return '#22c55e'
  if (pct >= 50) return '#eab308'
  if (pct >= 30) return '#f97316'
  return '#ef4444'
}

function pctBg(pct: number): string {
  if (pct >= 90) return 'bg-green-700 text-white'
  if (pct >= 70) return 'bg-green-500 text-white'
  if (pct >= 50) return 'bg-yellow-400 text-slate-800'
  if (pct >= 30) return 'bg-orange-400 text-white'
  return 'bg-red-500 text-white'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TRANG_THAI_CLS[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

// ─── Heatmap Component ────────────────────────────────────────────────────────

function KpiHeatmap({ data }: { data: HeatmapData }) {
  if (!data.danh_mucs.length || !data.periods.length) {
    return <p className="text-slate-400 text-sm text-center py-8">Chưa có dữ liệu heatmap</p>
  }

  const cellMap = new Map<string, { avg_pct: number; count: number }>()
  for (const c of data.cells) {
    cellMap.set(`${c.danh_muc}||${c.period}`, { avg_pct: c.avg_pct, count: c.count })
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            <th className="text-left pr-4 pb-2 text-slate-500 font-medium whitespace-nowrap min-w-[120px]">
              Danh mục
            </th>
            {data.periods.map(p => (
              <th key={p} className="text-center pb-2 px-1 text-slate-500 font-medium whitespace-nowrap min-w-[72px]">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.danh_mucs.map(cat => (
            <tr key={cat}>
              <td className="pr-4 py-1 text-slate-700 font-medium whitespace-nowrap">{cat}</td>
              {data.periods.map(period => {
                const cell = cellMap.get(`${cat}||${period}`)
                return (
                  <td key={period} className="px-1 py-1 text-center">
                    {cell ? (
                      <div
                        className={`rounded-lg px-2 py-2 font-bold cursor-default ${pctBg(cell.avg_pct)}`}
                        title={`${cat} / ${period}: ${cell.avg_pct}% (${cell.count} KPI)`}
                      >
                        {cell.avg_pct}%
                        <div className="text-[9px] font-normal opacity-80">{cell.count} KPI</div>
                      </div>
                    ) : (
                      <div className="rounded-lg px-2 py-2 bg-slate-100 text-slate-300">—</div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex gap-3 mt-3 text-xs text-slate-400 flex-wrap">
        {[
          { label: '≥90%', cls: 'bg-green-700' },
          { label: '70–89%', cls: 'bg-green-500' },
          { label: '50–69%', cls: 'bg-yellow-400' },
          { label: '30–49%', cls: 'bg-orange-400' },
          { label: '<30%', cls: 'bg-red-500' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${l.cls}`} />{l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface UserItem { id: number; username: string; full_name: string | null }

const INIT_FORM: KpiCLCreate = {
  ten: '', loai_kpi: 'nam', nam: THIS_YEAR, gia_tri_muc_tieu: 100,
}

export default function KpiCLPage() {
  const currentUser = useAuthStore(s => s.user)
  const canCreate = currentUser?.role === 'admin' || currentUser?.role === 'leader' || currentUser?.role === 'manager'

  const [tab, setTab] = useState<'dashboard' | 'list'>('dashboard')

  // Dashboard state
  const [stats, setStats]         = useState<KpiCLStats | null>(null)
  const [heatmap, setHeatmap]     = useState<HeatmapData | null>(null)
  const [ranking, setRanking]     = useState<RankingData | null>(null)
  const [overdue, setOverdue]     = useState<OverdueItem[]>([])
  const [loadingDash, setLoadingDash] = useState(true)

  // Filters for dashboard
  const [dashNam, setDashNam]         = useState(THIS_YEAR)
  const [dashLoai, setDashLoai]       = useState('')
  const [dashNhiemKy, setDashNhiemKy] = useState('')

  // List state
  const [items, setItems]     = useState<KpiCLRead[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loadingList, setLoadingList] = useState(false)
  const [search, setSearch]   = useState('')
  const [filterLoai, setFilterLoai] = useState('')
  const [filterTT, setFilterTT]     = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 15

  // Modal state
  const [showForm, setShowForm]   = useState(false)
  const [editItem, setEditItem]   = useState<KpiCLRead | null>(null)
  const [form, setForm]           = useState<KpiCLCreate>(INIT_FORM)
  const [saving, setSaving]       = useState(false)
  const [showTienDo, setShowTienDo] = useState<KpiCLRead | null>(null)
  const [tdForm, setTdForm]       = useState({ gia_tri: 0, quy: '' as number | '', nam: THIS_YEAR, ghi_chu: '' })
  const [savingTD, setSavingTD]   = useState(false)

  // Lookup data
  const [depts, setDepts]         = useState<DeptMin[]>([])
  const [users, setUsers]         = useState<UserItem[]>([])
  const [danhMucList, setDanhMucList] = useState<string[]>([])
  const [nhiemKyList, setNhiemKyList] = useState<string[]>([])

  // ─── Load data ─────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    setLoadingDash(true)
    try {
      const params = {
        nam: dashNam || undefined,
        loai_kpi: dashLoai || undefined,
        ten_nhiem_ky: dashNhiemKy || undefined,
      }
      const heatParams = {
        nam: dashNam,
        loai_kpi: dashLoai || undefined,
        ten_nhiem_ky: dashNhiemKy || undefined,
      }
      const [s, h, r, o] = await Promise.allSettled([
        kpiCLApi.getStats(params),
        kpiCLApi.getHeatmap(heatParams),
        kpiCLApi.getRanking({ ...params, top_n: 5 }),
        kpiCLApi.getOverdue({ nam: dashNam, limit: 8 }),
      ])
      if (s.status === 'fulfilled') setStats(s.value.data)
      if (h.status === 'fulfilled') setHeatmap(h.value.data)
      if (r.status === 'fulfilled') setRanking(r.value.data)
      if (o.status === 'fulfilled') setOverdue(o.value.data)
    } finally {
      setLoadingDash(false)
    }
  }, [dashNam, dashLoai, dashNhiemKy])

  const loadList = useCallback(async (p = 1, q = search) => {
    setLoadingList(true)
    try {
      const res = await kpiCLApi.list({
        page: p, size: SIZE,
        search: q || undefined,
        loai_kpi: filterLoai || undefined,
        trang_thai: filterTT || undefined,
      })
      setItems(res.data.items)
      setTotal(res.data.total)
      setPage(p)
    } finally {
      setLoadingList(false)
    }
  }, [search, filterLoai, filterTT])

  useEffect(() => { loadDashboard() }, [dashNam, dashLoai, dashNhiemKy])
  useEffect(() => { loadList(1) }, [filterLoai, filterTT])
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => loadList(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  useEffect(() => {
    apiClient.get<DeptMin[]>('/departments').then(r => setDepts(r.data)).catch(() => {})
    apiClient.get<UserItem[]>('/users').then(r => setUsers(r.data)).catch(() => {})
    kpiCLApi.getDanhMuc().then(r => setDanhMucList(r.data)).catch(() => {})
    kpiCLApi.getNhiemKy().then(r => setNhiemKyList(r.data)).catch(() => {})
  }, [])

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditItem(null)
    setForm(INIT_FORM)
    setShowForm(true)
  }

  function openEdit(item: KpiCLRead) {
    setEditItem(item)
    setForm({
      ma_kpi: item.ma_kpi ?? undefined,
      ten: item.ten,
      mo_ta: item.mo_ta ?? undefined,
      loai_kpi: item.loai_kpi,
      danh_muc: item.danh_muc ?? undefined,
      gia_tri_muc_tieu: item.gia_tri_muc_tieu,
      don_vi_do: item.don_vi_do ?? undefined,
      trang_thai: item.trang_thai,
      quy: item.quy ?? undefined,
      nam: item.nam,
      ten_nhiem_ky: item.ten_nhiem_ky ?? undefined,
      han_hoan_thanh: item.han_hoan_thanh ?? undefined,
      don_vi_phu_trach_id: item.don_vi_phu_trach_id ?? undefined,
      nguoi_theo_doi_id: item.nguoi_theo_doi_id ?? undefined,
      van_ban_id: item.van_ban_id ?? undefined,
      nhiem_vu_id: item.nhiem_vu_id ?? undefined,
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editItem) {
        await kpiCLApi.update(editItem.id, form)
      } else {
        await kpiCLApi.create(form)
      }
      setShowForm(false)
      loadList(1)
      loadDashboard()
      kpiCLApi.getDanhMuc().then(r => setDanhMucList(r.data)).catch(() => {})
      kpiCLApi.getNhiemKy().then(r => setNhiemKyList(r.data)).catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa KPI này?')) return
    try {
      await kpiCLApi.remove(id)
      loadList(page)
      loadDashboard()
    } catch { alert('Cần quyền admin hoặc leader để xóa.') }
  }

  async function handleAddTienDo(e: React.FormEvent) {
    e.preventDefault()
    if (!showTienDo) return
    setSavingTD(true)
    try {
      await kpiCLApi.addTienDo(showTienDo.id, {
        gia_tri: tdForm.gia_tri,
        quy: tdForm.quy !== '' ? Number(tdForm.quy) : null,
        nam: tdForm.nam,
        ghi_chu: tdForm.ghi_chu || undefined,
      })
      setShowTienDo(null)
      loadList(page)
      loadDashboard()
    } finally {
      setSavingTD(false)
    }
  }

  // ─── Computed ──────────────────────────────────────────────────────────────

  const pages = Math.max(1, Math.ceil(total / SIZE))
  const barData = items.map(k => ({
    name: k.ma_kpi ?? k.ten.slice(0, 16),
    fullName: k.ten,
    pct: k.pct_hoan_thanh,
    color: TRANG_THAI_COLOR[k.trang_thai] ?? '#94a3b8',
  }))

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-xl">🎯</div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">KPI Chiến lược</h1>
              <p className="text-sm text-slate-500">Hệ thống KPI quý · năm · nhiệm kỳ 5 năm</p>
            </div>
          </div>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition"
            >
              + Thêm KPI
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'dashboard', label: '📊 Dashboard' },
            { key: 'list',      label: '📋 Danh sách KPI' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── DASHBOARD TAB ─── */}
        {tab === 'dashboard' && (
          <>
            {/* Dashboard filters */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-medium">Năm:</label>
                <select
                  value={dashNam}
                  onChange={e => setDashNam(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700 focus:outline-none"
                >
                  {Array.from({ length: 8 }, (_, i) => THIS_YEAR - 2 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-medium">Loại:</label>
                <select
                  value={dashLoai}
                  onChange={e => setDashLoai(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700 focus:outline-none"
                >
                  <option value="">Tất cả</option>
                  {LOAI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {nhiemKyList.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 font-medium">Nhiệm kỳ:</label>
                  <select
                    value={dashNhiemKy}
                    onChange={e => setDashNhiemKy(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-700 focus:outline-none"
                  >
                    <option value="">Tất cả</option>
                    {nhiemKyList.map(nk => <option key={nk} value={nk}>{nk}</option>)}
                  </select>
                </div>
              )}
            </div>

            {loadingDash ? (
              <div className="text-center py-12 text-slate-400">Đang tải dashboard...</div>
            ) : (
              <>
                {/* Stats cards */}
                {stats && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                      {[
                        { label: 'Tổng KPI',        value: stats.tong,         cls: 'text-slate-700',  bg: 'bg-slate-50',   icon: '🎯' },
                        { label: 'Đạt mục tiêu',    value: stats.dat_muc_tieu, cls: 'text-blue-600',   bg: 'bg-blue-50',    icon: '🏁' },
                        { label: 'Đúng tiến độ',    value: stats.dung_tien_do, cls: 'text-green-600',  bg: 'bg-green-50',   icon: '✅' },
                        { label: 'Có rủi ro',       value: stats.co_rui_ro,    cls: 'text-amber-600',  bg: 'bg-amber-50',   icon: '⚠️' },
                        { label: 'Chậm tiến độ',    value: stats.cham_tien_do, cls: 'text-orange-600', bg: 'bg-orange-50',  icon: '🐢' },
                        { label: 'Quá hạn',         value: stats.qua_han,      cls: 'text-red-600',    bg: 'bg-red-50',     icon: '🔴' },
                        { label: 'Tiến độ TB',      value: `${stats.pct_tb}%`, cls: 'text-violet-600', bg: 'bg-violet-50',  icon: '📈' },
                      ].map(c => (
                        <div key={c.label} className={`rounded-2xl p-4 border border-slate-100 shadow-sm ${c.bg}`}>
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{c.label}</p>
                          <div className="flex items-end justify-between mt-1">
                            <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
                            <span className="text-xl">{c.icon}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Loai breakdown */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'KPI Quý',         value: stats.so_quy,      icon: '📅', cls: 'text-teal-600',  bg: 'bg-teal-50' },
                        { label: 'KPI Năm',         value: stats.so_nam,      icon: '📆', cls: 'text-cyan-600',  bg: 'bg-cyan-50' },
                        { label: 'KPI Nhiệm kỳ',   value: stats.so_nhiem_ky, icon: '🗓️', cls: 'text-indigo-600', bg: 'bg-indigo-50' },
                      ].map(c => (
                        <div key={c.label} className={`rounded-xl p-3 border border-slate-100 shadow-sm ${c.bg} flex items-center gap-3`}>
                          <span className="text-2xl">{c.icon}</span>
                          <div>
                            <p className="text-xs text-slate-400">{c.label}</p>
                            <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Progress stacked bar */}
                    {stats.tong > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phân bổ trạng thái</h3>
                          <span className="text-sm font-bold text-violet-600">{stats.pct_tb}% TB</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                          {[
                            { count: stats.dat_muc_tieu,  color: '#3b82f6', label: 'Đạt mục tiêu' },
                            { count: stats.dung_tien_do,  color: '#22c55e', label: 'Đúng tiến độ' },
                            { count: stats.co_rui_ro,     color: '#f59e0b', label: 'Có rủi ro' },
                            { count: stats.cham_tien_do,  color: '#f97316', label: 'Chậm tiến độ' },
                            { count: stats.qua_han,       color: '#ef4444', label: 'Quá hạn' },
                            { count: stats.chua_bat_dau,  color: '#94a3b8', label: 'Chưa bắt đầu' },
                          ].map(s => (
                            <div key={s.label} className="h-full transition-all"
                              style={{ width: `${(s.count / stats.tong) * 100}%`, backgroundColor: s.color }}
                              title={`${s.label}: ${s.count}`}
                            />
                          ))}
                        </div>
                        <div className="flex gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                          {[
                            { color: '#3b82f6', label: 'Đạt' },
                            { color: '#22c55e', label: 'Đúng TĐ' },
                            { color: '#f59e0b', label: 'Rủi ro' },
                            { color: '#f97316', label: 'Chậm' },
                            { color: '#ef4444', label: 'Quá hạn' },
                            { color: '#94a3b8', label: 'Chưa BĐ' },
                          ].map(s => (
                            <span key={s.label} className="flex items-center gap-1">
                              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                              {s.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Heatmap */}
                {heatmap && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">
                      🟩 KPI Heatmap — Tiến độ theo danh mục & kỳ
                    </h3>
                    <KpiHeatmap data={heatmap} />
                  </div>
                )}

                {/* Ranking + Overdue row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Ranking */}
                  {ranking && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4">🏆 KPI Ranking</h3>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-green-600 mb-2 uppercase tracking-wider">Top hoàn thành tốt nhất</p>
                          {ranking.top.length === 0 ? (
                            <p className="text-slate-400 text-xs">Chưa có dữ liệu</p>
                          ) : (
                            <div className="space-y-1.5">
                              {ranking.top.map((item, i) => (
                                <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
                                  <span className="text-xs font-bold text-green-600 w-5 text-center">#{i + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">{item.ten}</p>
                                    <p className="text-[10px] text-slate-400">{item.danh_muc ?? '—'} · {item.don_vi_phu_trach_ten ?? '—'}</p>
                                  </div>
                                  <span className="text-sm font-bold text-green-600 shrink-0">{item.pct_hoan_thanh}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="border-t border-slate-100 pt-3">
                          <p className="text-xs font-semibold text-red-500 mb-2 uppercase tracking-wider">Cần cải thiện</p>
                          {ranking.bottom.length === 0 ? (
                            <p className="text-slate-400 text-xs">Chưa có dữ liệu</p>
                          ) : (
                            <div className="space-y-1.5">
                              {ranking.bottom.map((item, i) => (
                                <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-red-50">
                                  <span className="text-xs font-bold text-red-500 w-5 text-center">#{i + 1}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">{item.ten}</p>
                                    <p className="text-[10px] text-slate-400">{item.danh_muc ?? '—'} · {item.don_vi_phu_trach_ten ?? '—'}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="w-12 bg-slate-100 rounded-full h-1.5">
                                      <div className="h-1.5 rounded-full" style={{ width: `${item.pct_hoan_thanh}%`, backgroundColor: pctColor(item.pct_hoan_thanh) }} />
                                    </div>
                                    <span className="text-xs font-bold text-red-500">{item.pct_hoan_thanh}%</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Overdue */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">
                      🔴 KPI Quá hạn {overdue.length > 0 && <span className="ml-1 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full font-bold">{overdue.length}</span>}
                    </h3>
                    {overdue.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-2xl mb-2">✅</p>
                        <p className="text-slate-400 text-sm">Không có KPI quá hạn</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {overdue.map(item => (
                          <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-red-50 border border-red-100">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.ma_kpi && (
                                  <span className="text-xs font-mono text-red-400">{item.ma_kpi}</span>
                                )}
                                <p className="text-xs font-medium text-slate-800 truncate">{item.ten}</p>
                              </div>
                              <div className="flex gap-3 mt-1 text-xs text-slate-400">
                                <span>{item.danh_muc ?? '—'}</span>
                                <span className="text-red-500 font-medium">Quá {item.so_ngay_qua_han} ngày</span>
                                {item.don_vi_phu_trach_ten && <span>📍 {item.don_vi_phu_trach_ten}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-red-600">{item.pct_hoan_thanh}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {stats?.tong === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                    <p className="text-4xl mb-3">🎯</p>
                    <p className="text-slate-500 font-medium">Chưa có KPI nào trong năm {dashNam}</p>
                    <button
                      onClick={() => { setTab('list'); openCreate() }}
                      className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition"
                    >
                      + Thêm KPI đầu tiên
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ─── LIST TAB ─── */}
        {tab === 'list' && (
          <>
            {/* List filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm tên, mã KPI..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                />
              </div>
              <select value={filterLoai} onChange={e => setFilterLoai(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none text-slate-600">
                <option value="">Tất cả loại</option>
                {LOAI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filterTT} onChange={e => setFilterTT(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none text-slate-600">
                <option value="">Tất cả trạng thái</option>
                {TRANG_THAI_LIST.map(tt => <option key={tt} value={tt}>{tt}</option>)}
              </select>
            </div>

            {/* Progress bar chart */}
            {barData.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">KPI Progress</h3>
                <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 44)}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 48, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={80} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any, _: any, p: any) => [`${v}%`, p.payload?.fullName ?? '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {barData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Table */}
            {loadingList ? (
              <div className="text-center py-10 text-slate-400">Đang tải...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                <p className="text-4xl mb-2">🎯</p>
                <p className="text-slate-400">Chưa có KPI nào. Nhấn "+ Thêm KPI" để bắt đầu.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['Mã', 'Tên KPI', 'Loại', 'Mục tiêu', 'Thực tế', 'Tiến độ', 'Trạng thái', 'Đơn vị', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-slate-400 whitespace-nowrap">
                          {item.ma_kpi ?? '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[180px]">
                          <p className="font-medium text-slate-800 line-clamp-2">{item.ten}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.danh_muc ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            item.loai_kpi === 'quy'      ? 'bg-teal-100 text-teal-700' :
                            item.loai_kpi === 'nam'      ? 'bg-cyan-100 text-cyan-700' :
                            'bg-indigo-100 text-indigo-700'
                          }`}>
                            {LOAI_OPTIONS.find(o => o.value === item.loai_kpi)?.label ?? item.loai_kpi}
                            {item.loai_kpi === 'quy' && item.quy ? ` Q${item.quy}` : ''}
                          </span>
                          <div className="text-xs text-slate-400 mt-0.5">{item.ten_nhiem_ky ?? item.nam}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {item.gia_tri_muc_tieu} <span className="text-slate-400 text-xs">{item.don_vi_do}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-medium">
                          {item.gia_tri_thuc_te} <span className="text-slate-400 text-xs">{item.don_vi_do}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-slate-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full transition-all"
                                style={{ width: `${item.pct_hoan_thanh}%`, backgroundColor: pctColor(item.pct_hoan_thanh) }}
                              />
                            </div>
                            <span className="text-xs font-bold" style={{ color: pctColor(item.pct_hoan_thanh) }}>
                              {item.pct_hoan_thanh}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={item.trang_thai} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {item.don_vi_phu_trach?.short_name ?? item.don_vi_phu_trach?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setShowTienDo(item); setTdForm({ gia_tri: item.gia_tri_thuc_te, quy: item.quy ?? '', nam: item.nam, ghi_chu: '' }) }}
                              className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition font-medium"
                              title="Cập nhật tiến độ"
                            >📊</button>
                            <button onClick={() => openEdit(item)}
                              className="text-xs px-2 py-1 text-slate-500 hover:bg-slate-100 rounded-lg transition">✏️</button>
                            <button onClick={() => handleDelete(item.id)}
                              className="text-xs px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Trang {page}/{pages} · {total} KPI</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => loadList(page - 1)}
                    className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">‹</button>
                  <button disabled={page >= pages} onClick={() => loadList(page + 1)}
                    className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Modal: Create / Edit KPI ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editItem ? 'Chỉnh sửa KPI' : 'Thêm KPI chiến lược'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mã KPI</label>
                  <input className={inp} value={form.ma_kpi ?? ''} onChange={e => setForm(p => ({ ...p, ma_kpi: e.target.value || undefined }))} placeholder="KT-01" />
                </div>
                <div>
                  <label className={lbl}>Loại KPI *</label>
                  <select className={inp} value={form.loai_kpi} onChange={e => setForm(p => ({ ...p, loai_kpi: e.target.value as KpiCLLoai }))}>
                    {LOAI_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl}>Tên KPI *</label>
                <input required className={inp} value={form.ten} onChange={e => setForm(p => ({ ...p, ten: e.target.value }))} placeholder="Tốc độ tăng trưởng kinh tế bình quân" />
              </div>

              <div>
                <label className={lbl}>Mô tả</label>
                <textarea rows={2} className={inp} value={form.mo_ta ?? ''} onChange={e => setForm(p => ({ ...p, mo_ta: e.target.value || undefined }))} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Danh mục</label>
                  <input
                    list="danh-muc-list"
                    className={inp}
                    value={form.danh_muc ?? ''}
                    onChange={e => setForm(p => ({ ...p, danh_muc: e.target.value || undefined }))}
                    placeholder="Kinh tế, Xã hội..."
                  />
                  <datalist id="danh-muc-list">
                    {[...DANH_MUC_SUGGESTIONS, ...danhMucList].filter((v, i, a) => a.indexOf(v) === i).map(d => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={lbl}>Đơn vị đo</label>
                  <input className={inp} value={form.don_vi_do ?? ''} onChange={e => setForm(p => ({ ...p, don_vi_do: e.target.value || undefined }))} placeholder="%, tỷ đồng, người..." />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Mục tiêu *</label>
                  <input type="number" step="any" required className={inp} value={form.gia_tri_muc_tieu ?? 100} onChange={e => setForm(p => ({ ...p, gia_tri_muc_tieu: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={lbl}>Năm *</label>
                  <input type="number" required className={inp} value={form.nam} onChange={e => setForm(p => ({ ...p, nam: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={lbl}>Quý (nếu là KPI quý)</label>
                  <select className={inp} value={form.quy ?? ''} onChange={e => setForm(p => ({ ...p, quy: e.target.value ? Number(e.target.value) : undefined }))}>
                    <option value="">— Cả năm —</option>
                    <option value={1}>Quý 1</option>
                    <option value={2}>Quý 2</option>
                    <option value={3}>Quý 3</option>
                    <option value={4}>Quý 4</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Nhiệm kỳ (KPI 5 năm)</label>
                  <input
                    list="nhiem-ky-list"
                    className={inp}
                    value={form.ten_nhiem_ky ?? ''}
                    onChange={e => setForm(p => ({ ...p, ten_nhiem_ky: e.target.value || undefined }))}
                    placeholder="2025-2030"
                  />
                  <datalist id="nhiem-ky-list">
                    {nhiemKyList.map(nk => <option key={nk} value={nk} />)}
                    <option value="2020-2025" />
                    <option value="2025-2030" />
                    <option value="2030-2035" />
                  </datalist>
                </div>
                <div>
                  <label className={lbl}>Hạn hoàn thành</label>
                  <input type="date" className={inp} value={form.han_hoan_thanh ?? ''} onChange={e => setForm(p => ({ ...p, han_hoan_thanh: e.target.value || undefined }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Đơn vị phụ trách</label>
                  <select className={inp} value={form.don_vi_phu_trach_id ?? ''} onChange={e => setForm(p => ({ ...p, don_vi_phu_trach_id: e.target.value ? Number(e.target.value) : undefined }))}>
                    <option value="">— Chọn đơn vị —</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Người theo dõi</label>
                  <select className={inp} value={form.nguoi_theo_doi_id ?? ''} onChange={e => setForm(p => ({ ...p, nguoi_theo_doi_id: e.target.value ? Number(e.target.value) : undefined }))}>
                    <option value="">— Chọn người —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.username}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>ID văn bản liên kết</label>
                  <input type="number" className={inp} value={form.van_ban_id ?? ''} onChange={e => setForm(p => ({ ...p, van_ban_id: e.target.value ? Number(e.target.value) : undefined }))} placeholder="ID tài liệu" />
                </div>
                <div>
                  <label className={lbl}>ID nhiệm vụ liên kết</label>
                  <input type="number" className={inp} value={form.nhiem_vu_id ?? ''} onChange={e => setForm(p => ({ ...p, nhiem_vu_id: e.target.value ? Number(e.target.value) : undefined }))} placeholder="ID nhiệm vụ" />
                </div>
              </div>

              <div className="flex gap-3 pt-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Hủy</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 transition">
                  {saving ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm KPI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Update Progress ─── */}
      {showTienDo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">Cập nhật tiến độ</h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">{showTienDo.ten}</p>
              </div>
              <button onClick={() => setShowTienDo(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleAddTienDo} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 flex items-center justify-between">
                <span>Mục tiêu: <strong>{showTienDo.gia_tri_muc_tieu} {showTienDo.don_vi_do}</strong></span>
                <span>Hiện tại: <strong>{showTienDo.pct_hoan_thanh}%</strong></span>
              </div>
              <div>
                <label className={lbl}>
                  Giá trị thực tế mới *
                  {showTienDo.don_vi_do && <span className="text-slate-400 ml-1">({showTienDo.don_vi_do})</span>}
                </label>
                <input type="number" step="any" required className={inp} value={tdForm.gia_tri}
                  onChange={e => setTdForm(p => ({ ...p, gia_tri: Number(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Quý</label>
                  <select className={inp} value={tdForm.quy} onChange={e => setTdForm(p => ({ ...p, quy: e.target.value ? Number(e.target.value) : '' }))}>
                    <option value="">— Cả năm —</option>
                    <option value={1}>Quý 1</option>
                    <option value={2}>Quý 2</option>
                    <option value={3}>Quý 3</option>
                    <option value={4}>Quý 4</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Năm *</label>
                  <input type="number" required className={inp} value={tdForm.nam}
                    onChange={e => setTdForm(p => ({ ...p, nam: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className={lbl}>Ghi chú</label>
                <textarea rows={2} className={inp} value={tdForm.ghi_chu}
                  onChange={e => setTdForm(p => ({ ...p, ghi_chu: e.target.value }))} placeholder="Nguồn số liệu..." />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowTienDo(null)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Hủy</button>
                <button type="submit" disabled={savingTD}
                  className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition">
                  {savingTD ? 'Đang lưu...' : 'Lưu tiến độ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
