import { useEffect, useRef, useState } from 'react'
import { Building2, Eye, Paperclip, Sparkles, User, X } from 'lucide-react'
import apiClient from '../../api/client'
import { documentsApi } from '../../api/documents'
import { programsApi } from '../../api/programs'
import type { Program } from '../../api/programs'
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
  onSubmit: (data: DocumentCreate, file?: File | null) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

function toDateInput(iso: string | null | undefined) {
  if (!iso) return ''
  return iso.split('T')[0]
}

export default function DocumentForm({ initial, onSubmit, onCancel, loading }: Props) {
  const [depts, setDepts] = useState<Dept[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [form, setForm] = useState<DocumentCreate>({
    doc_number: initial?.doc_number ?? '',
    title: initial?.title ?? '',
    doc_type: initial?.doc_type ?? 'incoming',
    category: initial?.category ?? '',
    issuer: initial?.issuer ?? '',
    responsible_department_id: initial?.responsible_department_id ?? null,
    coordinating_dept_ids: initial?.coordinating_dept_ids ?? [],
    issue_date: toDateInput(initial?.issue_date) || '',
    received_date: toDateInput(initial?.received_date) || '',
    deadline: toDateInput(initial?.deadline) || '',
    priority: initial?.priority ?? 'normal',
    summary: initial?.summary ?? '',
    assignee_id: initial?.assignee_id ?? null,
    assignee_staff_id: initial?.assignee_staff_id ?? null,
    program_id: initial?.program_id ?? null,
  })

  // AI file attach state
  const [aiFile, setAiFile] = useState<File | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [aiWarn, setAiWarn] = useState<string | null>(null)
  const [aiSummaryPoints, setAiSummaryPoints] = useState<string[]>([])
  const [aiKeywords, setAiKeywords] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const AI_SUPPORTED = ['.pdf', '.jpg', '.jpeg', '.png']

  useEffect(() => {
    apiClient.get<Dept[]>('/departments').then((r) => setDepts(r.data)).catch(() => {})
    apiClient.get<{ items: Staff[] }>('/staff?active_only=true&size=200')
      .then((r) => setStaffList(r.data.items)).catch(() => {})
    programsApi.list().then((r) => setPrograms(r.data)).catch(() => {})
  }, [])

  function set(field: keyof DocumentCreate, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // clear AI highlight for manually edited fields
    setAiFilledFields((prev) => { const s = new Set(prev); s.delete(field); return s })
  }

  function toggleCoordDept(deptId: number, checked: boolean) {
    const cur = form.coordinating_dept_ids ?? []
    set('coordinating_dept_ids', checked ? [...cur, deptId] : cur.filter((id) => id !== deptId))
  }

  async function runAiParse(file: File) {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    if (!AI_SUPPORTED.includes(ext)) {
      setAiWarn(`File đính kèm ✓ — AI chỉ đọc PDF/JPG/PNG, điền thủ công`)
      return
    }
    setAiLoading(true)
    setAiWarn(null)
    setAiFilledFields(new Set())
    setAiSummaryPoints([])
    setAiKeywords([])
    try {
      const { data } = await documentsApi.aiParse(file)
      const filled = new Set<string>()
      const updates: Partial<DocumentCreate> = {}
      if (data.doc_number) { updates.doc_number = data.doc_number; filled.add('doc_number') }
      if (data.title)       { updates.title = data.title;           filled.add('title') }
      if (data.issuer)      { updates.issuer = data.issuer;         filled.add('issuer') }
      if (data.summary)     { updates.summary = data.summary;       filled.add('summary') }
      if (data.category)    { updates.category = data.category;     filled.add('category') }
      if (data.issue_date)  { updates.issue_date = data.issue_date; filled.add('issue_date') }
      setForm((prev) => ({ ...prev, ...updates }))
      setAiFilledFields(filled)
      if (data.summary_points?.length) setAiSummaryPoints(data.summary_points)
      if (data.keywords?.length) setAiKeywords(data.keywords)
      if (filled.size === 0 && !data.summary_points?.length) {
        setAiWarn('File đính kèm ✓ — AI không nhận dạng được nội dung, điền thủ công')
      }
    } catch {
      setAiWarn('File đính kèm ✓ — AI không đọc được, điền thủ công')
    } finally {
      setAiLoading(false)
    }
  }

  function handleFileSelect(file: File) {
    setAiFile(file)
    setAiWarn(null)
    setAiFilledFields(new Set())
    runAiParse(file)
  }

  function handleViewFile() {
    if (!aiFile) return
    const url = URL.createObjectURL(aiFile)
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  function clearFile() {
    setAiFile(null)
    setAiFilledFields(new Set())
    setAiWarn(null)
    setAiSummaryPoints([])
    setAiKeywords([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
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
      coordinating_dept_ids: form.coordinating_dept_ids ?? [],
    }
    await onSubmit(payload, aiFile)
  }

  const inp = (field?: string) =>
    `w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 bg-white transition-all placeholder:text-slate-400 ${
      field && aiFilledFields.has(field)
        ? 'border-blue-300 bg-blue-50/50'
        : 'border-slate-200'
    }`
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1.5'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── AI File Attach Zone ── */}
      <div>
        <label className={lbl}>
          <span className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-violet-500" />
            Đính kèm văn bản — AI đọc tự động
          </span>
        </label>

        {!aiFile ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/30'
            }`}
          >
            <Paperclip size={20} className="text-slate-400" />
            <p className="text-sm text-slate-500">
              Kéo thả hoặc <span className="text-violet-600 font-semibold">chọn file</span>
            </p>
            <p className="text-xs text-slate-400">PDF, JPG, PNG — AI sẽ tự điền thông tin</p>
          </div>
        ) : (
          <div className={`border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${
            aiLoading
              ? 'border-violet-200 bg-violet-50/40'
              : aiWarn
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-green-200 bg-green-50/40'
          }`}>
            <Paperclip size={16} className={aiLoading ? 'text-violet-500 animate-pulse' : aiWarn ? 'text-amber-500' : 'text-green-600'} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{aiFile.name}</p>
              {aiLoading && (
                <p className="text-xs text-violet-600 flex items-center gap-1 mt-0.5">
                  <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin inline-block" />
                  Đang phân tích AI...
                </p>
              )}
              {!aiLoading && aiFilledFields.size > 0 && (
                <p className="text-xs text-green-700 mt-0.5">
                  ✓ Đã điền {aiFilledFields.size} trường — kiểm tra lại trước khi lưu
                </p>
              )}
              {!aiLoading && aiWarn && (
                <p className="text-xs text-amber-700 mt-0.5">{aiWarn}</p>
              )}
            </div>
            <button type="button" onClick={handleViewFile} title="Xem văn bản" className="text-slate-400 hover:text-blue-500 transition shrink-0">
              <Eye size={15} />
            </button>
            <button type="button" onClick={clearFile} className="text-slate-400 hover:text-red-400 transition shrink-0">
              <X size={15} />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
        />
      </div>

      {/* ── AI Analysis Panel ── */}
      {(aiSummaryPoints.length > 0 || aiKeywords.length > 0) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">
            <Sparkles size={12} />
            Phân tích AI
          </div>

          {aiSummaryPoints.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tóm tắt nội dung chính</p>
              <ul className="space-y-1">
                {aiSummaryPoints.map((pt, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-700">
                    <span className="text-violet-400 shrink-0 mt-0.5">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {aiKeywords.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Từ khóa</p>
              <div className="flex flex-wrap gap-1.5">
                {aiKeywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-medium border border-violet-200">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Số hiệu + Loại ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>
            Số hiệu văn bản
            {aiFilledFields.has('doc_number') && <span className="ml-1 text-violet-500 text-[10px]">✦ AI</span>}
          </label>
          <input className={inp('doc_number')} value={form.doc_number ?? ''} onChange={(e) => set('doc_number', e.target.value)} placeholder="VD: 123/UBND-VP" />
        </div>
        <div>
          <label className={lbl}>Loại văn bản *</label>
          <select className={inp()} value={form.doc_type} onChange={(e) => set('doc_type', e.target.value as DocumentCreate['doc_type'])}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Trích yếu ── */}
      <div>
        <label className={lbl}>
          Trích yếu *
          {aiFilledFields.has('title') && <span className="ml-1 text-violet-500 text-[10px]">✦ AI</span>}
        </label>
        <input required className={inp('title')} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Nội dung trích yếu văn bản" />
      </div>

      {/* ── Hình thức + Ưu tiên ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>
            Hình thức
            {aiFilledFields.has('category') && <span className="ml-1 text-violet-500 text-[10px]">✦ AI</span>}
          </label>
          <select className={inp('category')} value={form.category ?? ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">-- Chọn --</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Độ ưu tiên</label>
          <select className={inp()} value={form.priority} onChange={(e) => set('priority', e.target.value as DocumentCreate['priority'])}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Cơ quan ban hành ── */}
      <div>
        <label className={lbl}>
          Cơ quan ban hành
          {aiFilledFields.has('issuer') && <span className="ml-1 text-violet-500 text-[10px]">✦ AI</span>}
        </label>
        <input className={inp('issuer')} value={form.issuer ?? ''} onChange={(e) => set('issuer', e.target.value)} placeholder="VD: UBND tỉnh, Bộ Nội vụ..." />
      </div>

      {/* ── Đơn vị thực hiện ── */}
      <div>
        <label className={lbl}>
          <span className="flex items-center gap-1.5">
            <Building2 size={11} className="text-blue-500" />
            Đơn vị thực hiện
          </span>
        </label>
        <select
          className={inp()}
          value={form.responsible_department_id ?? ''}
          onChange={(e) => set('responsible_department_id', e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- Chưa xác định --</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>
          ))}
        </select>
      </div>

      {/* ── Đơn vị phối hợp ── */}
      <div>
        <label className={lbl}>
          <span className="flex items-center gap-1.5">
            <Building2 size={11} className="text-purple-500" />
            Đơn vị phối hợp
          </span>
        </label>
        {depts.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Đang tải danh sách đơn vị...</p>
        ) : (
          <div className="border border-slate-200 rounded-xl max-h-36 overflow-y-auto p-2 bg-white space-y-0.5">
            {depts.map((d) => {
              const checked = (form.coordinating_dept_ids ?? []).includes(d.id)
              return (
                <label key={d.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleCoordDept(d.id, e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">{d.short_name ?? d.name}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Ngày ── */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={lbl}>
            Ngày ban hành
            {aiFilledFields.has('issue_date') && <span className="ml-1 text-violet-500 text-[10px]">✦ AI</span>}
          </label>
          <input type="date" className={inp('issue_date')} value={form.issue_date ?? ''} onChange={(e) => set('issue_date', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Ngày nhận</label>
          <input type="date" className={inp()} value={form.received_date ?? ''} onChange={(e) => set('received_date', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Hạn xử lý</label>
          <input type="date" className={inp()} value={form.deadline ?? ''} onChange={(e) => set('deadline', e.target.value)} />
        </div>
      </div>

      {/* ── Người thực hiện ── */}
      <div>
        <label className={lbl}>
          <span className="flex items-center gap-1.5">
            <User size={11} className="text-blue-500" />
            Người thực hiện (Nhân sự)
          </span>
        </label>
        <select
          className={inp()}
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

      {/* ── Tóm tắt ── */}
      <div>
        <label className={lbl}>
          Nội dung tóm tắt
          {aiFilledFields.has('summary') && <span className="ml-1 text-violet-500 text-[10px]">✦ AI</span>}
        </label>
        <textarea rows={3} className={inp('summary')} value={form.summary ?? ''} onChange={(e) => set('summary', e.target.value)} placeholder="Tóm tắt nội dung văn bản..." />
      </div>

      {/* ── Chương trình / Nghị quyết ── */}
      {programs.length > 0 && (
        <div>
          <label className={lbl}>🔗 Thuộc chương trình / Nghị quyết</label>
          <select
            className={inp('program_id')}
            value={form.program_id ?? ''}
            onChange={(e) => set('program_id', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Không liên kết --</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.short_name ?? p.code} — {p.name.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3 pt-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Hủy
        </button>
        <button type="submit" disabled={loading || aiLoading} className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
          {loading ? 'Đang lưu...' : 'Lưu văn bản'}
        </button>
      </div>
    </form>
  )
}
