import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { documentsApi, type AISuggestedTask, type BulkTaskItem } from '../../api/documents'
import { departmentsApi, type DeptRead } from '../../api/departments'
import { usersApi, type UserPublic } from '../../api/users'

const PRIORITY_OPTS = [
  { value: 'low',    label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high',   label: 'Cao' },
  { value: 'urgent', label: 'Khẩn' },
]

interface EditableTask extends AISuggestedTask {
  _id: number
  lead_department_id: number | null
  assignee_id: number | null
}

interface Props {
  docId: number
  onClose: () => void
  onCreated: (count: number) => void
}

export default function TaskSuggestModal({ docId, onClose, onCreated }: Props) {
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [source, setSource]     = useState('')
  const [tasks, setTasks]       = useState<EditableTask[]>([])
  const [departments, setDepts] = useState<DeptRead[]>([])
  const [users, setUsers]       = useState<UserPublic[]>([])

  useEffect(() => {
    Promise.all([
      documentsApi.extractTasks(docId),
      departmentsApi.list(),
      usersApi.names(),
    ]).then(([taskRes, deptRes, userRes]) => {
      const suggested = taskRes.data.tasks.map((t, i) => ({
        ...t,
        _id: i,
        lead_department_id: null,
        assignee_id: null,
      }))
      setTasks(suggested)
      setSource(taskRes.data.source)
      setDepts(deptRes.data)
      setUsers(userRes.data)
    }).catch(() => {
      setError('Không thể trích xuất nhiệm vụ. Vui lòng thử lại.')
    }).finally(() => setLoading(false))
  }, [docId])

  function updateTask(id: number, patch: Partial<EditableTask>) {
    setTasks(prev => prev.map(t => t._id === id ? { ...t, ...patch } : t))
  }

  function removeTask(id: number) {
    setTasks(prev => prev.filter(t => t._id !== id))
  }

  async function handleApprove() {
    if (!tasks.length) return
    setSaving(true)
    try {
      const items: BulkTaskItem[] = tasks.map(t => ({
        title: t.title,
        description: t.description || null,
        deadline: t.deadline ? t.deadline + 'T23:59:59' : null,
        priority: t.priority,
        lead_department_id: t.lead_department_id,
        assignee_id: t.assignee_id,
      }))
      const { data } = await documentsApi.bulkCreateTasks(docId, items)
      onCreated(data.created)
      onClose()
    } catch {
      setError('Tạo nhiệm vụ thất bại. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-500" />
            <h2 className="font-bold text-slate-800">Trích xuất nhiệm vụ AI</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Loading */}
          {loading && (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <Loader2 size={32} className="text-violet-500 animate-spin" />
              <p className="text-slate-500 text-sm">AI đang đọc văn bản và phân tích nhiệm vụ...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* No tasks */}
          {!loading && !error && tasks.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">Không tìm thấy nhiệm vụ trong văn bản này</p>
              {source === 'none' && (
                <p className="text-xs mt-1 text-slate-400">Văn bản chưa có file đính kèm để AI đọc</p>
              )}
            </div>
          )}

          {/* Source badge */}
          {!loading && tasks.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {source === 'ai_file' ? '✨ Gemini đọc file gốc' : source === 'ai_text' ? '✨ Gemini đọc văn bản' : '📝 Trích xuất tự động'}
              </span>
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                {tasks.length} nhiệm vụ
              </span>
            </div>
          )}

          {/* Task cards */}
          {!loading && tasks.map((task) => (
            <div key={task._id} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">

              {/* Tên nhiệm vụ */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Tên nhiệm vụ *</label>
                  <input
                    value={task.title}
                    onChange={e => updateTask(task._id, { title: e.target.value })}
                    className="w-full text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="Tên nhiệm vụ"
                  />
                </div>
                <button
                  onClick={() => removeTask(task._id)}
                  className="text-slate-300 hover:text-red-400 transition shrink-0 mt-5"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Mô tả */}
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Mô tả</label>
                <textarea
                  value={task.description ?? ''}
                  onChange={e => updateTask(task._id, { description: e.target.value || null })}
                  rows={2}
                  className="w-full text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                  placeholder="Mô tả chi tiết..."
                />
              </div>

              {/* Hàng 1: Hạn xử lý + Ưu tiên */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Hạn xử lý</label>
                  <input
                    type="date"
                    value={task.deadline || ''}
                    onChange={e => updateTask(task._id, { deadline: e.target.value || null })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Ưu tiên</label>
                  <select
                    value={task.priority}
                    onChange={e => updateTask(task._id, { priority: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    {PRIORITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Hàng 2: Giao cho + Đơn vị chủ trì */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">Giao cho (người)</label>
                  <select
                    value={task.assignee_id ?? ''}
                    onChange={e => updateTask(task._id, { assignee_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    <option value="">— Chưa giao</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                    Đơn vị chủ trì
                    {task.lead_agency && <span className="text-violet-400 normal-case ml-1">(AI: {task.lead_agency.slice(0, 12)})</span>}
                  </label>
                  <select
                    value={task.lead_department_id ?? ''}
                    onChange={e => updateTask(task._id, { lead_department_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    <option value="">— Chưa chọn</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/50 rounded-b-2xl">
            <span className="text-xs text-slate-400">
              {tasks.length > 0 ? `${tasks.length} nhiệm vụ sẽ được tạo` : 'Không có nhiệm vụ'}
            </span>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              >
                <X size={14} className="inline mr-1" />Hủy
              </button>
              <button
                onClick={handleApprove}
                disabled={saving || tasks.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-40 transition"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Duyệt tất cả ({tasks.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
