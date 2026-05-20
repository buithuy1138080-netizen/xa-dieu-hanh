import { motion } from 'framer-motion'
import {
  AlertTriangle, CheckSquare, Clock, Filter,
  ListChecks, Plus, TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import AppLayout from '../../components/layout/AppLayout'
import PriorityBadge from '../../components/tasks/PriorityBadge'
import StatusBadge from '../../components/tasks/StatusBadge'
import TaskFilters, { type Filters } from '../../components/tasks/TaskFilters'
import TaskForm from '../../components/tasks/TaskForm'
import type { Task, TaskStats } from '../../types/task'

const EMPTY_FILTERS: Filters = { search: '', status: '', priority: '', assignee_id: '', overdue_only: false }

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function sourceTag(task: Task) {
  if (task.directive_id) return { label: 'Chỉ đạo', cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' }
  if (task.incoming_document_id) return { label: 'VB đến', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' }
  if (task.outgoing_document_id) return { label: 'VB đi', cls: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' }
  return { label: 'Trực tiếp', cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' }
}

function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  const colors = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#0284c7','#be185d']
  return colors[Math.abs(h) % colors.length]
}

const STAT_CARDS = (stats: TaskStats) => [
  {
    label: 'Tổng nhiệm vụ', value: stats.total, icon: ListChecks,
    iconBg: 'bg-blue-100', iconCl: 'text-blue-600',
    valueCl: 'text-slate-800', border: 'border-l-blue-500',
  },
  {
    label: 'Đang thực hiện', value: stats.in_progress, icon: Clock,
    iconBg: 'bg-amber-100', iconCl: 'text-amber-600',
    valueCl: 'text-slate-800', border: 'border-l-amber-500',
  },
  {
    label: 'Hoàn thành', value: stats.completed, icon: CheckSquare,
    iconBg: 'bg-emerald-100', iconCl: 'text-emerald-600',
    valueCl: 'text-emerald-700', border: 'border-l-emerald-500',
  },
  {
    label: 'Quá hạn', value: stats.overdue, icon: AlertTriangle,
    iconBg: 'bg-red-100', iconCl: 'text-red-600',
    valueCl: 'text-red-700', border: 'border-l-red-500',
  },
  {
    label: 'Tiến độ TB', value: `${stats.avg_progress}%`, icon: TrendingUp,
    iconBg: 'bg-indigo-100', iconCl: 'text-indigo-600',
    valueCl: 'text-indigo-700', border: 'border-l-indigo-500',
  },
]

export default function TaskListPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchTasks = useCallback(async (f: Filters, p: number) => {
    setLoading(true)
    setFetchError(null)
    try {
      const { data } = await tasksApi.list({
        page: p, page_size: 20,
        status: f.status || undefined,
        priority: f.priority || undefined,
        assignee_id: f.assignee_id ? parseInt(f.assignee_id) : undefined,
        search: f.search || undefined,
        overdue_only: f.overdue_only || undefined,
      })
      setTasks(data.items)
      setTotal(data.total)
      setPages(data.pages)
    } catch {
      setFetchError('Không thể tải danh sách nhiệm vụ. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshStats = () => tasksApi.stats().then((r) => setStats(r.data)).catch(() => {})

  useEffect(() => { refreshStats() }, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => fetchTasks(filters, page), 280)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [filters, page, fetchTasks])

  function handleFiltersChange(f: Filters) { setFilters(f); setPage(1) }

  async function handleDelete(id: number) {
    if (!confirm('Xóa nhiệm vụ này?')) return
    await tasksApi.delete(id)
    fetchTasks(filters, page)
    refreshStats()
  }

  function closeForm() { setShowForm(false); setEditTask(null) }

  const pageNumbers = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
    if (page <= 4) return [1,2,3,4,5,'…',pages]
    if (page >= pages - 3) return [1,'…',pages-4,pages-3,pages-2,pages-1,pages]
    return [1,'…',page-1,page,page+1,'…',pages]
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
              <CheckSquare size={20} className="text-blue-600" />
              Quản lý Nhiệm vụ
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">{total} nhiệm vụ</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/30"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Tạo nhiệm vụ</span>
            <span className="sm:hidden">Tạo</span>
          </button>
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {STAT_CARDS(stats).map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${c.border} p-4 shadow-sm hover:shadow-md transition-shadow`}
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

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-2.5">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <TaskFilters
            filters={filters}
            onChange={handleFiltersChange}
            onReset={() => { setFilters(EMPTY_FILTERS); setPage(1) }}
          />
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {fetchError}
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {loading && Array.from({length: 4}).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
          {!loading && tasks.map((task) => {
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
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditTask(task); setShowForm(true) }}
                      className="px-2.5 py-1 text-[11px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >Sửa</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(task.id) }}
                      className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    >Xóa</button>
                  </div>
                </div>
              </motion.div>
            )
          })}
          {!loading && tasks.length === 0 && (
            <div className="flex flex-col items-center gap-3 text-slate-400 py-16">
              <ListChecks size={36} className="opacity-30" />
              <p className="text-sm font-medium">Không có nhiệm vụ nào</p>
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Mã NV','Tiêu đề','Nguồn','Trạng thái','Ưu tiên','Tiến độ','Hạn xử lý','Đơn vị CT','Thực hiện',''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && Array.from({length: 5}).map((_, i) => (
                <tr key={i}>
                  {Array.from({length: 9}).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-3.5 bg-slate-100 rounded-full animate-pulse" style={{width: `${40 + Math.random()*40}%`}} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && tasks.length === 0 && (
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
              {!loading && tasks.map((task, idx) => {
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
                      <button
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        className="text-slate-800 hover:text-blue-600 font-semibold text-left line-clamp-1 text-[13px] transition-colors"
                      >
                        {task.title}
                      </button>
                      {task.is_overdue && (
                        <div className="flex items-center gap-1 text-red-500 text-[10px] mt-0.5 font-medium">
                          <AlertTriangle size={9} />
                          Quá hạn
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
                          <div
                            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                            style={{ width: `${task.progress_percent}%` }}
                          />
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
                            {(task.assignee_staff?.full_name ?? task.assignee?.full_name ?? task.assignee?.username ?? '?').slice(0,2).toUpperCase()}
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
                        <button
                          onClick={() => { setEditTask(task); setShowForm(true) }}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>{/* end desktop table */}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Hiển thị {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} / {total} nhiệm vụ
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600"
              >
                ‹
              </button>
              {pageNumbers().map((p, i) => (
                p === '…'
                  ? <span key={`ellipsis-${i}`} className="px-2 text-slate-400">…</span>
                  : <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 text-sm rounded-lg border transition-all font-medium ${
                        p === page
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {p}
                    </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 hover:border-slate-300 transition-all text-slate-600"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <TaskForm
          task={editTask ?? undefined}
          onClose={closeForm}
          onSuccess={() => { closeForm(); fetchTasks(filters, page); refreshStats() }}
        />
      )}
    </AppLayout>
  )
}
