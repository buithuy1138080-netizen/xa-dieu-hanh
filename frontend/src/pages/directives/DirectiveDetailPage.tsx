import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { directivesApi } from '../../api/directives'
import DirectivePriorityBadge from '../../components/directives/DirectivePriorityBadge'
import DirectiveStatusBadge from '../../components/directives/DirectiveStatusBadge'
import DirectiveForm from '../../components/directives/DirectiveForm'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'
import type {
  DirectiveCreate,
  DirectiveReadDetail,
  DirectiveStatus,
  DirectiveTaskCreate,
} from '../../types/directive'

interface StaffItem { id: number; full_name: string; position: string | null }
interface DeptItem { id: number; name: string; short_name: string | null }

const STATUS_ACTIONS: Partial<Record<DirectiveStatus, { label: string; next: DirectiveStatus; cls: string }[]>> = {
  draft: [
    { next: 'active', label: 'Kích hoạt', cls: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { next: 'cancelled', label: 'Hủy', cls: 'bg-red-100 hover:bg-red-200 text-red-700' },
  ],
  active: [
    { next: 'completed', label: 'Hoàn thành', cls: 'bg-green-600 hover:bg-green-700 text-white' },
    { next: 'cancelled', label: 'Hủy chỉ đạo', cls: 'bg-red-100 hover:bg-red-200 text-red-700' },
  ],
}

const HISTORY_ICONS: Record<string, string> = {
  created: '🆕', updated: '✏️', status_changed: '🔄', unit_added: '➕',
  unit_updated: '📊', unit_removed: '➖', task_linked: '✅', commented: '💬',
  attachment_added: '📎', attachment_removed: '🗑',
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

export default function DirectiveDetailPage() {
  const { id } = useParams<{ id: string }>()
  const directiveId = Number(id)
  const navigate = useNavigate()
  const { user: me } = useAuthStore()

  const [directive, setDirective] = useState<DirectiveReadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [depts, setDepts] = useState<DeptItem[]>([])
  const [unitUsers, setUnitUsers] = useState<{ id: number; username: string; full_name: string | null }[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  const [statusNote, setStatusNote] = useState('')
  const [statusChanging, setStatusChanging] = useState(false)

  // Unit form
  const [unitFormOpen, setUnitFormOpen] = useState(false)
  const [unitForm, setUnitForm] = useState({ unit_name: '', role: '', department_id: '' as string, user_id: '' as string, progress: 0, note: '' })
  const [unitSaving, setUnitSaving] = useState(false)
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null)
  const [editingProgress, setEditingProgress] = useState(0)

  // Task form
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [taskForm, setTaskForm] = useState<DirectiveTaskCreate>({
    title: '', description: '', priority: 'medium', deadline: '', assignee_id: null, assignee_staff_id: null,
  })
  const [taskSaving, setTaskSaving] = useState(false)

  // Attachment
  const [fileUploading, setFileUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const { data } = await directivesApi.get(directiveId)
      setDirective(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200').then((r) => setStaffList(r.data.items)).catch(() => {})
    apiClient.get<DeptItem[]>('/departments').then((r) => setDepts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    apiClient.get<{ id: number; username: string; full_name: string | null }[]>('/users').then((r) => { const d = r.data; setUnitUsers(Array.isArray(d) ? d : (d as { items: typeof d }).items ?? []) }).catch(() => {})
  }, [directiveId])

  async function handleStatusChange(next: DirectiveStatus) {
    setStatusChanging(true)
    try {
      await directivesApi.updateStatus(directiveId, next, statusNote || undefined)
      setStatusNote('')
      await load()
    } finally {
      setStatusChanging(false)
    }
  }

  async function handleEdit(data: DirectiveCreate) {
    setEditSaving(true)
    try {
      await directivesApi.update(directiveId, data)
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
      await directivesApi.addComment(directiveId, commentText.trim())
      setCommentText('')
      await load()
    } finally {
      setCommentSaving(false)
    }
  }

  async function handleDeleteComment(cid: number) {
    await directivesApi.deleteComment(directiveId, cid)
    await load()
  }

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault()
    setUnitSaving(true)
    try {
      await directivesApi.addUnit(directiveId, {
        unit_name: unitForm.unit_name,
        role: unitForm.role || undefined,
        department_id: unitForm.department_id ? Number(unitForm.department_id) : null,
        user_id: unitForm.user_id ? Number(unitForm.user_id) : null,
        progress: unitForm.progress,
        note: unitForm.note || undefined,
      })
      setUnitForm({ unit_name: '', role: '', department_id: '', user_id: '', progress: 0, note: '' })
      setUnitFormOpen(false)
      await load()
    } finally {
      setUnitSaving(false)
    }
  }

  async function handleUpdateProgress(unitId: number) {
    await directivesApi.updateUnitProgress(directiveId, unitId, editingProgress)
    setEditingUnitId(null)
    await load()
  }

  async function handleRemoveUnit(unitId: number) {
    if (!confirm('Xóa đơn vị này?')) return
    await directivesApi.removeUnit(directiveId, unitId)
    await load()
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!taskForm.title.trim()) return
    setTaskSaving(true)
    try {
      await directivesApi.createTask(directiveId, {
        ...taskForm,
        deadline: taskForm.deadline ? (taskForm.deadline + 'T23:59:59') : undefined,
        assignee_id: taskForm.assignee_id || null,
      })
      setTaskFormOpen(false)
      setTaskForm({ title: '', description: '', priority: 'medium', deadline: '', assignee_id: null })
      await load()
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileUploading(true)
    try {
      await directivesApi.uploadAttachment(directiveId, file)
      await load()
    } finally {
      setFileUploading(false)
    }
  }

  async function handleDownloadAttachment(attId: number, filename: string) {
    try {
      const { data } = await directivesApi.downloadAttachment(directiveId, attId)
      const url = URL.createObjectURL(data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  async function handleDeleteAttachment(attId: number) {
    if (!confirm('Xóa file đính kèm?')) return
    await directivesApi.deleteAttachment(directiveId, attId)
    await load()
  }

  async function handleDelete() {
    if (!confirm('Xóa chỉ đạo này?')) return
    await directivesApi.delete(directiveId)
    navigate('/directives')
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!directive) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-slate-500">Không tìm thấy chỉ đạo.</div>
      </AppLayout>
    )
  }

  const statusActions = STATUS_ACTIONS[directive.status] ?? []
  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-7xl mx-auto">

        {/* Top bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => navigate('/directives')} className="text-slate-400 hover:text-slate-700 text-sm">← Danh sách</button>
            <span className="text-slate-300">|</span>
            <DirectiveStatusBadge status={directive.status} />
            <DirectivePriorityBadge priority={directive.priority} />
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditOpen(true)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600">
              ✏ Sửa
            </button>
            <button onClick={handleDelete} className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 transition text-red-600">
              🗑 Xóa
            </button>
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-snug">{directive.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Người chỉ đạo: <span className="font-medium text-slate-700">{directive.issuer.full_name ?? directive.issuer.username}</span>
            {directive.issued_date && <span> · Ngày ban hành: <span className="font-medium text-slate-700">{fmtDate(directive.issued_date)}</span></span>}
          </p>
          {/* Overall progress bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 bg-slate-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${directive.progress}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-indigo-700 w-12 text-right">{directive.progress}%</span>
          </div>
        </div>

        {/* 2-col layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Left */}
          <div className="xl:col-span-2 space-y-4">

            {/* Info */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Thông tin chỉ đạo</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Ngày ban hành', fmtDate(directive.issued_date)],
                  ['Hạn hoàn thành', fmtDate(directive.deadline)],
                  ['Đơn vị chịu trách nhiệm', directive.responsible_department?.name ?? '—'],
                  ['Người thực hiện', directive.assignee_staff?.full_name ?? '—'],
                  ['Người tạo', directive.creator.full_name ?? directive.creator.username],
                  ['Ngày tạo', fmtDateTime(directive.created_at)],
                  ['Cập nhật', fmtDateTime(directive.updated_at)],
                  ['Tiến độ', `${directive.progress}%`],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-slate-400 font-medium">{k}</dt>
                    <dd className="text-slate-700 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {directive.content && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">Nội dung chỉ đạo</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{directive.content}</p>
                </div>
              )}
            </div>

            {/* Units */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Đơn vị thực hiện ({directive.units.length})</h2>
                <button
                  onClick={() => setUnitFormOpen(true)}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold"
                >
                  + Thêm đơn vị
                </button>
              </div>
              {directive.units.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Chưa có đơn vị thực hiện nào</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {directive.units.map((unit) => (
                    <div key={unit.id} className="px-5 py-3.5 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-slate-800">{unit.unit_name}</p>
                          {unit.role && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{unit.role}</span>}
                        </div>
                        {unit.user && (
                          <p className="text-xs text-slate-500">{unit.user.full_name ?? unit.user.username}</p>
                        )}
                        {unit.note && (
                          <p className="text-xs text-slate-400 mt-0.5 italic">"{unit.note}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 w-40">
                        {editingUnitId === unit.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0} max={100}
                              value={editingProgress}
                              onChange={(e) => setEditingProgress(Number(e.target.value))}
                              className="w-14 border border-slate-200 rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-500">%</span>
                            <button
                              onClick={() => handleUpdateProgress(unit.id)}
                              className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                            >✓</button>
                            <button
                              onClick={() => setEditingUnitId(null)}
                              className="text-xs text-slate-400 hover:text-slate-600"
                            >✕</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${unit.progress}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-8 text-right">{unit.progress}%</span>
                            <button
                              onClick={() => { setEditingUnitId(unit.id); setEditingProgress(unit.progress) }}
                              className="text-xs text-slate-400 hover:text-indigo-600 ml-1"
                              title="Cập nhật tiến độ"
                            >✏</button>
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveUnit(unit.id)}
                        className="text-slate-300 hover:text-red-400 text-sm ml-1"
                        title="Xóa đơn vị"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Linked tasks */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Nhiệm vụ liên quan ({directive.linked_tasks.length})</h2>
                <button
                  onClick={() => setTaskFormOpen(true)}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  + Tạo nhiệm vụ
                </button>
              </div>
              {directive.linked_tasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Chưa có nhiệm vụ nào</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {directive.linked_tasks.map((lt) => (
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

            {/* Attachments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">File đính kèm ({directive.attachments.length})</h2>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={fileUploading}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600 disabled:opacity-50"
                >
                  {fileUploading ? 'Đang tải...' : '+ Tải file lên'}
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={handleUploadAttachment} />
              </div>
              {directive.attachments.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Chưa có file đính kèm</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {directive.attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-xl">📎</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{att.filename}</p>
                        <p className="text-xs text-slate-400">{fmtSize(att.file_size)} · {att.user.full_name ?? att.user.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownloadAttachment(att.id, att.filename)}
                          className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition font-medium"
                        >Tải về</button>
                        <button
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="text-xs text-slate-300 hover:text-red-400"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">

            {/* Status actions */}
            {statusActions.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Cập nhật trạng thái</h2>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú (tuỳ chọn)..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-col gap-2">
                  {statusActions.map((action) => (
                    <button
                      key={action.next}
                      onClick={() => handleStatusChange(action.next)}
                      disabled={statusChanging}
                      className={`w-full py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${action.cls}`}
                    >
                      {statusChanging ? 'Đang cập nhật...' : action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Lịch sử</h2>
              {directive.history.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Chưa có lịch sử</p>
              ) : (
                <ol className="relative border-l border-slate-200 ml-3 space-y-4">
                  {directive.history.map((h) => (
                    <li key={h.id} className="ml-5">
                      <span className="absolute -left-2.5 w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xs">
                        {HISTORY_ICONS[h.action] ?? '•'}
                      </span>
                      <p className="text-xs font-medium text-slate-700">
                        {h.user.full_name ?? h.user.username}
                        {h.new_status && <span className="ml-1 text-indigo-600">→ {h.new_status}</span>}
                        {h.new_progress != null && <span className="ml-1 text-green-600">→ {h.new_progress}%</span>}
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
                Bình luận ({directive.comments.length})
              </h2>
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {directive.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
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
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={commentSaving || !commentText.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
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
              <h2 className="font-bold text-slate-800">Chỉnh sửa chỉ đạo</h2>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <DirectiveForm initial={directive} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} loading={editSaving} />
            </div>
          </div>
        </div>
      )}

      {/* Add unit modal */}
      {unitFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Thêm đơn vị thực hiện</h2>
              <button onClick={() => setUnitFormOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleAddUnit} className="p-6 space-y-4">
              <div>
                <label className={lbl}>Tên đơn vị *</label>
                <input required className={inp} value={unitForm.unit_name} onChange={(e) => setUnitForm((p) => ({ ...p, unit_name: e.target.value }))} placeholder="VD: Phòng kinh tế, Tổ dân phố..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Vai trò</label>
                  <input className={inp} value={unitForm.role} onChange={(e) => setUnitForm((p) => ({ ...p, role: e.target.value }))} placeholder="Chủ trì / Phối hợp..." />
                </div>
                <div>
                  <label className={lbl}>Đơn vị (liên kết)</label>
                  <select className={inp} value={unitForm.department_id} onChange={(e) => setUnitForm((p) => ({ ...p, department_id: e.target.value }))}>
                    <option value="">-- Chưa xác định --</option>
                    {depts.map((d) => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Người phụ trách (tài khoản)</label>
                <select className={inp} value={unitForm.user_id} onChange={(e) => setUnitForm((p) => ({ ...p, user_id: e.target.value }))}>
                  <option value="">-- Chưa xác định --</option>
                  {unitUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.username}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Tiến độ ban đầu (%)</label>
                <input type="number" min={0} max={100} className={inp} value={unitForm.progress} onChange={(e) => setUnitForm((p) => ({ ...p, progress: Number(e.target.value) }))} />
              </div>
              <div>
                <label className={lbl}>Ghi chú</label>
                <textarea rows={2} className={inp} value={unitForm.note} onChange={(e) => setUnitForm((p) => ({ ...p, note: e.target.value }))} placeholder="Ghi chú..." />
              </div>
              <div className="flex gap-3 pt-2 justify-end">
                <button type="button" onClick={() => setUnitFormOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">Hủy</button>
                <button type="submit" disabled={unitSaving} className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
                  {unitSaving ? 'Đang lưu...' : 'Thêm đơn vị'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task creation modal */}
      {taskFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Tạo nhiệm vụ từ chỉ đạo</h2>
              <button onClick={() => setTaskFormOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className={lbl}>Tên nhiệm vụ *</label>
                <input required value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Thực hiện chỉ đạo..." className={inp} />
              </div>
              <div>
                <label className={lbl}>Mô tả</label>
                <textarea rows={2} value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Ưu tiên</label>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))} className={inp}>
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="critical">Khẩn cấp</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Hạn xử lý</label>
                  <input type="date" value={taskForm.deadline ?? ''} onChange={(e) => setTaskForm((p) => ({ ...p, deadline: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className={lbl}>Giao cho (Nhân sự)</label>
                <select value={taskForm.assignee_staff_id ?? ''} onChange={(e) => setTaskForm((p) => ({ ...p, assignee_staff_id: e.target.value ? Number(e.target.value) : null, assignee_id: null }))} className={inp}>
                  <option value="">-- Chưa giao --</option>
                  {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.position ? ` — ${s.position}` : ''}</option>)}
                </select>
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
