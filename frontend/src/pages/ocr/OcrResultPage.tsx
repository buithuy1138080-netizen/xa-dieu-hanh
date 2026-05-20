import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ocrApi } from '../../api/ocr'
import AppLayout from '../../components/layout/AppLayout'
import type {
  OcrAiResult, OcrCanhBao, OcrDocumentRead, OcrKpi, OcrNhiemVu, OcrVanBan,
} from '../../types/ocr'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN')
}

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý', processing: 'Đang OCR...', done: 'Hoàn thành', failed: 'Lỗi',
}
const STATUS_CLS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  processing: 'bg-blue-100 text-blue-700 animate-pulse',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const PRIO_OPTIONS = [
  { value: 'low',    label: 'Thấp'    },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high',   label: 'Cao'     },
  { value: 'urgent', label: 'Khẩn cấp' },
]
const LOAI_VB_OPTIONS = [
  'Công văn', 'Quyết định', 'Nghị quyết', 'Chỉ thị', 'Kế hoạch',
  'Thông báo', 'Báo cáo', 'Tờ trình', 'Biên bản', 'Chương trình', 'Đề án',
]
const EMPTY_AI: OcrAiResult = { van_ban: {}, nhiem_vu: [], kpi: [], canh_bao: [] }

// ── Main component ───────────────────────────────────────────────────────────

export default function OcrResultPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ocrId = Number(id)

  const [doc, setDoc]           = useState<OcrDocumentRead | null>(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'raw' | 'ai' | 'confirm'>('ai')

  // Editable AI result
  const [ai, setAi]             = useState<OcrAiResult>(EMPTY_AI)
  const [saving, setSaving]     = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmDone, setConfirmDone] = useState<{ doc_id?: number; task_ids: number[]; message: string } | null>(null)

  // Confirm options
  const [createDoc, setCreateDoc]     = useState(true)
  const [createTasks, setCreateTasks] = useState(true)
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set())

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadDoc = useCallback(async () => {
    try {
      const r = await ocrApi.get(ocrId)
      setDoc(r.data)
      if (r.data.ai_result) {
        setAi(r.data.ai_result as OcrAiResult)
        // Default: all tasks selected
        const n = (r.data.ai_result as OcrAiResult).nhiem_vu?.length ?? 0
        setSelectedTasks(new Set(Array.from({ length: n }, (_, i) => i)))
      }
      if (r.data.confirmed_at) {
        const result = {
          doc_id: r.data.document_id ?? undefined,
          task_ids: r.data.linked_task_ids ?? [],
          message: 'Đã xác nhận trước đó',
        }
        setConfirmDone(result)
        setTab('confirm')
      }
    } catch {
      alert('Không tìm thấy tài liệu')
      navigate('/ocr')
    } finally {
      setLoading(false)
    }
  }, [ocrId, navigate])

  useEffect(() => { loadDoc() }, [loadDoc])

  // Poll while processing
  useEffect(() => {
    if (!doc) return
    const active = doc.status === 'pending' || doc.status === 'processing'
    if (active && !pollRef.current) {
      pollRef.current = setInterval(loadDoc, 2500)
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [doc, loadDoc])

  // ── Update helpers ─────────────────────────────────────────────────────────

  function setVanBan(key: keyof OcrVanBan, val: string) {
    setAi(prev => ({ ...prev, van_ban: { ...prev.van_ban, [key]: val } }))
  }

  function setTask(idx: number, key: keyof OcrNhiemVu, val: string) {
    setAi(prev => {
      const tasks = [...prev.nhiem_vu]
      tasks[idx] = { ...tasks[idx], [key]: val }
      return { ...prev, nhiem_vu: tasks }
    })
  }

  function addTask() {
    setAi(prev => ({
      ...prev,
      nhiem_vu: [...prev.nhiem_vu, { ten_nhiem_vu: '', mo_ta: '', deadline: null, don_vi_chu_tri: null, muc_uu_tien: 'medium' }],
    }))
    setSelectedTasks(prev => new Set([...prev, ai.nhiem_vu.length]))
  }

  function removeTask(idx: number) {
    setAi(prev => ({ ...prev, nhiem_vu: prev.nhiem_vu.filter((_, i) => i !== idx) }))
    setSelectedTasks(prev => {
      const next = new Set<number>()
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1) })
      return next
    })
  }

  function addKpi() {
    setAi(prev => ({
      ...prev,
      kpi: [...prev.kpi, { ten: '', muc_tieu_pct: 0, nam: new Date().getFullYear(), quy: null, loai_kpi: 'nam' }],
    }))
  }

  function setKpi(idx: number, key: keyof OcrKpi, val: string | number | null) {
    setAi(prev => {
      const kpis = [...prev.kpi]
      kpis[idx] = { ...kpis[idx], [key]: val }
      return { ...prev, kpi: kpis }
    })
  }

  function removeKpi(idx: number) {
    setAi(prev => ({ ...prev, kpi: prev.kpi.filter((_, i) => i !== idx) }))
  }

  // ── Save draft ─────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const r = await ocrApi.updateAiResult(ocrId, ai)
      setDoc(r.data)
      alert('Đã lưu dữ liệu AI')
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Lỗi lưu')
    } finally {
      setSaving(false)
    }
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  async function handleConfirm() {
    setConfirming(true)
    try {
      const r = await ocrApi.confirm(ocrId, {
        ai_result: ai,
        create_document: createDoc,
        create_tasks: createTasks,
        selected_task_indices: Array.from(selectedTasks).sort((a, b) => a - b),
      })
      setConfirmDone({ doc_id: r.data.document_id ?? undefined, task_ids: r.data.task_ids, message: r.data.message })
      setTab('confirm')
      loadDoc()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Lỗi xác nhận')
    } finally {
      setConfirming(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>
      </AppLayout>
    )
  }

  if (!doc) return null

  const isProcessing = doc.status === 'pending' || doc.status === 'processing'
  const isDone = doc.status === 'done'
  const warnings: OcrCanhBao[] = ai.canh_bao ?? []

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/ocr')} className="text-slate-400 hover:text-slate-700 transition-colors text-sm">
            ← Quay lại
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 truncate">
              🤖 {doc.filename}
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {fmtSize(doc.file_size)} · {doc.page_count} trang · Upload {fmtDate(doc.created_at)}
            </p>
          </div>
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${STATUS_CLS[doc.status]}`}>
            {STATUS_LABEL[doc.status]}
          </span>
        </div>

        {/* Processing state */}
        {isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2 animate-bounce">⚙️</div>
            <p className="text-blue-700 font-semibold">Đang xử lý OCR & AI phân tích...</p>
            <p className="text-blue-500 text-sm mt-1">Trang sẽ tự động cập nhật kết quả</p>
            <div className="mt-3 w-48 mx-auto bg-blue-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        )}

        {/* Error state */}
        {doc.status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-red-700 font-semibold">❌ OCR thất bại</p>
            <p className="text-red-600 text-sm mt-1">{doc.error_msg || 'Lỗi không xác định'}</p>
            <p className="text-red-500 text-xs mt-2">
              Kiểm tra Tesseract đã được cài và có gói ngôn ngữ tiếng Việt (vie).
            </p>
          </div>
        )}

        {/* Tabs — only show when done */}
        {isDone && (
          <>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
              {([
                { key: 'raw',     label: '📄 Văn bản gốc' },
                { key: 'ai',      label: '🔍 Dữ liệu AI'   },
                { key: 'confirm', label: '✅ Xác nhận'      },
              ] as { key: typeof tab; label: string }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t.key
                      ? 'bg-white shadow-sm text-violet-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Raw text ─────────────────────────────────────────────── */}
            {tab === 'raw' && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-700">Văn bản OCR gốc ({doc.page_count} trang)</h3>
                  <button
                    onClick={() => navigator.clipboard.writeText(doc.ocr_text ?? '')}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    📋 Sao chép
                  </button>
                </div>
                <pre className="p-5 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                  {doc.ocr_text || '[Không có văn bản OCR]'}
                </pre>
              </div>
            )}

            {/* ── Tab: AI data ───────────────────────────────────────────────── */}
            {tab === 'ai' && (
              <div className="space-y-4">

                {/* Warnings */}
                {warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="font-semibold text-amber-800 text-sm mb-2">⚠️ Cảnh báo AI ({warnings.length})</p>
                    <ul className="space-y-1">
                      {warnings.map((w, i) => (
                        <li key={i} className="text-amber-700 text-sm flex items-start gap-2">
                          <span className="mt-0.5 text-amber-400">•</span> {w.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Document info */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    📋 Thông tin văn bản
                    <span className="text-xs text-slate-400 font-normal">(có thể chỉnh sửa)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Số ký hiệu">
                      <input
                        value={ai.van_ban.so_ky_hieu ?? ''}
                        onChange={e => setVanBan('so_ky_hieu', e.target.value)}
                        placeholder="VD: 123/UBND-VP"
                        className="input-field"
                      />
                    </Field>
                    <Field label="Loại văn bản">
                      <select
                        value={ai.van_ban.loai_van_ban ?? ''}
                        onChange={e => setVanBan('loai_van_ban', e.target.value)}
                        className="input-field"
                      >
                        <option value="">— Chọn loại —</option>
                        {LOAI_VB_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="Ngày ban hành">
                      <input
                        type="date"
                        value={ai.van_ban.ngay_ban_hanh ?? ''}
                        onChange={e => setVanBan('ngay_ban_hanh', e.target.value)}
                        className="input-field"
                      />
                    </Field>
                    <Field label="Cơ quan ban hành">
                      <input
                        value={ai.van_ban.co_quan_ban_hanh ?? ''}
                        onChange={e => setVanBan('co_quan_ban_hanh', e.target.value)}
                        placeholder="VD: UBND xã Hòa Bình"
                        className="input-field"
                      />
                    </Field>
                    <Field label="Trích yếu" className="md:col-span-2">
                      <textarea
                        value={ai.van_ban.trich_yeu ?? ''}
                        onChange={e => setVanBan('trich_yeu', e.target.value)}
                        rows={2}
                        placeholder="Nội dung trích yếu..."
                        className="input-field resize-none"
                      />
                    </Field>
                  </div>
                </div>

                {/* Tasks */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                      📌 Nhiệm vụ phát sinh
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                        {ai.nhiem_vu.length}
                      </span>
                    </h3>
                    <button onClick={addTask} className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors">
                      + Thêm nhiệm vụ
                    </button>
                  </div>

                  {ai.nhiem_vu.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">
                      Không phát hiện nhiệm vụ. Nhấn "+ Thêm" để nhập thủ công.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {ai.nhiem_vu.map((task, idx) => (
                        <div key={idx} className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                          <div className="flex items-start gap-3 mb-3">
                            <span className="mt-1 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Field label="Tên nhiệm vụ" className="md:col-span-2">
                                <input
                                  value={task.ten_nhiem_vu}
                                  onChange={e => setTask(idx, 'ten_nhiem_vu', e.target.value)}
                                  className="input-field"
                                  placeholder="Tên nhiệm vụ..."
                                />
                              </Field>
                              <Field label="Deadline">
                                <input
                                  type="date"
                                  value={task.deadline ?? ''}
                                  onChange={e => setTask(idx, 'deadline', e.target.value)}
                                  className={`input-field ${!task.deadline ? 'border-amber-300' : ''}`}
                                />
                                {!task.deadline && <p className="text-amber-500 text-xs mt-0.5">⚠️ Chưa có deadline</p>}
                              </Field>
                              <Field label="Đơn vị chủ trì">
                                <input
                                  value={task.don_vi_chu_tri ?? ''}
                                  onChange={e => setTask(idx, 'don_vi_chu_tri', e.target.value)}
                                  className={`input-field ${!task.don_vi_chu_tri ? 'border-amber-300' : ''}`}
                                  placeholder="Đơn vị phụ trách..."
                                />
                                {!task.don_vi_chu_tri && <p className="text-amber-500 text-xs mt-0.5">⚠️ Chưa có đơn vị</p>}
                              </Field>
                              <Field label="Mức ưu tiên">
                                <select
                                  value={task.muc_uu_tien ?? 'medium'}
                                  onChange={e => setTask(idx, 'muc_uu_tien', e.target.value)}
                                  className="input-field"
                                >
                                  {PRIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </Field>
                              <Field label="Mô tả" className="md:col-span-2">
                                <textarea
                                  value={task.mo_ta ?? ''}
                                  onChange={e => setTask(idx, 'mo_ta', e.target.value)}
                                  rows={2}
                                  className="input-field resize-none"
                                  placeholder="Mô tả ngắn..."
                                />
                              </Field>
                            </div>
                            <button onClick={() => removeTask(idx)} className="text-slate-400 hover:text-red-500 transition-colors shrink-0 mt-1">
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* KPI */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                      📊 Chỉ tiêu KPI
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {ai.kpi.length}
                      </span>
                    </h3>
                    <button onClick={addKpi} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                      + Thêm KPI
                    </button>
                  </div>

                  {ai.kpi.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">
                      Không phát hiện chỉ tiêu KPI.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left bg-slate-50">
                            <th className="px-3 py-2 text-slate-500 font-medium">Tên chỉ tiêu</th>
                            <th className="px-3 py-2 text-slate-500 font-medium">Mục tiêu %</th>
                            <th className="px-3 py-2 text-slate-500 font-medium">Năm</th>
                            <th className="px-3 py-2 text-slate-500 font-medium">Quý</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {ai.kpi.map((kpi, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2">
                                <input
                                  value={kpi.ten}
                                  onChange={e => setKpi(idx, 'ten', e.target.value)}
                                  className="input-field text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number" min={0} max={100} step={0.1}
                                  value={kpi.muc_tieu_pct}
                                  onChange={e => setKpi(idx, 'muc_tieu_pct', parseFloat(e.target.value) || 0)}
                                  className="input-field text-xs w-24"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number" min={2020} max={2050}
                                  value={kpi.nam}
                                  onChange={e => setKpi(idx, 'nam', parseInt(e.target.value) || new Date().getFullYear())}
                                  className="input-field text-xs w-24"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={kpi.quy ?? ''}
                                  onChange={e => setKpi(idx, 'quy', e.target.value ? parseInt(e.target.value) : null)}
                                  className="input-field text-xs w-20"
                                >
                                  <option value="">—</option>
                                  <option value="1">Q1</option>
                                  <option value="2">Q2</option>
                                  <option value="3">Q3</option>
                                  <option value="4">Q4</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <button onClick={() => removeKpi(idx)} className="text-slate-400 hover:text-red-500">🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Save + Confirm buttons */}
                <div className="flex gap-3 justify-end">
                  <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium text-sm disabled:opacity-60">
                    {saving ? 'Đang lưu...' : '💾 Lưu nháp'}
                  </button>
                  {!doc.confirmed_at && (
                    <button onClick={() => setTab('confirm')} className="px-5 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-medium text-sm">
                      Tiếp theo: Xác nhận →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Confirm ──────────────────────────────────────────────── */}
            {tab === 'confirm' && (
              <div className="space-y-4">

                {/* Already confirmed */}
                {confirmDone && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
                    <p className="text-green-800 font-bold text-lg mb-1">✅ {confirmDone.message}</p>
                    <div className="flex gap-4 mt-3">
                      {confirmDone.doc_id && (
                        <a href={`/documents/${confirmDone.doc_id}`} className="text-sm text-blue-600 hover:underline">
                          → Xem văn bản #{confirmDone.doc_id}
                        </a>
                      )}
                      {confirmDone.task_ids.length > 0 && (
                        <a href="/tasks" className="text-sm text-blue-600 hover:underline">
                          → Xem {confirmDone.task_ids.length} nhiệm vụ
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!doc.confirmed_at && (
                  <>
                    {/* Summary */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <h3 className="font-semibold text-slate-700 mb-4">📋 Tóm tắt xác nhận</h3>

                      {/* Create document toggle */}
                      <label className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl mb-3 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={createDoc}
                          onChange={e => setCreateDoc(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-violet-600"
                        />
                        <div>
                          <p className="font-medium text-slate-700">Tạo Văn bản</p>
                          <p className="text-slate-400 text-sm mt-0.5">
                            {ai.van_ban.so_ky_hieu
                              ? `Số ${ai.van_ban.so_ky_hieu} — ${ai.van_ban.loai_van_ban ?? ''}`
                              : 'Thông tin văn bản (số ký hiệu chưa có)'}
                          </p>
                        </div>
                      </label>

                      {/* Create tasks toggle + selection */}
                      <label className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl mb-2 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={createTasks}
                          onChange={e => setCreateTasks(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-violet-600"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-slate-700">Tạo Nhiệm vụ</p>
                          <p className="text-slate-400 text-sm mt-0.5">{ai.nhiem_vu.length} nhiệm vụ — chọn những cái muốn tạo:</p>
                        </div>
                      </label>

                      {createTasks && ai.nhiem_vu.length > 0 && (
                        <div className="ml-7 space-y-2 mb-3">
                          {ai.nhiem_vu.map((t, idx) => (
                            <label key={idx} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedTasks.has(idx)}
                                onChange={e => {
                                  setSelectedTasks(prev => {
                                    const next = new Set(prev)
                                    e.target.checked ? next.add(idx) : next.delete(idx)
                                    return next
                                  })
                                }}
                                className="w-4 h-4 accent-violet-600"
                              />
                              <span className="text-sm text-slate-700 flex-1 truncate">{t.ten_nhiem_vu || `Nhiệm vụ ${idx + 1}`}</span>
                              {t.deadline
                                ? <span className="text-xs text-slate-400">{fmtDate(t.deadline)}</span>
                                : <span className="text-xs text-amber-400">⚠️ No deadline</span>}
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Warnings summary */}
                      {warnings.length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3 mb-4">
                          <p className="text-amber-700 text-sm font-medium">⚠️ Lưu ý trước khi xác nhận:</p>
                          {warnings.map((w, i) => (
                            <p key={i} className="text-amber-600 text-xs mt-1">• {w.message}</p>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleConfirm}
                      disabled={confirming}
                      className="w-full py-3.5 bg-violet-600 text-white rounded-2xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-60 text-base"
                    >
                      {confirming ? '⏳ Đang xử lý...' : '✅ Xác nhận & Tạo hồ sơ vào hệ thống'}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Tailwind inline styles */}
      <style>{`
        .input-field {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.4rem 0.65rem;
          font-size: 0.875rem;
          color: #334155;
          background: white;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 2px rgba(124,58,237,0.1);
        }
      `}</style>
    </AppLayout>
  )
}

// ── Small helper ─────────────────────────────────────────────────────────────
function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
