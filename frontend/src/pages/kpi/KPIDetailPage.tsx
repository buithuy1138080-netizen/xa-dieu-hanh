import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { kpiApi } from '../../api/kpi'
import { programsApi } from '../../api/programs'
import type { Program } from '../../api/programs'
import KPIStatusBadge from '../../components/kpi/KPIStatusBadge'
import AppLayout from '../../components/layout/AppLayout'
import type { KPICreate, KPIPeriod, KPIReadDetail, KPIStatus } from '../../types/kpi'

interface DeptMin { id: number; name: string; short_name: string | null }
interface StaffItem { id: number; full_name: string; position: string | null; employee_code: string | null; department_id: number | null }

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]
const CATEGORIES = ['Kinh tế', 'Xã hội', 'Hành chính', 'Môi trường', 'Hạ tầng', 'Văn hóa', 'An ninh', 'Khác']
const STATUS_OPTS: { value: KPIStatus; label: string }[] = [
  { value: 'on_track', label: 'Đúng tiến độ' },
  { value: 'at_risk', label: 'Có rủi ro' },
  { value: 'behind', label: 'Chậm tiến độ' },
  { value: 'completed', label: 'Hoàn thành' },
]

const STATUS_COLOR: Record<KPIStatus, string> = {
  on_track:  '#22c55e',
  at_risk:   '#f59e0b',
  behind:    '#ef4444',
  completed: '#3b82f6',
}

const HISTORY_ICON: Record<string, string> = {
  created: '🆕', updated: '✏️', progress_recorded: '📊',
}

function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function KPIDetailPage() {
  const { id } = useParams<{ id: string }>()
  const kpiId = Number(id)
  const navigate = useNavigate()

  const [kpi, setKpi] = useState<KPIReadDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm] = useState<Partial<KPICreate>>({})

  const [progressValue, setProgressValue] = useState('')
  const [progressNote, setProgressNote] = useState('')
  const [progressSaving, setProgressSaving] = useState(false)
  const [depts, setDepts] = useState<DeptMin[]>([])
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [programs, setPrograms] = useState<Program[]>([])

  useEffect(() => {
    apiClient.get<DeptMin[]>('/departments').then(r => setDepts(r.data)).catch(() => {})
    apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200').then(r => setStaffList(r.data.items ?? [])).catch(() => {})
    programsApi.list().then(r => setPrograms(r.data)).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await kpiApi.get(kpiId)
      setKpi(data)
      setEditForm({
        code: data.code ?? '', title: data.title, description: data.description ?? '',
        unit: data.unit ?? '', category: data.category ?? '',
        target_value: data.target_value, current_value: data.current_value,
        period: data.period, year: data.year, quarter: data.quarter ?? undefined,
        month: data.month ?? undefined, status: data.status,
        deadline: data.deadline ?? null,
        responsible_unit: data.responsible_unit ?? '',
        responsible_department_id: data.responsible_department_id ?? null,
        responsible_user_id: data.responsible_user?.id ?? null,
        responsible_staff_id: data.responsible_staff?.id ?? null,
        program_id: data.program_id ?? null,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [kpiId])

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    try {
      await kpiApi.update(kpiId, editForm)
      setEditOpen(false)
      await load()
    } finally {
      setEditSaving(false)
    }
  }

  async function handleProgress(e: React.FormEvent) {
    e.preventDefault()
    if (!progressValue) return
    setProgressSaving(true)
    try {
      await kpiApi.recordProgress(kpiId, Number(progressValue), progressNote || undefined)
      setProgressValue('')
      setProgressNote('')
      await load()
    } finally {
      setProgressSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Xóa KPI này?')) return
    await kpiApi.delete(kpiId)
    navigate('/kpi')
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!kpi) return <AppLayout><div className="p-6 text-center text-slate-500">Không tìm thấy KPI.</div></AppLayout>

  const progressColor = STATUS_COLOR[kpi.status] ?? '#94a3b8'
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-6xl mx-auto">

        {/* Top bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/kpi')} className="text-slate-400 hover:text-slate-700 text-sm">← Danh sách</button>
            <span className="text-slate-300">|</span>
            <KPIStatusBadge status={kpi.status} />
            {kpi.code && <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{kpi.code}</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditOpen(true)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600">✏ Sửa</button>
            <button onClick={handleDelete} className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 transition text-red-600">🗑 Xóa</button>
          </div>
        </div>

        {/* Title + progress ring */}
        <div className="flex items-start gap-5">
          <div className="shrink-0 relative">
            <svg width={90} height={90} className="-rotate-90">
              <circle cx={45} cy={45} r={38} fill="none" stroke="#f1f5f9" strokeWidth={8} />
              <circle cx={45} cy={45} r={38} fill="none" stroke={progressColor} strokeWidth={8}
                strokeDasharray={2 * Math.PI * 38}
                strokeDashoffset={2 * Math.PI * 38 * (1 - kpi.progress / 100)}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center rotate-90">
              <span className="text-lg font-bold text-slate-700">{kpi.progress}%</span>
            </div>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800 leading-snug">{kpi.title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {kpi.category && <span>{kpi.category} · </span>}
              {kpi.period === 'yearly' ? `Năm ${kpi.year}` : kpi.period === 'quarterly' ? `Q${kpi.quarter}/${kpi.year}` : `T${kpi.month}/${kpi.year}`}
              {(kpi.responsible_department?.short_name ?? kpi.responsible_department?.name ?? kpi.responsible_unit) && (
                <span> · {kpi.responsible_department?.short_name ?? kpi.responsible_department?.name ?? kpi.responsible_unit}</span>
              )}
            </p>
            {kpi.description && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{kpi.description}</p>}
          </div>
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Left */}
          <div className="xl:col-span-2 space-y-4">

            {/* Info */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Thông tin KPI</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Mục tiêu', `${kpi.target_value} ${kpi.unit ?? ''}`],
                  ['Thực hiện', `${kpi.current_value} ${kpi.unit ?? ''}`],
                  ['Tiến độ', `${kpi.progress}%`],
                  ['Hạn hoàn thành', fmtDate(kpi.deadline)],
                  ['Đơn vị phụ trách', kpi.responsible_department?.short_name ?? kpi.responsible_department?.name ?? kpi.responsible_unit ?? '—'],
                  ['Cán bộ phụ trách', kpi.responsible_staff?.full_name ?? kpi.responsible_user?.full_name ?? kpi.responsible_user?.username ?? '—'],
                  ['Người tạo', kpi.creator.full_name ?? kpi.creator.username],
                  ['Cập nhật', fmtDateTime(kpi.updated_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-slate-400 font-medium">{k}</dt>
                    <dd className="text-slate-700 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Progress history table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Lịch sử cập nhật kết quả ({kpi.progress_entries.length})</h2>
              </div>
              {kpi.progress_entries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Chưa có kết quả nào được ghi nhận</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">Thời gian</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">Giá trị</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">Người ghi</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">Ghi chú</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {kpi.progress_entries.map(e => (
                      <tr key={e.id}>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDateTime(e.recorded_at)}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-violet-700">{e.value} {kpi.unit ?? ''}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{e.user.full_name ?? e.user.username}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 italic">{e.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">

            {/* Record progress */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Ghi nhận kết quả</h2>
              <form onSubmit={handleProgress} className="space-y-3">
                <div>
                  <label className={lbl}>Giá trị thực hiện {kpi.unit ? `(${kpi.unit})` : ''} *</label>
                  <input type="number" step="any" required className={inp}
                    value={progressValue} onChange={e => setProgressValue(e.target.value)}
                    placeholder={`0 - ${kpi.target_value}`} />
                </div>
                <div>
                  <label className={lbl}>Ghi chú</label>
                  <textarea rows={2} className={inp} value={progressNote}
                    onChange={e => setProgressNote(e.target.value)} placeholder="Ghi chú kết quả..." />
                </div>
                <button type="submit" disabled={progressSaving || !progressValue}
                  className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition">
                  {progressSaving ? 'Đang lưu...' : 'Ghi nhận kết quả'}
                </button>
              </form>
            </div>

            {/* History */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Lịch sử thay đổi</h2>
              {kpi.history.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Chưa có lịch sử</p>
              ) : (
                <ol className="relative border-l border-slate-200 ml-3 space-y-4">
                  {kpi.history.map(h => (
                    <li key={h.id} className="ml-5">
                      <span className="absolute -left-2.5 w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xs">
                        {HISTORY_ICON[h.action] ?? '•'}
                      </span>
                      <p className="text-xs font-medium text-slate-700">
                        {h.user.full_name ?? h.user.username}
                        {h.new_value != null && <span className="ml-1 text-violet-600">→ {h.new_value} {kpi.unit ?? ''}</span>}
                        {h.new_status && <span className="ml-1 text-blue-600">→ {h.new_status}</span>}
                      </p>
                      {h.note && <p className="text-xs text-slate-500 mt-0.5 italic">"{h.note}"</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(h.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Chỉnh sửa KPI</h2>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mã KPI</label>
                  <input className={inp} value={editForm.code ?? ''} onChange={e => setEditForm(p => ({ ...p, code: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Nhóm</label>
                  <select className={inp} value={editForm.category ?? ''} onChange={e => setEditForm(p => ({ ...p, category: e.target.value || undefined }))}>
                    <option value="">-- Chọn nhóm --</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Tên KPI *</label>
                <input required className={inp} value={editForm.title ?? ''} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Mô tả</label>
                <textarea rows={2} className={inp} value={editForm.description ?? ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Mục tiêu</label>
                  <input type="number" step="any" className={inp} value={editForm.target_value ?? ''} onChange={e => setEditForm(p => ({ ...p, target_value: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={lbl}>Thực hiện</label>
                  <input type="number" step="any" className={inp} value={editForm.current_value ?? ''} onChange={e => setEditForm(p => ({ ...p, current_value: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={lbl}>Đơn vị tính</label>
                  <input className={inp} value={editForm.unit ?? ''} onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Trạng thái</label>
                  <select className={inp} value={editForm.status ?? 'on_track'} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as KPIStatus }))}>
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Hạn hoàn thành</label>
                  <input type="date" className={inp} value={editForm.deadline ?? ''} onChange={e => setEditForm(p => ({ ...p, deadline: e.target.value || null }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Chu kỳ</label>
                  <select className={inp} value={editForm.period ?? 'yearly'} onChange={e => setEditForm(p => ({ ...p, period: e.target.value as KPIPeriod }))}>
                    <option value="yearly">Năm</option>
                    <option value="quarterly">Quý</option>
                    <option value="monthly">Tháng</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Năm</label>
                  <select className={inp} value={editForm.year ?? CURRENT_YEAR} onChange={e => setEditForm(p => ({ ...p, year: Number(e.target.value) }))}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Đơn vị phụ trách</label>
                  <select className={inp} value={editForm.responsible_department_id ?? ''} onChange={e => {
                    const deptId = e.target.value ? Number(e.target.value) : null
                    const dept = depts.find(d => d.id === deptId)
                    setEditForm(p => ({
                      ...p,
                      responsible_department_id: deptId,
                      responsible_unit: dept ? (dept.short_name ?? dept.name) : (p.responsible_unit ?? ''),
                    }))
                  }}>
                    <option value="">-- Chọn đơn vị --</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Cán bộ phụ trách</label>
                  <select className={inp} value={editForm.responsible_staff_id ?? ''} onChange={e => setEditForm(p => ({ ...p, responsible_staff_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">-- Chưa xác định --</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}{s.position ? ` — ${s.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {programs.length > 0 && (
                <div>
                  <label className={lbl}>Chương trình / Nghị quyết</label>
                  <select className={inp} value={editForm.program_id ?? ''} onChange={e => setEditForm(p => ({ ...p, program_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">-- Không liên kết --</option>
                    {programs.map(prog => (
                      <option key={prog.id} value={prog.id}>{prog.short_name ?? prog.code} — {prog.name.slice(0, 50)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2 justify-end">
                <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Hủy</button>
                <button type="submit" disabled={editSaving} className="px-5 py-2 text-sm bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50 transition">
                  {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
