import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { downloadBlob, reportApi } from '../../api/report'
import AppLayout from '../../components/layout/AppLayout'
import type { ReportRead } from '../../types/report'
import { REPORT_TYPE_LABELS } from '../../types/report'

// ── Color palette ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  completed:    '#22c55e',
  in_progress:  '#3b82f6',
  pending:      '#94a3b8',
  overdue:      '#ef4444',
  cancelled:    '#e2e8f0',
}
const KPI_COLORS: Record<string, string> = {
  dat_muc_tieu:  '#22c55e',
  dung_tien_do:  '#3b82f6',
  co_rui_ro:     '#f59e0b',
  cham_tien_do:  '#f97316',
  qua_han:       '#ef4444',
  chua_bat_dau:  '#94a3b8',
}
const KPI_LABELS: Record<string, string> = {
  dat_muc_tieu:  'Đạt mục tiêu',
  dung_tien_do:  'Đúng tiến độ',
  co_rui_ro:     'Có rủi ro',
  cham_tien_do:  'Chậm tiến độ',
  qua_han:       'Quá hạn',
  chua_bat_dau:  'Chưa bắt đầu',
}
const BAR_COLORS = ['#4f46e5', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function pctColor(pct: number) {
  if (pct >= 80) return 'text-green-600'
  if (pct >= 60) return 'text-amber-500'
  return 'text-red-500'
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN')
}

// ── Summary section cards ────────────────────────────────────────────────────
function SummaryCard({ icon, title, value, sub, color = 'indigo' }: {
  icon: string; title: string; value: string | number; sub?: string; color?: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    green:  'bg-green-50 text-green-700 border-green-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
    slate:  'bg-slate-50 text-slate-600 border-slate-100',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color] ?? colorMap.indigo}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium opacity-80">{title}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── AI summary section ────────────────────────────────────────────────────────
function AiSection({ icon, title, content }: { icon: string; title: string; content?: string }) {
  if (!content) return null
  const lines = content.split('\n').filter(Boolean)
  return (
    <div className="space-y-1.5">
      <h4 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
        <span>{icon}</span> {title}
      </h4>
      <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-slate-700 text-sm leading-relaxed">{line}</p>
        ))}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const rptId = Number(id)

  const [report, setReport]     = useState<ReportRead | null>(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'summary' | 'tasks' | 'kpi' | 'overdue'>('summary')
  const [downloading, setDownloading] = useState<'docx' | 'xlsx' | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadReport = useCallback(async () => {
    try {
      const r = await reportApi.get(rptId)
      setReport(r.data)
    } catch {
      navigate('/bao-cao')
    } finally {
      setLoading(false)
    }
  }, [rptId, navigate])

  useEffect(() => { loadReport() }, [loadReport])

  useEffect(() => {
    if (!report) return
    if (report.status === 'generating' && !pollRef.current) {
      pollRef.current = setInterval(loadReport, 2500)
    } else if (report.status !== 'generating' && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [report, loadReport])

  async function handleDownload(fmt: 'docx' | 'xlsx') {
    if (!report) return
    setDownloading(fmt)
    try {
      const r = fmt === 'docx' ? await reportApi.exportDocx(report.id) : await reportApi.exportXlsx(report.id)
      const ext = fmt === 'docx' ? '.docx' : '.xlsx'
      downloadBlob(r.data as Blob, `${report.period_label}${ext}`.replace(/\s+/g, '_'))
    } catch (e: any) {
      alert(e?.response?.data?.detail || `Lỗi xuất ${fmt}`)
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div></AppLayout>
  }
  if (!report) return null

  const data = report.summary_data
  const ai   = report.ai_summary
  const isDone = report.status === 'done'
  const tasks = data?.tasks
  const kpis  = data?.kpis
  const overdue = data?.overdue_tasks ?? []
  const deptBd  = data?.dept_breakdown ?? []

  // ── Donut data: tasks ────────────────────────────────────────────────────
  const taskDonut = tasks ? [
    { name: 'Hoàn thành',     value: tasks.completed,   fill: STATUS_COLORS.completed },
    { name: 'Đang thực hiện', value: tasks.in_progress, fill: STATUS_COLORS.in_progress },
    { name: 'Chờ xử lý',     value: tasks.pending,     fill: STATUS_COLORS.pending },
    { name: 'Quá hạn',       value: tasks.overdue,     fill: STATUS_COLORS.overdue },
  ].filter(d => d.value > 0) : []

  // ── Donut data: KPI ──────────────────────────────────────────────────────
  const kpiDonut = kpis ? Object.entries(kpis.by_status).map(([k, v]) => ({
    name: KPI_LABELS[k] ?? k, value: v, fill: KPI_COLORS[k] ?? '#94a3b8',
  })).filter(d => d.value > 0) : []

  // ── Bar data: departments ────────────────────────────────────────────────
  const deptBarData = deptBd.map(d => ({ name: d.name, total: d.total, done: d.completed, rate: d.rate }))

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <button onClick={() => navigate('/bao-cao')} className="text-slate-400 hover:text-slate-700 text-sm mt-1">
            ← Quay lại
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">{report.title}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {REPORT_TYPE_LABELS[report.report_type]} · {report.period_label} · Tạo {fmtDate(report.created_at)}
            </p>
          </div>
          {isDone && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleDownload('docx')}
                disabled={downloading !== null}
                className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
              >
                {downloading === 'docx' ? '⏳' : '📝'} Tải DOCX
              </button>
              <button
                onClick={() => handleDownload('xlsx')}
                disabled={downloading !== null}
                className="text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium disabled:opacity-60"
              >
                {downloading === 'xlsx' ? '⏳' : '📊'} Tải XLSX
              </button>
            </div>
          )}
        </div>

        {/* Processing state */}
        {report.status === 'generating' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-2 animate-bounce">⚙️</div>
            <p className="text-indigo-700 font-semibold text-lg">AI đang phân tích dữ liệu...</p>
            <p className="text-indigo-500 text-sm mt-1">Đang tổng hợp từ tất cả các module IOC</p>
            <div className="mt-4 w-48 mx-auto bg-indigo-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-500 h-1.5 rounded-full animate-pulse w-2/3" />
            </div>
          </div>
        )}

        {report.status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-red-700 font-semibold">❌ Tạo báo cáo thất bại</p>
            <p className="text-red-600 text-sm mt-1">{report.error_msg}</p>
          </div>
        )}

        {isDone && data && (
          <>
            {/* KPI stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryCard icon="📌" title="Tổng nhiệm vụ"   value={tasks?.total ?? 0}             color="indigo" />
              <SummaryCard icon="✅" title="Hoàn thành"      value={tasks?.completed ?? 0}          color="green"
                sub={`${tasks?.completion_rate ?? 0}%`} />
              <SummaryCard icon="⚡" title="Đang thực hiện"  value={tasks?.in_progress ?? 0}        color="blue" />
              <SummaryCard icon="⏰" title="Quá hạn"         value={tasks?.overdue ?? 0}            color={tasks?.overdue ? 'red' : 'slate'} />
              <SummaryCard icon="🎯" title="KPI bình quân"   value={`${kpis?.avg_pct ?? 0}%`}       color={(kpis?.avg_pct ?? 0) >= 70 ? 'green' : 'amber'} />
              <SummaryCard icon="📄" title="Văn bản"         value={data?.documents?.total ?? 0}    color="slate" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
              {[
                { key: 'summary', label: '📋 Nhận xét AI' },
                { key: 'tasks',   label: '📊 Biểu đồ nhiệm vụ' },
                { key: 'kpi',     label: '🎯 Biểu đồ KPI' },
                { key: 'overdue', label: `⏰ Quá hạn (${overdue.length})` },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as typeof tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t.key ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── AI Summary ───────────────────────────────────────────── */}
            {tab === 'summary' && ai && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <span className="text-2xl">🤖</span>
                  <div>
                    <h3 className="font-bold text-slate-800">Nhận xét tự động của AI</h3>
                    <p className="text-slate-400 text-xs">Phong cách văn bản hành chính Nhà nước · {report.period_label}</p>
                  </div>
                </div>
                <AiSection icon="📌" title="I. TỔNG QUAN CHUNG"                content={ai.tong_quat} />
                <AiSection icon="📈" title="II. ĐÁNH GIÁ TIẾN ĐỘ"             content={ai.danh_gia_tien_do} />
                <AiSection icon="⚠️"  title="III. TỒN TẠI, HẠN CHẾ"            content={ai.ton_tai_han_che} />
                <AiSection icon="🔍" title="IV. NGUYÊN NHÂN"                   content={ai.nguyen_nhan} />
                <AiSection icon="💡" title="V. KIẾN NGHỊ"                      content={ai.kien_nghi} />
                <AiSection icon="🎯" title="VI. NHIỆM VỤ TRỌNG TÂM TIẾP THEO" content={ai.nhiem_vu_trong_tam} />
              </div>
            )}

            {/* ── Task charts ──────────────────────────────────────────── */}
            {tab === 'tasks' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Donut: status */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-semibold text-slate-700 mb-4">Phân bổ trạng thái nhiệm vụ</h3>
                  {taskDonut.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={taskDonut} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {taskDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`${v} nhiệm vụ`]} />
                        <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs text-slate-600">{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-slate-400 text-sm text-center py-8">Không có dữ liệu</p>}

                  {/* Rate ring */}
                  <div className="mt-3 text-center">
                    <span className={`text-3xl font-bold ${pctColor(tasks?.completion_rate ?? 0)}`}>
                      {tasks?.completion_rate ?? 0}%
                    </span>
                    <p className="text-slate-400 text-xs">Tỷ lệ hoàn thành</p>
                  </div>
                </div>

                {/* Bar: by department */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-semibold text-slate-700 mb-4">Theo đơn vị</h3>
                  {deptBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, deptBarData.length * 42)}>
                      <BarChart data={deptBarData} layout="vertical" margin={{ left: 0, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={72} />
                        <Tooltip />
                        <Bar dataKey="done" name="Hoàn thành" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="total" name="Tổng" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-slate-400 text-sm text-center py-8">Không có dữ liệu</p>}
                </div>
              </div>
            )}

            {/* ── KPI charts ───────────────────────────────────────────── */}
            {tab === 'kpi' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Donut: KPI status */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-semibold text-slate-700 mb-4">Phân bổ trạng thái KPI</h3>
                  {kpiDonut.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={kpiDonut} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                          {kpiDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [`${v} KPI`]} />
                        <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs text-slate-600">{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-slate-400 text-sm text-center py-8">Không có KPI</p>}
                  <div className="mt-3 text-center">
                    <span className={`text-3xl font-bold ${pctColor(kpis?.avg_pct ?? 0)}`}>
                      {kpis?.avg_pct ?? 0}%
                    </span>
                    <p className="text-slate-400 text-xs">Bình quân hoàn thành KPI</p>
                  </div>
                </div>

                {/* Bar: by category */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-semibold text-slate-700 mb-4">KPI theo danh mục</h3>
                  {(kpis?.by_category ?? []).length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, (kpis?.by_category?.length ?? 0) * 42)}>
                      <BarChart data={kpis?.by_category} layout="vertical" margin={{ left: 0, right: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={90} />
                        <Tooltip formatter={(v: any) => [`${v}%`, 'Bình quân']} />
                        <Bar dataKey="avg_pct" name="Bình quân %" radius={[0, 4, 4, 0]}>
                          {(kpis?.by_category ?? []).map((_, i) => (
                            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-slate-400 text-sm text-center py-8">Không có dữ liệu</p>}
                </div>
              </div>
            )}

            {/* ── Overdue tasks ────────────────────────────────────────── */}
            {tab === 'overdue' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-700">
                    Nhiệm vụ quá hạn
                    <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{overdue.length}</span>
                  </h3>
                </div>
                {overdue.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <div className="text-3xl mb-2">✅</div>
                    <p>Không có nhiệm vụ quá hạn trong kỳ này!</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-4 py-3 text-slate-500 font-medium">Nhiệm vụ</th>
                        <th className="px-4 py-3 text-slate-500 font-medium">Đơn vị</th>
                        <th className="px-4 py-3 text-slate-500 font-medium">Hạn chót</th>
                        <th className="px-4 py-3 text-slate-500 font-medium">Ngày trễ</th>
                        <th className="px-4 py-3 text-slate-500 font-medium">Ưu tiên</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {overdue.map(t => (
                        <tr key={t.id} className="hover:bg-red-50/30">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 truncate max-w-xs">{t.title}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{t.dept}</td>
                          <td className="px-4 py-3 text-slate-500">{fmtDate(t.due_date)}</td>
                          <td className="px-4 py-3">
                            <span className="text-red-600 font-semibold">+{t.days_late} ngày</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              t.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                              t.priority === 'high'   ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {t.priority === 'urgent' ? 'Khẩn' : t.priority === 'high' ? 'Cao' : 'TB'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
