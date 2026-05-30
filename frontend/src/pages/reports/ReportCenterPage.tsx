import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadBlob, reportApi } from '../../api/report'
import AppLayout from '../../components/layout/AppLayout'
import type { ReportList, ReportType } from '../../types/report'
import { REPORT_TYPE_LABELS } from '../../types/report'

// ── Helpers ──────────────────────────────────────────────────────────────────

const THIS_YEAR  = new Date().getFullYear()
const THIS_MONTH = new Date().getMonth() + 1

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_CLS: Record<string, string> = {
  generating: 'bg-blue-100 text-blue-700 animate-pulse',
  done:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  generating: '⏳ Đang tạo...',
  done:       '✅ Hoàn thành',
  failed:     '❌ Lỗi',
}

const REPORT_TYPE_ICONS: Record<string, string> = {
  monthly: '📅', quarterly: '📊', annual: '📋', kpi: '🎯', executive: '👔', nq57: '📜',
}

type PeriodMode = 'month' | 'quarter' | 'year' | 'custom'

function getPeriodDates(mode: PeriodMode, year: number, month: number, quarter: number, customFrom: string, customTo: string): { from: string; to: string } {
  if (mode === 'month') {
    const lastDay = new Date(year, month, 0).getDate()
    return { from: `${year}-${String(month).padStart(2, '0')}-01`, to: `${year}-${String(month).padStart(2, '0')}-${lastDay}` }
  }
  if (mode === 'quarter') {
    const m1 = (quarter - 1) * 3 + 1
    const m3 = m1 + 2
    const lastDay = new Date(year, m3, 0).getDate()
    return { from: `${year}-${String(m1).padStart(2, '0')}-01`, to: `${year}-${String(m3).padStart(2, '0')}-${lastDay}` }
  }
  if (mode === 'year') {
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
  return { from: customFrom, to: customTo }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportCenterPage() {
  const navigate = useNavigate()
  const [tab, setTab]         = useState<'create' | 'history'>('create')
  const [reports, setReports] = useState<ReportList[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)

  // Create form state
  const [reportType, setReportType] = useState<ReportType>('monthly')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [year, setYear]       = useState(THIS_YEAR)
  const [month, setMonth]     = useState(THIS_MONTH)
  const [quarter, setQuarter] = useState(Math.ceil(THIS_MONTH / 3))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const r = await reportApi.list()
      setReports(r.data.items)
    } catch {
      setFetchError('Không thể tải danh sách báo cáo. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadReports() }, [loadReports])

  // Poll while any report is generating
  useEffect(() => {
    const active = reports.some(r => r.status === 'generating')
    if (active && !pollRef.current) {
      pollRef.current = setInterval(loadReports, 3000)
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [reports, loadReports])

  // Auto-set period mode based on report type
  useEffect(() => {
    if (reportType === 'monthly')   setPeriodMode('month')
    if (reportType === 'quarterly') setPeriodMode('quarter')
    if (reportType === 'annual' || reportType === 'nq57') setPeriodMode('year')
    if (reportType === 'kpi' || reportType === 'executive') setPeriodMode('custom')
  }, [reportType])

  async function handleCreate() {
    const { from, to } = getPeriodDates(periodMode, year, month, quarter, customFrom, customTo)
    if (!from || !to) { alert('Vui lòng nhập khoảng thời gian'); return }

    setCreating(true)
    try {
      await reportApi.create({ report_type: reportType, period_from: from, period_to: to })
      setTab('history')
      await loadReports()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Lỗi tạo báo cáo')
    } finally {
      setCreating(false)
    }
  }

  async function handleResetStuck() {
    try {
      const r = await reportApi.resetStuck()
      alert(r.data.message)
      await loadReports()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Lỗi khi đặt lại báo cáo')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa báo cáo này?')) return
    await reportApi.remove(id)
    setReports(prev => prev.filter(r => r.id !== id))
  }

  async function handleDownload(id: number, fmt: 'docx' | 'xlsx') {
    setDownloading(id)
    try {
      const r = fmt === 'docx' ? await reportApi.exportDocx(id) : await reportApi.exportXlsx(id)
      const rpt = reports.find(x => x.id === id)
      const ext = fmt === 'docx' ? '.docx' : '.xlsx'
      const name = `${rpt?.period_label || 'bao-cao'}${ext}`.replace(/\s+/g, '_')
      downloadBlob(r.data as Blob, name)
    } catch (e: any) {
      alert(e?.response?.data?.detail || `Lỗi xuất ${fmt.toUpperCase()}`)
    } finally {
      setDownloading(null)
    }
  }

  const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - 2 + i)

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            📊 Trung tâm Báo cáo
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Tự động tổng hợp dữ liệu IOC — sinh báo cáo, phân tích KPI, xuất file
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'create',  label: '➕ Tạo báo cáo' },
            { key: 'history', label: `📋 Lịch sử (${reports.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Create tab ──────────────────────────────────────────────────── */}
        {tab === 'create' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-2xl">
            <h2 className="font-semibold text-slate-700 mb-5">Tạo báo cáo mới</h2>

            {/* Report type */}
            <div className="mb-5">
              <label className="text-xs font-medium text-slate-500 mb-2 block">Loại báo cáo</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(REPORT_TYPE_LABELS) as [ReportType, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setReportType(key)}
                    className={`p-3 rounded-xl border-2 text-sm font-medium text-left transition-all ${
                      reportType === key
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-100 hover:border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="mr-1.5">{REPORT_TYPE_ICONS[key]}</span>{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Period */}
            <div className="mb-6">
              <label className="text-xs font-medium text-slate-500 mb-2 block">Kỳ báo cáo</label>

              <div className="flex gap-2 mb-3">
                {(['month', 'quarter', 'year', 'custom'] as PeriodMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setPeriodMode(m)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                      periodMode === m ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {{ month: 'Tháng', quarter: 'Quý', year: 'Năm', custom: 'Tùy chọn' }[m]}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 flex-wrap">
                {periodMode !== 'custom' && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Năm</label>
                    <select value={year} onChange={e => setYear(+e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}
                {periodMode === 'month' && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Tháng</label>
                    <select value={month} onChange={e => setMonth(+e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={m}>Tháng {m}</option>
                      ))}
                    </select>
                  </div>
                )}
                {periodMode === 'quarter' && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Quý</label>
                    <select value={quarter} onChange={e => setQuarter(+e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <option value={1}>Quý I</option>
                      <option value={2}>Quý II</option>
                      <option value={3}>Quý III</option>
                      <option value={4}>Quý IV</option>
                    </select>
                  </div>
                )}
                {periodMode === 'custom' && (
                  <>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Từ ngày</label>
                      <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Đến ngày</label>
                      <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </>
                )}
              </div>

              {/* Preview */}
              {periodMode !== 'custom' && (
                <p className="mt-2 text-xs text-slate-400">
                  Kỳ: <strong className="text-slate-600">{
                    (() => {
                      const { from, to } = getPeriodDates(periodMode, year, month, quarter, '', '')
                      return `${new Date(from).toLocaleDateString('vi-VN')} – ${new Date(to).toLocaleDateString('vi-VN')}`
                    })()
                  }</strong>
                </p>
              )}
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {creating ? '⏳ Đang tạo báo cáo...' : '🚀 Tạo báo cáo'}
            </button>

            <p className="text-center text-slate-400 text-xs mt-3">
              AI sẽ tự động phân tích dữ liệu và sinh nhận xét — thường mất 3–10 giây
            </p>
          </div>
        )}

        {/* ── History tab ──────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-slate-700">Lịch sử báo cáo</h2>
              <div className="flex items-center gap-2">
                {reports.some(r => r.status === 'generating') && (
                  <button
                    onClick={handleResetStuck}
                    className="text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-medium"
                    title="Đặt lại tất cả báo cáo đang kẹt ở trạng thái Đang tạo"
                  >
                    🔧 Reset báo cáo kẹt
                  </button>
                )}
                <button onClick={loadReports} className="text-xs text-slate-400 hover:text-slate-700">↻ Làm mới</button>
              </div>
            </div>

            {fetchError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="shrink-0" />
                {fetchError}
              </div>
            )}

            {loading && reports.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Đang tải...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <div className="text-4xl mb-2">📭</div>
                <p>Chưa có báo cáo nào. Tạo báo cáo đầu tiên!</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-4 py-3 text-slate-500 font-medium">Báo cáo</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Kỳ</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Trạng thái</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Thời gian</th>
                      <th className="px-4 py-3 text-slate-500 font-medium">Xuất file</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reports.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{REPORT_TYPE_ICONS[r.report_type]}</span>
                            <div>
                              <p
                                className="font-medium text-slate-800 hover:text-indigo-600 cursor-pointer"
                                onClick={() => r.status === 'done' && navigate(`/bao-cao/${r.id}`)}
                              >
                                {r.title}
                              </p>
                              <p className="text-slate-400 text-xs">{REPORT_TYPE_LABELS[r.report_type]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.period_label}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLS[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                          {r.error_msg && (
                            <p className="text-red-500 text-xs mt-0.5 truncate max-w-[180px]">{r.error_msg}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          <div>{fmtDate(r.created_at)}</div>
                          {r.generated_at && <div className="text-green-500">✓ {fmtDate(r.generated_at)}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {r.status === 'done' && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleDownload(r.id, 'docx')}
                                disabled={downloading === r.id}
                                className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                                title="Tải Word"
                              >
                                📝 DOCX
                              </button>
                              <button
                                onClick={() => handleDownload(r.id, 'xlsx')}
                                disabled={downloading === r.id}
                                className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                                title="Tải Excel"
                              >
                                📊 XLSX
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {r.status === 'done' && (
                              <button
                                onClick={() => navigate(`/bao-cao/${r.id}`)}
                                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                              >
                                Xem →
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="text-xs text-slate-400 hover:text-red-500 px-1"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
