import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  AlertTriangle, BarChart2, BookOpen, ChevronDown, ChevronUp,
  DollarSign, Edit2, FileText, FolderKanban, Layers, Loader2, Plus, Search,
  Target, Trash2, TrendingUp, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import AppLayout from '../../components/layout/AppLayout'
import apiClient from '../../api/client'
import { documentsApi } from '../../api/documents'
import strategicApi from '../../api/strategic'
import type { DocumentRead } from '../../types/document'
import type {
  BudgetPlan,
  BudgetPlanCreate,
  Disbursement,
  DisbursementCreate,
  FundingSource,
  FundingSourceCreate,
  StrategicDashboardStats,
  StrategicProject,
  StrategicProjectCreate,
  StrategicProjectUpdate,
} from '../../types/strategic'
import {
  BUDGET_STATUS_LABELS,
  FUNDING_TYPE_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type BudgetStatus,
  type FundingType,
  type PriorityLevel,
  type ProjectStatus,
  type ProjectType,
} from '../../types/strategic'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(2)} tỷ`
    : n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)} tr`
    : n.toLocaleString('vi-VN')

const THIS_YEAR = new Date().getFullYear()

const STATUS_COLOR: Record<ProjectStatus, string> = {
  planning: 'bg-slate-100 text-slate-700',
  active: 'bg-blue-100 text-blue-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PRIORITY_COLOR: Record<PriorityLevel, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const BUDGET_STATUS_COLOR: Record<BudgetStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  approved: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-gray-200 text-gray-600',
  over_budget: 'bg-red-100 text-red-700',
}

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function ProgressBar({ value, max = 100, color = 'bg-blue-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-800 mt-0.5">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

interface StaffItem { id: number; full_name: string; position: string | null; employee_code: string | null; department_id: number | null }
interface DeptMin { id: number; name: string; short_name: string | null }

// ─── Project Form ─────────────────────────────────────────────────────────────

function ProjectForm({ initial, onSave, onClose }: {
  initial?: StrategicProject | null
  onSave: (data: StrategicProjectCreate) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<StrategicProjectCreate>({
    project_code: initial?.project_code ?? '',
    project_name: initial?.project_name ?? '',
    project_type: initial?.project_type ?? 'project',
    description: initial?.description ?? '',
    start_date: initial?.start_date ?? '',
    end_date: initial?.end_date ?? '',
    project_status: initial?.project_status ?? 'planning',
    priority_level: initial?.priority_level ?? 'medium',
    progress_percent: initial?.progress_percent ?? 0,
    responsible_department_id: initial?.responsible_department_id ?? undefined,
    coordinating_department_ids: initial?.coordinating_departments?.map(d => d.id) ?? [],
    project_manager_id: initial?.project_manager_id ?? undefined,
    project_manager_staff_id: initial?.project_manager_staff_id ?? null,
    source_document_id: initial?.source_document_id ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [depts, setDepts] = useState<DeptMin[]>([])

  // Coordinating departments (multi-select)
  const [coordDepts, setCoordDepts] = useState<DeptMin[]>(initial?.coordinating_departments ?? [])

  // Document (văn bản) search
  const [docSearch, setDocSearch] = useState('')
  const [docResults, setDocResults] = useState<DocumentRead[]>([])
  const [showDocPicker, setShowDocPicker] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<{ id: number; title: string; doc_number: string | null } | null>(
    initial?.source_document ?? null
  )

  useEffect(() => {
    apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200').then(r => setStaffList(r.data.items)).catch(() => {})
    apiClient.get<DeptMin[]>('/departments').then(r => setDepts(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!docSearch.trim()) { setDocResults([]); return }
    const t = setTimeout(() => {
      documentsApi.list({ search: docSearch, size: 10 })
        .then(r => setDocResults(r.data.items))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [docSearch])

  const set = (k: keyof StrategicProjectCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const val = e.target.value
    setForm(f => ({ ...f, [k]: val === '' ? undefined : val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mã dự án</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.project_code ?? ''} onChange={set('project_code')} placeholder="VD: DA2026-001" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Loại</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.project_type} onChange={set('project_type')}>
            {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map(k => (
              <option key={k} value={k}>{PROJECT_TYPE_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tên dự án <span className="text-red-500">*</span></label>
        <input required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.project_name} onChange={set('project_name')} placeholder="Nhập tên dự án..." />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={form.description ?? ''} onChange={set('description')} placeholder="Mô tả dự án..." />
      </div>

      {/* Document (văn bản) picker */}
      <div className="relative">
        <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
          <FileText size={12} className="text-blue-500" /> Văn bản căn cứ
        </label>
        {selectedDoc ? (
          <div className="flex items-center gap-2 px-3 py-2 border border-blue-300 bg-blue-50 rounded-lg text-sm">
            <FileText size={13} className="text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              {selectedDoc.doc_number && (
                <span className="text-xs font-mono text-slate-400 mr-1">{selectedDoc.doc_number}</span>
              )}
              <span className="text-xs text-blue-800 truncate">{selectedDoc.title}</span>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedDoc(null); setForm(f => ({ ...f, source_document_id: null })) }}
              className="text-slate-400 hover:text-red-500"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-2 border border-gray-200 rounded-lg">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Tìm văn bản căn cứ..."
              value={docSearch}
              onChange={e => { setDocSearch(e.target.value); setShowDocPicker(true) }}
              onFocus={() => setShowDocPicker(true)}
              onBlur={() => setTimeout(() => setShowDocPicker(false), 200)}
              className="flex-1 text-xs outline-none text-gray-700 bg-transparent"
            />
          </div>
        )}
        {showDocPicker && docResults.length > 0 && (
          <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {docResults.map(doc => (
              <button
                key={doc.id}
                type="button"
                onMouseDown={() => {
                  setSelectedDoc({ id: doc.id, title: doc.title, doc_number: doc.doc_number })
                  setForm(f => ({ ...f, source_document_id: doc.id }))
                  setDocSearch('')
                  setShowDocPicker(false)
                }}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors"
              >
                <FileText size={13} className="text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  {doc.doc_number && <span className="text-[10px] font-mono text-slate-400 mr-1">{doc.doc_number}</span>}
                  <span className="text-xs text-slate-700 line-clamp-1">{doc.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ngày bắt đầu</label>
          <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.start_date ?? ''} onChange={set('start_date')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ngày kết thúc</label>
          <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.end_date ?? ''} onChange={set('end_date')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trạng thái</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.project_status} onChange={set('project_status')}>
            {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map(k => (
              <option key={k} value={k}>{PROJECT_STATUS_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ưu tiên</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.priority_level} onChange={set('priority_level')}>
            {(Object.keys(PRIORITY_LABELS) as PriorityLevel[]).map(k => (
              <option key={k} value={k}>{PRIORITY_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tiến độ (%)</label>
        <input type="number" min={0} max={100} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.progress_percent ?? 0}
          onChange={e => setForm(f => ({ ...f, progress_percent: Number(e.target.value) }))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Quản lý dự án (Nhân sự)</label>
        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.project_manager_staff_id ?? ''} onChange={e => setForm(f => ({ ...f, project_manager_staff_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">-- Chưa xác định --</option>
          {staffList.map(s => (
            <option key={s.id} value={s.id}>{s.full_name}{s.position ? ` — ${s.position}` : ''}</option>
          ))}
        </select>
      </div>

      {/* Đơn vị phụ trách */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Đơn vị phụ trách</label>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={form.responsible_department_id ?? ''}
          onChange={e => setForm(f => ({ ...f, responsible_department_id: e.target.value ? Number(e.target.value) : undefined }))}
        >
          <option value="">-- Chưa xác định --</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
        </select>
      </div>

      {/* Đơn vị phối hợp */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Đơn vị phối hợp</label>
        {/* Chips hiện tại */}
        {coordDepts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {coordDepts.map(d => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
              >
                {d.short_name ?? d.name}
                <button
                  type="button"
                  onClick={() => {
                    const next = coordDepts.filter(x => x.id !== d.id)
                    setCoordDepts(next)
                    setForm(f => ({ ...f, coordinating_department_ids: next.map(x => x.id) }))
                  }}
                  className="hover:text-red-500 ml-0.5"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value=""
          onChange={e => {
            const id = Number(e.target.value)
            if (!id || coordDepts.some(d => d.id === id)) return
            const dept = depts.find(d => d.id === id)
            if (!dept) return
            const next = [...coordDepts, dept]
            setCoordDepts(next)
            setForm(f => ({ ...f, coordinating_department_ids: next.map(d => d.id) }))
          }}
        >
          <option value="">-- Thêm đơn vị phối hợp --</option>
          {depts
            .filter(d => !coordDepts.some(c => c.id === d.id) && d.id !== form.responsible_department_id)
            .map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)
          }
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 border rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Hủy</button>
        <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {initial ? 'Cập nhật' : 'Tạo mới'}
        </button>
      </div>
    </form>
  )
}

// ─── Projects Tab ─────────────────────────────────────────────────────────────

function ProjectsTab() {
  const { user } = useAuthStore()
  const canDelete = user?.role === 'admin' || user?.role === 'leader'
  const [projects, setProjects] = useState<StrategicProject[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<StrategicProject | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await strategicApi.listProjects({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        project_status: statusFilter || undefined,
        project_type: typeFilter || undefined,
      })
      setProjects(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, typeFilter])

  useEffect(() => { load() }, [load])

  const handleSave = async (data: StrategicProjectCreate) => {
    if (editing) {
      await strategicApi.updateProject(editing.id, data as StrategicProjectUpdate)
    } else {
      await strategicApi.createProject(data)
    }
    setShowForm(false)
    setEditing(null)
    load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa dự án này?')) return
    await strategicApi.deleteProject(id)
    load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
            placeholder="Tìm kiếm dự án..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">Tất cả trạng thái</option>
          {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map(k => (
            <option key={k} value={k}>{PROJECT_STATUS_LABELS[k]}</option>
          ))}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">Tất cả loại</option>
          {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map(k => (
            <option key={k} value={k}>{PROJECT_TYPE_LABELS[k]}</option>
          ))}
        </select>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap"
        >
          <Plus size={15} /> Thêm dự án
        </button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : projects.length === 0 ? (
          <div className="text-center py-10 text-gray-400">Chưa có dự án nào</div>
        ) : projects.map(p => (
          <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{p.project_name}</p>
                {p.project_code && <p className="text-xs text-gray-400">{p.project_code}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => { setEditing(p); setShowForm(true) }} className="p-1.5 hover:bg-blue-50 rounded-lg"><Edit2 size={14} className="text-blue-500" /></button>
                {canDelete && <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-500" /></button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              <Badge label={PROJECT_STATUS_LABELS[p.project_status]} cls={STATUS_COLOR[p.project_status]} />
              <Badge label={PRIORITY_LABELS[p.priority_level]} cls={PRIORITY_COLOR[p.priority_level]} />
              <Badge label={PROJECT_TYPE_LABELS[p.project_type]} cls="bg-purple-100 text-purple-700" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Tiến độ</span><span>{p.progress_percent}%</span>
              </div>
              <ProgressBar value={p.progress_percent} color={p.progress_percent >= 80 ? 'bg-green-500' : p.progress_percent >= 50 ? 'bg-blue-500' : 'bg-amber-500'} />
            </div>
            {p.responsible_department && (
              <p className="text-xs text-gray-400 mt-2">{p.responsible_department.name}</p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Dự án</th>
                <th className="px-4 py-3 text-left">Loại</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-left">Ưu tiên</th>
                <th className="px-4 py-3 text-left">Tiến độ</th>
                <th className="px-4 py-3 text-left">Thời gian</th>
                <th className="px-4 py-3 text-left">Phòng ban</th>
                <th className="px-4 py-3 text-left">Văn bản</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Chưa có dự án nào</td></tr>
              ) : projects.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{p.project_name}</p>
                    {p.project_code && <p className="text-xs text-gray-400">{p.project_code}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={PROJECT_TYPE_LABELS[p.project_type]} cls="bg-purple-100 text-purple-700" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={PROJECT_STATUS_LABELS[p.project_status]} cls={STATUS_COLOR[p.project_status]} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={PRIORITY_LABELS[p.priority_level]} cls={PRIORITY_COLOR[p.priority_level]} />
                  </td>
                  <td className="px-4 py-3 w-36">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.progress_percent} color={p.progress_percent >= 80 ? 'bg-green-500' : p.progress_percent >= 50 ? 'bg-blue-500' : 'bg-amber-500'} />
                      <span className="text-xs text-gray-500 w-8">{p.progress_percent}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.start_date && <div>{p.start_date}</div>}
                    {p.end_date && <div>→ {p.end_date}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.responsible_department?.short_name ?? p.responsible_department?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.source_document ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 hover:underline cursor-pointer" title={p.source_document.title}>
                        <FileText size={11} />
                        {p.source_document.doc_number ?? p.source_document.title.slice(0, 20)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(p); setShowForm(true) }} className="p-1.5 hover:bg-blue-50 rounded-lg"><Edit2 size={14} className="text-blue-500" /></button>
                      {canDelete && <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-500" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Tổng: {total} dự án</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">‹</button>
            <span className="px-3 py-1">{page}/{totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">›</button>
          </div>
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Chỉnh sửa dự án' : 'Thêm dự án chiến lược'} onClose={() => { setShowForm(false); setEditing(null) }}>
          <ProjectForm initial={editing} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null) }} />
        </Modal>
      )}
    </div>
  )
}

// ─── Budget Form ──────────────────────────────────────────────────────────────

function BudgetForm({ initial, onSave, onClose, projects }: {
  initial?: BudgetPlan | null
  onSave: (data: BudgetPlanCreate) => Promise<void>
  onClose: () => void
  projects: StrategicProject[]
}) {
  const [form, setForm] = useState<BudgetPlanCreate>({
    budget_code: initial?.budget_code ?? '',
    project_id: initial?.project_id ?? (projects[0]?.id ?? 0),
    fiscal_year: initial?.fiscal_year ?? THIS_YEAR,
    total_budget: initial?.total_budget ?? 0,
    allocated_budget: initial?.allocated_budget ?? 0,
    spent_budget: initial?.spent_budget ?? 0,
    budget_status: initial?.budget_status ?? 'draft',
    note: initial?.note ?? '',
  })
  const [saving, setSaving] = useState(false)

  const n = (k: keyof BudgetPlanCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setForm(f => ({ ...f, [k]: v === '' ? undefined : v }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mã kế hoạch</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.budget_code ?? ''} onChange={n('budget_code')} placeholder="NS2026-001" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Năm ngân sách</label>
          <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fiscal_year} onChange={e => setForm(f => ({ ...f, fiscal_year: Number(e.target.value) }))} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Dự án <span className="text-red-500">*</span></label>
        <select required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: Number(e.target.value) }))}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tổng vốn (đồng)</label>
          <input type="number" min={0} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.total_budget ?? 0} onChange={e => setForm(f => ({ ...f, total_budget: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Đã phân bổ</label>
          <input type="number" min={0} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.allocated_budget ?? 0} onChange={e => setForm(f => ({ ...f, allocated_budget: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Đã chi</label>
          <input type="number" min={0} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.spent_budget ?? 0} onChange={e => setForm(f => ({ ...f, spent_budget: Number(e.target.value) }))} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Trạng thái</label>
        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.budget_status} onChange={n('budget_status')}>
          {(Object.keys(BUDGET_STATUS_LABELS) as BudgetStatus[]).map(k => (
            <option key={k} value={k}>{BUDGET_STATUS_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.note ?? ''} onChange={n('note')} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 border rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Hủy</button>
        <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {initial ? 'Cập nhật' : 'Tạo mới'}
        </button>
      </div>
    </form>
  )
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────

function BudgetTab() {
  const { user } = useAuthStore()
  const canDelete = user?.role === 'admin' || user?.role === 'leader'
  const [budgets, setBudgets] = useState<BudgetPlan[]>([])
  const [projects, setProjects] = useState<StrategicProject[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BudgetPlan | null>(null)
  const [projectFilter, setProjectFilter] = useState<number | undefined>()
  const [yearFilter, setYearFilter] = useState<number | undefined>()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [fundingSources, setFundingSources] = useState<Record<number, FundingSource[]>>({})
  const [fsLoading, setFsLoading] = useState<number | null>(null)
  const [showFsForm, setShowFsForm] = useState<number | null>(null)
  const [fsForm, setFsForm] = useState<FundingSourceCreate>({ budget_plan_id: 0, funding_source_name: '', funding_type: 'ngan_sach_xa', funding_amount: 0 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bp, pr] = await Promise.all([
        strategicApi.listBudgetPlans({ project_id: projectFilter, fiscal_year: yearFilter, limit: 100 }),
        strategicApi.listProjects({ limit: 200 }),
      ])
      setBudgets(bp.items)
      setProjects(pr.items)
    } finally { setLoading(false) }
  }, [projectFilter, yearFilter])

  useEffect(() => { load() }, [load])

  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!fundingSources[id]) {
      setFsLoading(id)
      const res = await strategicApi.listFundingSources(id)
      setFundingSources(prev => ({ ...prev, [id]: res.items }))
      setFsLoading(null)
    }
  }

  const handleSave = async (data: BudgetPlanCreate) => {
    if (editing) await strategicApi.updateBudgetPlan(editing.id, data)
    else await strategicApi.createBudgetPlan(data)
    setShowForm(false); setEditing(null); load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa kế hoạch ngân sách này?')) return
    await strategicApi.deleteBudgetPlan(id); load()
  }

  const handleAddFs = async (e: React.FormEvent) => {
    e.preventDefault()
    await strategicApi.createFundingSource(fsForm)
    const res = await strategicApi.listFundingSources(fsForm.budget_plan_id)
    setFundingSources(prev => ({ ...prev, [fsForm.budget_plan_id]: res.items }))
    setShowFsForm(null)
  }

  const handleDeleteFs = async (fs: FundingSource) => {
    if (!confirm('Xóa nguồn vốn này?')) return
    await strategicApi.deleteFundingSource(fs.id)
    const res = await strategicApi.listFundingSources(fs.budget_plan_id)
    setFundingSources(prev => ({ ...prev, [fs.budget_plan_id]: res.items }))
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.project_name]))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={projectFilter ?? ''} onChange={e => setProjectFilter(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Tất cả dự án</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearFilter ?? ''} onChange={e => setYearFilter(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">Tất cả năm</option>
          {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => { setEditing(null); setShowForm(true) }} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 whitespace-nowrap">
          <Plus size={15} /> Thêm kế hoạch
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
      ) : (
        <div className="space-y-3">
          {budgets.length === 0 && <div className="text-center py-12 text-gray-400 bg-white rounded-xl border">Chưa có kế hoạch ngân sách nào</div>}
          {budgets.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.budget_code && <span className="text-xs font-mono text-gray-400">{b.budget_code}</span>}
                      <Badge label={BUDGET_STATUS_LABELS[b.budget_status]} cls={BUDGET_STATUS_COLOR[b.budget_status]} />
                      <span className="text-xs text-gray-400">Năm {b.fiscal_year}</span>
                    </div>
                    <p className="font-medium text-gray-800 mt-1 text-sm truncate">{projectMap[b.project_id] ?? `Dự án #${b.project_id}`}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditing(b); setShowForm(true) }} className="p-1.5 hover:bg-blue-50 rounded-lg"><Edit2 size={14} className="text-blue-500" /></button>
                    {canDelete && <button onClick={() => handleDelete(b.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-500" /></button>}
                    <button onClick={() => toggleExpand(b.id)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      {expandedId === b.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { label: 'Tổng vốn', val: b.total_budget, cls: 'text-blue-600' },
                    { label: 'Đã chi', val: b.spent_budget, cls: 'text-orange-600' },
                    { label: 'Còn lại', val: b.remaining_budget, cls: 'text-green-600' },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`font-semibold text-sm ${cls}`}>{fmt(val)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Giải ngân</span>
                    <span>{b.total_budget > 0 ? Math.round(b.spent_budget / b.total_budget * 100) : 0}%</span>
                  </div>
                  <ProgressBar
                    value={b.spent_budget}
                    max={b.total_budget || 1}
                    color={b.budget_status === 'over_budget' ? 'bg-red-500' : b.spent_budget / (b.total_budget || 1) > 0.8 ? 'bg-orange-500' : 'bg-green-500'}
                  />
                </div>
              </div>

              {/* Expanded: Funding sources */}
              {expandedId === b.id && (
                <div className="border-t bg-gray-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">Nguồn vốn</p>
                    <button
                      onClick={() => { setShowFsForm(b.id); setFsForm({ budget_plan_id: b.id, funding_source_name: '', funding_type: 'ngan_sach_xa', funding_amount: 0 }) }}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    ><Plus size={12} /> Thêm</button>
                  </div>
                  {fsLoading === b.id ? (
                    <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={18} /></div>
                  ) : (
                    <div className="space-y-2">
                      {(fundingSources[b.id] ?? []).length === 0 && <p className="text-xs text-gray-400">Chưa có nguồn vốn</p>}
                      {(fundingSources[b.id] ?? []).map(fs => (
                        <div key={fs.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">{fs.funding_source_name}</span>
                            <span className="ml-2 text-xs text-gray-400">{FUNDING_TYPE_LABELS[fs.funding_type]}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-blue-600">{fmt(fs.funding_amount)}</span>
                            {canDelete && <button onClick={() => handleDeleteFs(fs)} className="p-1 hover:bg-red-50 rounded"><Trash2 size={12} className="text-red-400" /></button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {showFsForm === b.id && (
                    <form onSubmit={handleAddFs} className="mt-3 bg-white rounded-lg p-3 space-y-2 border">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input required className="border rounded px-2 py-1.5 text-xs" placeholder="Tên nguồn vốn" value={fsForm.funding_source_name} onChange={e => setFsForm(f => ({ ...f, funding_source_name: e.target.value }))} />
                        <select className="border rounded px-2 py-1.5 text-xs" value={fsForm.funding_type} onChange={e => setFsForm(f => ({ ...f, funding_type: e.target.value as FundingType }))}>
                          {(Object.keys(FUNDING_TYPE_LABELS) as FundingType[]).map(k => <option key={k} value={k}>{FUNDING_TYPE_LABELS[k]}</option>)}
                        </select>
                        <input type="number" min={0} className="border rounded px-2 py-1.5 text-xs" placeholder="Số tiền (đồng)" value={fsForm.funding_amount} onChange={e => setFsForm(f => ({ ...f, funding_amount: Number(e.target.value) }))} />
                        <input type="number" className="border rounded px-2 py-1.5 text-xs" placeholder="Năm" value={fsForm.funding_year ?? ''} onChange={e => setFsForm(f => ({ ...f, funding_year: e.target.value ? Number(e.target.value) : undefined }))} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowFsForm(null)} className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50">Hủy</button>
                        <button type="submit" className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700">Thêm</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Chỉnh sửa kế hoạch ngân sách' : 'Thêm kế hoạch ngân sách'} onClose={() => { setShowForm(false); setEditing(null) }}>
          <BudgetForm initial={editing} onSave={handleSave} onClose={() => { setShowForm(false); setEditing(null) }} projects={projects} />
        </Modal>
      )}
    </div>
  )
}

// ─── Disbursement Tab ─────────────────────────────────────────────────────────

function DisbursementForm({ onSave, onClose, budgets }: {
  onSave: (data: DisbursementCreate) => Promise<void>
  onClose: () => void
  budgets: BudgetPlan[]
}) {
  const [form, setForm] = useState<DisbursementCreate>({
    budget_plan_id: budgets[0]?.id ?? 0,
    disbursement_date: new Date().toISOString().split('T')[0],
    disbursement_amount: 0,
  })
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Kế hoạch ngân sách <span className="text-red-500">*</span></label>
        <select required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.budget_plan_id} onChange={e => setForm(f => ({ ...f, budget_plan_id: Number(e.target.value) }))}>
          {budgets.map(b => <option key={b.id} value={b.id}>{b.budget_code ?? `#${b.id}`} — Năm {b.fiscal_year}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mã giải ngân</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.disbursement_code ?? ''} onChange={e => setForm(f => ({ ...f, disbursement_code: e.target.value || undefined }))} placeholder="GN2026-001" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ngày giải ngân <span className="text-red-500">*</span></label>
          <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.disbursement_date} onChange={e => setForm(f => ({ ...f, disbursement_date: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền giải ngân (đồng) <span className="text-red-500">*</span></label>
        <input required type="number" min={0} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.disbursement_amount} onChange={e => setForm(f => ({ ...f, disbursement_amount: Number(e.target.value) }))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú / chứng từ</label>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.note ?? ''} onChange={e => setForm(f => ({ ...f, note: e.target.value || undefined }))} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 border rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Hủy</button>
        <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}Ghi nhận
        </button>
      </div>
    </form>
  )
}

function DisbursementTab() {
  const { user } = useAuthStore()
  const canDelete = user?.role === 'admin' || user?.role === 'leader'
  const [items, setItems] = useState<Disbursement[]>([])
  const [total, setTotal] = useState(0)
  const [budgets, setBudgets] = useState<BudgetPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [budgetFilter, setBudgetFilter] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, b] = await Promise.all([
        strategicApi.listDisbursements({ budget_plan_id: budgetFilter, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
        strategicApi.listBudgetPlans({ limit: 200 }),
      ])
      setItems(d.items); setTotal(d.total)
      setBudgets(b.items)
    } finally { setLoading(false) }
  }, [budgetFilter, page])

  useEffect(() => { load() }, [load])

  const handleSave = async (data: DisbursementCreate) => {
    await strategicApi.createDisbursement(data)
    setShowForm(false); load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa khoản giải ngân này?')) return
    await strategicApi.deleteDisbursement(id); load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const budgetMap = Object.fromEntries(budgets.map(b => [b.id, b.budget_code ?? `#${b.id}`]))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={budgetFilter ?? ''} onChange={e => { setBudgetFilter(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}>
          <option value="">Tất cả kế hoạch</option>
          {budgets.map(b => <option key={b.id} value={b.id}>{b.budget_code ?? `#${b.id}`} — Năm {b.fiscal_year}</option>)}
        </select>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">
          <Plus size={15} /> Ghi nhận giải ngân
        </button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-400">Chưa có khoản giải ngân nào</div>
        ) : items.map(d => (
          <div key={d.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                {d.disbursement_code && <p className="text-xs font-mono text-gray-400 mb-1">{d.disbursement_code}</p>}
                <p className="font-semibold text-blue-600">{fmt(d.disbursement_amount)} đ</p>
                <p className="text-xs text-gray-500 mt-1">{d.disbursement_date}</p>
                <p className="text-xs text-gray-400">KH: {budgetMap[d.budget_plan_id] ?? `#${d.budget_plan_id}`}</p>
              </div>
              {canDelete && <button onClick={() => handleDelete(d.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-500" /></button>}
            </div>
            {d.note && <p className="text-xs text-gray-500 mt-2 border-t pt-2">{d.note}</p>}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Mã</th>
                <th className="px-4 py-3 text-left">Kế hoạch NS</th>
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3 text-left">Ghi chú</th>
                <th className="px-4 py-3 text-left">Người tạo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Chưa có khoản giải ngân</td></tr>
              ) : items.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.disbursement_code ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{budgetMap[d.budget_plan_id] ?? `#${d.budget_plan_id}`}</td>
                  <td className="px-4 py-3 text-xs">{d.disbursement_date}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-600">{fmt(d.disbursement_amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{d.note ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{d.creator?.full_name ?? d.creator?.username ?? '—'}</td>
                  <td className="px-4 py-3">
                    {canDelete && <button onClick={() => handleDelete(d.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 size={14} className="text-red-500" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Tổng: {total} khoản giải ngân</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">‹</button>
            <span className="px-3 py-1">{page}/{totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">›</button>
          </div>
        </div>
      )}

      {showForm && (
        <Modal title="Ghi nhận giải ngân" onClose={() => setShowForm(false)}>
          <DisbursementForm onSave={handleSave} onClose={() => setShowForm(false)} budgets={budgets} />
        </Modal>
      )}
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<StrategicDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    strategicApi.getDashboardStats().then(setStats).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
  if (!stats) return null

  const statusChartData = Object.entries(stats.by_status).map(([k, v]) => ({
    name: PROJECT_STATUS_LABELS[k as ProjectStatus] ?? k, value: v,
  }))
  const typeChartData = Object.entries(stats.by_type).map(([k, v]) => ({
    name: PROJECT_TYPE_LABELS[k as ProjectType] ?? k, value: v,
  }))

  return (
    <div className="space-y-6">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Tổng dự án" value={stats.total_projects} icon={FolderKanban} color="bg-blue-500" />
        <StatCard label="Đang thực hiện" value={stats.active_projects} icon={TrendingUp} color="bg-green-500" />
        <StatCard label="Hoàn thành" value={stats.completed_projects} icon={Target} color="bg-indigo-500" />
        <StatCard label="Tạm dừng" value={stats.on_hold_projects} icon={Layers} color="bg-amber-500" />
        <StatCard label="Quá hạn" value={stats.overdue_projects} icon={AlertTriangle} color="bg-red-500" />
      </div>

      {/* Budget summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng ngân sách" value={fmt(stats.total_budget)} sub="đồng" icon={DollarSign} color="bg-blue-500" />
        <StatCard label="Đã phân bổ" value={fmt(stats.total_allocated)} sub="đồng" icon={BarChart2} color="bg-purple-500" />
        <StatCard label="Đã giải ngân" value={fmt(stats.total_spent)} sub={`${stats.disbursement_rate}%`} icon={TrendingUp} color="bg-orange-500" />
        <StatCard label="Còn lại" value={fmt(stats.total_remaining)} sub="đồng" icon={DollarSign} color="bg-green-500" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">Tỷ lệ giải ngân tổng thể</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <ProgressBar value={stats.disbursement_rate} color={stats.disbursement_rate >= 80 ? 'bg-green-500' : stats.disbursement_rate >= 50 ? 'bg-blue-500' : 'bg-amber-500'} />
            </div>
            <span className="text-2xl font-bold text-gray-800 w-16 text-right">{stats.disbursement_rate}%</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-3">Tiến độ trung bình</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <ProgressBar value={stats.avg_progress} color={stats.avg_progress >= 80 ? 'bg-green-500' : stats.avg_progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'} />
            </div>
            <span className="text-2xl font-bold text-gray-800 w-16 text-right">{stats.avg_progress}%</span>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Dự án theo trạng thái</p>
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
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Dự án theo loại</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={typeChartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Dự án" radius={[4, 4, 0, 0]}>
                {typeChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Slow projects */}
      {stats.top_slow_projects.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-red-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-500" />
            <p className="text-sm font-semibold text-gray-700">Dự án chậm tiến độ cần chú ý</p>
          </div>
          <div className="space-y-3">
            {stats.top_slow_projects.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{p.project_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <ProgressBar value={p.progress_percent} color="bg-red-400" />
                    <span className="text-xs text-gray-500 w-10 shrink-0">{p.progress_percent}%</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Badge label={PRIORITY_LABELS[p.priority_level]} cls={PRIORITY_COLOR[p.priority_level]} />
                  <p className="text-xs text-gray-400 mt-1">→ {p.end_date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'projects' | 'budget' | 'disbursement'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { id: 'projects', label: 'Dự án', icon: FolderKanban },
  { id: 'budget', label: 'Ngân sách', icon: DollarSign },
  { id: 'disbursement', label: 'Giải ngân', icon: TrendingUp },
]

export default function StrategicPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <BookOpen className="text-blue-600" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dự án Chiến lược & Kinh phí</h1>
            <p className="text-sm text-gray-500">Quản lý dự án, ngân sách và giải ngân</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'projects' && <ProjectsTab />}
        {activeTab === 'budget' && <BudgetTab />}
        {activeTab === 'disbursement' && <DisbursementTab />}
      </div>
    </AppLayout>
  )
}
