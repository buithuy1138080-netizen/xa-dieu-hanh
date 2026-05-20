import { useEffect, useRef, useState } from 'react'
import {
  BookTemplate, CheckCircle, ChevronDown, ChevronRight, Download, Eye,
  FileSpreadsheet, FileText, Info, Play, Plus, RefreshCw, Tag, Trash2, Upload,
} from 'lucide-react'
import { reportTemplatesApi } from '../../api/reportTemplates'
import type { RenderFormat, ReportTemplate, VariableCatalog } from '../../types/reportTemplate'
import { CATEGORY_LABELS } from '../../types/reportTemplate'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExtBadge({ ext }: { ext: string }) {
  const isXlsx = ext === 'xlsx'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
      isXlsx ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
    }`}>
      {isXlsx ? <FileSpreadsheet size={10} /> : <FileText size={10} />}
      {ext}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700"><CheckCircle size={9} />Đang dùng</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">Lưu trữ</span>
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('monthly')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Chọn file template'); return }
    if (!name.trim()) { setError('Nhập tên template'); return }
    setUploading(true); setError('')
    try {
      await reportTemplatesApi.upload(file, name.trim(), category, description)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : 'Upload thất bại')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Upload size={16} className="text-blue-500" /> Upload mẫu báo cáo
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 transition-colors"
          >
            {file ? (
              <p className="text-sm text-slate-700 font-medium">{file.name} ({fmtSize(file.size)})</p>
            ) : (
              <p className="text-sm text-slate-400">Click để chọn file .xlsx hoặc .docx</p>
            )}
            <input
              ref={fileRef} type="file" accept=".xlsx,.docx" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, '')) }
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Tên mẫu *</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="VD: Báo cáo tháng NQ57" required />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Danh mục</label>
            <select className={inp} value={category} onChange={e => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Mô tả</label>
            <textarea className={inp} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Mô tả ngắn về mẫu báo cáo này..." />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="submit" disabled={uploading} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
              {uploading ? 'Đang upload...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Render modal ──────────────────────────────────────────────────────────────

function RenderModal({ tpl, onClose }: { tpl: ReportTemplate; onClose: () => void }) {
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const lastDay  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [periodFrom, setPeriodFrom] = useState(firstDay)
  const [periodTo, setPeriodTo] = useState(lastDay)
  const [format, setFormat] = useState<RenderFormat>(tpl.file_ext as RenderFormat)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400'

  async function handleRender() {
    setLoading(true); setError('')
    try {
      const resp = await reportTemplatesApi.render(tpl.id, { period_from: periodFrom, period_to: periodTo, format })
      const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'xlsx'
      const filename = `${tpl.name}_${periodFrom}_${periodTo}.${ext}`
      downloadBlob(resp.data as Blob, filename)
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : 'Render thất bại — kiểm tra lại kỳ báo cáo')
    } finally {
      setLoading(false)
    }
  }

  const formats = tpl.file_ext === 'xlsx'
    ? [{ v: 'xlsx', label: 'Excel (.xlsx)' }]
    : [{ v: 'docx', label: 'Word (.docx)' }, { v: 'pdf', label: 'PDF (cần LibreOffice)' }]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
          <Play size={15} className="text-green-500" /> Xuất báo cáo
        </h2>
        <p className="text-xs text-slate-500 mb-4 truncate">{tpl.name}</p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Từ ngày</label>
              <input type="date" className={inp} value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Đến ngày</label>
              <input type="date" className={inp} value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Định dạng xuất</label>
            <select className={inp} value={format} onChange={e => setFormat(e.target.value as RenderFormat)}>
              {formats.map(f => <option key={f.v} value={f.v}>{f.label}</option>)}
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Hủy</button>
            <button onClick={handleRender} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
              {loading ? 'Đang xuất...' : 'Xuất file'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Variables panel ───────────────────────────────────────────────────────────

function VariablesPanel({ catalog }: { catalog: VariableCatalog }) {
  const [expanded, setExpanded] = useState<'scalars' | 'lists' | null>('scalars')

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Info size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-slate-700">Biến hỗ trợ</span>
      </div>

      {/* Scalars */}
      <div>
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={() => setExpanded(expanded === 'scalars' ? null : 'scalars')}
        >
          <span>Biến đơn ({catalog.scalars.length})</span>
          {expanded === 'scalars' ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {expanded === 'scalars' && (
          <div className="border-t border-slate-100 max-h-48 overflow-y-auto">
            {catalog.scalars.map(v => (
              <div key={v.name} className="px-4 py-1.5 hover:bg-slate-50 flex items-start gap-2">
                <code className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                  {`{{${v.name}}}`}
                </code>
                <span className="text-[11px] text-slate-500 leading-tight">{v.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lists */}
      <div className="border-t border-slate-100">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          onClick={() => setExpanded(expanded === 'lists' ? null : 'lists')}
        >
          <span>Biến danh sách ({catalog.lists.length})</span>
          {expanded === 'lists' ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {expanded === 'lists' && (
          <div className="border-t border-slate-100">
            {catalog.lists.map(v => (
              <div key={v.name} className="px-4 py-2 border-b border-slate-50 last:border-0">
                <code className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded block mb-1">
                  {`{{#${v.name}}}`}
                </code>
                <p className="text-[11px] text-slate-500">{v.description}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Fields: item.stt, item.ten, ...</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  tpl,
  onActivate,
  onRender,
  onDelete,
  onDownload,
}: {
  tpl: ReportTemplate
  onActivate: (id: number) => void
  onRender: (tpl: ReportTemplate) => void
  onDelete: (id: number) => void
  onDownload: (id: number, name: string, ext: string) => void
}) {
  const [showVars, setShowVars] = useState(false)

  return (
    <div className={`bg-white rounded-xl border transition-all ${tpl.is_active ? 'border-green-300 shadow-sm shadow-green-100' : 'border-slate-200'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <ExtBadge ext={tpl.file_ext} />
              <StatusBadge active={tpl.is_active} />
              <span className="text-[10px] text-slate-400">v{tpl.version}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 truncate">{tpl.name}</h3>
            {tpl.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{tpl.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-3">
          <span>{fmtSize(tpl.file_size)}</span>
          <span>{fmtDate(tpl.created_at)}</span>
          {tpl.variables.length > 0 && (
            <button
              onClick={() => setShowVars(v => !v)}
              className="flex items-center gap-0.5 text-blue-500 hover:underline"
            >
              <Tag size={9} /> {tpl.variables.length} biến
            </button>
          )}
        </div>

        {showVars && (
          <div className="mb-3 p-2 bg-slate-50 rounded-lg flex flex-wrap gap-1">
            {tpl.variables.map(v => (
              <code key={v} className="text-[9px] bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-600">
                {`{{${v}}}`}
              </code>
            ))}
            {tpl.list_variables.map(v => (
              <code key={v} className="text-[9px] bg-purple-50 border border-purple-200 rounded px-1 py-0.5 text-purple-600">
                {`{{#${v}}}`}
              </code>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onRender(tpl)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
          >
            <Play size={11} /> Xuất
          </button>
          {!tpl.is_active && (
            <button
              onClick={() => onActivate(tpl.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
            >
              <CheckCircle size={11} /> Dùng mẫu này
            </button>
          )}
          <button
            onClick={() => onDownload(tpl.id, tpl.name, tpl.file_ext)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Download size={11} /> Tải về
          </button>
          <button
            onClick={() => onDelete(tpl.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplateManagerPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [catalog, setCatalog] = useState<VariableCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [renderTarget, setRenderTarget] = useState<ReportTemplate | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [tplRes, catRes] = await Promise.all([
        reportTemplatesApi.list(),
        reportTemplatesApi.variables(),
      ])
      setTemplates(tplRes.data)
      setCatalog(catRes.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleActivate(id: number) {
    try {
      await reportTemplatesApi.activate(id)
      load()
    } catch { /* silent */ }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa template này?')) return
    try {
      await reportTemplatesApi.delete(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch { /* silent */ }
  }

  async function handleDownload(id: number, name: string, ext: string) {
    try {
      const resp = await reportTemplatesApi.download(id)
      downloadBlob(resp.data as Blob, `${name}.${ext}`)
    } catch { /* silent */ }
  }

  // Group by category
  const categories = ['all', ...Object.keys(CATEGORY_LABELS)]
  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category === activeCategory)

  const grouped: Record<string, ReportTemplate[]> = {}
  filtered.forEach(t => {
    if (!grouped[t.category]) grouped[t.category] = []
    grouped[t.category].push(t)
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <BookTemplate size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">Quản lý mẫu báo cáo</h1>
              <p className="text-xs text-slate-500">{templates.length} mẫu • upload .xlsx / .docx • dữ liệu tự động</p>
            </div>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={14} /> Upload mẫu
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? `Tất cả (${templates.length})` : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={20} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Template list */}
            <div className="flex-1 min-w-0 space-y-6">
              {Object.keys(grouped).length === 0 ? (
                <div className="text-center py-16">
                  <BookTemplate size={40} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Chưa có mẫu báo cáo</p>
                  <p className="text-xs text-slate-400 mt-1">Upload file .xlsx hoặc .docx có chứa biến <code className="bg-slate-100 px-1 rounded">{'{{variable}}'}</code></p>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    Upload mẫu đầu tiên
                  </button>
                </div>
              ) : (
                Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                      {CATEGORY_LABELS[cat] ?? cat}
                      <span className="text-slate-400 font-normal normal-case">({items.length})</span>
                    </h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                      {items.map(tpl => (
                        <TemplateCard
                          key={tpl.id}
                          tpl={tpl}
                          onActivate={handleActivate}
                          onRender={setRenderTarget}
                          onDelete={handleDelete}
                          onDownload={handleDownload}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Variable catalog sidebar */}
            {catalog && (
              <div className="w-72 shrink-0 hidden xl:block">
                <VariablesPanel catalog={catalog} />

                {/* Syntax guide */}
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5">
                    <Eye size={12} /> Cú pháp template
                  </p>
                  <div className="space-y-2 text-[11px] text-amber-700">
                    <div>
                      <code className="font-mono block bg-white/60 rounded px-1.5 py-0.5 mb-0.5">{`{{tong_nhiem_vu}}`}</code>
                      <span>Biến đơn — tự điền giá trị</span>
                    </div>
                    <div>
                      <code className="font-mono block bg-white/60 rounded px-1.5 py-0.5 mb-0.5">{`{{#danh_sach_nhiem_vu_qua_han}}`}</code>
                      <code className="font-mono block bg-white/60 rounded px-1.5 py-0.5 mb-0.5">{`{{item.ten}}  {{item.han}}`}</code>
                      <code className="font-mono block bg-white/60 rounded px-1.5 py-0.5 mb-0.5">{`{{/danh_sach_nhiem_vu_qua_han}}`}</code>
                      <span>Vòng lặp — mỗi dòng là 1 item</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={load} />}
      {renderTarget && <RenderModal tpl={renderTarget} onClose={() => setRenderTarget(null)} />}
    </div>
  )
}
