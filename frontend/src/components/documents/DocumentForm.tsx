import { useEffect, useState } from 'react'
import { Building2, User } from 'lucide-react'
import apiClient from '../../api/client'
import type { DocumentCreate, DocumentRead } from '../../types/document'

const DOC_TYPES = [
  { value: 'incoming', label: 'Văn bản đến' },
  { value: 'outgoing', label: 'Văn bản đi' },
  { value: 'internal', label: 'Nội bộ' },
]

const CATEGORIES = [
  'Quyết định', 'Công văn', 'Thông báo', 'Báo cáo',
  'Kế hoạch', 'Hướng dẫn', 'Biên bản', 'Tờ trình', 'Nghị quyết', 'Khác',
]

const PRIORITIES = [
  { value: 'normal', label: 'Thường' },
  { value: 'urgent', label: 'Khẩn' },
  { value: 'very_urgent', label: 'Hỏa tốc' },
]

interface Dept { id: number; name: string; short_name: string | null }
interface Staff { id: number; full_name: string; position: string | null }

interface Props {
  initial?: Partial<DocumentRead>
  onSubmit: (data: DocumentCreate) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.split('T')[0]
}

function toDatetimeInput(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.split('T')[0]
}

export default function DocumentForm({ initial, onSubmit, onCancel, loading }: Props) {
  const [depts, setDepts] = useState<Dept[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [form, setForm] = useState<DocumentCreate>({
    doc_number: initial?.doc_number ?? '',
    title: initial?.title ?? '',
    doc_type: initial?.doc_type ?? 'incoming',
    category: initial?.category ?? '',
    issuer: initial?.issuer ?? '',
    responsible_department_id: initial?.responsible_department_id ?? null,
    issue_date: toDateInput(initial?.issue_date) || '',
    received_date: toDateInput(initial?.received_date) || '',
    deadline: toDatetimeInput(initial?.deadline) || '',
    priority: initial?.priority ?? 'normal',
    summary: initial?.summary ?? '',
    assignee_id: initial?.assignee_id ?? null,
    assignee_staff_id: initial?.assignee_staff_id ?? null,
  })

  useEffect(() => {
    apiClient.get<Dept[]>('/departments').then((r) => setDepts(r.data)).catch(() => {})
    apiClient.get<{ items: Staff[] }>('/staff?active_only=true&size=200')
      .then((r) => setStaffList(r.data.items)).catch(() => {})
  }, [])

  function set(field: keyof DocumentCreate, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleDeptChange(deptId: number | null) {
    set('responsible_department_id', deptId)
    if (deptId) {
      const dept = depts.find((d) => d.id === deptId)
      if (dept) set('issuer', dept.short_name ?? dept.name)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: DocumentCreate = {
      ...form,
      issue_date: form.issue_date || undefined,
      received_date: form.received_date || undefined,
      deadline: form.deadline ? (form.deadline + 'T23:59:59') : undefined,
      assignee_id: form.assignee_id || null,
      assignee_staff_id: form.assignee_staff_id || null,
      responsible_department_id: form.responsible_department_id || null,
    }
    await onSubmit(payload)
  }

  const inp = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 bg-white transition-all placeholder:text-slate-400'
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'
  const isOutgoing = form.doc_type === 'outgoing'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Số hiệu + Loại */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Số hiệu văn bản</label>
          <input className={inp} value={form.doc_number} onChange={(e) => set('doc_number', e.target.value)} placeholder="VD: 123/UBND-VP" />
        </div>
        <div>
          <label className={lbl}>Loại văn bản *</label>
          <select className={inp} value={form.doc_type} onChange={(e) => set('doc_type', e.target.value as DocumentCreate['doc_type'])}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Trích yếu */}
      <div>
        <label className={lbl}>Trích yếu *</label>
        <input required className={inp} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Nội dung trích yếu văn bản" />
      </div>

      {/* Hình thức + Ưu tiên */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Hình thức</label>
          <select className={inp} value={form.category ?? ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">-- Chọn --</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Độ ưu tiên</label>
          <select className={inp} value={form.priority} onChange={(e) => set('priority', e.target.value as DocumentCreate['priority'])}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Cơ quan ban hành — dept picker cho văn bản đi, text cho văn bản đến/nội bộ */}
      {isOutgoing ? (
        <div>
          <label className={lbl}>
            <span className="flex items-center gap-1.5">
              <Building2 size={11} className="text-blue-500" />
              Cơ quan ban hành (Đơn vị)
            </span>
          </label>
          <select
            className={inp}
            value={form.responsible_department_id ?? ''}
            onChange={(e) => handleDeptChange(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Chọn đơn vị ban hành --</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>
            ))}
          </select>
          {form.responsible_department_id && (
            <p className="text-[11px] text-slate-400 mt-1">
              Tên sẽ hiển thị: <span className="font-medium text-slate-600">{form.issuer}</span>
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className={lbl}>Cơ quan ban hành</label>
          <input className={inp} value={form.issuer ?? ''} onChange={(e) => set('issuer', e.target.value)} placeholder="VD: UBND tỉnh, Bộ Nội vụ..." />
        </div>
      )}

      {/* Ngày ban hành / nhận / hạn */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={lbl}>Ngày ban hành</label>
          <input type="date" className={inp} value={form.issue_date ?? ''} onChange={(e) => set('issue_date', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Ngày nhận</label>
          <input type="date" className={inp} value={form.received_date ?? ''} onChange={(e) => set('received_date', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Hạn xử lý</label>
          <input type="date" className={inp} value={form.deadline ?? ''} onChange={(e) => set('deadline', e.target.value)} />
        </div>
      </div>

      {/* Người thực hiện — từ Nhân sự */}
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

      {/* Tóm tắt */}
      <div>
        <label className={lbl}>Nội dung tóm tắt</label>
        <textarea rows={3} className={inp} value={form.summary ?? ''} onChange={(e) => set('summary', e.target.value)} placeholder="Tóm tắt nội dung văn bản..." />
      </div>

      <div className="flex gap-3 pt-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Hủy
        </button>
        <button type="submit" disabled={loading} className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
          {loading ? 'Đang lưu...' : 'Lưu văn bản'}
        </button>
      </div>
    </form>
  )
}
