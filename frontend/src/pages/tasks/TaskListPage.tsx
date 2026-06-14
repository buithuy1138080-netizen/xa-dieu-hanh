import { motion } from 'framer-motion'
import {
  AlertTriangle, Calendar, CheckCircle2, CheckSquare, CircleDashed,
  Clock, Columns3, Download, FileSpreadsheet, Filter, ListChecks,
  Plus, TrendingUp, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { departmentsApi } from '../../api/departments'
import type { DeptRead } from '../../api/departments'
import { programsApi } from '../../api/programs'
import type { Program } from '../../api/programs'
import { tasksApi } from '../../api/tasks'
import { getApiErrorMessage } from '../../utils/apiError'
import ExcelImportModal from '../../components/common/ExcelImportModal'
import AppLayout from '../../components/layout/AppLayout'
import PriorityBadge from '../../components/tasks/PriorityBadge'
import StatusBadge from '../../components/tasks/StatusBadge'
import TaskCard from '../../components/tasks/TaskCard'
import TaskFilters, { type Filters } from '../../components/tasks/TaskFilters'
import TaskForm from '../../components/tasks/TaskForm'
import type { Task, TaskStats, TaskStatus } from '../../types/task'
import { useAuthStore } from '../../store/authStore'

type View = 'list' | 'kanban' | 'overdue'

const EMPTY_FILTERS: Filters = {
  search: '', status: '', priority: '', assignee_id: '',
  lead_dept_id: '', program_id: '', overdue_only: false,
  date_from: '', date_to: '',
}

const KANBAN_COLS: {
  id: TaskStatus; label: string; icon: React.ElementType
  headerCls: string; countCls: string; zoneCls: string; overCls: string
}[] = [
  {
    id: 'pending', label: 'Chờ xử lý', icon: CircleDashed,
    headerCls: 'bg-slate-50 border-slate-200 text-slate-600',
    countCls: 'bg-slate-200 text-slate-600',
    zoneCls: 'bg-slate-50/40',
    overCls: 'bg-slate-100 border-slate-300 border-dashed',
  },
  {
    id: 'in_progress', label: 'Đang thực hiện', icon: Columns3,
    headerCls: 'bg-blue-50 border-blue-200 text-blue-700',
    countCls: 'bg-blue-200 text-blue-700',
    zoneCls: 'bg-blue-50/30',
    overCls: 'bg-blue-50 border-blue-300 border-dashed',
  },
  {
    id: 'completed', label: 'Hoàn thành', icon: CheckCircle2,
    headerCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    countCls: 'bg-emerald-200 text-emerald-700',
    zoneCls: 'bg-emerald-50/20',
    overCls: 'bg-emerald-50 border-emerald-300 border-dashed',
  },
  {
    id: 'overdue', label: 'Quá hạn', icon: AlertTriangle,
    headerCls: 'bg-orange-50 border-orange-200 text-orange-700',
    countCls: 'bg-orange-100 text-orange-700',
    zoneCls: 'bg-orange-50/20',
    overCls: 'bg-orange-50 border-orange-300 border-dashed',
  },
  {
    id: 'cancelled', label: 'Đã huỷ', icon: XCircle,
    headerCls: 'bg-red-50 border-red-200 text-red-600',
    countCls: 'bg-red-100 text-red-600',
    zoneCls: 'bg-red-50/20',
    overCls: 'bg-red-50 border-red-300 border-dashed',
  },
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysOverdue(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff <= 0) return 'Hôm nay'
  return `${diff} ngày`
}

function sourceTag(task: Task) {
  if (task.directive_id)                          return { label: 'Chỉ đạo',   cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' }
  if (task.incoming_document_id)                  return { label: 'VB đến',    cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' }
  if (task.outgoing_document_id)                  return { label: 'VB đi',     cls: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' }
  if (task.program_id)                            return { label: 'CT/NQ',     cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' }
  if (task.project_ids && task.project_ids.length > 0) return { label: 'Dự án CL', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' }
  return                                                 { label: 'Trực tiếp', cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' }
}

function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#0284c7','#be185d'][Math.abs(h) % 7]
}

const STAT_CARDS = (stats: TaskStats) => [
  { label: 'Tổng nhiệm vụ', value: stats.total,       icon: ListChecks,    iconBg: 'bg-blue-100',    iconCl: 'text-blue-600',    valueCl: 'text-slate-800',   border: 'border-l-blue-500',    filterStatus: '' },
  { label: 'Đang thực hiện', value: stats.in_progress, icon: Clock,         iconBg: 'bg-amber-100',   iconCl: 'text-amber-600',   valueCl: 'text-slate-800',   border: 'border-l-amber-500',   filterStatus: 'in_progress' },
  { label: 'Hoàn thành',    value: stats.completed,   icon: CheckSquare,   iconBg: 'bg-emerald-100', iconCl: 'text-emerald-600', valueCl: 'text-emerald-700', border: 'border-l-emerald-500', filterStatus: 'completed' },
  { label: 'Quá hạn',       value: stats.overdue,     icon: AlertTriangle, iconBg: 'bg-red-100',     iconCl: 'text-red-600',     valueCl: 'text-red-700',     border: 'border-l-red-500',     filterStatus: 'overdue' },
  { label: 'Tiến độ TB',    value: `${stats.avg_progress}%`, icon: TrendingUp, iconBg: 'bg-indigo-100', iconCl: 'text-indigo-600', valueCl: 'text-indigo-700', border: 'border-l-indigo-500', filterStatus: null },
]

// ── View toggle button ──────────────────────────────────────────────────────
function ViewBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export default function TaskListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const canDelete = user?.role === 'admin' || user?.role === 'leader'
  function canEditTask(task: Task): boolean {
    if (user?.role === 'admin' || user?.role === 'leader') return true
    // Nhân viên chỉ được sửa nhiệm vụ do chính mình tạo ra
    if (user?.role === 'staff') return task.created_by === user?.id
    // Manager: nhiệm vụ của đơn vị mình (backend kiểm tra thêm)
    return task.created_by === user?.id
  }

  // ── View ──
  const [view, setView] = useState<View>(() => {
    const v = searchParams.get('view')
    if (v === 'kanban' || v === 'overdue') return v
    return 'list'
  })

  // ── Shared ──
  const [stats, setStats]         = useState<TaskStats | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editTask, setEditTask]   = useState<Task | null>(null)
  const [departments, setDepartments] = useState<DeptRead[]>([])
  const [programs, setPrograms]   = useState<Program[]>([])
  const [toast, setToast]         = useState<string | null>(null)

  // ── List view ──
  const [tasks, setTasks]         = useState<Task[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [filters, setFilters]     = useState<Filters>(() => {
    const pid = searchParams.get('program')
    return { ...EMPTY_FILTERS, program_id: pid ?? '' }
  })
  const [listLoading, setListLoading] = useState(false)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [exporting, setExporting]     = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Kanban view ──
  const [kanbanTasks, setKanbanTasks]     = useState<Task[]>([])
  const [kanbanLoading, setKanbanLoading] = useState(false)
  const [draggingId, setDraggingId]       = useState<number | null>(null)
  const [dragOverCol, setDragOverCol]     = useState<TaskStatus | null>(null)

  // ── Overdue view ──
  const [overdueTasks, setOverdueTasks]     = useState<Task[]>([])
  const [overdueLoading, setOverdueLoading] = useState(false)

  // ── Data fetchers ──
  const fetchList = useCallback(async (f: Filters, p: number) => {
    setListLoading(true)
    setFetchError(null)
    try {
      const { data } = await tasksApi.list({
        page: p, page_size: 20,
        status:        f.status       || undefined,
        priority:      f.priority     || undefined,
        assignee_id:   f.assignee_id  ? parseInt(f.assignee_id)  : undefined,
        lead_dept_id:  f.lead_dept_id ? parseInt(f.lead_dept_id) : undefined,
        program_id:    f.program_id   ? parseInt(f.program_id)   : undefined,
        search:        f.search       || undefined,
        overdue_only:  f.overdue_only || undefined,
        due_after:     f.date_from    || undefined,
        due_before:    f.date_to      || undefined,
      })
      setTasks(data.items)
      setTotal(data.total)
      setPages(data.pages)
    } catch {
      setFetchError('Không thể tải danh sách nhiệm vụ. Vui lòng thử lại.')
    } finally {
      setListLoading(false)
    }
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await tasksApi.exportExcel({
        status:       filters.status       || undefined,
        priority:     filters.priority     || undefined,
        assignee_id:  filters.assignee_id  ? parseInt(filters.assignee_id)  : undefined,
        lead_dept_id: filters.lead_dept_id ? parseInt(filters.lead_dept_id) : undefined,
        program_id:   filters.program_id   ? parseInt(filters.program_id)   : undefined,
        search:       filters.search       || undefined,
        overdue_only: filters.overdue_only || undefined,
        due_after:    filters.date_from    || undefined,
        due_before:   filters.date_to      || undefined,
      })
    } catch {
      showToast('Xuất file thất bại. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchKanban = useCallback(async () => {
    setKanbanLoading(true)
    try {
      const { data } = await tasksApi.list({ page_size: 200 })
      setKanbanTasks(data.items)
    } catch {
      showToast('Không thể tải dữ liệu kanban. Vui lòng thử lại.')
    } finally {
      setKanbanLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOverdue = useCallback(async () => {
    setOverdueLoading(true)
    try {
      const { data } = await tasksApi.overdue()
      setOverdueTasks(data)
    } catch {
      showToast('Không thể tải danh sách quá hạn. Vui lòng thử lại.')
    } finally {
      setOverdueLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshStats = () => tasksApi.stats().then((r) => setStats(r.data)).catch(() => {})

  // ── Mount ──
  useEffect(() => { refreshStats() }, [])
  useEffect(() => { departmentsApi.list().then((r) => setDepartments(r.data)).catch(() => {}) }, [])
  useEffect(() => { programsApi.list({ status: 'active' }).then((r) => setPrograms(r.data)).catch(() => {}) }, [])

  // ── Fetch on view / filter change ──
  useEffect(() => {
    if (view !== 'list') return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => fetchList(filters, page), 280)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [view, filters, page, fetchList])

  useEffect(() => { if (view === 'kanban') fetchKanban() }, [view, fetchKanban])
  useEffect(() => { if (view === 'overdue') fetchOverdue() }, [view, fetchOverdue])

  // ── View switcher ──
  function changeView(v: View) {
    setView(v)
    if (v === 'list') setSearchParams(searchParams.get('program') ? { program: searchParams.get('program')! } : {})
    else setSearchParams({ view: v })
  }

  // ── List actions ──
  function handleFiltersChange(f: Filters) { setFilters(f); setPage(1) }

  async function handleDelete(id: number) {
    if (!confirm('Xóa nhiệm vụ này?')) return
    try {
      await tasksApi.delete(id)
      fetchList(filters, page)
      refreshStats()
    } catch (err) {
      showToast(getApiErrorMessage(err))
    }
  }

  function closeForm() { setShowForm(false); setEditTask(null) }

  const pageNumbers = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
    if (page <= 4) return [1,2,3,4,5,'…',pages]
    if (page >= pages - 3) return [1,'…',pages-4,pages-3,pages-2,pages-1,pages]
    return [1,'…',page-1,page,page+1,'…',pages]
  }

  // ── Kanban drag-drop ──
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggingId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, col: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(col)
  }

  async function handleDrop(e: React.DragEvent, newStatus: TaskStatus) {
    e.preventDefault()
    setDragOverCol(null)
    if (!draggingId) return
    const task = kanbanTasks.find((t) => t.id === draggingId)
    if (!task || task.status === newStatus) { setDraggingId(null); return }
    setKanbanTasks((prev) => prev.map((t) => t.id === draggingId ? { ...t, status: newStatus } : t))
    setDraggingId(null)
    try {
      await tasksApi.updateStatus(draggingId, newStatus)
      refreshStats()
    } catch {
      fetchKanban()
      showToast('Cập nhật trạng thái thất bại. Đã hoàn nguyên.')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      {toast && (
        <div className="fixed bottom-20 right-3 md:bottom-6 md:right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white bg-red-500">
          {toast}
        </div>
      )}

      <div className={`p-4 md:p-6 space-y-4 md:space-y-5 ${view === 'kanban' ? 'h-full flex flex-col' : ''}`}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
              <CheckSquare size={20} className="text-blue-600" />
              Quản lý Nhiệm vụ
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {view === 'list'    && `${total} nhiệm vụ`}
              {view === 'kanban'  && `${kanbanTasks.length} nhiệm vụ · kéo thả để thay đổi trạng thái`}
              {view === 'overdue' && (overdueLoading ? 'Đang tải...' : `${overdueTasks.length} nhiệm vụ quá hạn`)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
              <ViewBtn active={view === 'list'}    onClick={() => changeView('list')}    icon={ListChecks}    label="Danh sách" />
              <ViewBtn active={view === 'kanban'}  onClick={() => changeView('kanban')}  icon={Columns3}      label="Kanban" />
              <ViewBtn active={view === 'overdue'} onClick={() => changeView('overdue')} icon={AlertTriangle} label="Quá hạn" />
            </div>

            {view === 'list' && (
              <>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-60"
                >
                  <Download size={15} className="text-blue-500" />
                  {exporting ? 'Đang xuất...' : 'Xuất Excel'}
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" />
                  Import
                </button>
              </>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/30"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Tạo nhiệm vụ</span>
              <span className="sm:hidden">Tạo</span>
            </button>
          </div>
        </div>

        <ExcelImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          module="tasks"
          moduleName="Nhiệm vụ"
          templateFileName="mau_import_nhiem_vu.xlsx"
          onSuccess={() => { setShowImport(false); fetchList(filters, page) }}
        />

        {/* ── Stat cards (list + overdue views) ── */}
        {view !== 'kanban' && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {STAT_CARDS(stats).map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  if (c.filterStatus === null) return
                  if (c.filterStatus === 'overdue') {
                    changeView('overdue')
                  } else {
                    changeView('list')
                    handleFiltersChange({ ...EMPTY_FILTERS, status: c.filterStatus })
                  }
                }}
                className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${c.border} p-4 shadow-sm hover:shadow-md transition-shadow ${
                  c.filterStatus !== null ? 'cursor-pointer hover:ring-2 hover:ring-blue-300 active:scale-[0.98]' : ''
                } ${
                  view === 'list' && filters.status === c.filterStatus && c.filterStatus ? 'ring-2 ring-blue-400' : ''
                } ${
                  view === 'overdue' && c.filterStatus === 'overdue' ? 'ring-2 ring-red-400' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
                    <c.icon size={17} className={c.iconCl} />
                  </div>
                  <div>
                    <p className={`text-xl font-bold leading-none ${c.valueCl}`}>{c.value}</p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-none">{c.label}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ══════════════ LIST VIEW ══════════════ */}
        {view === 'list' && (
          <>
            {/* Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-2.5">
              <Filter size={14} className="text-slate-400 shrink-0" />
              <TaskFilters
                filters={filters}
                onChange={handleFiltersChange}
                onReset={() => { setFilters(EMPTY_FILTERS); setPage(1) }}
                departments={departments}
                programs={programs}
              />
            </div>

            {fetchError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                {fetchError}
              </div>
            )}

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {listLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
              {!listLoading && tasks.map((task) => {
                const src = sourceTag(task)
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm active:scale-[0.99] transition-transform"
                    onClick={() => navigate(`/tasks/${task.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm line-clamp-2">{task.title}</p>
                        {task.is_overdue && (
                          <span className="inline-flex items-center gap-1 text-red-500 text-[10px] font-medium mt-0.5">
                            <AlertTriangle size={9} /> Quá hạn
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${src.cls}`}>{src.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                      {task.due_date && (
                        <span className={`text-[11px] font-medium ${task.is_overdue ? 'text-red-500' : 'text-slate-400'}`}>
                          {fmtDate(task.due_date)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${task.progress_percent}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{task.progress_percent}%</span>
                      </div>
                      <div className="flex gap-1">
                        {canEditTask(task) && (
                          <button onClick={(e) => { e.stopPropagation(); setEditTask(task); setShowForm(true) }}
                            className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">Sửa</button>
                        )}
                        {canDelete && (
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}
                            className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">Xóa</button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
              {!listLoading && tasks.length === 0 && (
                <div className="flex flex-col items-center gap-3 text-slate-400 py-16">
                  <ListChecks size={36} className="opacity-30" />
                  <p className="text-sm font-medium">Không có nhiệm vụ nào</p>
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Mã NV','Tiêu đề','Nguồn','Trạng thái','Ưu tiên','Tiến độ','Hạn xử lý','Đơn vị CT','Thực hiện',''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listLoading && Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3.5">
                          <div className="h-3.5 bg-slate-100 rounded-full animate-pulse" style={{ width: `${40 + (j * 7) % 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!listLoading && tasks.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <ListChecks size={36} className="opacity-30" />
                          <p className="text-sm font-medium">Không có nhiệm vụ nào</p>
                          <p className="text-xs">Thử thay đổi bộ lọc hoặc tạo nhiệm vụ mới</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!listLoading && tasks.map((task, idx) => {
                    const src = sourceTag(task)
                    const assigneeColor = task.assignee_staff
                      ? colorHash(task.assignee_staff.full_name)
                      : task.assignee ? colorHash(task.assignee.username) : '#94a3b8'
                    return (
                      <motion.tr
                        key={task.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        className="hover:bg-blue-50/30 transition-colors group"
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {task.task_code ?? `#${task.id}`}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 max-w-[240px]">
                          <button onClick={() => navigate(`/tasks/${task.id}`)}
                            className="text-slate-800 hover:text-blue-600 font-semibold text-left line-clamp-1 text-[13px] transition-colors">
                            {task.title}
                          </button>
                          {task.is_overdue && (
                            <div className="flex items-center gap-1 text-red-500 text-[10px] mt-0.5 font-medium">
                              <AlertTriangle size={9} /> Quá hạn
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${src.cls}`}>
                            {src.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge status={task.status} /></td>
                        <td className="px-4 py-3.5"><PriorityBadge priority={task.priority} /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2 w-24">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${task.progress_percent}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0 w-7 text-right">{task.progress_percent}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-[12px] font-medium ${task.is_overdue ? 'text-red-500' : 'text-slate-500'}`}>
                            {fmtDate(task.due_date)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-[12px] text-slate-600">
                            {task.lead_department?.short_name ?? task.lead_department?.name ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {(task.assignee_staff ?? task.assignee) ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm"
                                style={{ backgroundColor: assigneeColor }}
                              >
                                {(task.assignee_staff?.full_name ?? task.assignee?.full_name ?? task.assignee?.username ?? '?').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-[12px] text-slate-600 truncate max-w-[80px]">
                                {task.assignee_staff?.full_name ?? task.assignee?.full_name ?? task.assignee?.username}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[12px] text-slate-300">Chưa giao</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEditTask(task) && (
                              <button onClick={() => { setEditTask(task); setShowForm(true) }}
                                className="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                Sửa
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => handleDelete(task.id)}
                                className="px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  Hiển thị {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} / {total} nhiệm vụ
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600">
                    ‹
                  </button>
                  {pageNumbers().map((p, i) => (
                    p === '…'
                      ? <span key={`e${i}`} className="px-2 text-slate-400">…</span>
                      : <button key={p} onClick={() => setPage(p as number)}
                          className={`w-8 h-8 text-sm rounded-lg border transition-all font-medium ${
                            p === page ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                          }`}>
                          {p}
                        </button>
                  ))}
                  <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600">
                    ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════ KANBAN VIEW ══════════════ */}
        {view === 'kanban' && (
          <div className="flex-1 overflow-hidden">
            {kanbanLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-400">Đang tải...</p>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ height: 'calc(100vh - 280px)' }}>
                {KANBAN_COLS.map((col, idx) => {
                  const Icon = col.icon
                  const colTasks = kanbanTasks.filter((t) => t.status === col.id)
                  const isOver = dragOverCol === col.id
                  const isDragging = draggingId !== null
                  return (
                    <motion.div
                      key={col.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex flex-col w-[240px] sm:w-[280px] shrink-0 snap-start h-full"
                      onDragOver={(e) => handleDragOver(e, col.id)}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={(e) => handleDrop(e, col.id)}
                    >
                      <div className={`flex items-center gap-2.5 px-3.5 py-3 rounded-t-2xl border ${col.headerCls}`}>
                        <Icon size={15} className="shrink-0 opacity-70" />
                        <span className="text-sm font-bold flex-1">{col.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.countCls}`}>{colTasks.length}</span>
                      </div>
                      <div className={`
                        flex-1 rounded-b-2xl border-x border-b border-slate-200/80 p-2 space-y-2.5
                        overflow-y-auto transition-all duration-150 ${col.zoneCls}
                        ${isOver ? col.overCls + ' scale-[1.01]' : ''}
                        ${isDragging && !isOver ? 'opacity-80' : ''}
                      `}>
                        {colTasks.length === 0 && !isOver && (
                          <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                            <Icon size={24} className="mb-2 opacity-40" />
                            <p className="text-xs">Kéo thẻ vào đây</p>
                          </div>
                        )}
                        {colTasks.map((task) => (
                          <TaskCard key={task.id} task={task} onDragStart={handleDragStart} />
                        ))}
                        {isOver && (
                          <div className="h-16 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 flex items-center justify-center">
                            <p className="text-xs text-blue-400 font-medium">Thả vào đây</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ OVERDUE VIEW ══════════════ */}
        {view === 'overdue' && (
          <>
            {overdueLoading && (
              <div className="flex items-center justify-center py-16">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200" />
                  <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-t-red-500 animate-spin" />
                </div>
              </div>
            )}

            {!overdueLoading && overdueTasks.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-12 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <p className="text-emerald-700 font-semibold text-lg">Không có nhiệm vụ quá hạn!</p>
                <p className="text-emerald-600 text-sm mt-1.5">Tất cả nhiệm vụ đang trong tiến độ tốt</p>
              </div>
            )}

            {/* Mobile overdue */}
            {!overdueLoading && overdueTasks.length > 0 && (
              <div className="md:hidden space-y-2">
                {overdueTasks.map((task) => {
                  const days = task.due_date ? Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000) : 0
                  const assigneeName = task.assignee?.full_name ?? task.assignee?.username
                  return (
                    <div key={task.id} onClick={() => navigate(`/tasks/${task.id}`)}
                      className="bg-white rounded-xl border border-red-100 p-4 shadow-sm active:scale-[0.99] transition-transform">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                          {task.task_code ?? `#${task.id}`}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${days > 7 ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-orange-500'}`}>
                          {task.due_date ? daysOverdue(task.due_date) : '—'}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 text-sm line-clamp-2 mb-2">{task.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={task.status} />
                        <PriorityBadge priority={task.priority} />
                        {task.due_date && <span className="text-[11px] text-red-500 font-medium">{fmtDate(task.due_date)}</span>}
                        {assigneeName && <span className="text-[11px] text-slate-500">{assigneeName}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Desktop overdue table */}
            {!overdueLoading && overdueTasks.length > 0 && (
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
                <div className="bg-red-50/60 border-b border-red-100 px-4 py-3 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-400" />
                  <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">Danh sách nhiệm vụ quá hạn</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Mã NV','Nhiệm vụ','Trạng thái','Ưu tiên','Hạn xử lý','Quá hạn','Thực hiện'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {overdueTasks.map((task) => {
                        const days = task.due_date ? Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000) : 0
                        const assigneeName = task.assignee?.full_name ?? task.assignee?.username
                        return (
                          <tr key={task.id} className="hover:bg-red-50/20 transition-colors group">
                            <td className="px-4 py-3">
                              <span className="font-mono text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                                {task.task_code ?? `#${task.id}`}
                              </span>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <button onClick={() => navigate(`/tasks/${task.id}`)}
                                className="text-left font-medium text-slate-700 hover:text-blue-600 line-clamp-1 transition-colors">
                                {task.title}
                              </button>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                            <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1 text-xs font-semibold text-red-500">
                                <Calendar size={11} />
                                {task.due_date ? fmtDate(task.due_date) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${days > 7 ? 'bg-red-100 text-red-600 ring-1 ring-red-200' : 'bg-orange-50 text-orange-500 ring-1 ring-orange-200'}`}>
                                <Clock size={10} />
                                {task.due_date ? daysOverdue(task.due_date) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {assigneeName ? (
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 shadow-sm"
                                    style={{ backgroundColor: colorHash(task.assignee?.username ?? '') }}
                                  >
                                    {assigneeName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-xs text-slate-600">{assigneeName}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <TaskForm
          task={editTask ?? undefined}
          onClose={closeForm}
          onSuccess={() => {
            closeForm()
            if (view === 'list') { fetchList(filters, page); refreshStats() }
            else if (view === 'kanban') { fetchKanban(); refreshStats() }
            else { fetchOverdue(); refreshStats() }
          }}
        />
      )}
    </AppLayout>
  )
}
