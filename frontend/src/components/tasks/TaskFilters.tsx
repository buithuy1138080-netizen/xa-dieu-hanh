import type { DeptRead } from '../../api/departments'
import type { Program } from '../../api/programs'

export interface Filters {
  search: string
  status: string
  priority: string
  assignee_id: string
  lead_dept_id: string
  program_id: string
  overdue_only: boolean
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  onReset: () => void
  departments?: DeptRead[]
  programs?: Program[]
}

export default function TaskFilters({ filters, onChange, onReset, departments = [], programs = [] }: Props) {
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) => onChange({ ...filters, [key]: val })
  const hasFilter = filters.search || filters.status || filters.priority || filters.assignee_id || filters.lead_dept_id || filters.program_id

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input
        type="text"
        placeholder="Tìm mã / tiêu đề..."
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <select
        value={filters.status}
        onChange={(e) => set('status', e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Tất cả trạng thái</option>
        <option value="pending">Chờ xử lý</option>
        <option value="in_progress">Đang thực hiện</option>
        <option value="completed">Hoàn thành</option>
        <option value="cancelled">Đã huỷ</option>
        <option value="overdue">⚠ Quá hạn</option>
      </select>

      <select
        value={filters.priority}
        onChange={(e) => set('priority', e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Tất cả ưu tiên</option>
        <option value="urgent">Khẩn</option>
        <option value="high">Cao</option>
        <option value="medium">Trung bình</option>
        <option value="low">Thấp</option>
      </select>

      <select
        value={filters.lead_dept_id}
        onChange={(e) => set('lead_dept_id', e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Tất cả đơn vị</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
        ))}
      </select>

      {programs.length > 0 && (
        <select
          value={filters.program_id}
          onChange={(e) => set('program_id', e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tất cả chương trình</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.short_name ?? p.code ?? `#${p.id}`} — {p.name.slice(0, 40)}</option>
          ))}
        </select>
      )}

      {hasFilter && (
        <button onClick={onReset} className="text-sm text-slate-500 hover:text-slate-700 underline">
          Xóa bộ lọc
        </button>
      )}
    </div>
  )
}
