import { AlertTriangle, Download, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentsApi } from '../../api/documents'
import DocStatusBadge from '../../components/documents/DocStatusBadge'
import DocTypeBadge from '../../components/documents/DocTypeBadge'
import DocumentForm from '../../components/documents/DocumentForm'
import DocumentUploadAI from '../../components/documents/DocumentUploadAI'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'
import { isAdminOrLeader } from '../../types'
import type { DocStatus, DocType, DocumentCreate, DocumentRead } from '../../types/document'

const TYPE_TABS: { value: DocType | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'incoming', label: 'Văn bản đến' },
  { value: 'outgoing', label: 'Văn bản đi' },
  { value: 'internal', label: 'Nội bộ' },
]

const STATUS_OPTS: { value: DocStatus | ''; label: string }[] = [
  { value: '', label: 'Mọi trạng thái' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'done', label: 'Đã xử lý' },
  { value: 'archived', label: 'Lưu trữ' },
]

const PRIORITY_COLORS: Record<string, string> = {
  normal: 'text-slate-400',
  urgent: 'text-amber-500 font-semibold',
  very_urgent: 'text-red-500 font-bold',
}
const PRIORITY_LABELS: Record<string, string> = {
  normal: 'Thường', urgent: 'Khẩn', very_urgent: 'Hỏa tốc',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isOverdue(deadline: string | null, status: string) {
  if (!deadline || status === 'done' || status === 'archived') return false
  return new Date(deadline) < new Date()
}

export default function DocumentListPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore(s => s.user)
  const canManage = isAdminOrLeader(currentUser)
  const [docs, setDocs] = useState<DocumentRead[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showUploadAI, setShowUploadAI] = useState(false)

  const [search, setSearch] = useState('')
  const [typeTab, setTypeTab] = useState<DocType | ''>('')
  const [statusFilter, setStatusFilter] = useState<DocStatus | ''>('')

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 20

  const load = useCallback(async (p = 1, q = search, t = typeTab, s = statusFilter) => {
    setLoading(true)
    setFetchError(null)
    try {
      const { data } = await documentsApi.list({
        page: p, size: SIZE,
        search: q || undefined,
        doc_type: t || undefined,
        status: s || undefined,
      })
      setDocs(data.items)
      setTotal(data.total)
      setPage(p)
    } catch {
      setFetchError('Không thể tải danh sách văn bản. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [search, typeTab, statusFilter])

  useEffect(() => { load(1) }, [typeTab, statusFilter])

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  async function handleCreate(data: DocumentCreate, file?: File | null) {
    setSaving(true)
    try {
      const { data: doc } = await documentsApi.create(data)
      if (file) {
        await documentsApi.uploadFile(doc.id, file).catch(() => {})
      }
      setShowForm(false)
      navigate(`/documents/${doc.id}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await documentsApi.export({
        search: search || undefined,
        doc_type: typeTab || undefined,
        status: statusFilter || undefined,
      })
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `van-ban-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Không thể xuất dữ liệu. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-blue-100 flex items-center justify-center text-xl">📄</div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-800">Quản lý Văn bản</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {loading ? 'Đang tải...' : `${total} văn bản`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={() => setShowUploadAI(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-violet-300 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-50 transition"
                title="Upload file — AI tự động phân tích và lưu"
              >
                <Sparkles size={15} />
                <span className="hidden sm:inline">AI Phân tích</span>
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
              title="Xuất Excel theo bộ lọc hiện tại"
            >
              <Download size={15} />
              <span className="hidden sm:inline">{exporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
            {canManage && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
              >
                <span className="hidden sm:inline">+ Thêm văn bản</span>
                <span className="sm:hidden">+ Thêm</span>
              </button>
            )}
          </div>
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeTab(t.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeTab === t.value
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search + filter bar */}
        <div className="flex gap-2 md:gap-3 items-center">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo số hiệu, trích yếu, cơ quan..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DocStatus | '')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          >
            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {fetchError}
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {loading && <div className="text-center py-8 text-slate-400">Đang tải...</div>}
          {!loading && docs.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-3xl mb-2">📭</p>
              <p>Không có văn bản nào</p>
            </div>
          )}
          {!loading && docs.map((doc) => {
            const overdue = isOverdue(doc.deadline, doc.status)
            return (
              <div
                key={doc.id}
                onClick={() => navigate(`/documents/${doc.id}`)}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{doc.doc_number ?? '—'}</span>
                  <DocTypeBadge type={doc.doc_type} />
                </div>
                <p className="font-semibold text-slate-800 text-sm line-clamp-2 mb-2">{doc.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <DocStatusBadge status={doc.status} />
                  {doc.deadline && (
                    <span className={`text-[11px] font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                      {overdue ? '⚠ ' : ''}{fmtDate(doc.deadline)}
                    </span>
                  )}
                  {doc.issuer && <span className="text-[11px] text-slate-400">{doc.issuer}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Số hiệu</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Trích yếu</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Cơ quan ban hành</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Ngày nhận</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Hạn xử lý</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Ưu tiên</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Xử lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400">Đang tải...</td></tr>
              )}
              {!loading && docs.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-slate-400">Không có văn bản nào</p>
                  </td>
                </tr>
              )}
              {!loading && docs.map((doc) => {
                const overdue = isOverdue(doc.deadline, doc.status)
                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/documents/${doc.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-600 font-medium">
                        {doc.doc_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-slate-800 line-clamp-2 leading-snug">{doc.title}</p>
                      {doc.category && <p className="text-xs text-slate-400 mt-0.5">{doc.category}</p>}
                    </td>
                    <td className="px-4 py-3"><DocTypeBadge type={doc.doc_type} /></td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{doc.issuer ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(doc.received_date)}</td>
                    <td className="px-4 py-3 text-xs">
                      {doc.deadline ? (
                        <span className={overdue ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                          {fmtDate(doc.deadline)}
                          {overdue && ' ⚠'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3"><DocStatusBadge status={doc.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${PRIORITY_COLORS[doc.priority] ?? 'text-slate-400'}`}>
                        {PRIORITY_LABELS[doc.priority] ?? doc.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {doc.assignee?.full_name ?? doc.assignee?.username ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Trang {page}/{pages} · {total} văn bản</span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
              >‹ Trước</button>
              <button
                disabled={page >= pages}
                onClick={() => load(page + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
              >Sau ›</button>
            </div>
          </div>
        )}
      </div>

      {/* AI Upload modal */}
      {showUploadAI && (
        <DocumentUploadAI
          onClose={() => setShowUploadAI(false)}
          onSaved={() => { load(1); setShowUploadAI(false) }}
        />
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Thêm văn bản mới</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <DocumentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
