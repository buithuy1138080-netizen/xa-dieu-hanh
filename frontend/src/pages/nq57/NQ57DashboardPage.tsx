import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { kpiApi } from '../../api/kpi'
import NQ57StatusBadge from '../../components/kpi/NQ57StatusBadge'
import AppLayout from '../../components/layout/AppLayout'
import type { NQ57Stats, NQ57Status, NQ57TaskCreate, NQ57TaskRead } from '../../types/kpi'

interface DeptMin { id: number; name: string; short_name: string | null }
interface StaffItem { id: number; full_name: string; position: string | null; employee_code: string | null; department_id: number | null }

const STATUS_TABS: { value: NQ57Status | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa bắt đầu' },
  { value: 'in_progress', label: 'Đang thực hiện' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'delayed', label: 'Chậm tiến độ' },
]

const STATUS_PROGRESS_COLOR: Record<NQ57Status, string> = {
  pending:     '#94a3b8',
  in_progress: '#3b82f6',
  completed:   '#22c55e',
  delayed:     '#ef4444',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isOverdue(deadline: string | null, status: NQ57Status) {
  if (!deadline || status === 'completed') return false
  return new Date(deadline) < new Date()
}

export default function NQ57DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<NQ57Stats | null>(null)
  const [tasks, setTasks] = useState<NQ57TaskRead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<string[]>([])
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showProgress, setShowProgress] = useState<number | null>(null)
  const [newProgress, setNewProgress] = useState(0)
  const [progressNote, setProgressNote] = useState('')

  const [statusTab, setStatusTab] = useState<NQ57Status | ''>('')
  const [groupFilter, setGroupFilter] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 15
  const [depts, setDepts] = useState<DeptMin[]>([])

  const [form, setForm] = useState<NQ57TaskCreate>({
    title: '', status: 'pending', progress: 0,
  })

  const loadAll = useCallback(async (p = 1, q = search) => {
    setLoading(true)
    try {
      const [s, t] = await Promise.allSettled([
        kpiApi.nq57Stats(),
        kpiApi.nq57List({
          page: p, size: SIZE,
          search: q || undefined,
          status: statusTab || undefined,
          group: groupFilter || undefined,
        }),
      ])
      if (s.status === 'fulfilled') setStats(s.value.data)
      if (t.status === 'fulfilled') {
        setTasks(t.value.data.items)
        setTotal(t.value.data.total)
        setPage(p)
      }
    } finally {
      setLoading(false)
    }
  }, [statusTab, groupFilter, search])

  useEffect(() => { loadAll(1) }, [statusTab, groupFilter])
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => loadAll(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])
  useEffect(() => {
    kpiApi.nq57Groups().then(r => setGroups(r.data)).catch(() => {})
    apiClient.get<DeptMin[]>('/departments').then(r => setDepts(r.data)).catch(() => {})
    apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200').then(r => setStaffList(r.data.items)).catch(() => {})
  }, [])

  // Group tasks by group for grouped view
  const groupedTasks: Record<string, NQ57TaskRead[]> = {}
  for (const t of tasks) {
    const g = t.group ?? 'Khác'
    if (!groupedTasks[g]) groupedTasks[g] = []
    groupedTasks[g].push(t)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await kpiApi.nq57Create(form)
      setShowForm(false)
      setForm({ title: '', status: 'pending', progress: 0 })
      loadAll(1)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateProgress(taskId: number) {
    await kpiApi.nq57RecordProgress(taskId, newProgress, progressNote || undefined)
    setShowProgress(null)
    setProgressNote('')
    loadAll(page)
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl">🏛</div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Nghị quyết 57</h1>
              <p className="text-sm text-slate-500 mt-0.5">Theo dõi nhiệm vụ chuyển đổi số và đổi mới sáng tạo</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition"
          >
            + Thêm nhiệm vụ
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { label: 'Tổng nhiệm vụ',    value: stats?.total ?? 0,       cls: 'text-slate-700', bg: 'bg-slate-50',   icon: '📋' },
            { label: 'Đang thực hiện',    value: stats?.in_progress ?? 0, cls: 'text-blue-600',  bg: 'bg-blue-50',    icon: '⚡' },
            { label: 'Hoàn thành',        value: stats?.completed ?? 0,   cls: 'text-green-600', bg: 'bg-green-50',   icon: '✅' },
            { label: 'Chậm tiến độ',     value: stats?.delayed ?? 0,     cls: 'text-red-600',   bg: 'bg-red-50',     icon: '⚠️' },
            { label: 'Chưa bắt đầu',     value: stats?.pending ?? 0,     cls: 'text-slate-600', bg: 'bg-slate-50',   icon: '⏳' },
            { label: 'Tiến độ TB',        value: `${stats?.avg_progress ?? 0}%`, cls: 'text-emerald-600', bg: 'bg-emerald-50', icon: '📈' },
          ].map(c => (
            <div key={c.label} className={`rounded-2xl p-4 border border-slate-100 shadow-sm ${c.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{c.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${c.cls}`}>{c.value}</p>
                </div>
                <span className="text-2xl">{c.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Overall progress bar */}
        {stats && stats.total > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng tiến độ thực hiện NQ57</h3>
              <span className="text-sm font-bold text-emerald-600">{stats.avg_progress}%</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${(stats.completed / stats.total) * 100}%` }} title={`Hoàn thành: ${stats.completed}`} />
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${(stats.in_progress / stats.total) * 100}%` }} title={`Đang thực hiện: ${stats.in_progress}`} />
              <div className="h-full bg-slate-300 transition-all" style={{ width: `${(stats.pending / stats.total) * 100}%` }} title={`Chưa bắt đầu: ${stats.pending}`} />
              <div className="h-full bg-red-400 transition-all" style={{ width: `${(stats.delayed / stats.total) * 100}%` }} title={`Chậm: ${stats.delayed}`} />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" />Hoàn thành</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400" />Đang thực hiện</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />Chưa bắt đầu</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Chậm tiến độ</span>
            </div>
          </div>
        )}

        {/* Filter + List */}
        <div className="space-y-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {STATUS_TABS.map(t => (
              <button key={t.value} onClick={() => setStatusTab(t.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusTab === t.value ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm nhiệm vụ, mã, đơn vị..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white" />
            </div>
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none text-slate-600">
              <option value="">Tất cả nhóm</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Task list — grouped by group */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">Đang tải...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-2">🏛</p>
              <p className="text-slate-400">Chưa có nhiệm vụ nào</p>
            </div>
          ) : (
            Object.entries(groupedTasks).map(([group, groupTasks]) => (
              <div key={group} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                  <span className="text-sm font-semibold text-emerald-800">{group}</span>
                  <span className="ml-auto text-xs text-emerald-600 font-medium">{groupTasks.length} nhiệm vụ</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {groupTasks.map(task => {
                    const overdue = isOverdue(task.deadline, task.status)
                    return (
                      <div key={task.id} className="px-5 py-3.5">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {task.code && <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{task.code}</span>}
                              <p className="text-sm font-medium text-slate-800">{task.title}</p>
                              <NQ57StatusBadge status={task.status} />
                            </div>
                            {task.target && <p className="text-xs text-slate-500 mt-1">Mục tiêu: {task.target}</p>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                              {(task.responsible_department?.short_name ?? task.responsible_department?.name ?? task.responsible_unit) && (
                                <span>📍 {task.responsible_department?.short_name ?? task.responsible_department?.name ?? task.responsible_unit}</span>
                              )}
                              {task.deadline && (
                                <span className={overdue ? 'text-red-500 font-medium' : ''}>
                                  📅 {fmtDate(task.deadline)}{overdue && ' ⚠'}
                                </span>
                              )}
                              {task.kpi && (
                                <span className="text-violet-600 cursor-pointer hover:underline"
                                  onClick={() => navigate(`/kpi/${task.kpi!.id}`)}>
                                  📊 KPI: {task.kpi.title.slice(0, 30)}...
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-slate-100 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full transition-all"
                                  style={{ width: `${task.progress}%`, backgroundColor: STATUS_PROGRESS_COLOR[task.status] ?? '#94a3b8' }} />
                              </div>
                              <span className="text-xs font-semibold text-slate-600 w-8 text-right">{task.progress}%</span>
                            </div>
                            <button
                              onClick={() => { setShowProgress(task.id); setNewProgress(task.progress) }}
                              className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition font-medium"
                            >
                              Cập nhật
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Trang {page}/{pages} · {total} nhiệm vụ</span>
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

      {/* Progress update modal */}
      {showProgress !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Cập nhật tiến độ</h2>
              <button onClick={() => setShowProgress(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={lbl}>Tiến độ (%) *</label>
                <input type="range" min={0} max={100} className="w-full accent-emerald-500"
                  value={newProgress} onChange={e => setNewProgress(Number(e.target.value))} />
                <div className="text-center text-2xl font-bold text-emerald-600 mt-1">{newProgress}%</div>
              </div>
              <div>
                <label className={lbl}>Ghi chú</label>
                <textarea rows={2} className={inp} value={progressNote}
                  onChange={e => setProgressNote(e.target.value)} placeholder="Ghi chú tiến độ..." />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowProgress(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Hủy</button>
                <button onClick={() => handleUpdateProgress(showProgress)}
                  className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition">
                  Cập nhật
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create task modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Thêm nhiệm vụ NQ57</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mã nhiệm vụ</label>
                  <input className={inp} value={form.code ?? ''} onChange={e => setForm(p => ({ ...p, code: e.target.value || undefined }))} placeholder="NQ57-001" />
                </div>
                <div>
                  <label className={lbl}>Nhóm nhiệm vụ</label>
                  <select className={inp} value={form.group ?? ''} onChange={e => setForm(p => ({ ...p, group: e.target.value || undefined }))}>
                    <option value="">-- Chọn nhóm --</option>
                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Tên nhiệm vụ *</label>
                <input required className={inp} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Triển khai chữ ký số..." />
              </div>
              <div>
                <label className={lbl}>Chỉ tiêu / Mục tiêu cần đạt</label>
                <textarea rows={2} className={inp} value={form.target ?? ''} onChange={e => setForm(p => ({ ...p, target: e.target.value || undefined }))} placeholder="100% cán bộ có chữ ký số..." />
              </div>
              <div>
                <label className={lbl}>Mô tả</label>
                <textarea rows={2} className={inp} value={form.description ?? ''} onChange={e => setForm(p => ({ ...p, description: e.target.value || undefined }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Ngày bắt đầu</label>
                  <input type="date" className={inp} value={form.start_date ?? ''} onChange={e => setForm(p => ({ ...p, start_date: e.target.value || null }))} />
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
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition">
                  {saving ? 'Đang lưu...' : 'Thêm nhiệm vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
