import { useEffect, useState } from 'react'
import { FileText, User } from 'lucide-react'
import apiClient from '../../api/client'
import type { DirectiveCreate, DirectivePriority, DirectiveRead, DirectiveStatus } from '../../types/directive'

const STATUSES: { value: DirectiveStatus; label: string }[] = [
  { value: 'draft', label: 'Nháp' },
  { value: 'active', label: 'Đang thực hiện' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const PRIORITIES: { value: DirectivePriority; label: string }[] = [
  { value: 'normal', label: 'Thường' },
  { value: 'urgent', label: 'Khẩn' },
  { value: 'very_urgent', label: 'Hỏa tốc' },
]

const SOURCE_TYPES = [
  { value: '', label: 'Không có nguồn sinh' },
  { value: 'incoming', label: 'Văn bản đến' },
  { value: 'outgoing', label: 'Văn bản đi' },
]

interface UserItem { id: number; username: string; full_name: string | null }
interface Staff { id: number; full_name: string; position: string | null }
interface DeptItem { id: number; name: string; short_name: string | null }
interface DocItem { id: number; doc_number: string | null; title: string; doc_type: string }

interface Props {
  initial?: Partial<DirectiveRead>
  onSubmit: (data: DirectiveCreate) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.split('T')[0]
}

export default function DirectiveForm({ initial, onSubmit, onCancel, loading }: Props) {
  const [users, setUsers] = useState<UserItem[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [depts, setDepts] = useState<DeptItem[]>([])
  const [docs, setDocs] = useState<DocItem[]>([])
  const [sourceType, setSourceType] = useState<string>(() => {
    if (!initial?.doc_id) return ''
    return initial.document?.doc_type ?? 'incoming'
  })

  const [form, setForm] = useState<DirectiveCreate>({
    title: initial?.title ?? '',
    content: initial?.content ?? '',
    issuer_id: initial?.issuer_id ?? 0,
    status: initial?.status ?? 'active',
    priority: initial?.priority ?? 'normal',
    issued_date: toDateInput(initial?.issued_date),
    deadline: toDateInput(initial?.deadline),
    doc_id: initial?.doc_id ?? null,
    assignee_staff_id: initial?.assignee_staff_id ?? null,
    responsible_department_id: initial?.responsible_department_id ?? null,
  })

  useEffect(() => {
    apiClient.get<UserItem[]>('/users').then((r) => {
      const data = r.data
      setUsers(Array.isArray(data) ? data : (data as { items: UserItem[] }).items ?? [])
    }).catch(() => {})
    apiClient.get<{ items: Staff[] }>('/staff?active_only=true&size=200')
      .then((r) => setStaffList(r.data.items)).catch(() => {})
    apiClient.get<DeptItem[]>('/departments')
      .then((r) => setDepts(Array.isArray(r.data) ? r.data : [])).catch(() => {})
  }, [])

  // Load docs when sourceType changes
  useEffect(() => {
    if (!sourceType) { setDocs([]); return }
    apiClient.get<{ items: DocItem[] }>(`/documents?doc_type=${sourceType}&size=200`)
      .then((r) => setDocs(r.data.items))
      .catch(() => {})
  }, [sourceType])

  function set(field: keyof DirectiveCreate, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSourceTypeChange(type: string) {
    setSourceType(type)
    set('doc_id', null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: DirectiveCreate = {
      ...form,
      issued_date: form.issued_date || undefined,
      deadline: form.deadline ? (form.deadline + 'T23:59:59') : undefined,
      doc_id: form.doc_id || null,
      assignee_staff_id: form.assignee_staff_id || null,
    }
    await onSubmit(payload)
  }

  const inp = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 bg-white transition-all placeholder:text-slate-400'
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tiêu đề */}
      <div>
        <label className={lbl}>Tiêu đề chỉ đạo *</label>
        <input
          required
          className={inp}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Nhập tiêu đề chỉ đạo..."
        />
      </div>

      {/* Người chỉ đạo */}
      <div>
        <label className={lbl}>Người / Cơ quan chỉ đạo *</label>
        <select
          required
          className={inp}
          value={form.issuer_id || ''}
          onChange={(e) => set('issuer_id', Number(e.target.value))}
        >
          <option value="">-- Chọn người chỉ đạo --</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name ?? u.username}</option>
          ))}
        </select>
      </div>

      {/* Trạng thái + Ưu tiên */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Trạng thái</label>
          <select className={inp} value={form.status} onChange={(e) => set('status', e.target.value as DirectiveStatus)}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Mức độ ưu tiên</label>
          <select className={inp} value={form.priority} onChange={(e) => set('priority', e.target.value as DirectivePriority)}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Ngày ban hành + Hạn */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Ngày ban hành</label>
          <input
            type="date"
            className={inp}
            value={form.issued_date ?? ''}
            onChange={(e) => set('issued_date', e.target.value)}
          />
        </div>
        <div>
          <label className={lbl}>Hạn hoàn thành</label>
          <input
            type="date"
            className={inp}
            value={form.deadline ?? ''}
            onChange={(e) => set('deadline', e.target.value)}
          />
        </div>
      </div>

      {/* Nguồn sinh — từ VB đến hoặc VB đi */}
      <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60 space-y-3">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <FileText size={11} className="text-purple-500" />
          Nguồn sinh chỉ đạo
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SOURCE_TYPES.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => handleSourceTypeChange(st.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                sourceType === st.value
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
        {sourceType && (
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">
              Chọn {sourceType === 'incoming' ? 'văn bản đến' : 'văn bản đi'}
            </label>
            <select
              className={inp}
              value={form.doc_id ?? ''}
              onChange={(e) => set('doc_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">-- Chọn văn bản --</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.doc_number ? `${d.doc_number} — ` : ''}{d.title}
                </option>
              ))}
            </select>
            {docs.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-1">Không có văn bản nào</p>
            )}
          </div>
        )}
        {form.doc_id && !sourceType && (
          <p className="text-xs text-slate-500">Đã liên kết văn bản #{form.doc_id}</p>
        )}
      </div>

      {/* Người thực hiện — Nhân sự */}
      <div>
        <label className={lbl}>
          <span className="flex items-center gap-1.5">
            <User size={11} className="text-blue-500" />
            Người thực hiện (Nhân sự)
          </span>
        </label>
        <select
          className={inp}
          value={form.assignee_staff_id ?? ''}
          onChange={(e) => set('assignee_staff_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- Chưa giao --</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}{s.position ? ` — ${s.position}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Đơn vị chịu trách nhiệm */}
      <div>
        <label className={lbl}>Đơn vị chịu trách nhiệm</label>
        <select
          className={inp}
          value={form.responsible_department_id ?? ''}
          onChange={(e) => set('responsible_department_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- Chưa xác định --</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.short_name ? `${d.short_name} — ` : ''}{d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Nội dung */}
      <div>
        <label className={lbl}>Nội dung chỉ đạo</label>
        <textarea
          rows={4}
          className={inp}
          value={form.content ?? ''}
          onChange={(e) => set('content', e.target.value)}
          placeholder="Nhập nội dung chi tiết của chỉ đạo..."
        />
      </div>

      <div className="flex gap-3 pt-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Đang lưu...' : 'Lưu chỉ đạo'}
        </button>
      </div>
    </form>
  )
}
