import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ChevronRight, ClipboardList, FileText, Paperclip, Send,
  Trash2, Activity, Clock, User, Building2, MessageSquare, Pencil, X, ListTree, Plus,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { tasksApi } from '../../api/tasks'
import { getApiErrorMessage } from '../../utils/apiError'
import AppLayout from '../../components/layout/AppLayout'
import PriorityBadge from '../../components/tasks/PriorityBadge'
import StatusBadge from '../../components/tasks/StatusBadge'
import TaskForm from '../../components/tasks/TaskForm'
import type { TaskDetail, TaskStatus } from '../../types/task'
import { useAuthStore } from '../../store/authStore'

const STATUS_FLOW: { id: TaskStatus; label: string; activeCls: string; baseCls: string }[] = [
  { id: 'pending',     label: 'Chờ xử lý',      activeCls: 'bg-slate-600 text-white ring-2 ring-slate-400 ring-offset-1',     baseCls: 'border border-slate-300 text-slate-600 hover:bg-slate-50' },
  { id: 'in_progress', label: 'Đang thực hiện',  activeCls: 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-1',       baseCls: 'border border-blue-200 text-blue-600 hover:bg-blue-50' },
  { id: 'overdue',     label: 'Quá hạn',         activeCls: 'bg-orange-600 text-white ring-2 ring-orange-400 ring-offset-1',   baseCls: 'border border-orange-200 text-orange-600 hover:bg-orange-50' },
  { id: 'completed',   label: 'Hoàn thành',      activeCls: 'bg-emerald-600 text-white ring-2 ring-emerald-400 ring-offset-1', baseCls: 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50' },
  { id: 'cancelled',   label: 'Đã huỷ',          activeCls: 'bg-red-500 text-white ring-2 ring-red-400 ring-offset-1',         baseCls: 'border border-red-200 text-red-500 hover:bg-red-50' },
]

const AUDIT_LABELS: Record<string, string> = {
  created:          'đã tạo nhiệm vụ',
  status_changed:   'đã đổi trạng thái',
  updated:          'đã cập nhật',
  progress_updated: 'đã cập nhật tiến độ',
  comment_added:    'đã bình luận',
  attachment_added: 'đã đính kèm file',
  deleted:          'đã xóa nhiệm vụ',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý', in_progress: 'Đang thực hiện', completed: 'Hoàn thành', cancelled: 'Đã huỷ', overdue: 'Quá hạn',
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}
function colorHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  const colors = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#0284c7','#be185d']
  return colors[Math.abs(h) % colors.length]
}
function initials(name: string | null | undefined, username: string) {
  return ((name ?? username) || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canDelete  = user?.role === 'admin' || user?.role === 'leader'
  const isStaff    = user?.role === 'staff'

  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [commenting, setCommenting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showCreateSubtask, setShowCreateSubtask] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Nhân viên được phân công thực hiện (assignee) có thể đổi trạng thái + đính kèm file
  const isAssignee = !!task && (
    (user?.id != null && task.assignee_id === user.id) ||
    (user?.staff_id != null && task.assignee_staff_id === user.staff_id)
  )
  // Nhân viên tự tạo nhiệm vụ
  const isCreator = !!task && user?.id != null && task.created_by === user.id
  // Nhân viên thuộc đơn vị chủ trì hoặc phối hợp
  const isOwnDept = !!task && user?.department_id != null && (
    task.lead_department_id === user.department_id ||
    task.departments.some(d => d.department_id === user.department_id)
  )
  // View-only: nhân viên không phải người được giao VÀ không thuộc đơn vị phụ trách
  const isViewOnly = isStaff && !isAssignee && !isOwnDept

  // Nhân viên (creator hoặc assignee) được chuyển sang "đang thực hiện" hoặc "hoàn thành"
  function canClickStatus(statusId: string): boolean {
    if (isViewOnly) return false
    if (isStaff) return statusId === 'in_progress' || statusId === 'completed'
    return true
  }

  function canEdit(t: TaskDetail | null): boolean {
    if (!t) return false
    if (user?.role === 'admin' || user?.role === 'leader') return true
    if (isViewOnly) return false
    // Nhân viên: chỉ được sửa nhiệm vụ do mình tạo
    if (isStaff) return isCreator
    // Manager: được sửa nếu là người tạo (hoặc đơn vị mình — backend kiểm tra)
    return t.created_by === user?.id
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function fetchTask() {
    if (!id) return
    try {
      const { data } = await tasksApi.get(parseInt(id))
      setTask(data)
      setProgress(data.progress_percent)
    } catch {
      showToast('Không thể tải nhiệm vụ', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTask() }, [id])

  async function handleStatusChange(newStatus: TaskStatus) {
    if (!task || task.status === newStatus || actionLoading) return
    if (!canClickStatus(newStatus)) return
    // Hoàn thành bắt buộc phải có file đính kèm
    if (newStatus === 'completed' && task.attachments.length === 0) {
      showToast('⚠️ Phải đính kèm ít nhất 1 file trước khi đánh dấu Hoàn thành', 'error')
      // Scroll đến phần đính kèm
      document.querySelector('[data-section="attachments"]')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setActionLoading(true)
    try {
      await tasksApi.updateStatus(task.id, newStatus)
      showToast('Đã cập nhật trạng thái')
      fetchTask()
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Cập nhật trạng thái thất bại'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleProgressSave() {
    if (!task || actionLoading) return
    setActionLoading(true)
    try {
      await tasksApi.updateProgress(task.id, progress)
      showToast('Đã cập nhật tiến độ')
      fetchTask()
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Cập nhật tiến độ thất bại'), 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleComment(e: FormEvent) {
    e.preventDefault()
    if (!task || !comment.trim()) return
    setCommenting(true)
    try {
      await tasksApi.addComment(task.id, comment.trim())
      setComment('')
      fetchTask()
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Không thể gửi bình luận'), 'error')
    } finally {
      setCommenting(false)
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!task || !confirm('Xóa bình luận này?')) return
    try {
      await tasksApi.deleteComment(task.id, commentId)
      fetchTask()
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Xóa bình luận thất bại'), 'error')
    }
  }

  async function uploadFile(file: File) {
    if (!task || !file) return
    setUploading(true)
    try {
      await tasksApi.uploadAttachment(task.id, file)
      showToast('Đã đính kèm file')
      fetchTask()
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Đính kèm file thất bại'), 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    setDragging(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    setDragging(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  async function handleDeleteAttachment(attId: number) {
    if (!task || !confirm('Xóa file đính kèm này?')) return
    try {
      await tasksApi.deleteAttachment(task.id, attId)
      fetchTask()
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Xóa file thất bại'), 'error')
    }
  }

  async function handleDelete() {
    if (!task || !confirm(`Xóa nhiệm vụ "${task.title}"?`)) return
    try {
      await tasksApi.delete(task.id)
      navigate('/tasks')
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Xóa nhiệm vụ thất bại'), 'error')
    }
  }

  if (loading) return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center h-full p-16">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-slate-200" />
            <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-t-blue-500 animate-spin" />
          </div>
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      </div>
    </AppLayout>
  )
  if (!task) return (
    <AppLayout>
      <div className="p-8 flex items-center gap-2 text-red-500">
        <AlertTriangle size={16} />
        <span className="text-sm">Không tìm thấy nhiệm vụ</span>
      </div>
    </AppLayout>
  )

  const sourceLabel = task.directive_id
    ? { icon: <ClipboardList size={13} className="text-purple-500" />, text: `Chỉ đạo #${task.directive_id}${task.directive ? ': ' + task.directive.title : ''}`, cls: 'bg-purple-50 border-purple-100 text-purple-700' }
    : task.incoming_document_id
    ? { icon: <FileText size={13} className="text-blue-500" />, text: `VB đến #${task.incoming_document_id}${task.incoming_document ? ': ' + (task.incoming_document.doc_number || task.incoming_document.title) : ''}`, cls: 'bg-blue-50 border-blue-100 text-blue-700' }
    : task.outgoing_document_id
    ? { icon: <FileText size={13} className="text-teal-500" />, text: `VB đi #${task.outgoing_document_id}${task.outgoing_document ? ': ' + (task.outgoing_document.doc_number || task.outgoing_document.title) : ''}`, cls: 'bg-teal-50 border-teal-100 text-teal-700' }
    : null

  return (
    <AppLayout>
      {toast && (
        <div className={`fixed bottom-20 right-3 md:bottom-6 md:right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <button onClick={() => navigate('/tasks')} className="text-slate-400 hover:text-blue-600 transition-colors">Nhiệm vụ</button>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{task.task_code ?? `#${task.id}`}</span>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="text-slate-600 font-medium truncate max-w-xs">{task.title}</span>
        </nav>

        {/* Source banner */}
        {sourceLabel && (
          <div className={`flex items-center gap-2.5 px-4 py-2.5 border rounded-xl text-sm font-medium ${sourceLabel.cls}`}>
            {sourceLabel.icon}
            <span className="font-semibold text-xs uppercase tracking-wide opacity-70 mr-1">Nguồn:</span>
            <span>{sourceLabel.text}</span>
          </div>
        )}

        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg md:text-2xl font-bold text-slate-800 leading-snug">{task.title}</h1>
          <div className="flex gap-2 shrink-0">
            {canEdit(task) && (
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
              >
                <Pencil size={13} />Sửa
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
              >
                <Trash2 size={13} />Xóa
              </button>
            )}
          </div>
        </div>

        {/* Status flow + progress */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 py-3 px-4 bg-white rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex gap-2 flex-wrap">
            {STATUS_FLOW.map((s) => (
              <button
                key={s.id}
                onClick={() => canClickStatus(s.id) && handleStatusChange(s.id)}
                disabled={actionLoading || !canClickStatus(s.id)}
                title={
                  !canClickStatus(s.id)
                    ? isViewOnly ? 'Bạn chỉ có quyền xem' : 'Không có quyền thay đổi trạng thái này'
                    : undefined
                }
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:cursor-not-allowed ${!canClickStatus(s.id) ? 'opacity-60' : 'disabled:opacity-60'} ${task.status === s.id ? s.activeCls : s.baseCls}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-slate-400">Tiến độ</span>
            <input
              type="range" min={0} max={100} step={5}
              value={progress}
              onChange={(e) => setProgress(parseInt(e.target.value))}
              className="w-28 accent-blue-600 cursor-pointer"
            />
            <span className="text-sm font-bold text-slate-700 w-9">{progress}%</span>
            {progress !== task.progress_percent && (
              <button
                onClick={handleProgressSave}
                disabled={actionLoading}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
              >
                {actionLoading ? '...' : 'Lưu'}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden -mt-3">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${task.progress_percent}%` }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
          {/* Left: Description + Departments + Comments + Attachments */}
          <div className="lg:col-span-2 space-y-4">
            {/* Description */}
            <Card icon={<FileText size={14} />} title="Mô tả">
              {task.description
                ? <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{task.description}</p>
                : <p className="text-sm text-slate-400 italic">Chưa có mô tả</p>
              }
              {task.content_summary && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Tóm tắt nội dung</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{task.content_summary}</p>
                </div>
              )}
            </Card>

            {/* Departments */}
            {task.departments.length > 0 && (
              <Card icon={<Building2 size={14} />} title="Đơn vị thực hiện">
                <div className="space-y-2">
                  {task.departments.map((td) => (
                    <div key={td.id} className="flex items-center gap-3 py-1.5 px-3 bg-slate-50 rounded-lg">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${td.role === 'lead' ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
                        {td.role === 'lead' ? 'Chủ trì' : 'Phối hợp'}
                      </span>
                      <span className="text-sm text-slate-700">{td.department?.name ?? `ID: ${td.department_id}`}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Subtasks */}
            {(task.subtasks.length > 0 || true) && (
              <Card
                icon={<ListTree size={14} />}
                title={`Nhiệm vụ con (${task.subtasks.length})`}
                action={
                  <button
                    onClick={() => setShowCreateSubtask(true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
                  >
                    <Plus size={11} /> Thêm
                  </button>
                }
              >
                {task.subtasks.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-3">Chưa có nhiệm vụ con</p>
                ) : (
                  <div className="space-y-2">
                    {task.subtasks.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => navigate(`/tasks/${sub.id}`)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-xl transition-colors text-left group"
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          sub.status === 'completed' ? 'bg-emerald-500' :
                          sub.status === 'in_progress' ? 'bg-blue-500' :
                          sub.status === 'overdue' ? 'bg-orange-500' :
                          sub.status === 'cancelled' ? 'bg-red-400' : 'bg-slate-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 font-medium truncate group-hover:text-blue-700">{sub.title}</p>
                          {sub.task_code && <p className="text-[10px] font-mono text-slate-400">{sub.task_code}</p>}
                        </div>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          sub.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          sub.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          sub.status === 'overdue' ? 'bg-orange-100 text-orange-700' :
                          sub.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {sub.progress_percent}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Comments */}
            <Card icon={<MessageSquare size={14} />} title={`Bình luận (${task.comments.length})`}>
              <form onSubmit={handleComment} className="flex gap-2.5 mb-4">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Thêm bình luận..."
                  className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || commenting}
                  className="px-3.5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  <Send size={13} />
                  <span className="text-sm font-medium">Gửi</span>
                </button>
              </form>

              <div className="space-y-3">
                {task.comments.length === 0 && (
                  <div className="flex flex-col items-center py-6 text-slate-300">
                    <MessageSquare size={24} className="mb-2 opacity-40" />
                    <p className="text-sm">Chưa có bình luận</p>
                  </div>
                )}
                {task.comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm ring-1 ring-white"
                      style={{ backgroundColor: colorHash(c.user?.username ?? 'user') }}
                    >
                      {initials(c.user?.full_name, c.user?.username ?? 'U')}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-slate-700">{c.user?.full_name ?? c.user?.username ?? '—'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{fmtDateTime(c.created_at)}</span>
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-slate-300 hover:text-red-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Attachments */}
            <div data-section="attachments">
            <Card
              icon={<Paperclip size={14} />}
              title={`Tệp đính kèm (${task.attachments.length})`}
              action={
                !isViewOnly ? (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? 'Đang tải...' : '+ Đính kèm'}
                  </button>
                ) : undefined
              }
            >
              <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />

              {/* Drag & drop zone */}
              {!isViewOnly && (
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`mb-3 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed cursor-pointer transition-all text-sm
                    ${dragging
                      ? 'border-blue-400 bg-blue-50 text-blue-600'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 text-slate-400'
                    }`}
                >
                  <Paperclip size={18} className="mb-1" />
                  <span>{dragging ? 'Thả file vào đây' : 'Kéo thả hoặc nhấn để đính kèm'}</span>
                  {task.attachments.length === 0 && (
                    <span className="text-xs text-amber-500 mt-1">⚠️ Cần đính kèm file trước khi Hoàn thành</span>
                  )}
                </div>
              )}

              {task.attachments.length === 0 && isViewOnly && (
                <div className="flex flex-col items-center py-6 text-slate-300">
                  <Paperclip size={24} className="mb-2 opacity-40" />
                  <p className="text-sm">Chưa có tệp đính kèm</p>
                </div>
              )}
              <div className="space-y-2">
                {task.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Paperclip size={13} className="text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-700 font-medium">{a.filename}</p>
                        <p className="text-[10px] text-slate-400">{fmtBytes(a.file_size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAttachment(a.id)}
                      className="text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
            </div>{/* end data-section="attachments" */}
          </div>{/* end lg:col-span-2 */}

          {/* Right: Details + Audit log */}
          <div className="space-y-4">
            <Card icon={<User size={14} />} title="Chi tiết">
              <div className="space-y-3">
                <Row label="Trạng thái"><StatusBadge status={task.status} /></Row>
                <Row label="Ưu tiên"><PriorityBadge priority={task.priority} /></Row>
                <Row label="Tiến độ">
                  <span className="text-sm font-bold text-blue-600">{task.progress_percent}%</span>
                </Row>
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <Row label="Hạn xử lý">
                    <span className={`text-xs font-medium ${task.is_overdue ? 'text-red-500' : 'text-slate-600'}`}>
                      {fmtDate(task.due_date)}
                    </span>
                  </Row>
                  {task.start_date && (
                    <Row label="Ngày bắt đầu">
                      <span className="text-xs text-slate-500">{fmtDate(task.start_date)}</span>
                    </Row>
                  )}
                  {task.completed_at && (
                    <Row label="Hoàn thành lúc">
                      <span className="text-xs text-emerald-600 font-medium">{fmtDate(task.completed_at)}</span>
                    </Row>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <Row label="Đơn vị chủ trì">
                    <span className="text-xs text-slate-600">{task.lead_department?.name ?? '—'}</span>
                  </Row>
                  <Row label="Thực hiện">
                    <span className="text-xs text-slate-600">
                      {task.assignee_staff?.full_name
                        ?? task.assignee?.full_name
                        ?? task.assignee?.username
                        ?? '—'}
                    </span>
                  </Row>
                  {task.supervisor && (
                    <Row label="Giám sát">
                      <span className="text-xs text-slate-600">{task.supervisor.full_name ?? task.supervisor.username}</span>
                    </Row>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <Row label="Tạo bởi">
                    <span className="text-xs text-slate-500">{task.creator?.full_name ?? task.creator?.username ?? '—'}</span>
                  </Row>
                  <Row label="Ngày tạo">
                    <span className="text-xs text-slate-400">{fmtDate(task.created_at)}</span>
                  </Row>
                </div>
                {task.completion_note && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Ghi chú hoàn thành</p>
                    <p className="text-xs text-slate-600 leading-relaxed bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">{task.completion_note}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Audit log */}
            <Card icon={<Activity size={14} />} title="Lịch sử hoạt động">
              {task.audit_logs.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4">Chưa có lịch sử</p>
              )}
              <div className="space-y-0 max-h-72 overflow-y-auto -mr-1 pr-1">
                {task.audit_logs.map((log, i) => (
                  <div key={log.id} className="flex gap-2.5 relative">
                    {i < task.audit_logs.length - 1 && (
                      <div className="absolute left-[5px] top-4 bottom-0 w-px bg-slate-100" />
                    )}
                    <div className="w-3 h-3 rounded-full bg-blue-400 mt-1.5 shrink-0 ring-2 ring-white z-10" />
                    <div className="pb-3 flex-1 min-w-0">
                      <p className="text-xs text-slate-600 leading-snug">
                        <span className="font-semibold text-slate-700">{log.user?.full_name ?? log.user?.username ?? '—'}</span>
                        {' '}
                        <span className="text-slate-500">{AUDIT_LABELS[log.action] ?? log.action}</span>
                        {log.action === 'status_changed' && log.old_value && log.new_value && (
                          <span className="text-slate-400"> ({STATUS_LABEL[log.old_value] ?? log.old_value} → {STATUS_LABEL[log.new_value] ?? log.new_value})</span>
                        )}
                        {log.action === 'progress_updated' && log.new_value && (
                          <span className="text-slate-400"> → {log.new_value}%</span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock size={9} />
                        {fmtDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
      {showEdit && (
        <TaskForm
          task={task}
          onClose={() => setShowEdit(false)}
          onSuccess={() => { setShowEdit(false); fetchTask() }}
        />
      )}
      {showCreateSubtask && (
        <TaskForm
          initialParentTaskId={task.id}
          onClose={() => setShowCreateSubtask(false)}
          onSuccess={() => { setShowCreateSubtask(false); fetchTask() }}
        />
      )}
    </AppLayout>
  )
}

function Card({
  icon, title, children, action,
}: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-700">
          <span className="text-blue-500">{icon}</span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}
