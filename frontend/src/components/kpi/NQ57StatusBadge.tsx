import type { NQ57Status } from '../../types/kpi'

const CONFIG: Record<NQ57Status, { label: string; cls: string }> = {
  pending:     { label: 'Chưa bắt đầu', cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Hoàn thành',    cls: 'bg-green-100 text-green-700' },
  delayed:     { label: 'Chậm tiến độ',  cls: 'bg-red-100 text-red-600' },
}

export default function NQ57StatusBadge({ status }: { status: NQ57Status }) {
  const c = CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}
