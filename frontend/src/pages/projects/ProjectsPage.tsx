import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BarChart2, Banknote, ChevronRight,
  FolderKanban, Layers, Loader2, Plus, Search,
  Target, TrendingUp,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import AppLayout from '../../components/layout/AppLayout'
import { tasksApi } from '../../api/tasks'
import type { Task } from '../../types/task'
import { usersApi } from '../../api/users'
import { departmentsApi } from '../../api/departments'
import type { UserPublic } from '../../api/users'
import type { DeptRead } from '../../api/departments'
import apiClient from '../../api/client'

interface ProgramMin { id: number; name: string; short_name?: string | null }

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(2)} tỷ`
  : n >= 1_000_000   ? `${(n / 1_000_000).toFixed(1)} tr`
  : n.toLocaleString('vi-VN')

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chưa bắt đầu', in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành', cancelled: 'Đã huỷ',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
}
const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500', medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Khẩn' }
const TYPE_LABEL: Record<string, string> = {
  project: 'Dự án', plan: 'Đề án', program: 'Kế hoạch', digital_transform: 'Chuyển đổi số',
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, onClick }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-start gap-3 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all' : ''}`}>
      <div className={`${color} w-9 h-9 rounded-xl flex items-center justify-center shrink-0`}>
        <Icon size={16} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        {onClick && <p className="text-[10px] text-indigo-400 mt-0.5">Xem chi tiết →</p>}
      </div>
    </div>
  )
}

function PBar({ value, color = 'bg-blue-500' }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects]   = useState<Task[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'dashboard' | 'projects'>('dashboard')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [showForm, setShowForm]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await tasksApi.list({ is_project: true, page_size: 200, sort_by: 'created_at', sort_dir: 'desc' })
      setProjects(data.items)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function goFilter(status = '', type = '') {
    setFilterStatus(status)
    setFilterType(type)
    setTab('projects')
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <FolderKanban size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Dự án & Kinh phí</h1>
              <p className="text-sm text-slate-500">Quản lý dự án, đề án và ngân sách</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition">
            <Plus size={15} /> + Tạo dự án
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200">
          {([['dashboard', 'Dashboard'], ['projects', 'Dự án']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
        ) : tab === 'dashboard' ? (
          <DashboardTab projects={projects} onNavigate={id => navigate(`/tasks/${id}`)} onFilter={goFilter} />
        ) : (
          <ProjectsTab projects={projects} onNavigate={id => navigate(`/tasks/${id}`)}
            initStatus={filterStatus} initType={filterType} />
        )}
      </div>

      {showForm && (
        <CreateProjectModal onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); load() }} />
      )}
    </AppLayout>
  )
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────

function DashboardTab({ projects, onNavigate, onFilter }: {
  projects: Task[]; onNavigate: (id: number) => void
  onFilter: (status?: string, type?: string) => void
}) {
  const stats = useMemo(() => {
    const total         = projects.length
    const in_progress   = projects.filter(p => p.status === 'in_progress').length
    const completed     = projects.filter(p => p.status === 'completed').length
    const cancelled     = projects.filter(p => p.status === 'cancelled').length
    const overdue       = projects.filter(p => p.is_overdue).length
    const total_budget  = projects.reduce((s, p) => s + (p.budget_amount ?? 0), 0)
    const with_budget   = projects.filter(p => (p.budget_amount ?? 0) > 0).length
    const avg_progress  = total ? Math.round(projects.reduce((s, p) => s + p.progress_percent, 0) / total) : 0

    const byStatus: Record<string, number> = {}
    projects.forEach(p => { byStatus[p.status] = (byStatus[p.status] ?? 0) + 1 })

    const byType: Record<string, number> = {}
    projects.forEach(p => {
      const t = p.project_type ?? 'project'
      byType[t] = (byType[t] ?? 0) + 1
    })

    const slow = projects.filter(p => p.status === 'in_progress' && p.progress_percent < 30 && !p.is_overdue)
    const warn = [...projects.filter(p => p.is_overdue), ...slow]

    return { total, in_progress, completed, cancelled, overdue, total_budget, with_budget, avg_progress, byStatus, byType, warn }
  }, [projects])

  const statusChartData = Object.entries(stats.byStatus).map(([k, v]) => ({ name: STATUS_LABEL[k] ?? k, value: v }))
  const typeChartData   = Object.entries(stats.byType).map(([k, v]) => ({ name: TYPE_LABEL[k] ?? k, value: v }))

  const progressColor = (v: number) => v >= 80 ? 'bg-green-500' : v >= 50 ? 'bg-blue-500' : 'bg-amber-500'

  return (
    <div className="space-y-5">
      {/* Row 1 — project count */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Tổng dự án"      value={stats.total}       icon={FolderKanban}  color="bg-blue-500"   onClick={() => onFilter()} />
        <StatCard label="Đang thực hiện"  value={stats.in_progress} icon={TrendingUp}     color="bg-green-500"  onClick={() => onFilter('in_progress')} />
        <StatCard label="Hoàn thành"      value={stats.completed}   icon={Target}         color="bg-indigo-500" onClick={() => onFilter('completed')} />
        <StatCard label="Đã huỷ"          value={stats.cancelled}   icon={Layers}         color="bg-amber-500"  onClick={() => onFilter('cancelled')} />
        <StatCard label="Quá hạn"         value={stats.overdue}     icon={AlertTriangle}  color="bg-red-500"    onClick={() => onFilter('overdue')} />
      </div>

      {/* Row 2 — budget */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Tổng kinh phí"     value={stats.total_budget > 0 ? fmt(stats.total_budget) : '—'} sub="đồng" icon={Banknote}  color="bg-blue-500" />
        <StatCard label="Có kinh phí"        value={stats.with_budget} sub={`/ ${stats.total} dự án`} icon={BarChart2} color="bg-purple-500" />
        <StatCard label="Tiến độ trung bình" value={`${stats.avg_progress}%`} icon={TrendingUp} color="bg-orange-500" />
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">Tỷ lệ hoàn thành</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <PBar value={stats.total ? Math.round(stats.completed / stats.total * 100) : 0}
                color={progressColor(stats.total ? stats.completed / stats.total * 100 : 0)} />
            </div>
            <span className="text-2xl font-bold text-slate-800 w-16 text-right">
              {stats.total ? Math.round(stats.completed / stats.total * 100) : 0}%
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">Tiến độ trung bình</p>
          <div className="flex items-center gap-4">
            <div className="flex-1"><PBar value={stats.avg_progress} color={progressColor(stats.avg_progress)} /></div>
            <span className="text-2xl font-bold text-slate-800 w-16 text-right">{stats.avg_progress}%</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Dự án theo trạng thái</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusChartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Dự án" radius={[4, 4, 0, 0]}>
                {statusChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Dự án theo loại</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={typeChartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Dự án" radius={[4, 4, 0, 0]}>
                {typeChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Warnings */}
      {stats.warn.length > 0 && (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <p className="text-sm font-bold text-red-600 mb-3 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Dự án chậm tiến độ cần chú ý
          </p>
          <div className="space-y-2">
            {stats.warn.map(p => (
              <div key={p.id} onClick={() => onNavigate(p.id)}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 cursor-pointer transition">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{p.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1"><PBar value={p.progress_percent} color="bg-red-400" /></div>
                    <span className="text-[10px] text-slate-400 w-8 text-right">{p.progress_percent}%</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${p.is_overdue ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {p.is_overdue ? 'Quá hạn' : 'Chậm'}
                </span>
                {p.due_date && (
                  <span className="text-[10px] text-slate-400 shrink-0">
                    → {new Date(p.due_date).toLocaleDateString('vi-VN')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Projects list tab ────────────────────────────────────────────────────────

function ProjectsTab({ projects, onNavigate, initStatus = '', initType = '' }: {
  projects: Task[]; onNavigate: (id: number) => void
  initStatus?: string; initType?: string
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(initStatus)
  const [type,   setType]   = useState(initType)

  // sync khi initStatus thay đổi (click từ dashboard)
  useEffect(() => { setStatus(initStatus) }, [initStatus])
  useEffect(() => { setType(initType) },     [initType])

  const filtered = projects.filter(p => {
    if (status === 'overdue') return p.is_overdue
    if (status && p.status !== status) return false
    if (type   && (p.project_type ?? 'project') !== type) return false
    if (search) {
      const q = search.toLowerCase()
      return p.title.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm dự án..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chưa bắt đầu</option>
          <option value="in_progress">Đang thực hiện</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã huỷ</option>
          <option value="overdue">Quá hạn</option>
        </select>
        <select value={type} onChange={e => setType(e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">Tất cả loại</option>
          <option value="project">Dự án</option>
          <option value="plan">Đề án</option>
          <option value="program">Kế hoạch</option>
          <option value="digital_transform">Chuyển đổi số</option>
        </select>
        <span className="self-center text-xs text-slate-400">{filtered.length} dự án</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
          <p>Không có dự án nào</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(p => (
            <div key={p.id} onClick={() => onNavigate(p.id)}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 transition cursor-pointer group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs text-slate-400 font-mono">{p.task_code}</span>
                    {p.project_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                        {TYPE_LABEL[p.project_type] ?? p.project_type}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[p.status] ?? STATUS_COLOR.pending}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[p.priority] ?? ''}`}>
                      {PRIORITY_LABEL[p.priority] ?? p.priority}
                    </span>
                    {p.is_overdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Quá hạn</span>}
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm group-hover:text-indigo-700 truncate">{p.title}</h3>
                  {p.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{p.description}</p>}
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400 shrink-0 mt-1" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                {p.assignee && <span>{p.assignee.full_name || p.assignee.username}</span>}
                {p.lead_department && <span>{p.lead_department.short_name || p.lead_department.name}</span>}
                {p.due_date && <span>→ {new Date(p.due_date).toLocaleDateString('vi-VN')}</span>}
                {p.subtasks_count > 0 && <span className="flex items-center gap-1"><Layers size={11}/>{p.subtasks_count} nhiệm vụ</span>}
                {p.budget_amount != null && p.budget_amount > 0 && (
                  <span className="text-emerald-600 font-medium flex items-center gap-1"><Banknote size={11}/>{fmt(p.budget_amount)} đ</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <PBar value={p.progress_percent}
                  color={p.progress_percent >= 80 ? 'bg-green-500' : p.progress_percent >= 50 ? 'bg-blue-500' : 'bg-amber-400'} />
                <span className="text-xs text-slate-500 shrink-0 w-8 text-right">{p.progress_percent}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Create project modal ─────────────────────────────────────────────────────

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', project_type: 'project',
    start_date: '', due_date: '', assignee_id: '', lead_department_id: '',
    program_id: '', budget_amount: '',
  })
  const [users, setUsers]       = useState<UserPublic[]>([])
  const [depts, setDepts]       = useState<DeptRead[]>([])
  const [programs, setPrograms] = useState<ProgramMin[]>([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    usersApi.names().then(r => setUsers(r.data))
    departmentsApi.list().then(r => setDepts(r.data))
    apiClient.get<ProgramMin[]>('/programs?status=active').then(r => setPrograms(r.data)).catch(() => {})
  }, [])

  function set(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Vui lòng nhập tên dự án'); return }
    setSaving(true); setError('')
    try {
      await tasksApi.create({
        title: form.title.trim(),
        description: form.description || undefined,
        priority: form.priority as 'low' | 'medium' | 'high' | 'urgent',
        is_project: true,
        project_type: form.project_type || undefined,
        budget_amount: form.budget_amount ? Number(form.budget_amount) : undefined,
        start_date: form.start_date || undefined,
        due_date: form.due_date ? form.due_date + 'T23:59:59' : undefined,
        program_id: form.program_id ? Number(form.program_id) : undefined,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : undefined,
        lead_department_id: form.lead_department_id ? Number(form.lead_department_id) : undefined,
      })
      onCreated()
    } catch {
      setError('Tạo dự án thất bại')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FolderKanban size={18} className="text-indigo-600" />
            <h2 className="font-bold text-slate-800">Tạo dự án mới</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Tên dự án *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Nhập tên dự án..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Mô tả</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              placeholder="Mô tả ngắn về dự án..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Loại</label>
              <select value={form.project_type} onChange={e => set('project_type', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="project">Dự án</option>
                <option value="plan">Đề án</option>
                <option value="program">Kế hoạch</option>
                <option value="digital_transform">Chuyển đổi số</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Ưu tiên</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
                <option value="urgent">Khẩn</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Ngày bắt đầu</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Ngày kết thúc</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Thuộc chương trình / NQ</label>
            <select value={form.program_id} onChange={e => set('program_id', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">-- Không liên kết --</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.short_name ? `[${p.short_name}] ` : ''}{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Kinh phí (đồng)</label>
            <input type="number" min="0" value={form.budget_amount} onChange={e => set('budget_amount', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="VD: 500000000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Quản lý dự án</label>
              <select value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— Chưa chọn</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Đơn vị chủ trì</label>
              <select value={form.lead_department_id} onChange={e => set('lead_department_id', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— Chưa chọn</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">Huỷ</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              + Tạo dự án
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
