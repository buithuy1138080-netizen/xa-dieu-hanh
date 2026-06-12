import { motion } from 'framer-motion'
import { AlertTriangle, BookOpen, ChevronRight, Edit2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { programsApi, tagsApi } from '../../api/programs'
import type { Program, ProgramWithStats, Tag } from '../../api/programs'
import TagBadge from '../../components/common/TagBadge'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'

const TYPE_LABELS: Record<string, string> = {
  nghi_quyet: 'Nghị quyết',
  de_an: 'Đề án',
  ke_hoach: 'Kế hoạch',
  chuong_trinh: 'Chương trình',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
}

const EMPTY_FORM = {
  code: '', name: '', short_name: '', program_type: 'nghi_quyet',
  issued_date: '', issuing_body: '', scope: 'xa', description: '', tag_id: '',
}

export default function ProgramsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canCreate = ['admin', 'leader', 'manager'].includes(user?.role ?? '')
  function canEditProgram(p: Program) {
    if (!user) return false
    if (['admin', 'leader'].includes(user.role)) return true
    if (user.role === 'manager') return p.created_by === user.id
    return false
  }
  function canDeleteProgram(p: Program) {
    return canEditProgram(p)
  }
  const [programs, setPrograms] = useState<ProgramWithStats[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    Promise.all([programsApi.listWithStats(), tagsApi.list()])
      .then(([p, t]) => { setPrograms(p.data); setTags(t.data) })
      .catch(() => setPageError('Không thể tải danh sách chương trình. Vui lòng tải lại trang.'))
      .finally(() => setLoading(false))
  }, [])

  function tagOf(p: Program) {
    return tags.find(t => t.id === p.tag_id)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Program) {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      short_name: p.short_name ?? '',
      program_type: p.program_type,
      issued_date: p.issued_date ? p.issued_date.slice(0, 10) : '',
      issuing_body: p.issuing_body ?? '',
      scope: p.scope,
      description: p.description ?? '',
      tag_id: p.tag_id ? String(p.tag_id) : '',
    })
    setShowForm(true)
  }

  async function handleDelete(p: Program) {
    if (!confirm(`Xóa chương trình "${p.name}"?\nCác nhiệm vụ và KPI liên kết sẽ mất liên kết (không bị xóa).`)) return
    try {
      await programsApi.delete(p.id)
      setPrograms(prev => prev.filter(x => x.id !== p.id))
    } catch {
      alert('Lỗi khi xóa chương trình')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        tag_id: form.tag_id ? Number(form.tag_id) : undefined,
        issued_date: form.issued_date || undefined,
      }
      if (editing) {
        const res = await programsApi.update(editing.id, payload)
        setPrograms(prev => prev.map(x => x.id === editing.id ? res.data : x))
      } else {
        const res = await programsApi.create(payload)
        setPrograms(prev => [res.data, ...prev])
      }
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY_FORM)
    } catch {
      alert(editing ? 'Lỗi khi cập nhật chương trình' : 'Lỗi khi tạo chương trình')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        {pageError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle size={15} className="shrink-0" /> {pageError}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BookOpen size={20} className="text-violet-600" /> Chương trình / Nghị quyết
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Quản lý các chương trình, nghị quyết, đề án đang triển khai</p>
          </div>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition"
            >
              <Plus size={15} /> Thêm mới
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : programs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có chương trình nào. Bấm "Thêm mới" để bắt đầu.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {programs.map((p, i) => {
              const tag = tagOf(p)
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-violet-200 transition-all cursor-pointer p-5"
                  onClick={() => navigate(`/nq57?program=${p.id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono text-slate-400">{p.code}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[p.status] ?? STATUS_COLORS.active}`}>
                          {p.status === 'active' ? 'Đang triển khai' : p.status === 'draft' ? 'Dự thảo' : 'Đã đóng'}
                        </span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {TYPE_LABELS[p.program_type] ?? p.program_type}
                        </span>
                        {tag && <TagBadge tag={tag} size="sm" />}
                      </div>
                      <h3 className="text-sm font-bold text-slate-800 leading-snug">{p.name}</h3>
                      {p.issuing_body && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Ban hành bởi: {p.issuing_body}
                          {p.issued_date && ` · ${new Date(p.issued_date).toLocaleDateString('vi-VN')}`}
                        </p>
                      )}
                      {p.description && (
                        <p className="text-xs text-slate-500 mt-1.5 line-clamp-1">{p.description}</p>
                      )}
                      {/* Mini stats */}
                      {p.stats && (
                        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                          {p.stats.task_total > 0 && (
                            <div className="flex items-center gap-1.5 min-w-[120px]">
                              <span className="text-[10px] text-slate-400">📋 {p.stats.task_done}/{p.stats.task_total} NV</span>
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${p.stats.task_total ? (p.stats.task_done / p.stats.task_total) * 100 : 0}%` }}
                                />
                              </div>
                              {p.stats.task_overdue > 0 && (
                                <span className="text-[10px] text-red-500 font-semibold">⚠️ {p.stats.task_overdue}</span>
                              )}
                            </div>
                          )}
                          {p.stats.kpi_total > 0 && (
                            <div className="flex items-center gap-1.5 min-w-[100px]">
                              <span className="text-[10px] text-slate-400">📊 {p.stats.kpi_total} KPI</span>
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-violet-400 rounded-full"
                                  style={{ width: `${p.stats.kpi_avg_progress}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-violet-600 font-semibold">{p.stats.kpi_avg_progress.toFixed(0)}%</span>
                            </div>
                          )}
                          {p.stats.project_count > 0 && (
                            <span className="text-[10px] text-blue-500">🔷 {p.stats.project_count} dự án</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {canEditProgram(p) && (
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 hover:bg-blue-50 rounded-lg"
                          title="Sửa chương trình"
                        >
                          <Edit2 size={14} className="text-blue-500" />
                        </button>
                      )}
                      {canDeleteProgram(p) && (
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 hover:bg-red-50 rounded-lg"
                          title="Xóa chương trình"
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Create/Edit form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditing(null) } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-800">
                  {editing ? 'Chỉnh sửa chương trình' : 'Thêm chương trình / nghị quyết'}
                </h2>
                <button onClick={() => { setShowForm(false); setEditing(null) }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Mã (*)</label>
                    <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="NQ57_2024" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Loại</label>
                    <select value={form.program_type} onChange={e => setForm(f => ({ ...f, program_type: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none">
                      {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Tên đầy đủ (*)</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nghị quyết số 57-NQ/TW về phát triển..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Tên ngắn</label>
                    <input value={form.short_name} onChange={e => setForm(f => ({ ...f, short_name: e.target.value }))}
                      placeholder="NQ57" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Tag nghiệp vụ</label>
                    <select value={form.tag_id} onChange={e => setForm(f => ({ ...f, tag_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none">
                      <option value="">— Không có —</option>
                      {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Cơ quan ban hành</label>
                    <input value={form.issuing_body} onChange={e => setForm(f => ({ ...f, issuing_body: e.target.value }))}
                      placeholder="Ban chấp hành TW..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Ngày ban hành</label>
                    <input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Mô tả ngắn</label>
                  <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:outline-none resize-none" />
                </div>
                <div className="flex gap-3 justify-end pt-1">
                  <button type="button" onClick={() => { setShowForm(false); setEditing(null) }}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Hủy</button>
                  <button type="submit" disabled={saving}
                    className="px-5 py-2 text-sm bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 disabled:opacity-50">
                    {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo chương trình'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
