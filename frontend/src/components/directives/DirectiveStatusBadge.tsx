import type { DirectiveStatus } from '../../types/directive'

const CONFIG: Record<DirectiveStatus, { label: string; cls: string }> = {
  draft:     { label: 'Nháp',         cls: 'bg-slate-100 text-slate-600' },
  active:    { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Hoàn thành',   cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Đã hủy',       cls: 'bg-red-100 text-red-500' },
}

export default function DirectiveStatusBadge({ status }: { status: DirectiveStatus }) {
  const c = CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}
