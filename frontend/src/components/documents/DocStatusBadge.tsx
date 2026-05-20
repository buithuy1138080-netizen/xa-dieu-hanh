import type { DocStatus } from '../../types/document'

const CONFIG: Record<DocStatus, { label: string; cls: string }> = {
  pending:    { label: 'Chờ xử lý',  cls: 'bg-slate-100 text-slate-600' },
  processing: { label: 'Đang xử lý', cls: 'bg-amber-100 text-amber-700' },
  done:       { label: 'Đã xử lý',   cls: 'bg-green-100 text-green-700' },
  archived:   { label: 'Lưu trữ',    cls: 'bg-indigo-100 text-indigo-600' },
}

export default function DocStatusBadge({ status }: { status: DocStatus }) {
  const c = CONFIG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  )
}
