import type { DirectivePriority } from '../../types/directive'

const CONFIG: Record<DirectivePriority, { label: string; cls: string }> = {
  normal:     { label: 'Thường',   cls: 'text-slate-500' },
  urgent:     { label: 'Khẩn',     cls: 'text-amber-600 font-semibold' },
  very_urgent: { label: 'Hỏa tốc', cls: 'text-red-600 font-bold' },
}

export default function DirectivePriorityBadge({ priority }: { priority: DirectivePriority }) {
  const c = CONFIG[priority] ?? { label: priority, cls: 'text-slate-500' }
  return <span className={`text-xs ${c.cls}`}>{c.label}</span>
}
