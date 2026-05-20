import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nghiQuyetApi } from '../../api/nghiQuyet'
import AppLayout from '../../components/layout/AppLayout'
import type { NghiQuyetCreate, NghiQuyetRead } from '../../types/nghiQuyet'

const LOAI_OPTIONS = [
  { value: 'nghi_quyet', label: 'Nghị quyết' },
  { value: 'de_an', label: 'Đề án' },
  { value: 'ke_hoach', label: 'Kế hoạch' },
]

function loaiLabel(loai: string) {
  return LOAI_OPTIONS.find(o => o.value === loai)?.label ?? loai
}

function loaiBadgeCls(loai: string) {
  const map: Record<string, string> = {
    nghi_quyet: 'bg-indigo-100 text-indigo-700',
    de_an:      'bg-violet-100 text-violet-700',
    ke_hoach:   'bg-emerald-100 text-emerald-700',
  }
  return map[loai] ?? 'bg-slate-100 text-slate-600'
}

function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('vi-VN')
}

const INIT_FORM: NghiQuyetCreate = {
  ten: '',
  loai: 'nghi_quyet',
  nam_bat_dau: new Date().getFullYear(),
  nam_ket_thuc: new Date().getFullYear() + 5,
}

export default function NghiQuyetListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<NghiQuyetRead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loaiFilter, setLoaiFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<NghiQuyetRead | null>(null)
  const [form, setForm] = useState<NghiQuyetCreate>(INIT_FORM)
  const [saving, setSaving] = useState(false)
  const SIZE = 12

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await nghiQuyetApi.list({
        page: p, size: SIZE,
        loai: loaiFilter || undefined,
      })
      setItems(res.data.items)
      setTotal(res.data.total)
      setPage(p)
    } catch {
      setFetchError('Không thể tải danh sách nghị quyết. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [loaiFilter])

  useEffect(() => { load(1) }, [loaiFilter])

  function openCreate() {
    setEditItem(null)
    setForm(INIT_FORM)
    setShowForm(true)
  }

  function openEdit(item: NghiQuyetRead, e: React.MouseEvent) {
    e.stopPropagation()
    setEditItem(item)
    setForm({
      ma_nghi_quyet: item.ma_nghi_quyet ?? undefined,
      ten: item.ten,
      mo_ta: item.mo_ta ?? undefined,
      loai: item.loai,
      nam_bat_dau: item.nam_bat_dau,
      nam_ket_thuc: item.nam_ket_thuc,
      ngay_ban_hanh: item.ngay_ban_hanh ?? undefined,
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editItem) {
        await nghiQuyetApi.update(editItem.id, form)
      } else {
        await nghiQuyetApi.create(form)
      }
      setShowForm(false)
      load(1)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Xóa nghị quyết này? Toàn bộ mục tiêu và KPI liên quan sẽ bị xóa.')) return
    await nghiQuyetApi.remove(id)
    load(page)
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <AppLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">📜</div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Nghị quyết & Đề án</h1>
              <p className="text-sm text-slate-500">Theo dõi KPI chiến lược Đại hội 5 năm</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
          >
            + Thêm mới
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setLoaiFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${loaiFilter === '' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Tất cả
          </button>
          {LOAI_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setLoaiFilter(o.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${loaiFilter === o.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {fetchError}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">Đang tải...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">📜</p>
            <p className="text-slate-500 font-medium text-lg">Chưa có nghị quyết nào</p>
            <p className="text-slate-400 text-sm mt-1">Nhấn "Thêm mới" để bắt đầu theo dõi KPI chiến lược</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map(item => (
              <div
                key={item.id}
                onClick={() => navigate(`/nghi-quyet/${item.id}`)}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all p-5 group relative"
              >
                {/* Loai badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    {item.ma_nghi_quyet && (
                      <p className="text-xs font-mono text-slate-400 mb-1">{item.ma_nghi_quyet}</p>
                    )}
                    <h3 className="text-sm font-semibold text-slate-800 leading-snug line-clamp-3 group-hover:text-indigo-700 transition-colors">
                      {item.ten}
                    </h3>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${loaiBadgeCls(item.loai)}`}>
                    {loaiLabel(item.loai)}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-4 flex-wrap">
                  <span className="flex items-center gap-1">
                    📅 {item.nam_bat_dau} – {item.nam_ket_thuc}
                  </span>
                  {item.ngay_ban_hanh && (
                    <span>Ban hành: {fmtDate(item.ngay_ban_hanh)}</span>
                  )}
                </div>

                {/* Progress indicator bar */}
                <div className="h-1 bg-slate-100 rounded-full mb-3">
                  <div
                    className="h-1 bg-indigo-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.round(((new Date().getFullYear() - item.nam_bat_dau) / (item.nam_ket_thuc - item.nam_bat_dau + 1)) * 100))}%` }}
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Tạo bởi {item.creator.full_name ?? item.creator.username}
                  </p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => openEdit(item, e)}
                      title="Chỉnh sửa"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition text-xs"
                    >✏️</button>
                    <button
                      onClick={e => handleDelete(item.id, e)}
                      title="Xóa"
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition text-xs"
                    >🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Trang {page}/{pages} · {total} bản ghi</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => load(page - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">‹</button>
              <button disabled={page >= pages} onClick={() => load(page + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">›</button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">
                {editItem ? 'Chỉnh sửa nghị quyết' : 'Thêm nghị quyết / đề án mới'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mã văn bản</label>
                  <input
                    className={inp}
                    value={form.ma_nghi_quyet ?? ''}
                    onChange={e => setForm(p => ({ ...p, ma_nghi_quyet: e.target.value || undefined }))}
                    placeholder="NQ-01/2025"
                  />
                </div>
                <div>
                  <label className={lbl}>Loại *</label>
                  <select
                    className={inp}
                    value={form.loai}
                    onChange={e => setForm(p => ({ ...p, loai: e.target.value }))}
                  >
                    {LOAI_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl}>Tên nghị quyết / đề án *</label>
                <input
                  required
                  className={inp}
                  value={form.ten}
                  onChange={e => setForm(p => ({ ...p, ten: e.target.value }))}
                  placeholder="Nghị quyết Đại hội Đảng bộ xã nhiệm kỳ 2025–2030"
                />
              </div>

              <div>
                <label className={lbl}>Mô tả</label>
                <textarea
                  rows={2}
                  className={inp}
                  value={form.mo_ta ?? ''}
                  onChange={e => setForm(p => ({ ...p, mo_ta: e.target.value || undefined }))}
                  placeholder="Mô tả nội dung, phạm vi..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Năm bắt đầu *</label>
                  <input
                    type="number"
                    required
                    className={inp}
                    value={form.nam_bat_dau}
                    onChange={e => setForm(p => ({ ...p, nam_bat_dau: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Năm kết thúc *</label>
                  <input
                    type="number"
                    required
                    className={inp}
                    value={form.nam_ket_thuc}
                    onChange={e => setForm(p => ({ ...p, nam_ket_thuc: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Ngày ban hành</label>
                  <input
                    type="date"
                    className={inp}
                    value={form.ngay_ban_hanh ?? ''}
                    onChange={e => setForm(p => ({ ...p, ngay_ban_hanh: e.target.value || undefined }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {saving ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
