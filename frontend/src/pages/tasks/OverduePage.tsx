import { AlertTriangle, CheckCircle2, Calendar, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import AppLayout from '../../components/layout/AppLayout'
import PriorityBadge from '../../components/tasks/PriorityBadge'
import StatusBadge from '../../components/tasks/StatusBadge'
import type { Task } from '../../types/task'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function daysOverdue(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff === 0) return 'Hôm nay'
  if (diff < 0) return 'Chưa hạn'
  return `${diff} ngày`
}

function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  const colors = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#0284c7','#be185d']
  return colors[Math.abs(h) % colors.length]
}

export default function OverduePage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    tasksApi.overdue()
      .then((r) => setTasks(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-800">Nhiệm vụ Quá Hạn</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {loading ? 'Đang tải...' : tasks.length === 0
                  ? 'Tất cả nhiệm vụ đang trong tiến độ'
                  : `${tasks.length} nhiệm vụ chưa hoàn thành và đã quá hạn`
                }
              </p>
            </div>
          </div>

          {!loading && tasks.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs font-semibold">
              <AlertTriangle size={11} />
              {tasks.length} quá hạn
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200" />
                <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-t-red-500 animate-spin" />
              </div>
              <p className="text-sm text-slate-400">Đang tải...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && tasks.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} className="text-emerald-500" />
            </div>
            <p className="text-emerald-700 font-semibold text-lg">Không có nhiệm vụ quá hạn!</p>
            <p className="text-emerald-600 text-sm mt-1.5">Tất cả nhiệm vụ đang trong tiến độ tốt</p>
          </div>
        )}

        {/* Mobile cards */}
        {!loading && tasks.length > 0 && (
          <div className="md:hidden space-y-2">
            {tasks.map((task) => {
              const days = task.due_date ? Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000) : 0
              const assigneeName = task.assignee?.full_name ?? task.assignee?.username
              return (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  className="bg-white rounded-xl border border-red-100 p-4 shadow-sm active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{task.task_code ?? `#${task.id}`}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${days > 7 ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-orange-500'}`}>
                      {task.due_date ? daysOverdue(task.due_date) : '—'}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm line-clamp-2 mb-2">{task.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                    {task.due_date && (
                      <span className="text-[11px] text-red-500 font-medium">{fmtDate(task.due_date)}</span>
                    )}
                    {assigneeName && (
                      <span className="text-[11px] text-slate-500">{assigneeName}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Desktop Table */}
        {!loading && tasks.length > 0 && (
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            <div className="bg-red-50/60 border-b border-red-100 px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-400" />
              <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">Danh sách nhiệm vụ quá hạn</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Mã NV</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Nhiệm vụ</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Trạng thái</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Ưu tiên</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Hạn xử lý</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Quá hạn</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Thực hiện</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tasks.map((task) => {
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
                          <button
                            onClick={() => navigate(`/tasks/${task.id}`)}
                            className="text-left font-medium text-slate-700 hover:text-blue-600 line-clamp-1 transition-colors"
                          >
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
                                {(assigneeName).split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
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
      </div>
    </AppLayout>
  )
}
