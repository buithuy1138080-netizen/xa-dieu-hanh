import { motion } from 'framer-motion'
import { Building, Plus, Pencil, Trash2, Users, CheckCircle, XCircle, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import AppLayout from '../../components/layout/AppLayout'

interface DeptRead {
  id: number
  code: string | null
  name: string
  short_name: string | null
  parent_id: number | null
  dept_type: string
  is_active: boolean
  sort_order: number
  description: string | null
  staff_count: number
}

interface DeptForm {
  name: string
  code: string
  short_name: string
  description: string
  is_active: boolean
  sort_order: number
  parent_id: number | null
}

const EMPTY: DeptForm = { name: '', code: '', short_name: '', description: '', is_active: true, sort_order: 0, parent_id: null }

export default function DepartmentPage() {
  const [depts, setDepts] = useState<DeptRead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DeptRead | null>(null)
  const [form, setForm] = useState<DeptForm>(EMPTY)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await apiClient.get<DeptRead[]>('/departments')
      setDepts(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(d: DeptRead) {
    setEditing(d)
    setForm({
      name: d.name, code: d.code ?? '', short_name: d.short_name ?? '',
      description: d.description ?? '', is_active: d.is_active,
      sort_order: d.sort_order, parent_id: d.parent_id,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        ...form,
        code: form.code || null,
        short_name: form.short_name || null,
        description: form.description || null,
      }
      if (editing) {
        await apiClient.put(`/departments/${editing.id}`, body)
      } else {
        await apiClient.post('/departments', body)
      }
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa đơn vị này?')) return
    await apiClient.delete(`/departments/${id}`)
    await load()
  }

  const filtered = depts.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.code ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = depts.filter(d => d.is_active).length
  const totalStaff = depts.reduce((s, d) => s + d.staff_count, 0)

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-4 md:space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Building size={20} className="text-blue-500" /> Quản lý đơn vị
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{activeCount} đơn vị hoạt động · {totalStaff} nhân sự</p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm shadow-blue-200">
            <Plus size={15} /> Thêm đơn vị
          </button>
        </motion.div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm đơn vị..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          />
        </div>

        {/* Mobile cards */}
        {!loading && filtered.length > 0 && (
          <div className="md:hidden space-y-2">
            {filtered.map((d) => (
              <div key={d.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{d.code ?? '—'}</span>
                    {d.is_active
                      ? <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Hoạt động</span>
                      : <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Không HĐ</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="font-semibold text-slate-800 text-sm">{d.name}</p>
                {d.short_name && <p className="text-xs text-slate-400">{d.short_name}</p>}
                <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                  <Users size={11} /> {d.staff_count} nhân sự
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Desktop Table */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-300">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-300">
              <Building size={40} className="mb-2" />
              <p className="text-sm">Không có đơn vị nào</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mã</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên đơn vị</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên tắt</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Nhân sự</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Trạng thái</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((d, i) => (
                  <motion.tr key={d.id}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="hover:bg-slate-50/60 transition group">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{d.code ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Building size={14} className="text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{d.name}</p>
                          {d.description && <p className="text-xs text-slate-400 truncate max-w-[200px]">{d.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{d.short_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1 text-slate-600">
                        <Users size={13} className="text-slate-400" />
                        <span className="font-semibold">{d.staff_count}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {d.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                          <CheckCircle size={10} /> Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          <XCircle size={10} /> Không HĐ
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition justify-end">
                        <button onClick={() => openEdit(d)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(d.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editing ? 'Sửa đơn vị' : 'Thêm đơn vị mới'}</h3>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tên đơn vị *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Mã đơn vị</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tên tắt</label>
                <input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Ghi chú</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-500" />
                  <span className="text-sm text-slate-700">Đang hoạt động</span>
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                  Hủy
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60">
                  {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AppLayout>
  )
}
