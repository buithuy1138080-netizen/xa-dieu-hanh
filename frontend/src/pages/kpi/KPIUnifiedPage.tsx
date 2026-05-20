import { AlertTriangle, BarChart3, Layers, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { kpiUnifiedApi, type UnifiedKpiItem, type UnifiedKpiSummary } from '../../api/kpiUnified'

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1]

const STATUS_OPTS = [
  { value: '', label: 'Tất cả' },
  { value: 'completed',   label: 'Đạt mục tiêu' },
  { value: 'on_track',    label: 'Đúng tiến độ' },
  { value: 'at_risk',     label: 'Có rủi ro' },
  { value: 'behind',      label: 'Chậm tiến độ' },
  { value: 'overdue',     label: 'Quá hạn' },
  { value: 'not_started', label: 'Chưa bắt đầu' },
]

const SOURCE_OPTS = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'standard',  label: 'KPI & NQ57' },
  { value: 'strategic', label: 'KPI Chiến lược' },
]

const STATUS_COLOR: Record<string, string> = {
  completed:   'bg-blue-100 text-blue-700',
  on_track:    'bg-green-100 text-green-700',
  at_risk:     'bg-amber-100 text-amber-700',
  behind:      'bg-red-100 text-red-700',
  overdue:     'bg-red-200 text-red-800',
  not_started: 'bg-slate-100 text-slate-500',
}

const STATUS_BAR_COLOR: Record<string, string> = {
  completed:   'bg-blue-500',
  on_track:    'bg-green-500',
  at_risk:     'bg-amber-500',
  behind:      'bg-red-500',
  overdue:     'bg-red-700',
  not_started: 'bg-slate-300',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
        <div
          className={`h-1.5 rounded-full transition-all ${STATUS_BAR_COLOR[status] ?? 'bg-slate-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-9 text-right shrink-0">{value}%</span>
    </div>
  )
}

function SourceBadge({ source }: { source: 'standard' | 'strategic' }) {
  return source === 'strategic'
    ? <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-100 text-purple-700">Chiến lược</span>
    : <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-sky-100 text-sky-700">Tiêu chuẩn</span>
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KPIUnifiedPage() {
  const navigate = useNavigate()

  const [summary, setSummary] = useState<UnifiedKpiSummary | null>(null)
  const [items, setItems] = useState<UnifiedKpiItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [year, setYear] = useState<number | ''>(CURRENT_YEAR)
  const [source, setSource] = useState<'standard' | 'strategic' | ''>('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<'progress' | 'title' | 'year'>('progress')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const SIZE = 20

  // Load summary whenever year changes
  useEffect(() => {
    kpiUnifiedApi.summary(year || undefined)
      .then((r) => setSummary(r.data))
      .catch(() => {})
  }, [year])

  // Load list
  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    kpiUnifiedApi.list({
      page,
      size: SIZE,
      year: year || undefined,
      source: source || undefined,
      status: status || undefined,
      search: search || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
    })
      .then((r) => {
        setItems(r.data.items)
        setTotal(r.data.total)
        setPages(r.data.pages)
      })
      .catch(() => setFetchError('Không thể tải danh sách KPI. Vui lòng thử lại.'))
      .finally(() => setLoading(false))
  }, [page, year, source, status, search, sortBy, sortDir])

  function applySearch() {
    setSearch(searchInput)
    setPage(1)
  }

  function handleSourceClick(v: string) {
    setSource(v as typeof source)
    setPage(1)
  }

  function handleStatusClick(v: string) {
    setStatus(v === status ? '' : v)
    setPage(1)
  }

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(1)
  }

  // Navigate to source detail page
  function goToDetail(item: UnifiedKpiItem) {
    if (item.source === 'strategic') {
      navigate(`/kpi-cl`)
    } else {
      navigate(`/kpi/${item.id}`)
    }
  }

  const byStatus = summary?.by_status ?? {}

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Layers size={20} className="text-indigo-500" />
              KPI Tổng hợp
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Tổng quan tất cả chỉ tiêu KPI từ hai nguồn</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">Năm:</label>
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Tất cả</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* ── Summary cards ── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Tổng KPI" value={summary.total} sub={`${summary.standard_total} TC + ${summary.strategic_total} CL`} color="text-slate-800" />
            <SummaryCard label="Tiến độ TB" value={`${summary.overall_avg_progress}%`} color="text-indigo-600" />
            <SummaryCard label="Đạt / Đúng tiến độ" value={(byStatus.completed ?? 0) + (byStatus.on_track ?? 0)} sub="completed + on_track" color="text-green-600" />
            <SummaryCard label="Rủi ro / Chậm" value={(byStatus.at_risk ?? 0) + (byStatus.behind ?? 0) + (byStatus.overdue ?? 0)} sub="at_risk + behind + overdue" color="text-red-600" />
          </div>
        )}

        {/* ── Status quick-filter chips ── */}
        {summary && (
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTS.filter((o) => o.value === '' || (byStatus[o.value] ?? 0) > 0).map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusClick(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                  status === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'
                }`}
              >
                {opt.label}
                {opt.value && <span className="ml-1 opacity-70">({byStatus[opt.value] ?? 0})</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── Filters row ── */}
        <div className="flex flex-wrap gap-3">
          {/* Source filter */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {SOURCE_OPTS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSourceClick(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex flex-1 min-w-[200px] items-center border border-slate-300 rounded-lg px-3 gap-2 bg-white">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Tìm theo tên KPI..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              className="flex-1 text-sm py-1.5 outline-none text-slate-700"
            />
            {searchInput !== search && (
              <button onClick={applySearch} className="text-xs text-indigo-600 font-medium hover:underline shrink-0">Tìm</button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Nguồn</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <button onClick={() => toggleSort('title')} className="flex items-center gap-1 hover:text-slate-700">
                      Tên KPI
                      {sortBy === 'title' && (sortDir === 'asc' ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Đơn vị PT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Trạng thái</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">
                    <button onClick={() => toggleSort('progress')} className="flex items-center gap-1 hover:text-slate-700">
                      Tiến độ
                      {sortBy === 'progress' && (sortDir === 'asc' ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                    <button onClick={() => toggleSort('year')} className="flex items-center gap-1 hover:text-slate-700">
                      Năm
                      {sortBy === 'year' && (sortDir === 'asc' ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fetchError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0" />
                        {fetchError}
                      </div>
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        Đang tải...
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                      Không có dữ liệu
                    </td>
                  </tr>
                )}
                {!loading && items.map((item) => (
                  <tr
                    key={`${item.source}-${item.id}`}
                    onClick={() => goToDetail(item)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <SourceBadge source={item.source} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {item.code && (
                          <span className="text-[10px] font-mono text-slate-400">{item.code}</span>
                        )}
                        <span className="text-sm text-slate-800 font-medium line-clamp-2 leading-snug">
                          {item.title}
                        </span>
                        {item.category && (
                          <span className="text-[10px] text-slate-400">{item.category}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600">{item.department_name ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLOR[item.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {item.status_display}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar value={item.progress} status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-600">
                        {item.year ?? '—'}
                        {item.quarter != null && <span className="text-slate-400"> / Q{item.quarter}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                {total} KPI · trang {page}/{pages}
              </p>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Trước
                </button>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Per-source breakdown ── */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['standard', 'strategic'] as const).map((src) => {
              const d = summary.by_source[src]
              if (!d) return null
              const label = src === 'standard' ? 'KPI & NQ57 (Tiêu chuẩn)' : 'KPI Chiến lược'
              const badgeClass = src === 'strategic' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
              return (
                <div key={src} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{d.total} KPI</span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <BarChart3 size={14} className="text-slate-400 shrink-0" />
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(100, d.avg_progress)}%` }} />
                    </div>
                    <span className="text-sm font-bold text-indigo-600">{d.avg_progress}%</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(d.by_status).map(([st, cnt]) => (
                      <div key={st} className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${STATUS_COLOR[st] ?? 'bg-slate-100 text-slate-500'}`}>
                        <span>{cnt}</span>
                        <span className="opacity-75">{STATUS_OPTS.find((o) => o.value === st)?.label ?? st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
