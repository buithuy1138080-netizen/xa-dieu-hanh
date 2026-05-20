import { ArrowDown, ArrowUp, Minus, Zap } from 'lucide-react'
import type { TaskPriority } from '../../types/task'

const config: Record<TaskPriority, { label: string; icon: React.ElementType; cls: string }> = {
  low:    { label: 'Thấp',  icon: ArrowDown, cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
  medium: { label: 'TB',    icon: Minus,     cls: 'bg-sky-50 text-sky-600 ring-1 ring-sky-200' },
  high:   { label: 'Cao',   icon: ArrowUp,   cls: 'bg-orange-50 text-orange-600 ring-1 ring-orange-200' },
  urgent: { label: 'Khẩn', icon: Zap,       cls: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
}

export default function PriorityBadge({ priority }: { priority: string }) {
  const c = config[priority as TaskPriority] ?? { label: priority, icon: Minus, cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200' }
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${c.cls}`}>
      <Icon size={10} className="shrink-0" />
      {c.label}
    </span>
  )
}
