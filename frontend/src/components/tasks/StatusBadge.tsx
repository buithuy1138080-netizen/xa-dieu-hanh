import type { TaskStatus } from '../../types/task'

const config: Record<TaskStatus, { label: string; dot: string; cls: string }> = {
  pending:     { label: 'Chờ xử lý',      dot: 'bg-slate-400',   cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  in_progress: { label: 'Đang thực hiện', dot: 'bg-blue-500',    cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  overdue:     { label: 'Quá hạn',        dot: 'bg-orange-500',  cls: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200' },
  completed:   { label: 'Hoàn thành',     dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled:   { label: 'Đã huỷ',         dot: 'bg-red-400',     cls: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
}

export default function StatusBadge({ status }: { status: string }) {
  const c = config[status as TaskStatus] ?? { label: status, dot: 'bg-gray-400', cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}
