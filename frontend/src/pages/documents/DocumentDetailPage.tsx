import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { departmentsApi } from '../../api/departments'
import type { DeptRead } from '../../api/departments'
import { documentsApi } from '../../api/documents'
import { usersApi } from '../../api/users'
import DocStatusBadge from '../../components/documents/DocStatusBadge'
import DocTypeBadge from '../../components/documents/DocTypeBadge'
import DocumentForm from '../../components/documents/DocumentForm'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'
import type { DocStatus, DocumentCreate, DocumentReadDetail, DocumentTaskCreate } from '../../types/document'

const STATUS_FLOW: Record<DocStatus, { next: DocStatus; label: string; cls: string } | null> = {
  pending:    { next: 'processing', label: 'Tiếp nhận xử lý', cls: 'bg-amber-500 hover:bg-amber-600 text-white' },
  processing: { next: 'done',       label: 'Hoàn thành xử lý', cls: 'bg-green-600 hover:bg-green-700 text-white' },
  done:       { next: 'archived',   label: 'Lưu trữ',          cls: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  archived:   null,
}

const HISTORY_ICONS: Record<string, string> = {
  created: '🆕', updated: '✏️', status_changed: '🔄',
  commented: '💬', file_uploaded: '📎', task_created: '✅',
}

const PRIORITY_BADGE: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-600',
  urgent: 'bg-amber-100 text-amber-700',
  very_urgent: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  normal: 'Thường', urgent: 'Khẩn', very_urgent: 'Hỏa tốc',
}
const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500', medium: 'bg-blue-100 text-blue-600',
  high: 'bg-amber-100 text-amber-700', critical: 'bg-red-100 text-red-600',
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface User { id: number; username: string; full_name: string | null }

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const docId = Number(id)
  const navigate = useNavigate()
  const { user: me } = useAuthStore()

  const [doc, setDoc] = useState<DocumentReadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<DeptRead[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  const [statusNote, setStatusNote] = useState('')
  const [statusChanging, setStatusChanging] = useState(false)

  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [taskForm, setTaskForm] = useState<DocumentTaskCreate>({
    title: '', description: '', priority: 'medium', deadline: '', assignee_id: null, lead_department_id: null,
  })
  const [taskSaving, setTaskSaving] = useState(false)

  const [fileUploading, setFileUploading] = useState(false)
  const [previewBlob, setPreviewBlob] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const { data } = await documentsApi.get(docId)
      setDoc(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    usersApi.list().then((r) => setUsers(r.data)).catch(() => {})
    departmentsApi.list().then((r) => setDepartments(r.data)).catch(() => {})
  }, [docId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewBlob(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleStatusChange() {
    if (!doc) return
    const flow = STATUS_FLOW[doc.status]
    if (!flow) return
    setStatusChanging(true)
    try {
      await documentsApi.updateStatus(docId, flow.next, statusNote || undefined)
      setStatusNote('')
      await load()
    } finally {
      setStatusChanging(false)
    }
  }

  async function handleEdit(data: DocumentCreate, file?: File | null) {
    setEditSaving(true)
    try {
      await documentsApi.update(docId, data)
      if (file) {
        try {
          await documentsApi.uploadFile(docId, file)
        } catch {
          alert('Văn bản đã lưu nhưng đính kèm file thất bại. Vui lòng thử tải lên lại.')
        }
      }
      setEditOpen(false)
      await load()
    } finally {
      setEditSaving(false)
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    setCommentSaving(true)
    try {
      await documentsApi.addComment(docId, commentText.trim())
      setCommentText('')
      await load()
    } finally {
      setCommentSaving(false)
    }
  }

  async function handleDeleteComment(cid: number) {
    await documentsApi.deleteComment(docId, cid)
    await load()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileUploading(true)
    try {
      await documentsApi.uploadFile(docId, file)
      await load()
    } finally {
      setFileUploading(false)
    }
  }

  async function handlePreview() {
    if (previewBlob) { setPreviewBlob(null); return }
    try {
      const { data } = await documentsApi.downloadFile(docId)
      const url = URL.createObjectURL(data as Blob)
      setPreviewBlob(url)
    } catch {}
  }

  async function handleDownload() {
    try {
      const { data } = await documentsApi.downloadFile(docId)
      const url = URL.createObjectURL(data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc?.file_name ?? 'file'
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!taskForm.title.trim()) return
    setTaskSaving(true)
    try {
      await documentsApi.createTask(docId, {
        ...taskForm,
        deadline: taskForm.deadline ? (taskForm.deadline + 'T23:59:59') : undefined,
        assignee_id: taskForm.assignee_id || null,
      })
      setTaskFormOpen(false)
      setTaskForm({ title: '', description: '', priority: 'medium', deadline: '', assignee_id: null, lead_department_id: null })
      await load()
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Xóa văn bản này?')) return
    await documentsApi.delete(docId)
    navigate('/documents')
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!doc) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-slate-500">Không tìm thấy văn bản.</div>
      </AppLayout>
    )
  }

  const flow = STATUS_FLOW[doc.status]

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-7xl mx-auto">

        {/* ── Top bar ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              <ArrowLeft size={15} /> Quay lại
            </button>
            <span className="text-slate-300">|</span>
            <DocTypeBadge type={doc.doc_type} />
            <DocStatusBadge status={doc.status} />
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${PRIORITY_BADGE[doc.priority] ?? ''}`}>
              {PRIORITY_LABEL[doc.priority] ?? doc.priority}
            </span>
          </div>
          {(me?.role === 'admin' || me?.role === 'leader' || doc.created_by === me?.id) && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditOpen(true)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600">
                ✏ Sửa
              </button>
              <button onClick={handleDelete} className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 transition text-red-600">
                🗑 Xóa
              </button>
            </div>
          )}
        </div>

        {/* ── Title ── */}
        <div>
          {doc.doc_number && (
            <p className="text-xs font-mono text-slate-400 mb-1">Số: {doc.doc_number}</p>
          )}
          <h1 className="text-xl font-bold text-slate-800 leading-snug">{doc.title}</h1>
          {doc.issuer && <p className="text-sm text-slate-500 mt-1">Cơ quan ban hành: <span className="font-medium text-slate-700">{doc.issuer}</span></p>}
        </div>

        {/* ── 2-col layout ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* ── Left: Info + File ── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Info card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Thông tin văn bản</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Ngày ban hành', fmtDate(doc.issue_date)],
                  ['Ngày nhận', fmtDate(doc.received_date)],
                  ['Hạn xử lý', fmtDate(doc.deadline)],
                  ['Hình thức', doc.category ?? '—'],
                  ['Người nhập', doc.creator.full_name ?? doc.creator.username],
                  ['Giao xử lý', doc.assignee?.full_name ?? doc.assignee?.username ?? '—'],
                  ['Ngày tạo', fmtDateTime(doc.created_at)],
                  ['Cập nhật', fmtDateTime(doc.updated_at)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-slate-400 font-medium">{k}</dt>
                    <dd className="text-slate-700 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {doc.summary && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">Nội dung tóm tắt</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{doc.summary}</p>
                </div>
              )}
            </div>

            {/* File */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">File đính kèm</h2>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={fileUploading}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600 disabled:opacity-50"
                >
                  {fileUploading ? 'Đang tải lên...' : '+ Tải file lên'}
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" />
              </div>

              {doc.file_name ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <span className="text-2xl">{doc.file_mime === 'application/pdf' ? '📕' : '📎'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{doc.file_name}</p>
                      <p className="text-xs text-slate-400">{fmtSize(doc.file_size)} · {doc.file_mime}</p>
                    </div>
                    <div className="flex gap-2">
                      {doc.file_mime === 'application/pdf' && (
                        <button onClick={handlePreview} className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition font-medium">
                          {previewBlob ? 'Đóng' : 'Xem'}
                        </button>
                      )}
                      <button onClick={handleDownload} className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition font-medium">
                        Tải về
                      </button>
                    </div>
                  </div>

                  {previewBlob && (
                    <iframe
                      src={previewBlob}
                      title="PDF Preview"
                      className="w-full rounded-lg border border-slate-200"
                      style={{ height: '60vh' }}
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">Chưa có file đính kèm</p>
              )}
            </div>

            {/* Linked tasks */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Nhiệm vụ liên quan</h2>
                <button
                  onClick={() => setTaskFormOpen(true)}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  + Tạo nhiệm vụ
                </button>
              </div>
              {doc.linked_tasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Chưa có nhiệm vụ nào được tạo từ văn bản này</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {doc.linked_tasks.map((lt) => (
                    <div
                      key={lt.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/tasks/${lt.task.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{lt.task.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {lt.task.assignee?.full_name ?? lt.task.assignee?.username ?? 'Chưa giao'}
                          {lt.task.deadline && ` · Hạn: ${fmtDate(lt.task.deadline)}`}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${TASK_PRIORITY_COLORS[lt.task.priority] ?? ''}`}>
                        {lt.task.priority}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Actions + Timeline + Comments ── */}
          <div className="space-y-4">

            {/* Status action */}
            {flow && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Xử lý văn bản</h2>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú (tuỳ chọn)..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleStatusChange}
                  disabled={statusChanging}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${flow.cls}`}
                >
                  {statusChanging ? 'Đang cập nhật...' : flow.label}
                </button>
              </div>
            )}

            {/* History timeline */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Lịch sử xử lý</h2>
              {doc.history.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Chưa có lịch sử</p>
              ) : (
                <ol className="relative border-l border-slate-200 ml-3 space-y-4">
                  {doc.history.map((h) => (
                    <li key={h.id} className="ml-5">
                      <span className="absolute -left-2.5 w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xs">
                        {HISTORY_ICONS[h.action] ?? '•'}
                      </span>
                      <p className="text-xs font-medium text-slate-700">
                        {h.user.full_name ?? h.user.username}
                        {h.new_status && (
                          <span className="ml-1 text-blue-600">→ {h.new_status}</span>
                        )}
                      </p>
                      {h.note && <p className="text-xs text-slate-500 mt-0.5 italic">"{h.note}"</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(h.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Comments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">
                Bình luận ({doc.comments.length})
              </h2>
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {doc.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {(c.user.full_name ?? c.user.username)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 bg-slate-50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">
                          {c.user.full_name ?? c.user.username}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{fmtDateTime(c.created_at)}</span>
                          {c.user.id === me?.id && (
                            <button onClick={() => handleDeleteComment(c.id)} className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mt-1 leading-snug">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleComment} className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Thêm bình luận..."
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={commentSaving || !commentText.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  Gửi
                </button>
              </form>
            </div>

          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Chỉnh sửa văn bản</h2>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <DocumentForm initial={doc} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} loading={editSaving} />
            </div>
          </div>
        </div>
      )}

      {/* Task creation modal */}
      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Tạo nhiệm vụ từ văn bản</h2>
              <button onClick={() => setTaskFormOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tên nhiệm vụ *</label>
                <input
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Xử lý văn bản..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Mô tả</label>
                <textarea
                  rows={2}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Ưu tiên</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="critical">Khẩn cấp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hạn xử lý</label>
                  <input
                    type="date"
                    value={taskForm.deadline ?? ''}
                    onChange={(e) => setTaskForm((p) => ({ ...p, deadline: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giao cho (người)</label>
                  <select
                    value={taskForm.assignee_id ?? ''}
                    onChange={(e) => setTaskForm((p) => ({ ...p, assignee_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chưa giao --</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.username}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị chủ trì</label>
                  <select
                    value={taskForm.lead_department_id ?? ''}
                    onChange={(e) => setTaskForm((p) => ({ ...p, lead_department_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chưa chọn --</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2 justify-end">
                <button type="button" onClick={() => setTaskFormOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Hủy</button>
                <button type="submit" disabled={taskSaving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                  {taskSaving ? 'Đang tạo...' : 'Tạo nhiệm vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
