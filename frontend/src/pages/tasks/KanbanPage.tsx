import { motion } from 'framer-motion'
import { CheckCircle2, CircleDashed, Columns3, Plus, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { tasksApi } from '../../api/tasks'
import AppLayout from '../../components/layout/AppLayout'
import TaskCard from '../../components/tasks/TaskCard'
import TaskForm from '../../components/tasks/TaskForm'
import type { Task, TaskStatus } from '../../types/task'

const COLUMNS: {
  id: TaskStatus
  label: string
  icon: React.ElementType
  headerCls: string
  countCls: string
  zoneCls: string
  overCls: string
}[] = [
  {
    id: 'pending',
    label: 'Chờ xử lý',
    icon: CircleDashed,
    headerCls: 'bg-slate-50 border-slate-200 text-slate-600',
    countCls: 'bg-slate-200 text-slate-600',
    zoneCls: 'bg-slate-50/40',
    overCls: 'bg-slate-100 border-slate-300 border-dashed',
  },
  {
    id: 'in_progress',
    label: 'Đang thực hiện',
    icon: Columns3,
    headerCls: 'bg-blue-50 border-blue-200 text-blue-700',
    countCls: 'bg-blue-200 text-blue-700',
    zoneCls: 'bg-blue-50/30',
    overCls: 'bg-blue-50 border-blue-300 border-dashed',
  },
  {
    id: 'completed',
    label: 'Hoàn thành',
    icon: CheckCircle2,
    headerCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    countCls: 'bg-emerald-200 text-emerald-700',
    zoneCls: 'bg-emerald-50/20',
    overCls: 'bg-emerald-50 border-emerald-300 border-dashed',
  },
  {
    id: 'cancelled',
    label: 'Đã huỷ',
    icon: XCircle,
    headerCls: 'bg-red-50 border-red-200 text-red-600',
    countCls: 'bg-red-100 text-red-600',
    zoneCls: 'bg-red-50/20',
    overCls: 'bg-red-50 border-red-300 border-dashed',
  },
]

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showError(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchAll() {
    setLoading(true)
    try {
      const { data } = await tasksApi.list({ page_size: 200 })
      setTasks(data.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  function handleDragStart(e: React.DragEvent, taskId: number) {
    setDraggingId(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, col: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(col)
  }

  function handleDragLeave() {
    setDragOverCol(null)
  }

  async function handleDrop(e: React.DragEvent, newStatus: TaskStatus) {
    e.preventDefault()
    setDragOverCol(null)
    if (!draggingId) return
    const task = tasks.find((t) => t.id === draggingId)
    if (!task || task.status === newStatus) { setDraggingId(null); return }
    setTasks((prev) => prev.map((t) => t.id === draggingId ? { ...t, status: newStatus } : t))
    setDraggingId(null)
    try {
      await tasksApi.updateStatus(draggingId, newStatus)
    } catch {
      fetchAll()
      showError('Cập nhật trạng thái thất bại. Đã hoàn nguyên.')
    }
  }

  const grouped = (status: TaskStatus) => tasks.filter((t) => t.status === status)

  return (
    <AppLayout>
      {toast && (
        <div className="fixed bottom-20 right-3 md:bottom-6 md:right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white bg-red-500">
          {toast}
        </div>
      )}
      <div className="p-4 md:p-6 h-full flex flex-col gap-4 md:gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
              <Columns3 size={20} className="text-blue-600" />
              Kanban Board
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-0.5 hidden sm:block">{tasks.length} nhiệm vụ · kéo thả để thay đổi trạng thái</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-500/30"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Tạo nhiệm vụ</span>
            <span className="sm:hidden">Tạo</span>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Đang tải...</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 md:gap-4 flex-1 overflow-x-auto pb-2 snap-x snap-mandatory">
            {COLUMNS.map((col, idx) => {
              const Icon = col.icon
              const colTasks = grouped(col.id)
              const isOver = dragOverCol === col.id
              const isDragging = draggingId !== null

              return (
                <motion.div
                  key={col.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex flex-col w-[240px] sm:w-[280px] shrink-0 snap-start"
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                >
                  {/* Column header */}
                  <div className={`flex items-center gap-2.5 px-3.5 py-3 rounded-t-2xl border ${col.headerCls} mb-0`}>
                    <Icon size={15} className="shrink-0 opacity-70" />
                    <span className="text-sm font-bold flex-1">{col.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.countCls}`}>
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Drop zone */}
                  <div
                    className={`
                      flex-1 rounded-b-2xl border-x border-b border-slate-200/80 p-2 space-y-2.5
                      min-h-[120px] transition-all duration-150 ${col.zoneCls}
                      ${isOver ? col.overCls + ' scale-[1.01]' : ''}
                      ${isDragging && !isOver ? 'opacity-80' : ''}
                    `}
                  >
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

      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); fetchAll() }}
        />
      )}
    </AppLayout>
  )
}
