import { useEffect, useRef, useState } from 'react'
import {
  Download, Edit2, Eye, EyeOff, KeyRound, Lock, Plus, Search, Shield, Trash2, Users, X,
} from 'lucide-react'
import apiClient from '../../api/client'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../store/authStore'
import { ROLE_LABELS, isAdminOrLeader } from '../../types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Department { id: number; name: string; short_name: string | null }
interface StaffRecord {
  id: number
  employee_code: string | null
  full_name: string
  position: string | null
  phone: string | null
  email: string | null
  avatar_url: string | null
  note: string | null
  role: string
  is_active: boolean
  has_password: boolean
  department_id: number | null
  user_id: number | null
  department: { id: number; name: string; short_name: string | null } | null
  user: { id: number; username: string; full_name: string | null } | null
}

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin:   'bg-red-100 text-red-700 border-red-200',
    leader:  'bg-purple-100 text-purple-700 border-purple-200',
    manager: 'bg-blue-100 text-blue-700 border-blue-200',
    staff:   'bg-slate-100 text-slate-600 border-slate-200',
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${colors[role] ?? colors.staff}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed']
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  const bg = colors[Math.abs(h) % colors.length]
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35, backgroundColor: bg }}>
      {initials}
    </div>
  )
}

// ── Staff Form Modal ───────────────────────────────────────────────────────────

interface StaffFormData {
  full_name: string; email: string; password: string; role: string
  position: string; department_id: string; phone: string; employee_code: string; is_active: boolean
}

function StaffModal({ staff, departments, onSave, onClose }: {
  staff: StaffRecord | null; departments: Department[]
  onSave: () => void; onClose: () => void
}) {
  const isEdit = !!staff
  const [form, setForm] = useState<StaffFormData>({
    full_name: staff?.full_name ?? '', email: staff?.email ?? '',
    password: '', role: staff?.role ?? 'staff', position: staff?.position ?? '',
    department_id: staff?.department_id?.toString() ?? '', phone: staff?.phone ?? '',
    employee_code: staff?.employee_code ?? '', is_active: staff?.is_active ?? true,
  })
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof StaffFormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Vui lòng nhập họ tên'); return }
    setSaving(true); setError('')
    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        role: form.role,
        position: form.position.trim() || null,
        department_id: form.department_id ? parseInt(form.department_id) : null,
        phone: form.phone.trim() || null,
        employee_code: form.employee_code.trim() || null,
        is_active: form.is_active,
      }
      if (!isEdit && form.password) payload.password = form.password
      if (isEdit) {
        await apiClient.put(`/staff/${staff!.id}`, payload)
      } else {
        await apiClient.post('/staff', payload)
      }
      onSave()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(msg ?? 'Có lỗi xảy ra')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-slate-800 text-lg">{isEdit ? 'Sửa nhân sự' : 'Thêm nhân sự mới'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <form id="staff-form" onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Họ và tên *</label>
              <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mã nhân viên</label>
              <input value={form.employee_code} onChange={e => set('employee_code', e.target.value)}
                placeholder="Tự động" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Chức vụ</label>
              <input value={form.position} onChange={e => set('position', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Điện thoại</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phân quyền</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị</label>
              <select value={form.department_id} onChange={e => set('department_id', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                <option value="">-- Chưa phân --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
              </select>
            </div>
            {!isEdit && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mật khẩu <span className="text-slate-400">(để trống nếu chưa cần đăng nhập)</span>
                </label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full border rounded-lg px-3 py-2 pr-9 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
              <label htmlFor="is_active" className="text-sm text-slate-700">Tài khoản đang hoạt động</label>
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition">Hủy</button>
          <button type="submit" form="staff-form"
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm nhân sự'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Password Reset Modal ───────────────────────────────────────────────────────

function PasswordModal({ staff, onClose }: { staff: StaffRecord & { has_password: boolean }; onClose: () => void }) {
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    if (pwd.length < 6) { setError('Mật khẩu phải có ít nhất 6 ký tự'); return }
    setSaving(true); setError('')
    try {
      await apiClient.post(`/staff/${staff.id}/reset-password`, { new_password: pwd })
      setDone(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(msg ?? 'Có lỗi xảy ra')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-800">{staff.has_password ? 'Đặt lại mật khẩu' : 'Cấp mật khẩu đăng nhập'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            {staff.has_password ? 'Đặt lại mật khẩu cho' : 'Cấp mật khẩu đăng nhập cho'} <span className="font-semibold">{staff.full_name}</span>
          </p>
          {staff.email && (
            <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
              Đăng nhập bằng email: <span className="font-mono font-bold">{staff.email}</span>
            </div>
          )}
          {!staff.email && (
            <div className="bg-amber-50 text-amber-700 text-xs px-3 py-2 rounded-lg">
              ⚠ Nhân sự chưa có email — hãy cập nhật email trước khi cấp mật khẩu
            </div>
          )}
          {done ? (
            <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">Đặt lại mật khẩu thành công!</div>
          ) : (
            <>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
                  placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                  className="w-full border rounded-lg px-3 py-2 pr-9 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button onClick={handleReset} disabled={saving}
                className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                {saving ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { user: currentUser } = useAuthStore()
  const canManage = isAdminOrLeader(currentUser ?? null)
  const isManager = currentUser?.role === 'manager'
  // Manager cũng được thêm nhân sự (chỉ đơn vị mình)
  const canAdd = canManage || isManager

  const [items, setItems] = useState<StaffRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffRecord | null>(null)
  const [pwdModal, setPwdModal] = useState<StaffRecord | null>(null)

  const SIZE = 20
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { loadDepts() }, [])
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadStaff(), 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [page, search, deptFilter, roleFilter])

  async function loadDepts() {
    try {
      const { data } = await apiClient.get('/departments')
      setDepartments(Array.isArray(data) ? data : (data as { items?: Department[] }).items ?? [])
    } catch { /* non-critical: dropdowns just stay empty */ }
  }

  async function loadStaff() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), size: String(SIZE) })
      if (search) params.set('search', search)
      if (deptFilter) params.set('department_id', deptFilter)
      if (roleFilter) params.set('role', roleFilter)
      const { data } = await apiClient.get<{ items: StaffRecord[]; total: number }>(`/staff?${params}`)
      setItems(data.items); setTotal(data.total)
    } finally { setLoading(false) }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (deptFilter) params.set('department_id', deptFilter)
      if (roleFilter) params.set('role', roleFilter)
      const res = await apiClient.get(`/staff/export/excel?${params}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nhan-su-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  async function handleToggleActive(s: StaffRecord) {
    await apiClient.put(`/staff/${s.id}`, { is_active: !s.is_active })
    loadStaff()
  }

  async function handleDelete(s: StaffRecord) {
    if (!confirm(`Xóa nhân sự "${s.full_name}"?`)) return
    try {
      await apiClient.delete(`/staff/${s.id}`)
      loadStaff()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      alert(msg ?? 'Có lỗi khi xóa')
    }
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))

  return (
    <AppLayout>
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={24} className="text-blue-600" /> Quản lý Nhân sự
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {(search || deptFilter || roleFilter)
              ? <>{total} nhân sự <span className="text-amber-500 font-medium">(đang lọc)</span> · <button onClick={() => { setSearch(''); setDeptFilter(''); setRoleFilter(''); setPage(1) }} className="text-blue-500 hover:underline">Xóa bộ lọc</button></>
              : <>{total} nhân sự · Tài khoản &amp; phân quyền</>
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition shadow-sm disabled:opacity-60"
          >
            <Download size={15} className="text-emerald-600" />
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          {canAdd && (
            <button onClick={() => { setEditing(null); setModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Plus size={16} /> {isManager ? 'Thêm nhân sự đơn vị' : 'Thêm nhân sự'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Tìm tên, chức vụ, mã nhân viên..."
            className="w-full pl-9 pr-8 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1) }}
          className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white min-w-[150px]">
          <option value="">Tất cả đơn vị</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.short_name ?? d.name}</option>)}
        </select>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white min-w-[130px]">
          <option value="">Tất cả quyền</option>
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nhân sự</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Chức vụ / Đơn vị</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phân quyền</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Liên hệ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trạng thái</th>
                {canManage && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Đang tải...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Không có dữ liệu</td></tr>
              ) : items.map(s => (
                <tr key={s.id} className={`hover:bg-slate-50 transition ${!s.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.full_name} size={36} />
                      <div>
                        <p className="font-medium text-slate-800">{s.full_name}</p>
                        <p className="text-xs text-slate-400">{s.employee_code ?? '—'}</p>
                        {s.user && (
                          <p className="text-xs text-blue-600 font-mono mt-0.5">@{s.user.username}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{s.position ?? '—'}</p>
                    <p className="text-xs text-slate-400">{s.department?.short_name ?? s.department?.name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={s.role} /></td>
                  <td className="px-4 py-3">
                    <p className="text-slate-600 text-xs">{s.email ?? '—'}</p>
                    <p className="text-xs text-slate-400">{s.phone ?? ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active
                      ? <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Hoạt động</span>
                      : <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border">Đã khóa</span>}
                    {s.has_password
                      ? <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">✓ Có thể đăng nhập</p>
                      : <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">⚠ Chưa có mật khẩu</p>}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(s); setModalOpen(true) }} title="Sửa"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setPwdModal(s)} title={s.has_password ? 'Đặt lại mật khẩu' : 'Cấp mật khẩu đăng nhập'}
                          className={`p-1.5 rounded-lg transition ${s.has_password ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-amber-500 bg-amber-50 hover:bg-amber-100'}`}>
                          <KeyRound size={14} />
                        </button>
                        <button onClick={() => handleToggleActive(s)} title={s.is_active ? 'Khóa tài khoản' : 'Mở khóa'}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition">
                          <Lock size={14} className={!s.is_active ? 'text-amber-500' : ''} />
                        </button>
                        {currentUser?.role === 'admin' && (
                          <button onClick={() => handleDelete(s)} title="Xóa"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <p className="text-xs text-slate-500">Trang {page}/{pages} · {total} nhân sự</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-white transition">‹</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-white transition">›</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <Shield size={13} className="text-slate-400" />
        <span className="text-xs text-slate-400">Phân quyền:</span>
        {ROLE_OPTIONS.map(r => <RoleBadge key={r.value} role={r.value} />)}
      </div>

      {modalOpen && (
        <StaffModal staff={editing} departments={departments}
          onSave={() => { setModalOpen(false); loadStaff() }}
          onClose={() => setModalOpen(false)} />
      )}
      {pwdModal && (
        <PasswordModal staff={pwdModal} onClose={() => { setPwdModal(null); loadStaff() }} />
      )}
    </div>
    </AppLayout>
  )
}
