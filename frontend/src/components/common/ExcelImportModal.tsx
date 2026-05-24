import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import apiClient from '../../api/client'

interface ImportResult {
  imported: number
  errors: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: (result: ImportResult) => void
  /** e.g. "tasks", "nq57", "kpi" */
  module: string
  /** display name shown in modal title */
  moduleName: string
  templateFileName?: string
}

export default function ExcelImportModal({
  open, onClose, onSuccess, module, moduleName, templateFileName,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFileChange(f: File | null) {
    setError(null)
    setResult(null)
    if (!f) return
    if (!f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) {
      setError('Chỉ chấp nhận file .xlsx hoặc .xls')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File không được vượt quá 5 MB')
      return
    }
    setFile(f)
  }

  async function downloadTemplate() {
    try {
      const res = await apiClient.get(`/${module}/import/template`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = templateFileName ?? `mau_import_${module}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Không tải được file mẫu')
    }
  }

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiClient.post<ImportResult>(`/${module}/import`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      onSuccess?.(res.data)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string | { errors?: string[] } } } })
        ?.response?.data?.detail
      if (typeof msg === 'object' && msg?.errors) {
        setError(msg.errors.join('\n'))
      } else {
        setError(typeof msg === 'string' ? msg : 'Import thất bại, kiểm tra lại file')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <FileSpreadsheet size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Import từ Excel</h2>
                  <p className="text-xs text-slate-400">{moduleName}</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Step 1: Download template */}
              <div className="flex items-start gap-3 p-3.5 bg-blue-50 rounded-xl border border-blue-100">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800 mb-1">Tải file mẫu</p>
                  <p className="text-xs text-blue-600 mb-2.5">Điền dữ liệu vào file mẫu, cột có (*) là bắt buộc.</p>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Download size={13} /> Tải file mẫu (.xlsx)
                  </button>
                </div>
              </div>

              {/* Step 2: Upload */}
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Chọn file đã điền</p>
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
                      ${dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); handleFileChange(e.dataTransfer.files[0] ?? null) }}
                  >
                    <input
                      ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                      onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileSpreadsheet size={20} className="text-emerald-600" />
                        <div className="text-left">
                          <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                          <p className="text-xs text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button
                          className="ml-2 p-1 rounded-lg hover:bg-emerald-100 text-emerald-500"
                          onClick={e => { e.stopPropagation(); reset() }}
                        ><X size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-sm text-slate-500">Kéo thả hoặc <span className="text-blue-600 font-semibold">chọn file</span></p>
                        <p className="text-xs text-slate-400 mt-1">.xlsx · .xls · tối đa 5 MB</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700 whitespace-pre-line">{error}</p>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className={`p-3.5 rounded-xl border ${result.errors.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <p className="text-sm font-semibold text-emerald-700">Import thành công {result.imported} bản ghi</p>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold text-amber-700">{result.errors.length} hàng bị bỏ qua:</p>
                      {result.errors.map((e, i) => (
                        <p key={i} className="text-xs text-amber-600">• {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">
                {result ? 'Đóng' : 'Hủy'}
              </button>
              {!result && (
                <button
                  onClick={handleImport}
                  disabled={!file || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {loading ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang import...</>
                  ) : (
                    <><Upload size={14} /> Import dữ liệu</>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
