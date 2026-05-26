import axios from 'axios'
import { Download, Eye, FileText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const publicApi = axios.create({ baseURL: '/api/public' })

interface MeetingItem {
  id: number
  title: string
  meeting_date: string
  location: string | null
  chair: string | null
  file_count: number
  participant_count: number
}

interface MeetingDetail {
  id: number
  title: string
  meeting_date: string
  location: string | null
  chair: string | null
  agenda: string | null
  files: { id: number; file_name: string; file_size: number; file_mime: string | null; uploaded_at: string }[]
  participants: { id: number; name: string | null }[]
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function fileIcon(mime: string | null) {
  if (mime === 'application/pdf') return '📄'
  if (mime?.startsWith('image/')) return '🖼️'
  if (mime?.includes('word')) return '📝'
  if (mime?.includes('sheet') || mime?.includes('excel')) return '📊'
  return '📎'
}

export default function PublicMeetingsPage() {
  const [items, setItems] = useState<MeetingItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SIZE = 20

  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [viewFileName, setViewFileName] = useState('')
  const [viewLoading, setViewLoading] = useState(false)

  async function load(p = 1, q = search) {
    setLoading(true)
    try {
      const { data } = await publicApi.get('/public/meetings', { params: { page: p, size: SIZE, search: q || undefined } })
      setItems(data.items)
      setTotal(data.total)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1) }, [])

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(1, search), 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  async function openDetail(id: number) {
    setLoadingDetail(true)
    setDetail(null)
    try {
      const { data } = await publicApi.get(`/public/meetings/${id}`)
      setDetail(data)
    } finally {
      setLoadingDetail(false)
    }
  }

  async function handleViewFile(meetingId: number, fileId: number, fileName: string) {
    setViewLoading(true)
    setViewFileName(fileName)
    setViewUrl(null)
    try {
      const { data } = await publicApi.get(`/public/meetings/${meetingId}/files/${fileId}`, { responseType: 'blob' })
      setViewUrl(URL.createObjectURL(data))
    } catch {
      setViewUrl('error')
    } finally {
      setViewLoading(false)
    }
  }

  function closeViewer() {
    if (viewUrl && viewUrl !== 'error') URL.revokeObjectURL(viewUrl)
    setViewUrl(null)
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: 'linear-gradient(135deg, #4F46E5, #2563EB)' }}>
            <span className="text-white text-lg">📋</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Tài liệu họp</h1>
            <p className="text-xs text-slate-500">Hệ thống điều hành cấp xã</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề cuộc họp..."
            className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Stats */}
        {!loading && (
          <p className="text-sm text-slate-500">{total} cuộc họp</p>
        )}

        {/* List */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-slate-400">Chưa có cuộc họp nào</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="space-y-3">
            {items.map(m => (
              <button key={m.id} onClick={() => openDetail(m.id)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all duration-200 group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                    <FileText size={18} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors leading-snug">{m.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      <span className="text-xs text-slate-500">🗓 {fmtDateTime(m.meeting_date)}</span>
                      {m.location && <span className="text-xs text-slate-500">📍 {m.location}</span>}
                      {m.chair && <span className="text-xs text-slate-500">👤 {m.chair}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.file_count > 0 && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium">
                        <FileText size={11} /> {m.file_count} file
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50 transition bg-white">
              ‹ Trước
            </button>
            <span className="text-sm text-slate-500">Trang {page}/{pages}</span>
            <button disabled={page >= pages} onClick={() => load(page + 1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50 transition bg-white">
              Sau ›
            </button>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {(detail || loadingDetail) && (
        <div className="fixed inset-0 z-40 flex bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="flex-1" />
          <div className="w-full max-w-xl bg-white shadow-2xl overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-slate-800">Tài liệu cuộc họp</h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>

            {loadingDetail && (
              <div className="flex-1 flex items-center justify-center text-slate-400 py-20">Đang tải...</div>
            )}

            {detail && (
              <div className="p-5 space-y-5">
                {/* Meeting info */}
                <div>
                  <h3 className="font-bold text-slate-800 text-lg leading-snug mb-3">{detail.title}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Ngày giờ</p>
                      <p className="font-medium text-slate-700">{fmtDateTime(detail.meeting_date)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Địa điểm</p>
                      <p className="font-medium text-slate-700">{detail.location || '—'}</p>
                    </div>
                    {detail.chair && (
                      <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                        <p className="text-xs text-slate-400 mb-0.5">Chủ trì</p>
                        <p className="font-medium text-slate-700">{detail.chair}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Agenda */}
                {detail.agenda && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Nội dung chương trình</p>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">{detail.agenda}</div>
                  </div>
                )}

                {/* Participants */}
                {detail.participants.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Thành phần tham dự ({detail.participants.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {detail.participants.map(p => (
                        <span key={p.id} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full font-medium">
                          {p.name || '—'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-3">
                    Tài liệu đính kèm ({detail.files.length})
                  </p>
                  {detail.files.length === 0 ? (
                    <p className="text-sm text-slate-400">Chưa có tài liệu</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.files.map(f => (
                        <div key={f.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition">
                          <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-lg shrink-0">
                            {fileIcon(f.file_mime)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{f.file_name}</p>
                            <p className="text-xs text-slate-400">{fmtSize(f.file_size)}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => handleViewFile(detail.id, f.id, f.file_name)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Xem">
                              <Eye size={15} />
                            </button>
                            <a href={`/api/public/meetings/${detail.id}/files/${f.id}`} target="_blank" rel="noreferrer"
                              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Tải về"
                              onClick={e => e.stopPropagation()}>
                              <Download size={15} />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File viewer */}
      {(viewUrl !== null || viewLoading) && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="text-indigo-500 shrink-0" />
              <span className="font-semibold text-slate-800 text-sm truncate">{viewFileName}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {viewUrl && viewUrl !== 'error' && (
                <a href={viewUrl} download={viewFileName}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                  <Download size={14} /> Tải về
                </a>
              )}
              <button onClick={closeViewer} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
            {viewLoading && <div className="text-white text-sm">Đang tải file...</div>}
            {!viewLoading && viewUrl === 'error' && (
              <div className="text-white text-center">
                <p className="text-4xl mb-3">⚠️</p>
                <p className="text-sm">Không thể tải file.</p>
              </div>
            )}
            {!viewLoading && viewUrl && viewUrl !== 'error' && (() => {
              const ext = viewFileName.split('.').pop()?.toLowerCase()
              if (ext === 'pdf') return <iframe src={viewUrl} className="w-full h-full rounded-xl bg-white" title={viewFileName} />
              if (['jpg','jpeg','png','gif'].includes(ext || '')) return (
                <img src={viewUrl} alt={viewFileName} className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
              )
              return (
                <div className="bg-white rounded-2xl p-8 text-center shadow-2xl max-w-sm">
                  <p className="text-5xl mb-4">📄</p>
                  <p className="font-semibold text-slate-800 mb-1">{viewFileName}</p>
                  <p className="text-sm text-slate-500 mb-6">Định dạng này không thể xem trực tiếp.</p>
                  <a href={viewUrl} download={viewFileName}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
                    <Download size={15} /> Tải về để xem
                  </a>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
