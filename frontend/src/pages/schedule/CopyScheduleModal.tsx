import { useState } from 'react'
import { Copy, X } from 'lucide-react'
import { scheduleApi } from '../../api/schedule'
import type { LeaderMin, ScheduleItemRead } from '../../types/schedule'
import { SESSION_LABELS } from '../../types/schedule'

interface Props {
  item: ScheduleItemRead
  leaders: LeaderMin[]
  onClose: () => void
  onSuccess: () => void
}

function fmtDate(d: string) {
  const dt = new Date(d)
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CopyScheduleModal({ item, leaders, onClose, onSuccess }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [overrideDate, setOverrideDate] = useState(item.work_date)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [copiedCount, setCopiedCount] = useState(0)

  // Loại bỏ lãnh đạo nguồn khỏi danh sách đích
  const targetLeaders = leaders.filter(l => l.id !== item.leader_id)

  function toggleLeader(id: number) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function selectAll() {
    setSelectedIds(targetLeaders.map(l => l.id))
  }

  async function handleCopy() {
    if (selectedIds.length === 0) { setError('Chọn ít nhất 1 lãnh đạo'); return }
    setSaving(true); setError('')
    try {
      const result = await scheduleApi.copy({
        item_id: item.id,
        leader_ids: selectedIds,
        work_date: overrideDate !== item.work_date ? overrideDate : undefined,
      })
      setCopiedCount(result.data.length)
      setDone(true)
      setTimeout(() => { onSuccess(); onClose() }, 1800)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Sao chép thất bại')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Copy size={15} className="text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-800">Sao chép lịch</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {done ? (
            <div className="text-center py-6 space-y-2">
              <div className="text-4xl">✅</div>
              <p className="font-bold text-emerald-600 text-lg">
                Đã sao chép {copiedCount} lịch!
              </p>
              <p className="text-sm text-slate-400">Đang đóng...</p>
            </div>
          ) : (
            <>
              {/* Info lịch nguồn */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-slate-400 font-medium mb-1">LỊCH NGUỒN</p>
                <p className="font-semibold text-slate-800 text-sm line-clamp-2">{item.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span>{fmtDate(item.work_date)}</span>
                  <span>·</span>
                  <span>{SESSION_LABELS[item.session]}</span>
                  {item.start_time && <><span>·</span><span>{item.start_time.slice(0, 5)}</span></>}
                  <span>·</span>
                  <span className="text-blue-600 font-medium">{item.leader?.full_name}</span>
                </div>
                {item.location && <p className="text-xs text-slate-400 mt-0.5">📍 {item.location}</p>}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}

              {/* Chọn ngày */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Ngày thực hiện
                  <span className="font-normal text-slate-400 ml-1">(có thể đổi ngày)</span>
                </label>
                <input
                  type="date"
                  value={overrideDate}
                  onChange={e => setOverrideDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {overrideDate !== item.work_date && (
                  <p className="text-xs text-blue-600 mt-1">
                    ↩ Đã thay đổi từ {fmtDate(item.work_date)} → {fmtDate(overrideDate)}
                    <button onClick={() => setOverrideDate(item.work_date)}
                      className="ml-2 underline hover:no-underline">Khôi phục</button>
                  </p>
                )}
              </div>

              {/* Chọn lãnh đạo đích */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Sao chép cho lãnh đạo *
                  </label>
                  <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Chọn tất cả ({targetLeaders.length})
                  </button>
                </div>

                {targetLeaders.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    Không có lãnh đạo nào khác
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {targetLeaders.map(l => (
                      <label key={l.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          selectedIds.includes(l.id)
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(l.id)}
                          onChange={() => toggleLeader(l.id)}
                          className="w-4 h-4 accent-blue-600 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{l.full_name}</p>
                          {l.position && <p className="text-xs text-slate-500 truncate">{l.position}</p>}
                        </div>
                        {selectedIds.includes(l.id) && (
                          <span className="text-blue-500 shrink-0">✓</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}

                {selectedIds.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1.5 font-medium">
                    Đã chọn {selectedIds.length} lãnh đạo
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Hủy
                </button>
                <button onClick={handleCopy} disabled={saving || selectedIds.length === 0}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving
                    ? '⏳ Đang sao chép...'
                    : <><Copy size={14} /> Sao chép {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
