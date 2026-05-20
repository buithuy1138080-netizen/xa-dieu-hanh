import type { DocType } from '../../types/document'

const CONFIG: Record<DocType, { label: string; cls: string }> = {
  incoming: { label: 'Văn bản đến', cls: 'bg-blue-100 text-blue-700' },
  outgoing: { label: 'Văn bản đi', cls: 'bg-purple-100 text-purple-700' },
  internal: { label: 'Nội bộ', cls: 'bg-slate-100 text-slate-600' },
}

export default function DocTypeBadge({ type }: { type: DocType }) {
  const c = CONFIG[type] ?? { label: type, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  )
}
