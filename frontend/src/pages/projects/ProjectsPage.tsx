import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, ChevronRight, Clock, FolderKanban, Layers,
  Loader2, Plus, Search, Users,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { tasksApi } from '../../api/tasks'
import type { Task } from '../../types/task'

const STATUS_LABEL: Record<string, string> = {
  pending:     'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  completed:   'Hoàn thành',
  cancelled:   'Đã huỷ',
}

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-red-100 text-red-700',
}

const PRIORITY_COLOR: Record<string, string> = {
  low:    'bg-slate-100 text-slate-500',
  medium: 'bg-blue-100 text-blue-600',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Khẩn',
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 100 ? 'bg-green-500' : value >= 60 ? 'bg-blue-500' : value >= 30 ? 'bg-amber-400' : 'bg-slate-300'
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Task[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await tasksApi.list({
        is_project: true,
        page_size: 200,
        search: search || undefined,
        status:  status || undefined,
        sort_by: 'created_at',
        sort_dir: 'desc',
      })
      setProjects(data.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, status])

  const stats = {
    total:       projects.length,
    in_progress: projects.filter(p => p.status === 'in_progress').length,
    completed:   projects.filter(p => p.status === 'completed').length,
    overdue:     projects.filter(p => p.is_overdue).length,
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <FolderKanban size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Dự án</h1>
              <p className="text-sm text-slate-500">Quản lý dự án từ nhiệm vụ</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
          >
            <Plus size={15} />Tạo dự án
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Tổng dự án',      value: stats.total,       color: 'text-slate-700',  bg: 'bg-slate-50' },
            { label: 'Đang thực hiện',  value: stats.in_progress, color: 'text-blue-700',   bg: 'bg-blue-50' },
            { label: 'Hoàn thành',      value: stats.completed,   color: 'text-green-700',  bg: 'bg-green-50' },
            { label: 'Quá hạn',         value: stats.overdue,     color: 'text-red-700',    bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl px-4 py-3 border border-slate-100`}>
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm dự án..."
              className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="pending">Chưa bắt đầu</option>
            <option value="in_progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
            <option value="cancelled">Đã huỷ</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 size={28} className="animate-spin text-indigo-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <FolderKanban size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Chưa có dự án nào</p>
            <p className="text-sm mt-1">Tạo dự án mới hoặc đánh dấu nhiệm vụ hiện có là dự án</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/tasks/${p.id}`)}
                className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200 transition cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Title + badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs text-slate-400 font-mono">{p.task_code}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[p.status] ?? STATUS_COLOR.pending}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[p.priority] ?? ''}`}>
                        {PRIORITY_LABEL[p.priority] ?? p.priority}
                      </span>
                      {p.is_overdue && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Quá hạn</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-800 text-sm group-hover:text-indigo-700 truncate">{p.title}</h3>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400 shrink-0 mt-1" />
                </div>

                {/* Meta row */}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                  {p.assignee && (
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {p.assignee.full_name || p.assignee.username}
                    </span>
                  )}
                  {p.due_date && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(p.due_date).toLocaleDateString('vi-VN')}
                    </span>
                  )}
                  {p.subtasks_count > 0 && (
                    <span className="flex items-center gap-1">
                      <Layers size={11} />
                      {p.subtasks_count} nhiệm vụ
                    </span>
                  )}
                  {p.lead_department && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      {p.lead_department.short_name || p.lead_department.name}
                    </span>
                  )}
                </div>

                {/* Progress */}
                <div className="mt-3 flex items-center gap-2">
                  <ProgressBar value={p.progress_percent} />
                  <span className="text-xs text-slate-500 shrink-0 w-8 text-right">{p.progress_percent}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal tạo dự án */}
      {showForm && (
        <CreateProjectModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load() }}
        />
      )}
    </AppLayout>
  )
}


// ── Modal tạo dự án nhanh ──────────────────────────────────────────────────────

import { usersApi } from '../../api/users'
import { departmentsApi } from '../../api/departments'
import type { UserPublic } from '../../api/users'
import type { DeptRead } from '../../api/departments'

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium',
    due_date: '', assignee_id: '', lead_department_id: '',
  })
  const [users, setUsers]   = useState<UserPublic[]>([])
  const [depts, setDepts]   = useState<DeptRead[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    usersApi.names().then(r => setUsers(r.data))
    departmentsApi.list().then(r => setDepts(r.data))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Vui lòng nhập tên dự án'); return }
    setSaving(true)
    try {
      await tasksApi.create({
        title: form.title.trim(),
        description: form.description || undefined,
        priority: form.priority as 'low' | 'medium' | 'high' | 'urgent',
        is_project: true,
        due_date: form.due_date ? form.due_date + 'T23:59:59' : undefined,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : undefined,
        lead_department_id: form.lead_department_id ? Number(form.lead_department_id) : undefined,
      })
      onCreated()
    } catch {
      setError('Tạo dự án thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FolderKanban size={18} className="text-indigo-600" />
            <h2 className="font-bold text-slate-800">Tạo dự án mới</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Tên dự án *</label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Nhập tên dự án..."
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Mô tả</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              placeholder="Mô tả ngắn về dự án..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Hạn hoàn thành</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Ưu tiên</label>
              <select
                value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
                <option value="urgent">Khẩn</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Quản lý dự án</label>
              <select
                value={form.assignee_id}
                onChange={e => setForm(p => ({ ...p, assignee_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">— Chưa chọn</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Đơn vị chủ trì</label>
              <select
                value={form.lead_department_id}
                onChange={e => setForm(p => ({ ...p, lead_department_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">— Chưa chọn</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.short_name || d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
              Huỷ
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Tạo dự án
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
