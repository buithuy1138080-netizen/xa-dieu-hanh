import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, BookOpen, Briefcase, CheckSquare, ChevronDown, ChevronRight,
  Download, ExternalLink, FileText, Filter, Link2, Plus, RefreshCw, Target, Trash2, TrendingUp, X,
} from 'lucide-react'
import { documentsApi } from '../../api/documents'
import { tasksApi } from '../../api/tasks'
import type { DocumentRead } from '../../types/document'
import { documentProgramsApi, programsApi } from '../../api/programs'
import type { Program, ProgramDashboard, ProgramDocument, ProgramKpi, ProgramProject, ProgramTask } from '../../api/programs'
import type { Task } from '../../types/task'
import AppLayout from '../../components/layout/AppLayout'
import TaskForm from '../../components/tasks/TaskForm'
import { useAuthStore } from '../../store/authStore'
import { isManagerOrAbove } from '../../types'

// ── Hằng số ───────────────────────────────────────────────────────────────────

const LINK_TYPE_LABEL: Record<string, string> = {
  implements: 'Triển khai',
  amends: 'Sửa đổi',
  references: 'Tham chiếu',
  reports: 'Báo cáo',
  guides: 'Hướng dẫn',
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  cancelled:   'bg-red-100 text-red-400',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ', in_progress: 'Đang làm', completed: 'Xong', cancelled: 'Huỷ',
}

const KPI_STATUS_COLORS: Record<string, string> = {
  on_track:  'bg-emerald-100 text-emerald-700',
  at_risk:   'bg-amber-100 text-amber-700',
  behind:    'bg-red-100 text-red-600',
  completed: 'bg-blue-100 text-blue-700',
}
const KPI_STATUS_LABELS: Record<string, string> = {
  on_track: 'Đúng tiến độ', at_risk: 'Có rủi ro', behind: 'Chậm', completed: 'Hoàn thành',
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-blue-400', low: 'bg-slate-300',
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function ProgressBar({ value, max = 100, color = 'bg-emerald-500', thin = false }: {
  value: number; max?: number; color?: string; thin?: boolean
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${thin ? 'h-1.5' : 'h-2'}`}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Component chính ───────────────────────────────────────────────────────────

export default function NQ57DashboardPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)
  const canManage = isManagerOrAbove(currentUser)
  const [searchParams] = useSearchParams()

  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dashboard, setDashboard] = useState<ProgramDashboard | null>(null)
  const [dashError, setDashError] = useState(false)
  const [tab, setTab] = useState<'overview' | 'documents' | 'tasks' | 'kpis' | 'reports'>('overview')
  const [loading, setLoading] = useState(true)
  const [loadingDash, setLoadingDash] = useState(false)

  // Tab tasks
  const [tasks, setTasks] = useState<ProgramTask[]>([])
  const [taskTotal, setTaskTotal] = useState(0)
  const [taskPage, setTaskPage] = useState(1)
  const [taskStatus, setTaskStatus] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskOverdue, setTaskOverdue] = useState(false)
  const [taskDept, setTaskDept] = useState<number | ''>('')
  const [depts, setDepts] = useState<{ id: number; name: string; short_name: string | null }[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [exportingTasks, setExportingTasks] = useState(false)

  // Tab KPIs
  const [kpis, setKpis] = useState<ProgramKpi[]>([])
  const [loadingKpis, setLoadingKpis] = useState(false)

  // Tab documents
  const [docs, setDocs] = useState<ProgramDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  // Strategic projects
  const [projects, setProjects] = useState<ProgramProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  // Task-based projects (is_project=true)
  const [taskProjects, setTaskProjects] = useState<Task[]>([])

  // Link document modal
  const [showLinkDoc, setShowLinkDoc] = useState(false)
  const [docSearch, setDocSearch] = useState('')
  const [docResults, setDocResults] = useState<DocumentRead[]>([])
  const [docSearching, setDocSearching] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linkType, setLinkType] = useState('implements')
  const docSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Task create modal
  const [showTaskCreate, setShowTaskCreate] = useState(false)

  // ── Load danh sách programs + departments ────────────────────────────────
  useEffect(() => {
    programsApi.list({ status: 'active' }).then(r => {
      const list = r.data
      setPrograms(list)
      if (list.length > 0) {
        const fromUrl = searchParams.get('program')
        const preselect = fromUrl ? list.find(p => p.id === parseInt(fromUrl)) : null
        const nq = preselect ?? list.find(p => p.program_type === 'nghi_quyet') ?? list[0]
        setSelectedId(nq.id)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    // Load departments for task filter
    import('../../api/client').then(({ default: api }) =>
      api.get('/departments').then((r: any) => setDepts(r.data))
    )
  }, [])

  // ── Load dashboard khi chọn program ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    setLoadingDash(true)
    setDashError(false)
    programsApi.dashboard(selectedId)
      .then(r => setDashboard(r.data))
      .catch(() => setDashError(true))
      .finally(() => setLoadingDash(false))
  }, [selectedId])

  // ── Load sub-tab data ─────────────────────────────────────────────────────
  const loadTasks = useCallback(async (page = 1) => {
    if (!selectedId) return
    setLoadingTasks(true)
    try {
      const r = await programsApi.tasks(selectedId, {
        status: taskStatus || undefined,
        search: taskSearch || undefined,
        overdue_only: taskOverdue || undefined,
        lead_dept_id: taskDept || undefined,
        page, size: 20,
      })
      setTasks(r.data.items)
      setTaskTotal(r.data.total)
      setTaskPage(page)
    } finally {
      setLoadingTasks(false)
    }
  }, [selectedId, taskStatus, taskSearch, taskOverdue, taskDept])

  const handleExportTasks = useCallback(async () => {
    if (!selectedId) return
    setExportingTasks(true)
    try {
      await tasksApi.exportExcel({
        program_id:   selectedId,
        status:       taskStatus   || undefined,
        search:       taskSearch   || undefined,
        overdue_only: taskOverdue  || undefined,
        lead_dept_id: taskDept     ? Number(taskDept) : undefined,
      })
    } finally {
      setExportingTasks(false)
    }
  }, [selectedId, taskStatus, taskSearch, taskOverdue, taskDept])

  const loadKpis = useCallback(async () => {
    if (!selectedId) return
    setLoadingKpis(true)
    programsApi.kpis(selectedId, { size: 100 })
      .then(r => setKpis(r.data.items))
      .finally(() => setLoadingKpis(false))
  }, [selectedId])

  const loadDocs = useCallback(async () => {
    if (!selectedId) return
    setLoadingDocs(true)
    programsApi.documents(selectedId)
      .then(r => setDocs(r.data))
      .finally(() => setLoadingDocs(false))
  }, [selectedId])

  const searchDocs = useCallback(async (q: string) => {
    setDocSearching(true)
    try {
      const r = await documentsApi.list({ search: q || undefined, size: 20 })
      setDocResults(r.data.items)
    } finally {
      setDocSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!showLinkDoc) return
    if (docSearchRef.current) clearTimeout(docSearchRef.current)
    docSearchRef.current = setTimeout(() => searchDocs(docSearch), 350)
    return () => { if (docSearchRef.current) clearTimeout(docSearchRef.current) }
  }, [docSearch, showLinkDoc])

  useEffect(() => {
    if (showLinkDoc) { setDocSearch(''); searchDocs('') }
  }, [showLinkDoc])

  async function handleLinkDoc(docId: number) {
    if (!selectedId) return
    setLinking(true)
    try {
      await documentProgramsApi.link(docId, selectedId, linkType)
      await loadDocs()
      setShowLinkDoc(false)
    } catch {
      alert('Liên kết thất bại, thử lại.')
    } finally {
      setLinking(false)
    }
  }

  async function handleUnlinkDoc(docId: number) {
    if (!selectedId) return
    if (!confirm('Gỡ liên kết văn bản này khỏi chương trình?')) return
    await documentProgramsApi.unlink(docId, selectedId)
    setDocs(prev => prev.filter(d => d.document.id !== docId))
  }

  useEffect(() => {
    if (tab === 'tasks') loadTasks(1)
    else if (tab === 'kpis') loadKpis()
    else if (tab === 'documents') loadDocs()
  }, [tab, selectedId])

  useEffect(() => {
    if (!selectedId) return
    setLoadingProjects(true)
    Promise.all([
      programsApi.projects(selectedId).then(r => r.data).catch(() => []),
      tasksApi.list({ is_project: true, program_id: selectedId, page_size: 50 }).then(r => r.data.items).catch(() => []),
    ]).then(([sp, tp]) => {
      setProjects(sp)
      setTaskProjects(tp)
    }).finally(() => setLoadingProjects(false))
  }, [selectedId])

  useEffect(() => {
    if (tab === 'tasks') {
      const t = setTimeout(() => loadTasks(1), 300)
      return () => clearTimeout(t)
    }
  }, [taskStatus, taskSearch, taskOverdue])

  const selectedProgram = programs.find(p => p.id === selectedId)

  async function handleDeleteProgram() {
    if (!selectedId || !selectedProgram) return
    if (!confirm(`Xóa chương trình "${selectedProgram.name}"?\nCác nhiệm vụ và KPI liên kết sẽ mất liên kết program_id (không bị xóa).`)) return
    await programsApi.delete(selectedId)
    const remaining = programs.filter(p => p.id !== selectedId)
    setPrograms(remaining)
    setDashboard(null)
    setSelectedId(remaining.length > 0 ? remaining[0].id : null)
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (programs.length === 0) {
    return (
      <AppLayout>
        <div className="p-8 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Chưa có chương trình nào</h2>
          <p className="text-sm text-slate-500 mb-4">
            Tạo chương trình / nghị quyết trong mục "Chương trình & Dự án" trước, sau đó quay lại đây để theo dõi tiến độ.
          </p>
          <button
            onClick={() => navigate('/programs')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition"
          >
            <Plus size={15} /> Tạo chương trình
          </button>
        </div>
      </AppLayout>
    )
  }

  const s = dashboard?.stats
  const taskPages = Math.max(1, Math.ceil(taskTotal / 20))

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">

        {/* ── Header + Program selector ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl">🏛</div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Nghị quyết 57</h1>
              <p className="text-xs text-slate-400">Theo dõi chuyển đổi số theo chương trình</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={selectedId ?? ''}
                onChange={e => {
                  setSelectedId(Number(e.target.value))
                  setTab('overview')
                }}
                className="appearance-none pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[220px]"
              >
                {programs.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.short_name || p.code} — {p.name.slice(0, 40)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {canManage && (
              <button
                onClick={() => navigate('/programs')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                <Plus size={13} /> Thêm chương trình
              </button>
            )}
            {canManage && selectedId && (
              <button
                onClick={handleDeleteProgram}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-red-200 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition"
                title="Xóa chương trình này"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── Program info strip ── */}
        {selectedProgram && (
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 shadow-sm">
            <span className="font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{selectedProgram.code}</span>
            {selectedProgram.issuing_body && <span>🏢 {selectedProgram.issuing_body}</span>}
            {selectedProgram.issued_date && <span>📅 Ban hành: {fmtDate(selectedProgram.issued_date)}</span>}
            {selectedProgram.end_date && <span>🎯 Kết thúc: {fmtDate(selectedProgram.end_date)}</span>}
            {selectedProgram.fiscal_year && <span>📆 Năm KH: {selectedProgram.fiscal_year}</span>}
            <span className={`ml-auto px-2.5 py-0.5 rounded-full font-semibold text-[10px] ${
              selectedProgram.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {selectedProgram.status === 'active' ? 'Đang triển khai' : 'Đã đóng'}
            </span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {([
            { key: 'overview',   label: 'Tổng quan',   icon: TrendingUp },
            { key: 'documents',  label: 'Văn bản',     icon: FileText },
            { key: 'tasks',      label: 'Nhiệm vụ',    icon: CheckSquare },
            { key: 'kpis',       label: 'Chỉ tiêu KPI', icon: Target },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={13} /> {label}
              {key === 'tasks' && s && s.task_overdue > 0 && (
                <span className="ml-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {s.task_overdue}
                </span>
              )}
            </button>
          ))}
        </div>

        {loadingDash && (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 1: TỔNG QUAN
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'overview' && !loadingDash && (dashError || !dashboard) && (
          <div className="text-center py-16 text-slate-400 text-sm">
            {dashError ? 'Lỗi tải dữ liệu tổng quan — vui lòng thử lại.' : 'Chưa có dữ liệu.'}
          </div>
        )}

        {tab === 'overview' && !loadingDash && dashboard && (
          <div className="space-y-4">

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Tổng nhiệm vụ', value: s!.task_total,                         icon: '📋', color: 'text-slate-700',   bg: 'bg-slate-50',   onClick: () => { setTaskStatus(''); setTaskOverdue(false); setTab('tasks') } },
                { label: 'Hoàn thành',    value: `${s!.task_done}/${s!.task_total}`,     icon: '✅', color: 'text-emerald-700', bg: 'bg-emerald-50', onClick: () => { setTaskStatus('completed'); setTaskOverdue(false); setTab('tasks') } },
                { label: 'Quá hạn',       value: s!.task_overdue,                        icon: '⚠️', color: 'text-red-600',     bg: 'bg-red-50',     onClick: () => { setTaskStatus(''); setTaskOverdue(true); setTab('tasks') } },
                { label: 'KPI đạt',       value: `${s!.kpi_completed}/${s!.kpi_total}`, icon: '📊', color: 'text-blue-700',   bg: 'bg-blue-50',    onClick: () => setTab('kpis') },
              ].map(c => (
                <div key={c.label} onClick={c.onClick} className={`rounded-2xl p-4 border border-slate-100 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${c.bg}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{c.label}</p>
                      <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                    </div>
                    <span className="text-2xl">{c.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Tiến độ tổng thể */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700">Tiến độ thực hiện</h3>
                <span className="text-lg font-bold text-emerald-600">{s!.task_completion_rate}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${s!.task_total ? (s!.task_done / s!.task_total) * 100 : 0}%` }} title={`Hoàn thành: ${s!.task_done}`} />
                <div className="h-full bg-blue-400 transition-all" style={{ width: `${s!.task_total ? (s!.task_in_progress / s!.task_total) * 100 : 0}%` }} title={`Đang làm: ${s!.task_in_progress}`} />
                <div className="h-full bg-slate-300 transition-all" style={{ width: `${s!.task_total ? (s!.task_pending / s!.task_total) * 100 : 0}%` }} title={`Chờ: ${s!.task_pending}`} />
                <div className="h-full bg-red-400 transition-all" style={{ width: `${s!.task_total ? (s!.task_overdue / s!.task_total) * 100 : 0}%` }} title={`Quá hạn: ${s!.task_overdue}`} />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Hoàn thành ({s!.task_done})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400" />Đang làm ({s!.task_in_progress})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />Chờ ({s!.task_pending})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Quá hạn ({s!.task_overdue})</span>
              </div>
            </div>

            {/* Dự án */}
            {(loadingProjects || projects.length > 0 || taskProjects.length > 0) && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <Briefcase size={14} className="text-blue-500" />
                    Dự án ({projects.length + taskProjects.length})
                  </h3>
                  <button
                    onClick={() => navigate('/projects')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    Xem tất cả <ChevronRight size={12} />
                  </button>
                </div>
                {loadingProjects ? (
                  <div className="text-center py-4 text-slate-400 text-xs">Đang tải...</div>
                ) : (
                  <div className="space-y-2">
                    {/* Strategic projects (cũ) */}
                    {projects.map(p => {
                      const statusColor = p.project_status === 'active' ? 'bg-blue-500'
                        : p.project_status === 'completed' ? 'bg-emerald-500'
                        : p.project_status === 'on_hold' ? 'bg-amber-400' : 'bg-slate-300'
                      const statusLabel: Record<string, string> = {
                        planning: 'Lập kế hoạch', active: 'Đang thực hiện',
                        on_hold: 'Tạm dừng', completed: 'Hoàn thành', cancelled: 'Huỷ',
                      }
                      return (
                        <div
                          key={`sp-${p.id}`}
                          onClick={() => navigate('/strategic')}
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition"
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-medium text-slate-800 truncate flex-1">{p.project_name}</p>
                              <span className="text-[10px] text-slate-400 shrink-0">{statusLabel[p.project_status] ?? p.project_status}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar value={p.progress_percent} color="bg-blue-400" thin />
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0 w-8 text-right">{p.progress_percent}%</span>
                            </div>
                          </div>
                          <ChevronRight size={12} className="text-slate-300 shrink-0" />
                        </div>
                      )
                    })}
                    {/* Task-based projects (mới) */}
                    {taskProjects.map(p => {
                      const statusColor = p.status === 'in_progress' ? 'bg-blue-500'
                        : p.status === 'completed' ? 'bg-emerald-500'
                        : p.is_overdue ? 'bg-red-400' : 'bg-slate-300'
                      const statusLabel: Record<string, string> = {
                        pending: 'Chưa bắt đầu', in_progress: 'Đang thực hiện',
                        completed: 'Hoàn thành', cancelled: 'Huỷ',
                      }
                      return (
                        <div
                          key={`tp-${p.id}`}
                          onClick={() => navigate(`/tasks/${p.id}`)}
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition"
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-medium text-slate-800 truncate flex-1">{p.title}</p>
                              <span className="text-[10px] text-slate-400 shrink-0">{statusLabel[p.status] ?? p.status}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <ProgressBar value={p.progress_percent} color="bg-indigo-400" thin />
                              </div>
                              <span className="text-[10px] text-slate-400 shrink-0 w-8 text-right">{p.progress_percent}%</span>
                            </div>
                          </div>
                          <ChevronRight size={12} className="text-slate-300 shrink-0" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* Tiến độ theo nhóm ưu tiên */}
              {dashboard.groups.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Theo mức ưu tiên</h3>
                  <div className="space-y-3">
                    {dashboard.groups.map(g => (
                      <div key={g.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[g.key] ?? 'bg-slate-300'}`} />
                            <span className="text-slate-600 font-medium">{g.name}</span>
                          </div>
                          <span className="text-slate-400">{g.done}/{g.total} · {g.avg_progress.toFixed(0)}%</span>
                        </div>
                        <ProgressBar value={g.avg_progress} color={
                          g.key === 'urgent' ? 'bg-red-500' : g.key === 'high' ? 'bg-orange-400' : 'bg-emerald-500'
                        } thin />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cảnh báo */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-500" />
                  Cảnh báo ({dashboard.alerts.length})
                </h3>
                {dashboard.alerts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">✅ Không có cảnh báo nào</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {dashboard.alerts.map(a => (
                      <div
                        key={a.task_id}
                        onClick={() => navigate(`/tasks/${a.task_id}`)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer hover:bg-slate-50 transition ${
                          a.alert_type === 'overdue' ? 'border-l-2 border-red-400' : 'border-l-2 border-amber-400'
                        }`}
                      >
                        <span className="text-sm mt-0.5">{a.alert_type === 'overdue' ? '🔴' : '🟡'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{a.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {a.task_code && <span className="mr-1">{a.task_code}</span>}
                            Hạn: {fmtDate(a.due_date)}
                          </p>
                        </div>
                        <ChevronRight size={12} className="text-slate-300 shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Mô tả / Chỉ tiêu */}
            {(selectedProgram?.description || selectedProgram?.target_summary) && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                {selectedProgram.description && (
                  <div className="mb-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Mô tả</p>
                    <p className="text-sm text-slate-600">{selectedProgram.description}</p>
                  </div>
                )}
                {selectedProgram.target_summary && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Chỉ tiêu tổng quát</p>
                    <p className="text-sm text-slate-600 whitespace-pre-line">{selectedProgram.target_summary}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2: VĂN BẢN NGUỒN
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'documents' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{docs.length} văn bản liên kết</p>
              <div className="flex gap-2">
                <button
                  onClick={loadDocs}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw size={12} /> Làm mới
                </button>
                {canManage && (
                  <button
                    onClick={() => setShowLinkDoc(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
                  >
                    <Link2 size={12} /> Liên kết văn bản
                  </button>
                )}
                <button
                  onClick={() => navigate('/documents')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  <ExternalLink size={12} /> Quản lý văn bản
                </button>
              </div>
            </div>

            {loadingDocs ? (
              <div className="text-center py-10 text-slate-400">Đang tải...</div>
            ) : docs.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <FileText size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">Chưa có văn bản nào liên kết</p>
                <p className="text-xs text-slate-400 mt-1">
                  Nhấn "Liên kết văn bản" để gắn văn bản vào chương trình này
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-50">
                  {docs.map(d => (
                    <div key={d.link_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          {d.document.doc_number && (
                            <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {d.document.doc_number}
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            d.link_type === 'implements' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            d.link_type === 'reports'    ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {LINK_TYPE_LABEL[d.link_type] ?? d.link_type}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate">{d.document.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {d.document.doc_type && <span className="mr-2">{d.document.doc_type}</span>}
                          {d.document.issued_date && `Ban hành: ${fmtDate(d.document.issued_date)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => navigate(`/documents/${d.document.id}`)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition"
                        >
                          Xem <ChevronRight size={12} />
                        </button>
                        {canManage && (
                          <button
                            onClick={() => handleUnlinkDoc(d.document.id)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Gỡ liên kết"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 3: NHIỆM VỤ
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'tasks' && (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  placeholder="Tìm nhiệm vụ..."
                  className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <select
                value={taskStatus}
                onChange={e => setTaskStatus(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="pending">Chờ xử lý</option>
                <option value="in_progress">Đang thực hiện</option>
                <option value="completed">Hoàn thành</option>
              </select>
              <select
                value={taskDept}
                onChange={e => setTaskDept(e.target.value ? Number(e.target.value) : '')}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tất cả đơn vị</option>
                {depts.map(d => (
                  <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={taskOverdue}
                  onChange={e => setTaskOverdue(e.target.checked)}
                  className="rounded border-slate-300 text-red-500"
                />
                Quá hạn
              </label>
              <span className="text-xs text-slate-400 ml-auto">{taskTotal} nhiệm vụ</span>
              <button
                onClick={handleExportTasks}
                disabled={exportingTasks}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all disabled:opacity-60"
              >
                <Download size={13} className="text-blue-500" />
                {exportingTasks ? 'Đang xuất...' : 'Xuất Excel'}
              </button>
              {canManage && (
                <button
                  onClick={() => setShowTaskCreate(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
                >
                  <Plus size={13} /> Tạo nhiệm vụ
                </button>
              )}
            </div>

            {loadingTasks ? (
              <div className="text-center py-10 text-slate-400">Đang tải...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <CheckSquare size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">Chưa có nhiệm vụ nào</p>
                <p className="text-xs text-slate-400 mt-1">Tạo nhiệm vụ và gắn vào chương trình này</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-50">
                  {tasks.map(t => (
                    <div
                      key={t.id}
                      onClick={() => navigate(`/tasks/${t.id}`)}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          {t.task_code && <span className="text-xs font-mono text-slate-400">{t.task_code}</span>}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? 'bg-slate-100 text-slate-500'}`}>
                            {STATUS_LABELS[t.status] ?? t.status}
                          </span>
                          {t.is_overdue && (
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                              Quá hạn
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          {t.lead_department && <span>🏢 {t.lead_department.short_name ?? t.lead_department.name}</span>}
                          {t.assignee && <span>👤 {t.assignee.full_name}</span>}
                          {t.due_date && <span className={t.is_overdue ? 'text-red-500 font-medium' : ''}>📅 {fmtDate(t.due_date)}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[80px]">
                        <span className="text-sm font-bold text-slate-700">{t.progress_percent}%</span>
                        <ProgressBar value={t.progress_percent} color={
                          t.status === 'completed' ? 'bg-emerald-500' :
                          t.is_overdue ? 'bg-red-500' : 'bg-blue-400'
                        } thin />
                      </div>
                    </div>
                  ))}
                </div>

                {taskPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-sm text-slate-500">
                    <span>Trang {taskPage}/{taskPages}</span>
                    <div className="flex gap-1">
                      <button disabled={taskPage <= 1} onClick={() => loadTasks(taskPage - 1)}
                        className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-slate-50">‹</button>
                      <button disabled={taskPage >= taskPages} onClick={() => loadTasks(taskPage + 1)}
                        className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-slate-50">›</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 4: CHỈ TIÊU KPI
        ══════════════════════════════════════════════════════════════ */}
        {tab === 'kpis' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{kpis.length} chỉ tiêu KPI</p>
              <button
                onClick={() => navigate(`/kpi?program_id=${selectedId}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700"
              >
                <ExternalLink size={12} /> Quản lý KPI
              </button>
            </div>

            {loadingKpis ? (
              <div className="text-center py-10 text-slate-400">Đang tải...</div>
            ) : kpis.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <Target size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">Chưa có KPI nào cho chương trình này</p>
                <p className="text-xs text-slate-400 mt-1">Nhấn "Quản lý KPI" để tạo KPI và gắn vào chương trình này</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* KPI group by category (fallback: field, then 'Chung') */}
                {(() => {
                  const grouped = kpis.reduce((acc, k) => {
                    const grp = k.category || k.field || 'Chung'
                    if (!acc[grp]) acc[grp] = []
                    acc[grp].push(k)
                    return acc
                  }, {} as Record<string, ProgramKpi[]>)
                  const entries = Object.entries(grouped)
                  return entries
                })().map(([grp, items]) => {
                  const avgPct = items.length ? Math.round(items.reduce((s, k) => s + k.progress, 0) / items.length) : 0
                  const onlyChung = grp === 'Chung' && kpis.every(k => !k.category && !k.field)
                  return (
                  <div key={grp}>
                    {!onlyChung && (
                    <div className="flex items-center justify-between px-5 py-2.5 bg-violet-50 border-b border-violet-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-violet-700">{grp}</span>
                        <span className="text-xs text-violet-500">{items.length} chỉ tiêu</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-20">
                          <ProgressBar value={avgPct} color="bg-violet-400" thin />
                        </div>
                        <span className="text-xs text-violet-600 font-semibold w-8 text-right">{avgPct}%</span>
                      </div>
                    </div>
                    )}
                    <div className="divide-y divide-slate-50">
                      {items.map(k => {
                        const pct = Math.min(100, k.progress)
                        const barColor = pct >= k.threshold_yellow ? 'bg-emerald-500'
                          : pct >= k.threshold_red ? 'bg-amber-400' : 'bg-red-500'
                        return (
                          <div
                            key={k.id}
                            onClick={() => navigate(`/kpi/${k.id}`)}
                            className="px-5 py-3.5 hover:bg-slate-50 transition cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                  <p className="text-sm font-medium text-slate-800 truncate">{k.title}</p>
                                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${KPI_STATUS_COLORS[k.status] ?? 'bg-slate-100 text-slate-500'}`}>
                                    {KPI_STATUS_LABELS[k.status] ?? k.status}
                                  </span>
                                  {k.field && onlyChung && (
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{k.field}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <div className="flex-1 max-w-xs">
                                    <ProgressBar value={pct} color={barColor} thin />
                                  </div>
                                  <span className="text-xs text-slate-500 shrink-0">
                                    {k.current_value} / {k.target_value} {k.unit} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-slate-300 shrink-0 mt-1" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Link Document Modal */}
      {showLinkDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Liên kết văn bản</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Gắn văn bản vào: {programs.find(p => p.id === selectedId)?.name}
                </p>
              </div>
              <button onClick={() => setShowLinkDoc(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex gap-3">
              <input
                autoFocus
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Tìm văn bản theo tên, số hiệu..."
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
              />
              <select
                value={linkType}
                onChange={e => setLinkType(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white focus:outline-none"
              >
                <option value="implements">Triển khai</option>
                <option value="references">Tham chiếu</option>
                <option value="reports">Báo cáo</option>
                <option value="guides">Hướng dẫn</option>
                <option value="amends">Sửa đổi</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {docSearching ? (
                <div className="py-10 text-center text-slate-400 text-sm">Đang tìm...</div>
              ) : docResults.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">Không tìm thấy văn bản</div>
              ) : docResults.map(doc => {
                const alreadyLinked = docs.some(d => d.document.id === doc.id)
                return (
                  <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {doc.doc_number && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                            {doc.doc_number}
                          </span>
                        )}
                        {doc.doc_type && (
                          <span className="text-[10px] text-slate-400">{doc.doc_type}</span>
                        )}
                        {doc.issue_date && (
                          <span className="text-[10px] text-slate-400">{fmtDate(doc.issue_date)}</span>
                        )}
                      </div>
                    </div>
                    {alreadyLinked ? (
                      <span className="text-xs text-emerald-600 font-semibold shrink-0">Đã liên kết</span>
                    ) : (
                      <button
                        disabled={linking}
                        onClick={() => handleLinkDoc(doc.id)}
                        className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Link2 size={12} className="inline mr-1" />Liên kết
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Task Create Modal */}
      {showTaskCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setShowTaskCreate(false) }}
        >
          <div className="min-h-screen flex items-start justify-center p-4 pt-12">
            <TaskForm
              initialProgramId={selectedId}
              onClose={() => setShowTaskCreate(false)}
              onSuccess={() => {
                setShowTaskCreate(false)
                loadTasks(1)
              }}
            />
          </div>
        </div>
      )}
    </AppLayout>
  )
}
