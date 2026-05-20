import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import apiClient from '../../api/client'
import { nghiQuyetApi } from '../../api/nghiQuyet'
import AppLayout from '../../components/layout/AppLayout'
import type {
  DashboardCharts,
  DashboardSummary,
  DeptMin,
  MucTieuCreate,
  MucTieuRead,
  MucTieuReadWithChildren,
  NghiQuyetReadDetail,
  TopDelayedItem,
} from '../../types/nghiQuyet'

// ─── Constants ───────────────────────────────────────────────────────────────

const TRANG_THAI_COLOR: Record<string, string> = {
  'Đúng tiến độ': '#22c55e',
  'Có rủi ro':    '#f59e0b',
  'Chậm tiến độ': '#f97316',
  'Hoàn thành':   '#3b82f6',
  'Quá hạn':      '#ef4444',
}

const TRANG_THAI_CLS: Record<string, string> = {
  'Đúng tiến độ': 'bg-green-100 text-green-700',
  'Có rủi ro':    'bg-amber-100 text-amber-700',
  'Chậm tiến độ': 'bg-orange-100 text-orange-700',
  'Hoàn thành':   'bg-blue-100 text-blue-700',
  'Quá hạn':      'bg-red-100 text-red-700',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TRANG_THAI_CLS[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

interface StaffMin { id: number; full_name: string; position: string | null }

interface TreeNodeProps {
  node: MucTieuReadWithChildren
  onAddChild: (parent: MucTieuReadWithChildren) => void
  onEdit: (node: MucTieuReadWithChildren) => void
  onDelete: (id: number) => void
  onAddTheoDoi: (node: MucTieuReadWithChildren) => void
}

function TreeNode({ node, onAddChild, onEdit, onDelete, onAddTheoDoi }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true)

  const capColor = ['', '#6366f1', '#3b82f6', '#64748b']
  const rowCls = [
    '',
    'bg-indigo-50/60 border-indigo-200',
    'bg-blue-50/40 border-blue-100',
    'bg-slate-50 border-slate-100',
  ]

  return (
    <div>
      <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border mb-1 ${rowCls[node.cap_do] ?? 'bg-slate-50 border-slate-100'}`}>
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className={`mt-0.5 text-xs w-4 shrink-0 text-slate-400 hover:text-slate-600 ${node.con.length === 0 ? 'invisible' : ''}`}
        >
          {expanded ? '▾' : '▸'}
        </button>

        {/* Cap-do badge */}
        <span
          className="shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold text-white leading-none"
          style={{ backgroundColor: capColor[node.cap_do] ?? '#94a3b8' }}
        >
          C{node.cap_do}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {node.ma_chi_tieu && (
              <span className="text-xs font-mono text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                {node.ma_chi_tieu}
              </span>
            )}
            <span className={`text-sm ${node.cap_do === 1 ? 'font-bold text-slate-800' : node.cap_do === 2 ? 'font-semibold text-slate-700' : 'text-slate-600'}`}>
              {node.ten}
            </span>
          </div>
          {node.cap_do === 3 && (
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
              {node.gia_tri_muc_tieu != null && (
                <span>Mục tiêu: <strong className="text-slate-600">{node.gia_tri_muc_tieu} {node.don_vi_do}</strong></span>
              )}
              {node.nam_hoan_thanh && <span>Năm HT: {node.nam_hoan_thanh}</span>}
              {node.don_vi_phu_trach && (
                <span>📍 {node.don_vi_phu_trach.short_name ?? node.don_vi_phu_trach.name}</span>
              )}
              {node.can_bo_theo_doi && (
                <span>👤 {node.can_bo_theo_doi.full_name}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {node.cap_do < 3 && (
            <button
              onClick={() => onAddChild(node)}
              className="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-100 rounded-lg transition font-medium"
            >
              + Con
            </button>
          )}
          {node.cap_do === 3 && (
            <button
              onClick={() => onAddTheoDoi(node)}
              className="text-xs px-2 py-1 text-emerald-600 hover:bg-emerald-100 rounded-lg transition font-medium"
            >
              📊 Số liệu
            </button>
          )}
          <button
            onClick={() => onEdit(node)}
            className="text-xs p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(node.id)}
            className="text-xs p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && node.con.length > 0 && (
        <div className="ml-6 pl-3 border-l-2 border-slate-200 mb-1 space-y-0.5">
          {node.con.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddTheoDoi={onAddTheoDoi}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NghiQuyetDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const nqId = Number(id)
  const navigate = useNavigate()

  // Data state
  const [nq, setNq] = useState<NghiQuyetReadDetail | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [charts, setCharts] = useState<DashboardCharts | null>(null)
  const [topDelayed, setTopDelayed] = useState<TopDelayedItem[]>([])
  const [tree, setTree] = useState<MucTieuReadWithChildren[]>([])
  const [nam, setNam] = useState<number | null>(null)
  const [tab, setTab] = useState<'dashboard' | 'muc-tieu'>('dashboard')
  const [loadingDash, setLoadingDash] = useState(true)

  // Lookup data
  const [depts, setDepts] = useState<DeptMin[]>([])
  const [staffList, setStaffList] = useState<StaffMin[]>([])

  // MucTieu modal
  const [showMtModal, setShowMtModal] = useState(false)
  const [editMt, setEditMt] = useState<MucTieuRead | null>(null)
  const [mtForm, setMtForm] = useState<MucTieuCreate>({ nghi_quyet_id: nqId, ten: '' })
  const [savingMt, setSavingMt] = useState(false)

  // BangTheoDoi modal
  const [showTheoDoiModal, setShowTheoDoiModal] = useState(false)
  const [theoDoiTarget, setTheoDoiTarget] = useState<MucTieuReadWithChildren | null>(null)
  const [theoDoiForm, setTheoDoiForm] = useState({
    gia_tri_thuc_te: 0,
    nam: new Date().getFullYear(),
    quy: '' as number | '',
    thang: '' as number | '',
    ghi_chu: '',
  })
  const [savingTheoDoi, setSavingTheoDoi] = useState(false)

  // Load NQ + lookup data once
  useEffect(() => {
    nghiQuyetApi.get(nqId)
      .then(r => setNq(r.data))
      .catch(() => navigate('/nghi-quyet'))
    apiClient.get<DeptMin[]>('/departments').then(r => setDepts(r.data)).catch(() => {})
    apiClient.get<StaffMin[]>('/staff').then(r => setStaffList(r.data)).catch(() => {})
  }, [nqId])

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    setLoadingDash(true)
    try {
      const [s, c, d] = await Promise.allSettled([
        nghiQuyetApi.getSummary(nqId, nam),
        nghiQuyetApi.getCharts(nqId, nam),
        nghiQuyetApi.getTopDelayed(nqId, 5, nam),
      ])
      if (s.status === 'fulfilled') setSummary(s.value.data)
      if (c.status === 'fulfilled') setCharts(c.value.data)
      if (d.status === 'fulfilled') setTopDelayed(d.value.data)
    } finally {
      setLoadingDash(false)
    }
  }, [nqId, nam])

  // Load tree
  const loadTree = useCallback(async () => {
    const res = await nghiQuyetApi.getTree(nqId)
    setTree(res.data)
  }, [nqId])

  useEffect(() => { loadDashboard() }, [nam, nqId])
  useEffect(() => { loadTree() }, [nqId])

  // Year options
  const yearOptions = nq
    ? Array.from({ length: nq.nam_ket_thuc - nq.nam_bat_dau + 1 }, (_, i) => nq.nam_bat_dau + i)
    : []

  // ─── MucTieu handlers ───────────────────────────────────────────────────────

  function openAddRoot() {
    setEditMt(null)
    setMtForm({ nghi_quyet_id: nqId, ten: '', cap_do: 1, thu_tu: tree.length + 1 })
    setShowMtModal(true)
  }

  function openAddChild(parent: MucTieuReadWithChildren) {
    setEditMt(null)
    setMtForm({
      nghi_quyet_id: nqId,
      ten: '',
      cap_do: parent.cap_do + 1,
      muc_tieu_cha_id: parent.id,
      thu_tu: parent.con.length + 1,
    })
    setShowMtModal(true)
  }

  function openEditMt(node: MucTieuReadWithChildren) {
    setEditMt(node)
    setMtForm({
      nghi_quyet_id: nqId,
      ten: node.ten,
      mo_ta: node.mo_ta ?? undefined,
      ma_chi_tieu: node.ma_chi_tieu ?? undefined,
      cap_do: node.cap_do,
      muc_tieu_cha_id: node.muc_tieu_cha_id ?? undefined,
      gia_tri_muc_tieu: node.gia_tri_muc_tieu ?? undefined,
      don_vi_do: node.don_vi_do ?? undefined,
      don_vi_phu_trach_id: node.don_vi_phu_trach_id ?? undefined,
      can_bo_theo_doi_id: node.can_bo_theo_doi_id ?? undefined,
      nam_hoan_thanh: node.nam_hoan_thanh ?? undefined,
      thu_tu: node.thu_tu,
      ghi_chu: node.ghi_chu ?? undefined,
    })
    setShowMtModal(true)
  }

  async function handleMtSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSavingMt(true)
    try {
      if (editMt) {
        const { nghi_quyet_id: _nq, ...updateBody } = mtForm
        await nghiQuyetApi.updateMucTieu(editMt.id, updateBody)
      } else {
        await nghiQuyetApi.createMucTieu(mtForm)
      }
      setShowMtModal(false)
      loadTree()
      loadDashboard()
    } finally {
      setSavingMt(false)
    }
  }

  async function handleDeleteMt(id: number) {
    if (!confirm('Xóa mục tiêu này? Các mục tiêu con và số liệu theo dõi sẽ bị xóa theo.')) return
    try {
      await nghiQuyetApi.deleteMucTieu(id)
      loadTree()
      loadDashboard()
    } catch {
      alert('Không thể xóa. Bạn cần quyền admin hoặc leader.')
    }
  }

  // ─── BangTheoDoi handlers ───────────────────────────────────────────────────

  function openAddTheoDoi(node: MucTieuReadWithChildren) {
    setTheoDoiTarget(node)
    setTheoDoiForm({
      gia_tri_thuc_te: 0,
      nam: new Date().getFullYear(),
      quy: '',
      thang: '',
      ghi_chu: '',
    })
    setShowTheoDoiModal(true)
  }

  async function handleTheoDoiSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!theoDoiTarget) return
    setSavingTheoDoi(true)
    try {
      await nghiQuyetApi.addTheoDoi(theoDoiTarget.id, {
        gia_tri_thuc_te: theoDoiForm.gia_tri_thuc_te,
        nam: theoDoiForm.nam,
        quy: theoDoiForm.quy !== '' ? Number(theoDoiForm.quy) : null,
        thang: theoDoiForm.thang !== '' ? Number(theoDoiForm.thang) : null,
        ghi_chu: theoDoiForm.ghi_chu || undefined,
      })
      setShowTheoDoiModal(false)
      loadDashboard()
    } finally {
      setSavingTheoDoi(false)
    }
  }

  // ─── Chart data ─────────────────────────────────────────────────────────────

  const barData = (charts?.bar_chart ?? []).map(item => ({
    name: item.ma_chi_tieu ?? item.ten.slice(0, 18),
    fullName: item.ten,
    pct: item.pct_so_lieu,
    color: TRANG_THAI_COLOR[item.trang_thai] ?? '#94a3b8',
    trang_thai: item.trang_thai,
  }))

  const donutData = (charts?.donut_chart ?? []).map(item => ({
    name: item.trang_thai,
    value: item.so_luong,
    fill: TRANG_THAI_COLOR[item.trang_thai] ?? '#94a3b8',
  }))

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <button onClick={() => navigate('/nghi-quyet')} className="hover:text-indigo-600 transition">
            📜 Nghị quyết
          </button>
          <span>›</span>
          <span className="text-slate-600 font-medium truncate max-w-xs">{nq?.ten ?? '...'}</span>
        </div>

        {/* NQ Header */}
        {nq && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-2xl shrink-0">📜</div>
                <div>
                  {nq.ma_nghi_quyet && (
                    <p className="text-xs font-mono text-slate-400 mb-0.5">{nq.ma_nghi_quyet}</p>
                  )}
                  <h1 className="text-lg font-bold text-slate-800 leading-snug">{nq.ten}</h1>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    <span>📅 {nq.nam_bat_dau} – {nq.nam_ket_thuc}</span>
                    <span>📋 {nq.so_muc_tieu} mục tiêu</span>
                    <span className="text-indigo-600 font-medium">🎯 {nq.so_kpi} KPI</span>
                  </div>
                </div>
              </div>

              {/* Year filter */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-medium">Lọc năm:</label>
                <select
                  value={nam ?? ''}
                  onChange={e => setNam(e.target.value ? Number(e.target.value) : null)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-700"
                >
                  <option value="">Toàn nhiệm kỳ</option>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'dashboard', label: '📊 Tổng quan' },
            { key: 'muc-tieu',  label: '🌳 Cây mục tiêu' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── TAB: DASHBOARD ─── */}
        {tab === 'dashboard' && (
          <>
            {/* Summary cards */}
            {loadingDash ? (
              <div className="text-center py-10 text-slate-400">Đang tải...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                  {[
                    { label: 'Tổng KPI',       value: summary?.tong_kpi ?? 0,     cls: 'text-slate-700',   bg: 'bg-slate-50',    icon: '🎯' },
                    { label: 'Đúng tiến độ',   value: summary?.dung_tien_do ?? 0, cls: 'text-green-600',   bg: 'bg-green-50',    icon: '✅' },
                    { label: 'Có rủi ro',       value: summary?.co_rui_ro ?? 0,    cls: 'text-amber-600',   bg: 'bg-amber-50',    icon: '⚠️' },
                    { label: 'Chậm tiến độ',   value: summary?.cham_tien_do ?? 0, cls: 'text-orange-600',  bg: 'bg-orange-50',   icon: '🐢' },
                    { label: 'Hoàn thành',     value: summary?.hoan_thanh ?? 0,   cls: 'text-blue-600',    bg: 'bg-blue-50',     icon: '🏁' },
                    { label: 'Quá hạn',        value: summary?.qua_han ?? 0,      cls: 'text-red-600',     bg: 'bg-red-50',      icon: '🔴' },
                    { label: 'Tiến độ TB',     value: `${summary?.tien_do_tb ?? 0}%`, cls: 'text-indigo-600', bg: 'bg-indigo-50', icon: '📈' },
                  ].map(c => (
                    <div key={c.label} className={`rounded-2xl p-4 border border-slate-100 shadow-sm ${c.bg}`}>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">{c.label}</p>
                      <div className="flex items-end justify-between mt-1">
                        <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
                        <span className="text-xl">{c.icon}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress stacked bar */}
                {summary && summary.tong_kpi > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Phân bổ trạng thái KPI
                      </h3>
                      <span className="text-sm font-bold text-indigo-600">{summary.tien_do_tb}% hoàn thành TB</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                      {[
                        { count: summary.hoan_thanh,   color: '#3b82f6', label: 'Hoàn thành' },
                        { count: summary.dung_tien_do, color: '#22c55e', label: 'Đúng tiến độ' },
                        { count: summary.co_rui_ro,    color: '#f59e0b', label: 'Có rủi ro' },
                        { count: summary.cham_tien_do, color: '#f97316', label: 'Chậm tiến độ' },
                        { count: summary.qua_han,      color: '#ef4444', label: 'Quá hạn' },
                      ].map(s => (
                        <div
                          key={s.label}
                          className="h-full transition-all"
                          style={{ width: `${(s.count / summary.tong_kpi) * 100}%`, backgroundColor: s.color }}
                          title={`${s.label}: ${s.count}`}
                        />
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                      {[
                        { color: '#3b82f6', label: 'Hoàn thành' },
                        { color: '#22c55e', label: 'Đúng tiến độ' },
                        { color: '#f59e0b', label: 'Có rủi ro' },
                        { color: '#f97316', label: 'Chậm tiến độ' },
                        { color: '#ef4444', label: 'Quá hạn' },
                      ].map(s => (
                        <span key={s.label} className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Charts row */}
                {charts && (barData.length > 0 || donutData.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    {/* Bar chart */}
                    <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4">Tiến độ từng KPI (%)</h3>
                      {barData.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-8">Chưa có dữ liệu</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 48)}>
                          <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis
                              type="number"
                              domain={[0, 100]}
                              tickFormatter={v => `${v}%`}
                              tick={{ fontSize: 11, fill: '#94a3b8' }}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              width={72}
                            />
                            <Tooltip
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              formatter={(v: any, _: any, p: any) => [`${v}%`, p.payload?.fullName ?? '']}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                              {barData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Donut chart */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4">Phân bổ trạng thái</h3>
                      {donutData.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-8">Chưa có dữ liệu</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={donutData}
                              cx="50%"
                              cy="45%"
                              innerRadius={50}
                              outerRadius={85}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {donutData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              formatter={(v: any, name: any) => [`${v} KPI`, name]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Legend
                              iconType="circle"
                              iconSize={8}
                              formatter={(value) => <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                )}

                {/* Top delayed / at-risk */}
                {topDelayed.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">
                      ⚠️ KPI cần chú ý (chậm / rủi ro / quá hạn)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left border-b border-slate-100">
                            <th className="pb-2 pr-4 text-xs font-semibold text-slate-400 uppercase">Mã</th>
                            <th className="pb-2 pr-4 text-xs font-semibold text-slate-400 uppercase">Tên chỉ tiêu</th>
                            <th className="pb-2 pr-4 text-xs font-semibold text-slate-400 uppercase">Thực tế / Mục tiêu</th>
                            <th className="pb-2 pr-4 text-xs font-semibold text-slate-400 uppercase">Tiến độ</th>
                            <th className="pb-2 pr-4 text-xs font-semibold text-slate-400 uppercase">Trạng thái</th>
                            <th className="pb-2 text-xs font-semibold text-slate-400 uppercase">Đơn vị</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {topDelayed.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 pr-4 text-xs font-mono text-slate-400">
                                {item.ma_chi_tieu ?? '—'}
                              </td>
                              <td className="py-3 pr-4 font-medium text-slate-800 max-w-[200px]">
                                <p className="line-clamp-2 text-sm">{item.ten}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{item.don_vi_do}</p>
                              </td>
                              <td className="py-3 pr-4 text-sm">
                                <span className="font-semibold text-slate-700">{item.gia_tri_thuc_te_moi_nhat}</span>
                                {item.gia_tri_muc_tieu != null && (
                                  <span className="text-slate-400"> / {item.gia_tri_muc_tieu}</span>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-1.5">
                                    <div
                                      className="h-1.5 rounded-full"
                                      style={{
                                        width: `${Math.min(100, item.pct_so_lieu)}%`,
                                        backgroundColor: TRANG_THAI_COLOR[item.trang_thai] ?? '#94a3b8',
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs font-semibold text-slate-600">{item.pct_so_lieu}%</span>
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                <StatusBadge status={item.trang_thai} />
                              </td>
                              <td className="py-3 text-xs text-slate-500">
                                {item.don_vi_phu_trach_viet_tat ?? item.don_vi_phu_trach_ten ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!loadingDash && summary?.tong_kpi === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                    <p className="text-4xl mb-3">🎯</p>
                    <p className="text-slate-500 font-medium">Chưa có KPI nào</p>
                    <p className="text-slate-400 text-sm mt-1">
                      Chuyển sang tab "Cây mục tiêu" để thêm chỉ tiêu
                    </p>
                    <button
                      onClick={() => setTab('muc-tieu')}
                      className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                    >
                      Đi đến Cây mục tiêu →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ─── TAB: CÂY MỤC TIÊU ─── */}
        {tab === 'muc-tieu' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Cây mục tiêu chiến lược</h2>
              {nq && (
                <button
                  onClick={openAddRoot}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                >
                  + Thêm mục tiêu gốc (C1)
                </button>
              )}
            </div>

            {tree.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">🌳</p>
                <p className="text-slate-400">Chưa có mục tiêu nào. Nhấn "Thêm mục tiêu gốc" để bắt đầu.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {tree.map(root => (
                  <TreeNode
                    key={root.id}
                    node={root}
                    onAddChild={openAddChild}
                    onEdit={openEditMt}
                    onDelete={handleDeleteMt}
                    onAddTheoDoi={openAddTheoDoi}
                  />
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: '#6366f1' }}>C1</span>
                Mục tiêu chiến lược
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: '#3b82f6' }}>C2</span>
                Nhóm chỉ tiêu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded text-white text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: '#64748b' }}>C3</span>
                KPI / Chỉ tiêu cụ thể
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal: Add / Edit MucTieu ─── */}
      {showMtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">
                {editMt ? 'Chỉnh sửa mục tiêu / chỉ tiêu' : `Thêm mục tiêu cấp ${mtForm.cap_do}`}
              </h2>
              <button onClick={() => setShowMtModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleMtSubmit} className="p-6 space-y-4">
              {/* ma_chi_tieu — cap 3 only */}
              {mtForm.cap_do === 3 && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Mã chỉ tiêu</label>
                    <input
                      className={inp}
                      value={mtForm.ma_chi_tieu ?? ''}
                      onChange={e => setMtForm(p => ({ ...p, ma_chi_tieu: e.target.value || undefined }))}
                      placeholder="KT-01"
                    />
                  </div>
                  <div>
                    <label className={lbl}>Thứ tự</label>
                    <input
                      type="number"
                      className={inp}
                      value={mtForm.thu_tu ?? 0}
                      onChange={e => setMtForm(p => ({ ...p, thu_tu: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={lbl}>Tên mục tiêu / chỉ tiêu *</label>
                <input
                  required
                  className={inp}
                  value={mtForm.ten}
                  onChange={e => setMtForm(p => ({ ...p, ten: e.target.value }))}
                  placeholder={mtForm.cap_do === 3 ? 'Tốc độ tăng trưởng kinh tế bình quân' : 'Tên nhóm mục tiêu...'}
                />
              </div>

              <div>
                <label className={lbl}>Mô tả</label>
                <textarea
                  rows={2}
                  className={inp}
                  value={mtForm.mo_ta ?? ''}
                  onChange={e => setMtForm(p => ({ ...p, mo_ta: e.target.value || undefined }))}
                />
              </div>

              {/* Cap 3 specific fields */}
              {mtForm.cap_do === 3 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>Giá trị mục tiêu</label>
                      <input
                        type="number"
                        step="any"
                        className={inp}
                        value={mtForm.gia_tri_muc_tieu ?? ''}
                        onChange={e => setMtForm(p => ({ ...p, gia_tri_muc_tieu: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="12.5"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Đơn vị đo</label>
                      <input
                        className={inp}
                        value={mtForm.don_vi_do ?? ''}
                        onChange={e => setMtForm(p => ({ ...p, don_vi_do: e.target.value || undefined }))}
                        placeholder="%/năm, triệu đồng..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>Năm hoàn thành</label>
                      <input
                        type="number"
                        className={inp}
                        value={mtForm.nam_hoan_thanh ?? ''}
                        onChange={e => setMtForm(p => ({ ...p, nam_hoan_thanh: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder={nq?.nam_ket_thuc?.toString()}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Loại chỉ tiêu</label>
                      <input
                        className={inp}
                        value={mtForm.loai_chi_tieu ?? ''}
                        onChange={e => setMtForm(p => ({ ...p, loai_chi_tieu: e.target.value || undefined }))}
                        placeholder="Định lượng / Định tính"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>Đơn vị phụ trách</label>
                      <select
                        className={inp}
                        value={mtForm.don_vi_phu_trach_id ?? ''}
                        onChange={e => setMtForm(p => ({ ...p, don_vi_phu_trach_id: e.target.value ? Number(e.target.value) : undefined }))}
                      >
                        <option value="">-- Chọn đơn vị --</option>
                        {depts.map(d => (
                          <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Cán bộ theo dõi</label>
                      <select
                        className={inp}
                        value={mtForm.can_bo_theo_doi_id ?? ''}
                        onChange={e => setMtForm(p => ({ ...p, can_bo_theo_doi_id: e.target.value ? Number(e.target.value) : undefined }))}
                      >
                        <option value="">-- Chọn cán bộ --</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>{s.full_name}{s.position ? ` (${s.position})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {mtForm.cap_do !== 3 && (
                <div>
                  <label className={lbl}>Thứ tự</label>
                  <input
                    type="number"
                    className={inp}
                    value={mtForm.thu_tu ?? 0}
                    onChange={e => setMtForm(p => ({ ...p, thu_tu: Number(e.target.value) }))}
                  />
                </div>
              )}

              <div>
                <label className={lbl}>Ghi chú</label>
                <textarea
                  rows={1}
                  className={inp}
                  value={mtForm.ghi_chu ?? ''}
                  onChange={e => setMtForm(p => ({ ...p, ghi_chu: e.target.value || undefined }))}
                />
              </div>

              <div className="flex gap-3 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowMtModal(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingMt}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {savingMt ? 'Đang lưu...' : editMt ? 'Cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Add BangTheoDoi ─── */}
      {showTheoDoiModal && theoDoiTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">Cập nhật số liệu</h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                  {theoDoiTarget.ma_chi_tieu && <span className="font-mono mr-1">{theoDoiTarget.ma_chi_tieu}</span>}
                  {theoDoiTarget.ten}
                </p>
              </div>
              <button onClick={() => setShowTheoDoiModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleTheoDoiSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>
                    Giá trị thực tế *
                    {theoDoiTarget.don_vi_do && <span className="text-slate-400 ml-1">({theoDoiTarget.don_vi_do})</span>}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    className={inp}
                    value={theoDoiForm.gia_tri_thuc_te}
                    onChange={e => setTheoDoiForm(p => ({ ...p, gia_tri_thuc_te: Number(e.target.value) }))}
                    placeholder="0"
                  />
                  {theoDoiTarget.gia_tri_muc_tieu != null && (
                    <p className="text-xs text-slate-400 mt-1">
                      Mục tiêu: {theoDoiTarget.gia_tri_muc_tieu} {theoDoiTarget.don_vi_do}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Năm *</label>
                  <input
                    type="number"
                    required
                    className={inp}
                    value={theoDoiForm.nam}
                    onChange={e => setTheoDoiForm(p => ({ ...p, nam: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Quý (1–4, không bắt buộc)</label>
                  <select
                    className={inp}
                    value={theoDoiForm.quy}
                    onChange={e => setTheoDoiForm(p => ({ ...p, quy: e.target.value ? Number(e.target.value) as 1|2|3|4 : '' }))}
                  >
                    <option value="">-- Toàn năm --</option>
                    <option value={1}>Quý 1</option>
                    <option value={2}>Quý 2</option>
                    <option value={3}>Quý 3</option>
                    <option value={4}>Quý 4</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Tháng (1–12, không bắt buộc)</label>
                  <select
                    className={inp}
                    value={theoDoiForm.thang}
                    onChange={e => setTheoDoiForm(p => ({ ...p, thang: e.target.value ? Number(e.target.value) : '' }))}
                  >
                    <option value="">-- Toàn quý/năm --</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl}>Ghi chú</label>
                <textarea
                  rows={2}
                  className={inp}
                  value={theoDoiForm.ghi_chu}
                  onChange={e => setTheoDoiForm(p => ({ ...p, ghi_chu: e.target.value }))}
                  placeholder="Nguồn số liệu, ghi chú..."
                />
              </div>

              <div className="flex gap-3 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowTheoDoiModal(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingTheoDoi}
                  className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {savingTheoDoi ? 'Đang lưu...' : 'Lưu số liệu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
