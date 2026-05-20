import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ocrApi } from '../../api/ocr'
import AppLayout from '../../components/layout/AppLayout'
import type { OcrDocumentList, OcrEngineStatus } from '../../types/ocr'

const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png']
const MAX_MB = 20

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  processing: 'Đang OCR...',
  done: 'Hoàn thành',
  failed: 'Lỗi',
}

const STATUS_CLS: Record<string, string> = {
  pending:    'bg-slate-100 text-slate-600',
  processing: 'bg-blue-100 text-blue-700 animate-pulse',
  done:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
}

const FILE_ICON: Record<string, string> = {
  pdf: '📄', jpg: '🖼️', jpeg: '🖼️', png: '🖼️',
}

export default function OcrPage() {
  const navigate = useNavigate()
  const [items, setItems]       = useState<OcrDocumentList[]>([])
  const [loading, setLoading]   = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [engine, setEngine]     = useState<OcrEngineStatus | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const r = await ocrApi.list(0, 30)
      setItems(r.data.items)
    } catch {
      setFetchError('Không thể tải danh sách tài liệu OCR. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Poll while any item is processing/pending
  useEffect(() => {
    loadList()
    ocrApi.engineStatus().then(r => setEngine(r.data)).catch(() => null)
  }, [loadList])

  useEffect(() => {
    const hasActive = items.some(i => i.status === 'pending' || i.status === 'processing')
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadList, 3000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [items, loadList])

  async function handleFile(file: File) {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      alert(`Chỉ hỗ trợ PDF, JPG, PNG. File của bạn: ${ext}`)
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File quá lớn. Tối đa ${MAX_MB}MB`)
      return
    }

    setUploading(true)
    setUploadPct(0)
    try {
      // Simulate progress via interval
      const prog = setInterval(() => setUploadPct(p => Math.min(p + 10, 90)), 200)
      await ocrApi.upload(file)
      clearInterval(prog)
      setUploadPct(100)
      setTimeout(() => { setUploading(false); setUploadPct(0); loadList() }, 600)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Upload thất bại')
      setUploading(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa tài liệu OCR này?')) return
    await ocrApi.remove(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">
              🤖 OCR & AI Phân tích Văn bản
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Upload PDF hoặc ảnh scan — AI tự động trích xuất thông tin hành chính
            </p>
          </div>

          {/* Engine status badge */}
          {engine && (
            <div className={`self-start sm:self-auto text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap ${
              engine.tesseract_binary
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {engine.tesseract_binary ? '✅ Tesseract sẵn sàng' : '⚠️ Chưa cài Tesseract'}
            </div>
          )}
        </div>

        {/* Engine hint */}
        {engine && !engine.tesseract_binary && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Lưu ý:</strong> Tesseract chưa được cài. Để OCR hoạt động đầy đủ:
            <ol className="list-decimal ml-4 mt-1 space-y-0.5">
              <li>Tải Tesseract tại <span className="font-mono">github.com/UB-Mannheim/tesseract/wiki</span></li>
              <li>Cài gói ngôn ngữ <span className="font-mono">vie</span></li>
              <li>Thêm đường dẫn vào <span className="font-mono">OCR_TESSERACT_CMD</span> trong <span className="font-mono">.env</span></li>
            </ol>
            <p className="mt-1">AI phân tích vẫn hoạt động nếu bạn nhập text thủ công trong trang kết quả.</p>
          </div>
        )}

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 md:p-10 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-violet-400 bg-violet-50'
              : uploading
              ? 'border-blue-300 bg-blue-50 cursor-wait'
              : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/50'
          }`}
        >
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onFileInput} />

          {uploading ? (
            <div className="space-y-3">
              <div className="text-4xl">⏳</div>
              <p className="text-blue-700 font-semibold">Đang upload & xử lý...</p>
              <div className="w-64 mx-auto bg-blue-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-5xl">📁</div>
              <p className="text-slate-700 font-semibold text-lg">
                Kéo thả file vào đây
              </p>
              <p className="text-slate-400 text-sm">hoặc click để chọn file</p>
              <p className="text-slate-400 text-xs mt-2">
                Hỗ trợ: <strong>PDF scan, JPG, PNG</strong> · Tối đa {MAX_MB}MB
              </p>
              <div className="flex justify-center gap-3 mt-3">
                {['📄 PDF', '🖼️ JPG', '🖼️ PNG'].map(t => (
                  <span key={t} className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* History list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">Lịch sử xử lý</h2>
            <button onClick={loadList} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
              ↻ Làm mới
            </button>
          </div>

          {fetchError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="shrink-0" />
              {fetchError}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="text-center py-10 text-slate-400">Đang tải...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <div className="text-4xl mb-2">🗂️</div>
              <p>Chưa có tài liệu nào. Upload file để bắt đầu!</p>
            </div>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden space-y-2">
              {items.map(item => (
                <div key={item.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{FILE_ICON[item.file_type] ?? '📎'}</span>
                      <p className="font-medium text-slate-800 text-sm truncate">{item.filename}</p>
                    </div>
                    <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-400 shrink-0">🗑️</button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    <span className="text-xs text-slate-400">{fmtSize(item.file_size)}</span>
                    <span className="text-xs text-slate-400">{item.page_count} trang</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{fmtDate(item.created_at)}</span>
                    {item.status === 'done' && (
                      <button onClick={() => navigate(`/ocr/${item.id}`)}
                        className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg font-medium">
                        {item.confirmed_at ? 'Xem lại' : 'Xem kết quả →'}
                      </button>
                    )}
                    {item.status === 'failed' && (
                      <button onClick={() => navigate(`/ocr/${item.id}`)}
                        className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-lg">Chi tiết lỗi</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-slate-500 font-medium">Tên file</th>
                    <th className="px-4 py-3 text-slate-500 font-medium">Kích thước</th>
                    <th className="px-4 py-3 text-slate-500 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 text-slate-500 font-medium">Thời gian</th>
                    <th className="px-4 py-3 text-slate-500 font-medium">Kết quả</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{FILE_ICON[item.file_type] ?? '📎'}</span>
                          <div>
                            <p className="font-medium text-slate-800 truncate max-w-[200px]">{item.filename}</p>
                            <p className="text-slate-400 text-xs uppercase">{item.file_type} · {item.page_count} trang</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{fmtSize(item.file_size)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLS[item.status]}`}>
                          {STATUS_LABEL[item.status]}
                        </span>
                        {item.error_msg && (
                          <p className="text-red-500 text-xs mt-0.5 truncate max-w-[180px]" title={item.error_msg}>
                            {item.error_msg}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        <div>{fmtDate(item.created_at)}</div>
                        {item.processed_at && (
                          <div className="text-slate-400">✓ {fmtDate(item.processed_at)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {item.document_id && <span className="text-green-600">📋 VB #{item.document_id}</span>}
                        {item.linked_task_ids?.length
                          ? <span className="text-blue-600 ml-1">✅ {item.linked_task_ids.length} NV</span>
                          : null}
                        {item.confirmed_at && !item.document_id && !item.linked_task_ids?.length && (
                          <span className="text-slate-400">Đã xác nhận</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {item.status === 'done' && !item.confirmed_at && (
                            <button
                              onClick={() => navigate(`/ocr/${item.id}`)}
                              className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors font-medium"
                            >
                              Xem kết quả →
                            </button>
                          )}
                          {(item.status === 'done' && item.confirmed_at) && (
                            <button
                              onClick={() => navigate(`/ocr/${item.id}`)}
                              className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                              Xem lại
                            </button>
                          )}
                          {item.status === 'failed' && (
                            <button
                              onClick={() => navigate(`/ocr/${item.id}`)}
                              className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              Chi tiết lỗi
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors px-1"
                            title="Xóa"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>{/* end desktop table */}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
