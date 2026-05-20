import type { KPIStatus } from '../../types/kpi'

const CONFIG: Record<KPIStatus, { label: string; cls: string; dot: string }> = {
  on_track: { label: 'Đúng tiến độ', cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  at_risk:  { label: 'Có rủi ro',    cls: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  behind:   { label: 'Chậm tiến độ', cls: 'bg-red-100 text-red-600',      dot: 'bg-red-500' },
  completed:{ label: 'Hoàn thành',   cls: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
}

export default function KPIStatusBadge({ status }: { status: KPIStatus }) {
  const c = CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}
