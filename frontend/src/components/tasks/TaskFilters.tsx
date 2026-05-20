export interface Filters {
  search: string
  status: string
  priority: string
  assignee_id: string
  overdue_only: boolean
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  onReset: () => void
}

export default function TaskFilters({ filters, onChange, onReset }: Props) {
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) => onChange({ ...filters, [key]: val })
  const hasFilter = filters.search || filters.status || filters.priority || filters.assignee_id || filters.overdue_only

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

      <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.overdue_only}
          onChange={(e) => set('overdue_only', e.target.checked)}
          className="rounded border-slate-300 text-red-500 focus:ring-red-400"
        />
        Quá hạn
      </label>

      {hasFilter && (
        <button onClick={onReset} className="text-sm text-slate-500 hover:text-slate-700 underline">
          Xóa bộ lọc
        </button>
      )}
    </div>
  )
}
