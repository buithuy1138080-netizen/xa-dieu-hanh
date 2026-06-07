import { useEffect, useState } from 'react'
import { Bell, Calendar, Copy, Download, Edit2, Plus, Trash2, X } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { scheduleApi } from '../../api/schedule'
import type {
  LeaderMin, ReminderLog, ScheduleItemCreate, ScheduleItemRead, ScheduleItemUpdate,
} from '../../types/schedule'
import { REMIND_OPTIONS, SESSION_COLORS, SESSION_LABELS } from '../../types/schedule'
import { useAuthStore } from '../../store/authStore'
import CopyScheduleModal from './CopyScheduleModal'

const SESSION_OPTIONS = [
  { value: 'sang',    label: 'Sáng' },
  { value: 'chieu',  label: 'Chiều' },
  { value: 'ca_ngay', label: 'Cả ngày' },
  { value: 'toi',    label: 'Tối' },
]

function fmtDate(d: string) {
  const dt = new Date(d)
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getMonday(d: Date): string {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d.setDate(diff))
  return mon.toISOString().split('T')[0]
}

type Tab = 'list' | 'logs'

export default function ScheduleAdminPage() {
  const { user } = useAuthStore()
  const canManage = user?.role === 'admin' || user?.role === 'leader'

  const [items, setItems] = useState<ScheduleItemRead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('list')

  // Filters
  const [leaders, setLeaders] = useState<LeaderMin[]>([])
  const [filterLeader, setFilterLeader] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSession, setFilterSession] = useState('')

  // Logs
  const [logs, setLogs] = useState<ReminderLog[]>([])

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ScheduleItemRead | null>(null)
  const [saving, setSaving] = useState(false)
  const [copyItem, setCopyItem] = useState<ScheduleItemRead | null>(null)
  const [form, setForm] = useState<ScheduleItemCreate>({
    leader_id: 0, title: '', location: '', note: '',
    work_date: new Date().toISOString().split('T')[0],
    session: 'sang', start_time: '08:00',
    zalo_remind: false, remind_before_minutes: 30,
  })

  const SIZE = 20
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  useEffect(() => {
    scheduleApi.leaders().then(r => setLeaders(r.data)).catch(() => {})
  }, [])

  async function load(p = 1) {
    setLoading(true)
    try {
      const r = await scheduleApi.list({
        page: p, size: SIZE,
        leader_id: filterLeader ? Number(filterLeader) : undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
        session: filterSession || undefined,
      })
      setItems(r.data.items)
      setTotal(r.data.total)
      setPage(p)
    } finally { setLoading(false) }
  }

  async function loadLogs() {
    const r = await scheduleApi.reminderLogs({ limit: 200 })
    setLogs(r.data)
  }

  useEffect(() => {
    if (tab === 'list') load(1)
    else loadLogs()
  }, [tab, filterLeader, filterDateFrom, filterDateTo, filterSession])

  function openCreate() {
    setEditing(null)
    setForm({
      leader_id: leaders[0]?.id || 0, title: '', location: '', note: '',
      work_date: new Date().toISOString().split('T')[0],
      session: 'sang', start_time: '08:00',
      zalo_remind: false, remind_before_minutes: 30,
    })
    setShowForm(true)
  }

  function openEdit(item: ScheduleItemRead) {
    setEditing(item)
    setForm({
      leader_id: item.leader_id, title: item.title,
      location: item.location ?? '', note: item.note ?? '',
      work_date: item.work_date, session: item.session,
      start_time: item.start_time ? item.start_time.slice(0, 5) : '',
      zalo_remind: item.zalo_remind, remind_before_minutes: item.remind_before_minutes,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.leader_id || !form.work_date) return
    setSaving(true)
    try {
      if (editing) {
        await scheduleApi.update(editing.id, form as ScheduleItemUpdate)
      } else {
        await scheduleApi.create(form)
      }
      setShowForm(false)
      load(1)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa lịch này?')) return
    await scheduleApi.remove(id)
    load(page)
  }

  async function exportExcel() {
    const weekStart = getMonday(new Date())
    const r = await scheduleApi.exportExcel(weekStart)
    const url = URL.createObjectURL(r.data as Blob)
    const a = document.createElement('a')
    a.href = url; a.download = `lich_tuan_${weekStart}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <Calendar size={20} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Quản lý Lịch Công Tác</h1>
              <p className="text-sm text-slate-500">{total} lịch · {leaders.length} lãnh đạo</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportExcel}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
              <Download size={15} /> Xuất Excel tuần này
            </button>
            {canManage && (
              <button onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700">
                <Plus size={15} /> Thêm lịch mới
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'list', label: '📋 Danh sách lịch' },
            { key: 'logs', label: '📨 Nhật ký nhắc Zalo' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as Tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-white shadow-sm text-red-700' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        {tab === 'list' && (
          <div className="flex flex-wrap gap-3">
            <select value={filterLeader} onChange={e => setFilterLeader(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[180px]">
              <option value="">Tất cả lãnh đạo</option>
              {leaders.map(l => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Từ ngày" />
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Đến ngày" />
            <select value={filterSession} onChange={e => setFilterSession(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
              <option value="">Tất cả buổi</option>
              {SESSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(filterLeader || filterDateFrom || filterDateTo || filterSession) && (
              <button onClick={() => { setFilterLeader(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterSession('') }}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600">
                <X size={14} /> Xóa lọc
              </button>
            )}
          </div>
        )}

        {/* TABLE VIEW */}
        {tab === 'list' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-red-600 text-white">
                <tr>
                  {['Ngày', 'Buổi', 'Giờ', 'Lãnh đạo', 'Chức vụ', 'Nội dung', 'Địa điểm', 'Zalo', 'Thao tác'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400">
                      Chưa có lịch công tác nào
                    </td>
                  </tr>
                )}
                {!loading && items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{fmtDate(item.work_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SESSION_COLORS[item.session]}`}>
                        {SESSION_LABELS[item.session]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {item.start_time ? item.start_time.slice(0, 5) : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.leader?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.leader?.position ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={item.title}>{item.title}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[140px] truncate">{item.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      {item.zalo_remind
                        ? <span className="flex items-center gap-1 text-xs text-green-600"><Bell size={12} /> {item.remind_before_minutes}p</span>
                        : <span className="text-xs text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {/* Sao chép — tất cả đều dùng được */}
                        <button onClick={() => setCopyItem(item)}
                          className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600"
                          title="Sao chép lịch cho lãnh đạo khác">
                          <Copy size={13} />
                        </button>
                        {canManage && (
                          <>
                            <button onClick={() => openEdit(item)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => handleDelete(item.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">{total} lịch</span>
                <div className="flex gap-1">
                  {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map(p => (
                    <button key={p} onClick={() => load(p)}
                      className={`w-8 h-8 text-xs rounded-lg ${p === page ? 'bg-red-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOGS VIEW */}
        {tab === 'logs' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  {['Ngày gửi dự kiến', 'Lãnh đạo', 'Lịch', 'Trạng thái', 'Lỗi', 'Thử lại'].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono">{new Date(l.scheduled_at).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3">—</td>
                    <td className="px-4 py-3 text-xs text-slate-500">#{l.schedule_id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        l.status === 'sent'    ? 'bg-green-100 text-green-700' :
                        l.status === 'failed'  ? 'bg-red-100 text-red-700' :
                        l.status === 'skipped' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {l.status === 'sent' ? '✅ Đã gửi' :
                         l.status === 'failed' ? '❌ Thất bại' :
                         l.status === 'skipped' ? '⏭ Bỏ qua' : '⏳ Chờ gửi'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-red-500 max-w-xs truncate">{l.error_msg ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{l.retry_count}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">Chưa có nhật ký</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* COPY MODAL */}
        {copyItem && (
          <CopyScheduleModal
            item={copyItem}
            leaders={leaders}
            onClose={() => setCopyItem(null)}
            onSuccess={() => load(1)}
          />
        )}

        {/* FORM MODAL */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-slate-800">{editing ? 'Sửa lịch' : 'Thêm lịch mới'}</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                {/* Lãnh đạo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Lãnh đạo *</label>
                  <select value={form.leader_id} onChange={e => setForm(f => ({ ...f, leader_id: Number(e.target.value) }))} className={inp}>
                    <option value={0}>-- Chọn lãnh đạo --</option>
                    {leaders.map(l => <option key={l.id} value={l.id}>{l.full_name} — {l.position}</option>)}
                  </select>
                </div>
                {/* Ngày */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày *</label>
                    <input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Buổi *</label>
                    <select value={form.session} onChange={e => setForm(f => ({ ...f, session: e.target.value as any }))} className={inp}>
                      {SESSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                {/* Giờ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Giờ bắt đầu</label>
                  <input type="time" value={form.start_time ?? ''} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inp} />
                </div>
                {/* Nội dung */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nội dung *</label>
                  <textarea value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    rows={3} className={inp} placeholder="Nội dung lịch công tác..." />
                </div>
                {/* Địa điểm */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Địa điểm</label>
                  <input value={form.location ?? ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={inp} placeholder="Địa điểm..." />
                </div>
                {/* Ghi chú */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ghi chú</label>
                  <input value={form.note ?? ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={inp} placeholder="Ghi chú thêm..." />
                </div>

                {/* Nhắc Zalo */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setForm(f => ({ ...f, zalo_remind: !f.zalo_remind }))}
                      className={`w-10 h-5 rounded-full transition-colors relative ${form.zalo_remind ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.zalo_remind ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="font-semibold text-sm text-slate-700 flex items-center gap-1.5">
                      <Bell size={14} /> Nhắc lịch qua Zalo
                    </span>
                  </label>
                  {form.zalo_remind && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Nhắc trước</label>
                      <select value={form.remind_before_minutes}
                        onChange={e => setForm(f => ({ ...f, remind_before_minutes: Number(e.target.value) }))}
                        className={inp}>
                        {REMIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t flex justify-end gap-3">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 font-medium">Hủy</button>
                <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.leader_id}
                  className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm lịch'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
