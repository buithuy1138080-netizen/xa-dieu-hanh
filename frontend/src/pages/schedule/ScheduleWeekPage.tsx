import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { scheduleApi } from '../../api/schedule'
import type { LeaderMin, WeekView } from '../../types/schedule'
import { SESSION_LABELS } from '../../types/schedule'

const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']
const SESSION_COLORS_LIGHT: Record<string, string> = {
  sang:    'bg-amber-50 border-amber-200 text-amber-800',
  chieu:   'bg-blue-50 border-blue-200 text-blue-800',
  ca_ngay: 'bg-green-50 border-green-200 text-green-800',
  toi:     'bg-indigo-50 border-indigo-200 text-indigo-800',
}

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d).setDate(diff))
}

function fmt(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`
}

function getDefaultWeek(): Date {
  const today = new Date()
  const monday = getMonday(today)
  if (today.getDay() === 0) monday.setDate(monday.getDate() + 7)
  return monday
}

export default function ScheduleWeekPage() {
  const [weekStart, setWeekStart] = useState<Date>(getDefaultWeek)
  const [data, setData] = useState<WeekView | null>(null)
  const [leaders, setLeaders] = useState<LeaderMin[]>([])
  const [filterLeader, setFilterLeader] = useState('')
  const [loading, setLoading] = useState(false)

  const weekStartStr = weekStart.toISOString().split('T')[0]

  useEffect(() => {
    scheduleApi.leaders().then(r => setLeaders(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    scheduleApi.weekView(weekStartStr, filterLeader ? Number(filterLeader) : undefined)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [weekStartStr, filterLeader])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }
  function thisWeek() { setWeekStart(getDefaultWeek()) }

  async function exportExcel() {
    const r = await scheduleApi.exportExcel(weekStartStr, filterLeader ? Number(filterLeader) : undefined)
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a')
    a.href = url; a.download = `lich_tuan_${weekStartStr}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  // weekEnd used in header
  void data

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Lịch Công Tác Tuần</h1>
            {data && (
              <p className="text-sm text-slate-500">
                Từ ngày {fmt(data.week_start)} đến {fmt(data.week_end)}/
                {new Date(data.week_end).getFullYear()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filterLeader} onChange={e => setFilterLeader(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[180px]">
              <option value="">Tất cả lãnh đạo</option>
              {leaders.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button onClick={prevWeek} className="p-1.5 hover:bg-white rounded-lg transition">
                <ChevronLeft size={16} />
              </button>
              <button onClick={thisWeek} className="px-3 py-1 text-sm font-medium hover:bg-white rounded-lg transition">
                Tuần này
              </button>
              <button onClick={nextWeek} className="p-1.5 hover:bg-white rounded-lg transition">
                <ChevronRight size={16} />
              </button>
            </div>
            <button onClick={exportExcel}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
              <Download size={14} /> Xuất Excel
            </button>
          </div>
        </div>

        {/* Week calendar table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm" style={{ minWidth: '900px' }}>
              <thead>
                <tr className="bg-red-700 text-white">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase w-44">LÃNH ĐẠO</th>
                  {data.days.map((d, i) => {
                    const isToday = d === new Date().toISOString().split('T')[0]
                    return (
                      <th key={d} className={`px-3 py-3 text-center text-xs font-bold uppercase ${isToday ? 'bg-red-500' : ''}`}>
                        <div>{DAY_NAMES[i]}</div>
                        <div className="font-normal opacity-90">{fmt(d)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.leaders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-slate-400">Không có dữ liệu lịch</td>
                  </tr>
                ) : data.leaders.map((row, ri) => (
                  <tr key={row.leader.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-4 py-3 border-r border-slate-100">
                      <p className="font-bold text-slate-800 text-xs">{row.leader.full_name}</p>
                      {row.leader.position && (
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{row.leader.position}</p>
                      )}
                    </td>
                    {data.days.map(d => {
                      const items = row.days[d] || []
                      return (
                        <td key={d} className="px-2 py-2 align-top border-r border-slate-100 min-w-[120px]">
                          {items.length === 0 ? (
                            <div className="h-8" />
                          ) : (
                            <div className="space-y-1">
                              {items.map(item => (
                                <div key={item.id}
                                  className={`p-1.5 rounded-lg border text-[11px] leading-snug ${SESSION_COLORS_LIGHT[item.session] || 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                  <div className="font-semibold text-[10px] mb-0.5">
                                    {SESSION_LABELS[item.session]}
                                    {item.start_time && ` ${item.start_time.slice(0,5)}`}
                                  </div>
                                  <div className="line-clamp-3">{item.title}</div>
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
        )}
      </div>
    </AppLayout>
  )
}
