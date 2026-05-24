import type { NQ57Status } from '../../types/kpi'

const CONFIG: Record<NQ57Status, { label: string; cls: string; dot: string }> = {
  pending:     { label: 'Chưa bắt đầu', cls: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400' },
  in_progress: { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-500' },
  completed:   { label: 'Hoàn thành',    cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  delayed:     { label: 'Chậm tiến độ',  cls: 'bg-red-100 text-red-600',     dot: 'bg-red-500' },
}

export default function NQ57StatusBadge({ status }: { status: NQ57Status }) {
  const c = CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}
