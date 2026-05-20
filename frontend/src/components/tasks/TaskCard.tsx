import { Calendar, ClipboardList, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Task, TaskPriority, TaskStatus } from '../../types/task'

const priorityBorder: Record<TaskPriority, string> = {
  low:    'border-l-slate-300',
  medium: 'border-l-sky-400',
  high:   'border-l-orange-400',
  urgent: 'border-l-red-500',
}

const priorityDot: Record<TaskPriority, string> = {
  low:    'bg-slate-300',
  medium: 'bg-sky-400',
  high:   'bg-orange-400',
  urgent: 'bg-red-500',
}

const statusRing: Record<TaskStatus, string> = {
  pending:     'ring-slate-200 bg-slate-50/50',
  in_progress: 'ring-blue-200 bg-blue-50/30',
  completed:   'ring-emerald-200 bg-emerald-50/30',
  cancelled:   'ring-red-200 bg-red-50/20',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function initials(name: string | null, username: string) {
  return (name ?? username).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  const colors = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#0284c7','#be185d']
  return colors[Math.abs(h) % colors.length]
}

function SourceIcon({ task }: { task: Task }) {
  if (task.directive_id) return <ClipboardList size={10} className="text-purple-400" />
  if (task.incoming_document_id || task.outgoing_document_id) return <FileText size={10} className="text-blue-400" />
  return null
}

interface Props {
  task: Task
  onDragStart: (e: React.DragEvent, taskId: number) => void
}

export default function TaskCard({ task, onDragStart }: Props) {
  const navigate = useNavigate()
  const priority = task.priority as TaskPriority
  const status = task.status as TaskStatus

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => navigate(`/tasks/${task.id}`)}
      className={`
        group relative bg-white rounded-xl border-l-4 ${priorityBorder[priority] ?? 'border-l-slate-300'}
        border border-slate-200/80 ring-1 ${statusRing[status] ?? ''}
        p-3.5 cursor-pointer select-none
        hover:shadow-lg hover:shadow-slate-200/60 hover:-translate-y-0.5
        transition-all duration-200 ease-out
      `}
    >
      {/* Task code */}
      {task.task_code && (
        <div className="flex items-center gap-1.5 mb-2">
          <SourceIcon task={task} />
          <span className="font-mono text-[10px] text-slate-400 tracking-wide">{task.task_code}</span>
          <div className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[priority] ?? 'bg-slate-300'}`} />
        </div>
      )}

      {/* Title */}
      <p className="text-[13px] font-semibold text-slate-800 line-clamp-2 leading-snug mb-3 group-hover:text-blue-700 transition-colors">
        {task.title}
      </p>

      {/* Progress bar */}
      {task.progress_percent > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400">Tiến độ</span>
            <span className="text-[10px] font-semibold text-slate-600">{task.progress_percent}%</span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${task.progress_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          {task.is_overdue ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md ring-1 ring-red-200">
              <Calendar size={9} />
              Quá hạn
            </span>
          ) : task.due_date ? (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <Calendar size={9} />
              {fmtDate(task.due_date)}
            </span>
          ) : null}
        </div>

        {task.assignee && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm ring-1 ring-white"
            style={{ backgroundColor: colorHash(task.assignee.username) }}
            title={task.assignee.full_name ?? task.assignee.username}
          >
            {initials(task.assignee.full_name, task.assignee.username)}
          </div>
        )}
      </div>
    </div>
  )
}
