import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, CheckCircle, FileText, Paperclip, Sparkles, Tag, X } from 'lucide-react'
import { documentsApi } from '../../api/documents'
import type { DocumentRead } from '../../types/document'

const ALLOWED_EXTS = ['.pdf', '.docx', '.doc', '.txt', '.jpg', '.jpeg', '.png']
const ALLOWED_LABEL = 'PDF, DOCX, TXT, JPG, PNG'

const DOC_TYPES = [
  { value: 'incoming', label: 'Văn bản đến' },
  { value: 'outgoing', label: 'Văn bản đi' },
  { value: 'internal', label: 'Nội bộ' },
]

type Phase = 'idle' | 'analyzing' | 'done' | 'error'

interface Props {
  onClose: () => void
  onSaved: (doc: DocumentRead) => void
}

export default function DocumentUploadAI({ onClose, onSaved }: Props) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('incoming')
  const [isDragging, setIsDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DocumentRead | null>(null)

  function handleFileSelect(f: File) {
    const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`Không hỗ trợ định dạng ${ext}. Chấp nhận: ${ALLOWED_LABEL}`)
      return
    }
    setFile(f)
    setError(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }

  async function handleAnalyze() {
    if (!file) return
    setPhase('analyzing')
    setError(null)
    try {
      const { data } = await documentsApi.upload(file, docType)
      setResult(data)
      setPhase('done')
      onSaved(data)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Lỗi phân tích — vui lòng thử lại.'
      setError(msg)
      setPhase('error')
    }
  }

  function handleExtractTasks() {
    if (!result) return
    navigate(`/documents/${result.id}`, { state: { openTaskExtract: true } })
    onClose()
  }

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('vi-VN') : '—'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-500" />
            <h2 className="font-bold text-slate-800">Upload & AI Phân tích văn bản</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition text-xl">✕</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Phase: idle / error — show upload zone */}
          {(phase === 'idle' || phase === 'error') && (
            <>
              {/* Doc type selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Loại văn bản</label>
                <div className="flex gap-2">
                  {DOC_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setDocType(t.value)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                        docType === t.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              {!file ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl px-6 py-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                    isDragging ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/30'
                  }`}
                >
                  <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
                    <Paperclip size={24} className="text-violet-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Kéo thả hoặc <span className="text-violet-600 font-semibold">chọn file</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{ALLOWED_LABEL} — tối đa 50 MB</p>
                  </div>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 bg-slate-50">
                  <FileText size={20} className="text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setFile(null); setError(null); setPhase('idle') }}
                    className="text-slate-400 hover:text-red-400 transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_EXTS.join(',')}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
              />

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!file}
                  className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-40 transition"
                >
                  <Sparkles size={15} />
                  Phân tích AI & Lưu
                </button>
              </div>
            </>
          )}

          {/* Phase: analyzing */}
          {phase === 'analyzing' && (
            <div className="py-16 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                <Sparkles size={28} className="text-violet-500 animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">Đang phân tích bằng AI...</p>
                <p className="text-sm text-slate-400 mt-1">
                  Gemini đang đọc văn bản, trích xuất thông tin và tóm tắt nội dung
                </p>
              </div>
              <div className="flex gap-1.5 mt-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Phase: done — show result */}
          {phase === 'done' && result && (
            <>
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle size={16} className="shrink-0" />
                <span className="text-sm font-medium">
                  Đã lưu văn bản #{result.id} — AI phân tích thành công
                </span>
              </div>

              {/* Extracted info */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Số ký hiệu', value: result.doc_number },
                  { label: 'Cơ quan ban hành', value: result.issuer },
                  { label: 'Hình thức', value: result.category },
                  { label: 'Ngày ban hành', value: fmtDate(result.issue_date) },
                  { label: 'Lĩnh vực', value: result.domain },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-slate-700 font-medium mt-0.5">{value}</p>
                    </div>
                  ) : null
                )}
              </div>

              {/* Summary */}
              {result.summary && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-blue-700 text-xs font-semibold mb-2">
                    <BookOpen size={12} />
                    Tóm tắt nội dung
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                    {result.summary}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {result.keywords && result.keywords.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                    <Tag size={11} />
                    Từ khóa
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keywords.map((kw: string, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium border border-violet-200">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-2 justify-end flex-wrap">
                <button
                  type="button"
                  onClick={handleExtractTasks}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-blue-300 text-blue-700 hover:bg-blue-50 font-medium transition"
                >
                  📋 Trích xuất nhiệm vụ
                </button>
                <button
                  type="button"
                  onClick={() => { navigate(`/documents/${result.id}`); onClose() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition"
                >
                  ✏️ Xem & Sửa
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                >
                  Đóng
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
