import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { directivesApi } from '../../api/directives'
import DirectivePriorityBadge from '../../components/directives/DirectivePriorityBadge'
import DirectiveStatusBadge from '../../components/directives/DirectiveStatusBadge'
import DirectiveForm from '../../components/directives/DirectiveForm'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'
import { isAdminOrLeader } from '../../types'
import type { DirectiveCreate, DirectivePriority, DirectiveRead, DirectiveStatus } from '../../types/directive'

const STATUS_TABS: { value: DirectiveStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'active', label: 'Đang thực hiện' },
  { value: 'draft', label: 'Nháp' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const PRIORITY_OPTS: { value: DirectivePriority | ''; label: string }[] = [
  { value: '', label: 'Mọi ưu tiên' },
  { value: 'normal', label: 'Thường' },
  { value: 'urgent', label: 'Khẩn' },
  { value: 'very_urgent', label: 'Hỏa tốc' },
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isOverdue(deadline: string | null, status: DirectiveStatus) {
  if (!deadline || status === 'completed' || status === 'cancelled') return false
  return new Date(deadline) < new Date()
}

export default function DirectiveListPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)
  const canManage = isAdminOrLeader(currentUser)
  const [items, setItems] = useState<DirectiveRead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState<DirectiveStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<DirectivePriority | ''>('')

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 20

  const load = useCallback(async (
    p = 1,
    q = search,
    st = statusTab,
    pr = priorityFilter,
  ) => {
    setLoading(true)
    setFetchError(null)
    try {
      const { data } = await directivesApi.list({
        page: p, size: SIZE,
        search: q || undefined,
        status: st || undefined,
        priority: pr || undefined,
      })
      setItems(data.items)
      setTotal(data.total)
      setPage(p)
    } catch {
      setFetchError('Không thể tải danh sách chỉ đạo. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [search, statusTab, priorityFilter])

  useEffect(() => { load(1) }, [statusTab, priorityFilter])

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  async function handleCreate(data: DirectiveCreate) {
    setSaving(true)
    try {
      const { data: d } = await directivesApi.create(data)
      setShowForm(false)
      navigate(`/directives/${d.id}`)
    } finally {
      setSaving(false)
    }
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">📋</div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-800">Chỉ đạo điều hành</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {loading ? 'Đang tải...' : `${total} chỉ đạo`}
              </p>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
            >
              <span className="hidden sm:inline">+ Tạo chỉ đạo</span>
              <span className="sm:hidden">+ Tạo</span>
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatusTab(t.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusTab === t.value
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search + filter */}
        <div className="flex gap-2 md:gap-3 items-center">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tiêu đề, nội dung..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as DirectivePriority | '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600"
          >
            {PRIORITY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {fetchError}
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {loading && <div className="text-center py-8 text-slate-400">Đang tải...</div>}
          {!loading && items.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-3xl mb-2">📭</p><p>Không có chỉ đạo nào</p>
            </div>
          )}
          {!loading && items.map((item) => {
            const overdue = isOverdue(item.deadline, item.status)
            return (
              <div
                key={item.id}
                onClick={() => navigate(`/directives/${item.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm active:scale-[0.99] transition-transform"
              >
                <p className="font-semibold text-slate-800 text-sm line-clamp-2 mb-2">{item.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <DirectiveStatusBadge status={item.status} />
                  <DirectivePriorityBadge priority={item.priority} />
                  {item.deadline && (
                    <span className={`text-[11px] font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(item.deadline)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${item.progress}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400">{item.progress}%</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tiêu đề</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Ưu tiên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Người chỉ đạo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Ngày ban hành</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Hạn hoàn thành</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Tiến độ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">Đang tải...</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-slate-400">Không có chỉ đạo nào</p>
                  </td>
                </tr>
              )}
              {!loading && items.map((item) => {
                const overdue = isOverdue(item.deadline, item.status)
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/directives/${item.id}`)}
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-slate-800 line-clamp-2 leading-snug">{item.title}</p>
                      {item.content && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.content}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DirectiveStatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <DirectivePriorityBadge priority={item.priority} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {item.issuer.full_name ?? item.issuer.username}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {fmtDate(item.issued_date)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {item.deadline ? (
                        <span className={overdue ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                          {fmtDate(item.deadline)}
                          {overdue && ' ⚠'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-8 text-right">{item.progress}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Trang {page}/{pages} · {total} chỉ đạo</span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
              >‹ Trước</button>
              <button
                disabled={page >= pages}
                onClick={() => load(page + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
              >Sau ›</button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Tạo chỉ đạo mới</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <DirectiveForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
