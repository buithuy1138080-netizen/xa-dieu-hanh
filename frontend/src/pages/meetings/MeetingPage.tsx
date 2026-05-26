import { Download, Eye, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { meetingsApi, type Meeting, type MeetingCreate, type MeetingListItem } from '../../api/meetings'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'
import { isAdminOrLeader } from '../../types'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const EMPTY_FORM: MeetingCreate = {
  title: '', meeting_date: '', location: '', chair: '', agenda: '', participant_ids: [],
}

interface StaffOption { id: number; full_name: string; email: string | null }

export default function MeetingPage() {
  const currentUser = useAuthStore(s => s.user)
  const canManageMeeting = (createdById: number | null) =>
    isAdminOrLeader(currentUser) || (currentUser?.id != null && currentUser.id === createdById)

  const [items, setItems] = useState<MeetingListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 20

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<MeetingCreate>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [detail, setDetail] = useState<Meeting | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [viewFileName, setViewFileName] = useState('')
  const [viewLoading, setViewLoading] = useState(false)

  const load = useCallback(async (p = 1, q = search) => {
    setLoading(true)
    try {
      const { data } = await meetingsApi.list({ page: p, size: SIZE, search: q || undefined })
      setItems(data.items)
      setTotal(data.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { load(1) }, [])

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  useEffect(() => {
    import('../../../src/api/client').then(({ default: api }) =>
      api.get('/staff/dropdown').then(r => setStaffOptions(r.data))
    ).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (viewUrl !== null || viewLoading) { closeViewer(); return }
      if (showForm) { setShowForm(false); return }
      if (detail || loadingDetail) setDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewUrl, viewLoading, showForm, detail, loadingDetail])

  async function openDetail(id: number) {
    setLoadingDetail(true)
    setDetail(null)
    try {
      const { data } = await meetingsApi.get(id)
      setDetail(data)
    } finally {
      setLoadingDetail(false)
    }
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(m: MeetingListItem) {
    setEditId(m.id)
    setForm({
      title: m.title,
      meeting_date: m.meeting_date.slice(0, 16),
      location: m.location || '',
      chair: m.chair || '',
      agenda: '',
      participant_ids: [],
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title || !form.meeting_date) return
    setSaving(true)
    try {
      if (editId) {
        await meetingsApi.update(editId, form)
      } else {
        await meetingsApi.create(form)
      }
      setShowForm(false)
      load(1)
      if (detail && editId === detail.id) {
        const { data } = await meetingsApi.get(editId)
        setDetail(data)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xoá cuộc họp này?')) return
    await meetingsApi.delete(id)
    load(page)
    if (detail?.id === id) setDetail(null)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!detail || !e.target.files?.length) return
    setUploadingFile(true)
    try {
      await meetingsApi.uploadFile(detail.id, e.target.files[0])
      const { data } = await meetingsApi.get(detail.id)
      setDetail(data)
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteFile(fileId: number) {
    if (!detail) return
    if (!confirm('Xoá tài liệu này?')) return
    await meetingsApi.deleteFile(detail.id, fileId)
    const { data } = await meetingsApi.get(detail.id)
    setDetail(data)
  }

  async function handleViewFile(meetingId: number, fileId: number, fileName: string) {
    setViewLoading(true)
    setViewFileName(fileName)
    setViewUrl(null)
    try {
      const { data } = await meetingsApi.downloadFile(meetingId, fileId)
      setViewUrl(URL.createObjectURL(data))
    } catch {
      setViewUrl('error')
    } finally {
      setViewLoading(false)
    }
  }

  function closeViewer() {
    if (viewUrl && viewUrl !== 'error') URL.revokeObjectURL(viewUrl)
    setViewUrl(null)
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">📋</div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-800">Tài liệu họp</h1>
              <p className="text-sm text-slate-500 mt-0.5">{loading ? 'Đang tải...' : `${total} cuộc họp`}</p>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
            <Plus size={15} /> Tạo cuộc họp
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, địa điểm..."
            className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tiêu đề</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-36">Ngày họp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Địa điểm</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Chủ trì</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase w-20">Tài liệu</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase w-20">Tham dự</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="text-center py-12 text-slate-400">Đang tải...</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} className="text-center py-16">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-slate-400">Chưa có cuộc họp nào</p>
                </td></tr>
              )}
              {!loading && items.map(m => (
                <tr key={m.id}
                  onClick={() => openDetail(m.id)}
                  className="hover:bg-indigo-50/50 cursor-pointer transition-colors border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-800 group-hover:text-indigo-700 line-clamp-1">{m.title}</p>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 text-xs whitespace-nowrap">{fmtDateTime(m.meeting_date)}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{m.location || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{m.chair || '—'}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">
                      <FileText size={11} />{m.file_count}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs text-slate-500">{m.participant_count}</td>
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      {canManageMeeting(m.created_by_id) && (
                        <>
                          <button onClick={() => openEdit(m)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" title="Sửa">
                            ✏️
                          </button>
                          <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Xoá">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Trang {page}/{pages} · {total} cuộc họp</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">‹ Trước</button>
              <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Sau ›</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {(detail || loadingDetail) && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setDetail(null)}>
          <div className="flex-1" />
          <div className="w-full max-w-xl bg-white shadow-2xl border-l border-slate-200 overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800 text-base">Chi tiết cuộc họp</h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"><X size={18} /></button>
            </div>

            {loadingDetail && <div className="flex-1 flex items-center justify-center text-slate-400">Đang tải...</div>}

            {detail && (
              <div className="p-5 space-y-5 flex-1">
                {/* Info */}
                <div>
                  <h3 className="font-bold text-slate-800 text-lg leading-snug mb-3">{detail.title}</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Ngày giờ</p>
                      <p className="font-medium text-slate-700">{fmtDateTime(detail.meeting_date)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Địa điểm</p>
                      <p className="font-medium text-slate-700">{detail.location || '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                      <p className="text-xs text-slate-400 mb-0.5">Chủ trì</p>
                      <p className="font-medium text-slate-700">{detail.chair || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Agenda */}
                {detail.agenda && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Nội dung chương trình</p>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">{detail.agenda}</div>
                  </div>
                )}

                {/* Participants */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Thành phần tham dự ({detail.participants.length})</p>
                  {detail.participants.length === 0
                    ? <p className="text-sm text-slate-400">Chưa có</p>
                    : <div className="flex flex-wrap gap-2">
                        {detail.participants.map(p => (
                          <span key={p.id} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full font-medium">
                            {p.name || `Nhân sự #${p.staff_id}`}
                          </span>
                        ))}
                      </div>
                  }
                </div>

                {/* Files */}
                {/* Upload zone */}
                {canManageMeeting(detail.created_by_id) && (
                  <div>
                    <input ref={fileInputRef} type="file" className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg"
                      onChange={handleUpload} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                      className="w-full flex flex-col items-center gap-2 p-5 border-2 border-dashed border-indigo-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/50 transition disabled:opacity-50">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Upload size={18} className="text-indigo-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-indigo-700">{uploadingFile ? 'Đang upload...' : 'Nhấn để upload tài liệu'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">PDF, Word, Excel, PowerPoint, ảnh</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* File list */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-3">
                    Tài liệu đính kèm ({detail.files.length})
                  </p>
                  {detail.files.length === 0
                    ? (
                      <div className="text-center py-8 text-slate-400">
                        <p className="text-3xl mb-2">📂</p>
                        <p className="text-sm">Chưa có tài liệu nào</p>
                      </div>
                    )
                    : <div className="space-y-2">
                        {detail.files.map(f => (
                          <div key={f.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition">
                            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-lg shrink-0">
                              {f.file_mime === 'application/pdf' ? '📄' : f.file_mime?.startsWith('image/') ? '🖼️' : f.file_mime?.includes('word') ? '📝' : f.file_mime?.includes('sheet') ? '📊' : '📎'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{f.file_name}</p>
                              <p className="text-xs text-slate-400">{fmtSize(f.file_size)} · {fmtDate(f.uploaded_at)}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => handleViewFile(detail.id, f.id, f.file_name)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Xem">
                                <Eye size={15} />
                              </button>
                              <a href={meetingsApi.getFileUrl(detail.id, f.id)} download={f.file_name}
                                className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Tải về"
                                onClick={e => e.stopPropagation()}>
                                <Download size={15} />
                              </a>
                              {canManageMeeting(detail.created_by_id) && (
                                <button onClick={() => handleDeleteFile(f.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Xoá">
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editId ? 'Cập nhật cuộc họp' : 'Tạo cuộc họp mới'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={lbl}>Tiêu đề cuộc họp *</label>
                <input className={inp} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="VD: Họp giao ban tháng 6/2026" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Ngày, giờ bắt đầu *</label>
                  <input type="datetime-local" className={inp} value={form.meeting_date} onChange={e => setForm(p => ({ ...p, meeting_date: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Địa điểm</label>
                  <input className={inp} value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="VD: Phòng họp A" />
                </div>
              </div>
              <div>
                <label className={lbl}>Chủ trì</label>
                <input className={inp} value={form.chair} onChange={e => setForm(p => ({ ...p, chair: e.target.value }))} placeholder="Họ tên người chủ trì" />
              </div>
              <div>
                <label className={lbl}>Nội dung chương trình (agenda)</label>
                <textarea className={`${inp} resize-none`} rows={4} value={form.agenda}
                  onChange={e => setForm(p => ({ ...p, agenda: e.target.value }))}
                  placeholder="Nội dung các vấn đề sẽ thảo luận..." />
              </div>
              <div>
                <label className={lbl}>Thành phần tham dự</label>
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                  {staffOptions.length === 0
                    ? <p className="text-xs text-slate-400 p-2">Đang tải danh sách nhân sự...</p>
                    : staffOptions.map(s => {
                        const checked = form.participant_ids.includes(s.id)
                        return (
                          <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={() =>
                              setForm(p => ({
                                ...p,
                                participant_ids: checked
                                  ? p.participant_ids.filter(id => id !== s.id)
                                  : [...p.participant_ids, s.id],
                              }))
                            } className="rounded" />
                            <span className="text-sm text-slate-700">{s.full_name}</span>
                            {s.email && <span className="text-xs text-slate-400">{s.email}</span>}
                          </label>
                        )
                      })
                  }
                </div>
                {form.participant_ids.length > 0 && (
                  <p className="text-xs text-indigo-600 mt-1">Đã chọn {form.participant_ids.length} người</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition">Huỷ</button>
                <button onClick={handleSave} disabled={saving || !form.title || !form.meeting_date}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
                  {saving ? 'Đang lưu...' : editId ? 'Cập nhật' : 'Tạo cuộc họp'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File viewer */}
      {(viewUrl !== null || viewLoading) && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="text-indigo-500 shrink-0" />
              <span className="font-semibold text-slate-800 text-sm truncate">{viewFileName}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {viewUrl && viewUrl !== 'error' && (
                <a href={viewUrl} download={viewFileName}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                  <Download size={14} /> Tải về
                </a>
              )}
              <button onClick={closeViewer} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"><X size={18} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
            {viewLoading && <div className="text-white text-sm">Đang tải file...</div>}
            {!viewLoading && viewUrl === 'error' && <div className="text-white text-center"><p className="text-4xl mb-3">⚠️</p><p className="text-sm">Không thể tải file.</p></div>}
            {!viewLoading && viewUrl && viewUrl !== 'error' && (() => {
              const ext = viewFileName.split('.').pop()?.toLowerCase()
              if (ext === 'pdf') return <iframe src={viewUrl} className="w-full h-full rounded-xl bg-white" title={viewFileName} />
              if (['jpg','jpeg','png','gif'].includes(ext || '')) return <img src={viewUrl} alt={viewFileName} className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
              return (
                <div className="bg-white rounded-2xl p-8 text-center shadow-2xl max-w-sm">
                  <p className="text-5xl mb-4">📄</p>
                  <p className="font-semibold text-slate-800 mb-1">{viewFileName}</p>
                  <p className="text-sm text-slate-500 mb-6">Định dạng này không thể xem trực tiếp.</p>
                  <a href={viewUrl} download={viewFileName}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
                    <Download size={15} /> Tải về để xem
                  </a>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
