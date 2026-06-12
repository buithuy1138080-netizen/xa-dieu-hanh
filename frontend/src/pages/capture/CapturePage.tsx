/**
 * /capture — Nhận văn bản từ bookmarklet dhtn.dcs.vn
 *
 * URL params (tất cả đều optional):
 *   doc_number, title, issuer, trich_yeu, issue_date, doc_type, do_mat, source_url
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckSquare, ExternalLink, FileText, X } from 'lucide-react'
import apiClient from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { departmentsApi, type DeptRead } from '../../api/departments'

interface CaptureRequest {
  title: string
  doc_number?: string
  doc_type: string
  issuer?: string
  trich_yeu?: string
  issue_date?: string
  source_url?: string
  do_mat?: string
  create_task: boolean
  task_title?: string
  task_due_date?: string
  lead_department_id?: number
}

export default function CapturePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user: authUser } = useAuthStore()

  // Form state from URL params
  const [title, setTitle] = useState(params.get('title') ?? '')
  const [docNumber, setDocNumber] = useState(params.get('doc_number') ?? '')
  const [docType, setDocType] = useState(params.get('doc_type') ?? 'incoming')
  const [issuer, setIssuer] = useState(params.get('issuer') ?? '')
  const [trichYeu] = useState(params.get('trich_yeu') ?? '')
  const [issueDate, setIssueDate] = useState(params.get('issue_date') ?? '')
  const [sourceUrl] = useState(params.get('source_url') ?? '')
  const [doMat] = useState(params.get('do_mat') ?? '')

  // Task creation
  const [createTask, setCreateTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [leadDeptId, setLeadDeptId] = useState<number | ''>('')
  const [departments, setDepartments] = useState<DeptRead[]>([])

  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ doc_id: number; task_id?: number; message: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authUser) {
      sessionStorage.setItem('capture_redirect', window.location.href)
      navigate('/login')
      return
    }
    departmentsApi.list().then(r => setDepartments(r.data)).catch(() => {})
  }, [authUser, navigate])

  // Auto-fill task title from doc title
  useEffect(() => {
    if (createTask && !taskTitle && title) {
      setTaskTitle(`Xử lý ${docNumber ? docNumber + ': ' : ''}${title}`)
    }
  }, [createTask, title, docNumber, taskTitle])

  async function handleSave() {
    if (!title.trim()) { setError('Vui lòng nhập tiêu đề văn bản'); return }
    setSaving(true); setError('')
    try {
      const body: CaptureRequest = {
        title: title.trim(),
        doc_number: docNumber.trim() || undefined,
        doc_type: docType,
        issuer: issuer.trim() || undefined,
        trich_yeu: trichYeu.trim() || undefined,
        issue_date: issueDate || undefined,
        source_url: sourceUrl || undefined,
        do_mat: doMat || undefined,
        create_task: createTask,
        task_title: createTask ? taskTitle.trim() : undefined,
        task_due_date: createTask && taskDueDate ? taskDueDate : undefined,
        lead_department_id: createTask && leadDeptId ? Number(leadDeptId) : undefined,
      }
      const r = await apiClient.post<{ doc_id: number; task_id?: number; message: string }>(
        '/documents/capture', body
      )
      setResult(r.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Lỗi khi lưu văn bản')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckSquare size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Đã lưu thành công!</h2>
          <p className="text-slate-500 text-sm">{result.message}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => navigate(`/documents/${result.doc_id}`)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold"
            >
              Xem văn bản
            </button>
            {result.task_id && (
              <button
                onClick={() => navigate(`/tasks/${result.task_id}`)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold"
              >
                Xem nhiệm vụ
              </button>
            )}
            <button
              onClick={() => window.close()}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-semibold"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Nhập văn bản từ dhtn.dcs.vn</p>
              <p className="text-blue-200 text-xs mt-0.5">Xã Ba Chá · IOC Platform</p>
            </div>
          </div>
          <button onClick={() => window.close()} className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Source info */}
        {sourceUrl && (
          <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 flex items-center gap-2 text-xs text-blue-700">
            <ExternalLink size={12} />
            <span className="truncate">{sourceUrl}</span>
          </div>
        )}

        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          {/* Doc type */}
          <div className="flex gap-2">
            {[
              { v: 'incoming', l: '📥 Văn bản đến' },
              { v: 'outgoing', l: '📤 Văn bản đi' },
            ].map(opt => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setDocType(opt.v)}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl border-2 transition-all ${
                  docType === opt.v
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          {/* Số hiệu */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Số/Ký hiệu văn bản</label>
            <input
              value={docNumber}
              onChange={e => setDocNumber(e.target.value)}
              placeholder="VD: 811-CV/ĐU"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tiêu đề */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Trích yếu nội dung <span className="text-red-500">*</span></label>
            <textarea
              value={title}
              onChange={e => setTitle(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Đơn vị ban hành */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Đơn vị ban hành / Nơi gửi</label>
            <input
              value={issuer}
              onChange={e => setIssuer(e.target.value)}
              placeholder="VD: Đảng ủy xã Bắc Hà - Tỉnh ủy Lào Cai"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Ngày văn bản */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Ngày ban hành</label>
            <input
              value={issueDate}
              onChange={e => setIssueDate(e.target.value)}
              placeholder="dd/mm/yyyy"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tạo nhiệm vụ? */}
          <div className="border-t border-slate-100 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setCreateTask(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${createTask ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${createTask ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm font-semibold text-slate-700">Tạo nhiệm vụ từ văn bản này</span>
            </label>
          </div>

          {createTask && (
            <div className="space-y-3 bg-indigo-50 rounded-xl p-4 border border-indigo-100">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tiêu đề nhiệm vụ</label>
                <input
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hạn xử lý</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={e => setTaskDueDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Đơn vị chủ trì</label>
                  <select
                    value={leadDeptId}
                    onChange={e => setLeadDeptId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {departments.filter(d => d.is_active).map(d => (
                      <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm disabled:opacity-60 transition-colors"
          >
            {saving ? '⏳ Đang lưu...' : createTask ? '💾 Lưu văn bản + Tạo nhiệm vụ' : '💾 Lưu văn bản'}
          </button>
          <button
            onClick={() => window.close()}
            className="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl text-sm"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  )
}
