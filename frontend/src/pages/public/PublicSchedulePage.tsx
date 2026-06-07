import axios from 'axios'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'

const publicApi = axios.create({ baseURL: '/api/public' })

const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']

const SESSION_LABEL: Record<string, string> = {
  sang: 'Sáng', chieu: 'Chiều', ca_ngay: 'Cả ngày', toi: 'Tối',
}
const SESSION_CLS: Record<string, string> = {
  sang:    'bg-amber-50 border-amber-200 text-amber-800',
  chieu:   'bg-sky-50 border-sky-200 text-sky-800',
  ca_ngay: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  toi:     'bg-indigo-50 border-indigo-200 text-indigo-800',
}

interface ScheduleItem { id: number; title: string; location: string | null; session: string; start_time: string | null }
interface LeaderRow { leader: { id: number; full_name: string; position: string | null }; days: Record<string, ScheduleItem[]> }
interface WeekData { week_start: string; week_end: string; days: string[]; leaders: LeaderRow[] }

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d).setDate(diff))
}
function getDefaultWeek(): Date {
  const today = new Date()
  const monday = getMonday(today)
  if (today.getDay() === 0) monday.setDate(monday.getDate() + 7)
  return monday
}
function fmt(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
function fmtFull(s: string) {
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PublicSchedulePage() {
  const [weekStart, setWeekStart] = useState<Date>(getDefaultWeek)
  const [data, setData]     = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const weekStr = weekStart.toISOString().split('T')[0]

  useEffect(() => {
    setLoading(true)
    setError('')
    publicApi.get<WeekData>('/schedule/week', { params: { week_start: weekStr } })
      .then(r => setData(r.data))
      .catch(() => setError('Không thể tải lịch. Vui lòng thử lại.'))
      .finally(() => setLoading(false))
  }, [weekStr])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }
  function thisWeek() { setWeekStart(getDefaultWeek()) }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-red-700 text-white shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0">
              📅
            </div>
            <div>
              <p className="text-xs text-red-200 uppercase tracking-wider font-medium">Hệ thống điều hành cấp xã</p>
              <h1 className="text-lg font-bold leading-tight">Lịch Công Tác Tuần</h1>
            </div>
          </div>
          {/* Nav */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
              <button onClick={prevWeek} className="p-1.5 hover:bg-white/20 rounded-lg transition">
                <ChevronLeft size={16} />
              </button>
              <button onClick={thisWeek} className="px-3 py-1 text-sm font-medium hover:bg-white/20 rounded-lg transition">
                Tuần này
              </button>
              <button onClick={nextWeek} className="p-1.5 hover:bg-white/20 rounded-lg transition">
                <ChevronRight size={16} />
              </button>
            </div>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition">
              <Printer size={14} /> In
            </button>
          </div>
        </div>
      </header>

      {/* Print header — only shows when printing */}
      <div className="hidden print:block text-center py-4 border-b-2 border-red-700">
        <p className="text-sm text-slate-500 uppercase tracking-wide">Ủy ban nhân dân xã Bắc Hà</p>
        <h1 className="text-2xl font-bold text-red-700 mt-1">LỊCH CÔNG TÁC TUẦN</h1>
        {data && (
          <p className="text-sm text-slate-600 mt-1">
            Từ ngày {fmtFull(data.week_start)} đến ngày {fmtFull(data.week_end)}
          </p>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-4 py-5">
        {/* Week label */}
        {data && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">
              Từ ngày <strong>{fmtFull(data.week_start)}</strong> đến ngày <strong>{fmtFull(data.week_end)}</strong>
            </span>
          </div>
        )}

        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm text-center">
            {error}
          </div>
        )}

        {!loading && data && (
          data.leaders.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-5xl mb-3">📋</p>
              <p className="text-lg font-medium">Tuần này chưa có lịch công tác</p>
              <p className="text-sm mt-1">Vui lòng chọn tuần khác</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-0">
              <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-red-700 text-white print:bg-red-700">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase w-44 border-r border-red-600">
                      LÃNH ĐẠO
                    </th>
                    {data.days.map((d, i) => {
                      const isToday = d === today
                      return (
                        <th key={d} className={`px-3 py-3 text-center text-xs font-bold border-r border-red-600 last:border-r-0 ${isToday ? 'bg-red-500' : ''}`}>
                          <div>{DAY_NAMES[i]}</div>
                          <div className="font-normal opacity-90 text-[11px] mt-0.5">{fmt(d)}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.leaders.map((row, ri) => (
                    <tr key={row.leader.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      {/* Leader name */}
                      <td className="px-4 py-3 border-r border-slate-100 align-middle">
                        <p className="font-bold text-slate-800 text-sm">{row.leader.full_name}</p>
                        {row.leader.position && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{row.leader.position}</p>
                        )}
                      </td>
                      {/* Day cells */}
                      {data.days.map(d => {
                        const cellItems = row.days[d] || []
                        const isToday = d === today
                        return (
                          <td key={d} className={`px-2 py-2 align-top border-r border-slate-100 last:border-r-0 min-w-[120px] ${isToday ? 'bg-amber-50/40' : ''}`}>
                            {cellItems.length === 0 ? (
                              <div className="h-8" />
                            ) : (
                              <div className="space-y-1">
                                {cellItems.map(item => (
                                  <div key={item.id}
                                    className={`p-1.5 rounded-lg border text-[11px] leading-snug ${SESSION_CLS[item.session] ?? 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                    <div className="font-semibold text-[10px] mb-0.5 opacity-80">
                                      {SESSION_LABEL[item.session] ?? item.session}
                                      {item.start_time && ` ${item.start_time}`}
                                    </div>
                                    <div className="font-medium line-clamp-3">{item.title}</div>
                                    {item.location && (
                                      <div className="text-[10px] opacity-70 mt-0.5 truncate">📍 {item.location}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="mt-8 pb-6 text-center text-xs text-slate-400 print:hidden">
        Hệ thống điều hành cấp xã · xabacha.com
      </footer>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 1cm; }
          body { font-size: 10pt; }
          table { font-size: 9pt; }
          th, td { padding: 6px 8px !important; }
        }
      `}</style>
    </div>
  )
}
