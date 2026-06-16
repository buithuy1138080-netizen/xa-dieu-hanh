import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { getApiErrorMessage } from '../../utils/apiError'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { BookOpen, Building2, Check, ChevronDown, ClipboardList, FileText, FolderKanban, Search, User as UserIcon, X } from 'lucide-react'
import apiClient from '../../api/client'
import { departmentsApi, type DeptRead } from '../../api/departments'
import { directivesApi } from '../../api/directives'
import { documentsApi } from '../../api/documents'
import { tasksApi } from '../../api/tasks'
import { usersApi } from '../../api/users'
import type { User } from '../../types'
import type { DirectiveRead } from '../../types/directive'
import type { DocumentRead } from '../../types/document'
import type { Task, TaskCreate, TaskDetail, TaskPriority, TaskUpdate } from '../../types/task'
import { useAuthStore } from '../../store/authStore'

interface ProgramMin { id: number; name: string; short_name?: string | null; program_type: string }

interface StaffItem {
  id: number
  employee_code: string | null
  full_name: string
  position: string | null
  user_id: number | null
  department_id: number | null
  department: { id: number; name: string; short_name: string | null } | null
}

type SourceType = 'none' | 'incoming' | 'outgoing' | 'directive'

interface Props {
  task?: Task
  onClose: () => void
  onSuccess: () => void
  initialProgramId?: number | null
  initialParentTaskId?: number | null
}

const SOURCE_TABS: { id: SourceType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'none',      label: 'Không nguồn',  icon: X,             color: 'slate' },
  { id: 'incoming',  label: 'VB đến',        icon: FileText,      color: 'blue' },
  { id: 'outgoing',  label: 'VB đi',         icon: FileText,      color: 'teal' },
  { id: 'directive', label: 'Chỉ đạo',       icon: ClipboardList, color: 'purple' },
]

const TAB_ACTIVE: Record<SourceType, string> = {
  none:      'bg-slate-100 text-slate-700 border-slate-300',
  incoming:  'bg-blue-600 text-white border-blue-600',
  outgoing:  'bg-teal-600 text-white border-teal-600',
  directive: 'bg-purple-600 text-white border-purple-600',
}
const TAB_IDLE = 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'

function initSourceType(t?: Task): SourceType {
  if (!t) return 'none'
  if (t.directive_id) return 'directive'
  if (t.incoming_document_id) return 'incoming'
  if (t.outgoing_document_id) return 'outgoing'
  return 'none'
}

export default function TaskForm({ task, onClose, onSuccess, initialProgramId, initialParentTaskId }: Props) {
  const { user } = useAuthStore()
  const isManager = user?.role === 'manager'
  // Basic fields
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date ? task.due_date.slice(0, 10) : '')
  const [startDate, setStartDate] = useState(task?.start_date ? task.start_date.slice(0, 10) : '')
  const [isProject, setIsProject] = useState<boolean>(task?.is_project ?? false)
  const [projectType, setProjectType] = useState<string>(task?.project_type ?? 'project')
  const [budgetAmount, setBudgetAmount] = useState<string>(task?.budget_amount != null ? String(task.budget_amount) : '')

  // Parent task (project) picker — chỉ tìm task có is_project=true
  const [parentTaskId, setParentTaskId] = useState<number | null>(
    task?.parent_task_id ?? initialParentTaskId ?? null
  )
  const [parentTaskLabel, setParentTaskLabel] = useState('')
  const [parentSearch, setParentSearch] = useState('')
  const [parentTasks, setParentTasks] = useState<Task[]>([])
  const [showParentPicker, setShowParentPicker] = useState(false)
  const parentRef = useRef<HTMLDivElement>(null)
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id?.toString() ?? '')
  const [assigneeStaffId, setAssigneeStaffId] = useState<number | null>(
    (task as Task & { assignee_staff_id?: number | null })?.assignee_staff_id ?? null
  )

  // Source
  const [sourceType, setSourceType] = useState<SourceType>(initSourceType(task))
  const [sourceSearch, setSourceSearch] = useState('')
  const [selectedDocId, setSelectedDocId] = useState<number | null>(
    task?.incoming_document_id ?? task?.outgoing_document_id ?? null
  )
  const [selectedDocLabel, setSelectedDocLabel] = useState('')
  const [selectedDirId, setSelectedDirId] = useState<number | null>(task?.directive_id ?? null)
  const [selectedDirLabel, setSelectedDirLabel] = useState('')
  const [docs, setDocs] = useState<DocumentRead[]>([])
  const [directives, setDirectives] = useState<DirectiveRead[]>([])
  const [loadingSrc, setLoadingSrc] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState(false)

  // Programs (Chương trình / Nghị quyết)
  const [programs, setPrograms] = useState<ProgramMin[]>([])
  const [programId, setProgramId] = useState<number | null>(task?.program_id ?? initialProgramId ?? null)

  // Departments
  const [departments, setDepartments] = useState<DeptRead[]>([])
  const [leadDeptId, setLeadDeptId] = useState<number | null>(task?.lead_department_id ?? null)
  const [coordIds, setCoordIds] = useState<number[]>([])
  const [deptSearch, setDeptSearch] = useState('')

  // Users
  const [users, setUsers] = useState<User[]>([])

  // Staff (Nhân sự) for assignee picker
  const [staffList, setStaffList] = useState<StaffItem[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [staffDeptFilter, setStaffDeptFilter] = useState('')
  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const assigneeRef = useRef<HTMLDivElement>(null)

  // Form state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sourceRef = useRef<HTMLDivElement>(null)

  // ESC to close
  useEscapeKey(useCallback(() => { if (!loading) onClose() }, [loading, onClose]))

  // Load departments + users + staff + programs on mount
  useEffect(() => {
    departmentsApi.list().then((r) => {
      setDepartments(r.data)
      // Manager: tự điền đơn vị chủ trì = đơn vị của mình (nếu chưa có)
      if (isManager && !task && !leadDeptId) {
        apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200')
          .then((staffRes) => {
            setStaffList(staffRes.data.items)
            // Tìm staff của user hiện tại để lấy department_id
            const myStaff = staffRes.data.items.find(s => s.user_id === user?.id)
            if (myStaff?.department_id && !leadDeptId) {
              setLeadDeptId(myStaff.department_id)
            }
          }).catch(() => {})
      } else {
        apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200')
          .then((r) => setStaffList(r.data.items)).catch(() => {})
      }
    }).catch(() => {
      apiClient.get<{ items: StaffItem[] }>('/staff?active_only=true&size=200')
        .then((r) => setStaffList(r.data.items)).catch(() => {})
    })
    usersApi.names().then((r) => setUsers(r.data as any)).catch(() => {})
    apiClient.get<ProgramMin[]>('/programs?status=active')
      .then((r) => setPrograms(r.data)).catch(() => {})
  }, [])

  // Load existing task's coordinating depts when editing
  useEffect(() => {
    if (!task?.id) return
    tasksApi.get(task.id).then((r) => {
      const detail = r.data as TaskDetail
      const coordDeptIds = detail.departments
        .filter((d) => d.role === 'coordinating')
        .map((d) => d.department_id)
      setCoordIds(coordDeptIds)
    }).catch(() => {})
  }, [task?.id])

  // Load source list when sourceType changes
  useEffect(() => {
    if (sourceType === 'none') { setDocs([]); setDirectives([]); return }
    setLoadingSrc(true)
    if (sourceType === 'directive') {
      directivesApi.list({ size: 100 })
        .then((r) => setDirectives(r.data.items))
        .catch(() => {})
        .finally(() => setLoadingSrc(false))
    } else {
      const docType = sourceType === 'incoming' ? 'incoming' : 'outgoing'
      documentsApi.list({ size: 100, doc_type: docType })
        .then((r) => setDocs(r.data.items))
        .catch(() => {})
        .finally(() => setLoadingSrc(false))
    }
  }, [sourceType])

  // Load dự án candidates khi search thay đổi (chỉ is_project=true)
  useEffect(() => {
    if (!parentSearch.trim()) { setParentTasks([]); return }
    const timer = setTimeout(() => {
      tasksApi.list({ search: parentSearch, is_project: true, page_size: 10 })
        .then((r) => setParentTasks(r.data.items.filter((t) => t.id !== task?.id)))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [parentSearch, task?.id])

  // Close source/assignee/parent pickers on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (sourceRef.current && !sourceRef.current.contains(e.target as Node)) {
        setShowSourcePicker(false)
      }
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setShowAssigneePicker(false)
      }
      if (parentRef.current && !parentRef.current.contains(e.target as Node)) {
        setShowParentPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSourceTypeChange(t: SourceType) {
    setSourceType(t)
    setSelectedDocId(null)
    setSelectedDocLabel('')
    setSelectedDirId(null)
    setSelectedDirLabel('')
    setSourceSearch('')
    if (t !== 'none') setShowSourcePicker(true)
  }

  function selectDoc(doc: DocumentRead) {
    setSelectedDocId(doc.id)
    setSelectedDocLabel(`${doc.doc_number ? doc.doc_number + ' – ' : ''}${doc.title}`)
    setShowSourcePicker(false)
    setSourceSearch('')
  }

  function selectDir(dir: DirectiveRead) {
    setSelectedDirId(dir.id)
    setSelectedDirLabel(dir.title)
    setShowSourcePicker(false)
    setSourceSearch('')
  }

  function toggleCoord(deptId: number) {
    setCoordIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
    )
  }

  const filteredDocs = docs.filter((d) =>
    !sourceSearch ||
    d.title.toLowerCase().includes(sourceSearch.toLowerCase()) ||
    (d.doc_number ?? '').toLowerCase().includes(sourceSearch.toLowerCase())
  )
  const filteredDirs = directives.filter((d) =>
    !sourceSearch || d.title.toLowerCase().includes(sourceSearch.toLowerCase())
  )
  const filteredDepts = departments.filter((d) =>
    d.is_active && (
      !deptSearch ||
      d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
      (d.short_name ?? '').toLowerCase().includes(deptSearch.toLowerCase())
    )
  )

  // Manager chỉ thấy nhân sự đơn vị mình
  const myStaffDeptId = isManager
    ? staffList.find(s => s.user_id === user?.id)?.department_id
    : undefined

  const filteredStaff = staffList.filter((s) => {
    // Manager: chỉ nhân sự đơn vị mình (trừ khi họ tự chọn)
    if (isManager && myStaffDeptId && s.department_id !== myStaffDeptId) return false
    const matchDept = !staffDeptFilter || String(s.department_id) === staffDeptFilter
    const term = staffSearch.toLowerCase()
    const matchSearch = !term ||
      s.full_name.toLowerCase().includes(term) ||
      (s.position ?? '').toLowerCase().includes(term) ||
      (s.employee_code ?? '').toLowerCase().includes(term)
    return matchDept && matchSearch
  })

  const selectedStaff = assigneeStaffId
    ? staffList.find((s) => s.id === assigneeStaffId) ?? null
    : assigneeId
    ? staffList.find((s) => s.user_id === Number(assigneeId)) ?? null
    : null
  const fallbackUser = !selectedStaff && assigneeId
    ? users.find((u) => u.id === Number(assigneeId)) ?? null
    : null
  const assigneeDisplayLabel = selectedStaff
    ? `${selectedStaff.full_name}${selectedStaff.position ? ` — ${selectedStaff.position}` : ''}${selectedStaff.department?.short_name ? ` (${selectedStaff.department.short_name})` : ''}`
    : fallbackUser
    ? (fallbackUser.full_name ?? fallbackUser.username)
    : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')
    try {
      const incoming_document_id = sourceType === 'incoming' ? selectedDocId ?? undefined : task ? null : undefined
      const outgoing_document_id = sourceType === 'outgoing' ? selectedDocId ?? undefined : task ? null : undefined
      const directive_id = sourceType === 'directive' ? selectedDirId ?? undefined : task ? null : undefined

      if (task) {
        const payload: TaskUpdate = {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          is_project: isProject,
          project_type: isProject ? projectType : null,
          budget_amount: isProject && budgetAmount ? Number(budgetAmount) : null,
          due_date: dueDate ? new Date(dueDate + 'T23:59:59').toISOString() : null,
          assignee_id: assigneeId ? parseInt(assigneeId) : null,
          assignee_staff_id: assigneeStaffId,
          lead_department_id: leadDeptId,
          coordinating_department_ids: coordIds,
          incoming_document_id: incoming_document_id as number | null | undefined,
          outgoing_document_id: outgoing_document_id as number | null | undefined,
          directive_id: directive_id as number | null | undefined,
          parent_task_id: parentTaskId,
          program_id: programId,
        }
        await tasksApi.update(task.id, payload)
      } else {
        const payload: TaskCreate = {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          is_project: isProject,
          project_type: isProject ? projectType : undefined,
          budget_amount: isProject && budgetAmount ? Number(budgetAmount) : undefined,
          start_date: startDate || undefined,
          due_date: dueDate ? new Date(dueDate + 'T23:59:59').toISOString() : undefined,
          program_id: programId ?? undefined,
          parent_task_id: parentTaskId,
          assignee_id: assigneeId ? parseInt(assigneeId) : undefined,
          assignee_staff_id: assigneeStaffId ?? undefined,
          lead_department_id: leadDeptId ?? undefined,
          coordinating_department_ids: coordIds,
          incoming_document_id: sourceType === 'incoming' ? (selectedDocId ?? undefined) : undefined,
          outgoing_document_id: sourceType === 'outgoing' ? (selectedDocId ?? undefined) : undefined,
          directive_id: sourceType === 'directive' ? (selectedDirId ?? undefined) : undefined,
        }
        await tasksApi.create(payload)
      }
      onSuccess()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const currentSourceLabel =
    sourceType === 'directive'
      ? selectedDirLabel || 'Chọn chỉ đạo...'
      : sourceType !== 'none'
      ? selectedDocLabel || (sourceType === 'incoming' ? 'Chọn văn bản đến...' : 'Chọn văn bản đi...')
      : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            {task ? 'Cập nhật nhiệm vụ' : 'Tạo nhiệm vụ mới'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* ── SECTION 1: Thông tin cơ bản ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thông tin cơ bản</p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tiêu đề <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Nhập tiêu đề nhiệm vụ..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Mô tả ngắn..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Toggle is_project */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setIsProject(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isProject ? 'bg-indigo-500' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isProject ? 'translate-x-5' : ''}`} />
              </div>
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <FolderKanban size={14} className={isProject ? 'text-indigo-500' : 'text-slate-400'} />
                {isProject ? 'Đây là dự án' : 'Đánh dấu là dự án'}
              </span>
            </label>

            {/* Loại dự án + Kinh phí — chỉ hiện khi isProject=true */}
            {isProject && (
              <div className="grid grid-cols-2 gap-3 pl-1 border-l-2 border-indigo-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Loại</label>
                  <select
                    value={projectType}
                    onChange={e => setProjectType(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="project">Dự án</option>
                    <option value="plan">Đề án</option>
                    <option value="program">Kế hoạch</option>
                    <option value="digital_transform">Chuyển đổi số</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kinh phí (đồng)</label>
                  <input
                    type="number"
                    min="0"
                    value={budgetAmount}
                    onChange={e => setBudgetAmount(e.target.value)}
                    placeholder="VD: 500000000"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            )}

            {/* Parent task picker — chỉ tìm dự án (is_project=true) */}
            <div ref={parentRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <FolderKanban size={12} className="text-indigo-400" /> Thuộc dự án
              </label>
              {parentTaskId ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-blue-400 bg-blue-50 rounded-lg text-sm">
                  <span className="flex-1 truncate text-blue-800 text-xs">{parentTaskLabel || `#${parentTaskId}`}</span>
                  <button type="button" onClick={() => { setParentTaskId(null); setParentTaskLabel('') }} className="text-slate-400 hover:text-red-500">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2.5 py-2 border border-slate-300 rounded-lg">
                  <Search size={13} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Tìm nhiệm vụ cha..."
                    value={parentSearch}
                    onChange={(e) => { setParentSearch(e.target.value); setShowParentPicker(true) }}
                    onFocus={() => setShowParentPicker(true)}
                    className="flex-1 text-xs outline-none text-slate-700 bg-transparent"
                  />
                </div>
              )}
              {showParentPicker && parentTasks.length > 0 && (
                <div className="absolute z-30 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                  {parentTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setParentTaskId(t.id)
                        setParentTaskLabel(`${t.task_code ? t.task_code + ' – ' : ''}${t.title}`)
                        setParentSearch('')
                        setShowParentPicker(false)
                      }}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-blue-50 transition-colors"
                    >
                      {t.task_code && <span className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5">{t.task_code}</span>}
                      <span className="text-xs text-slate-700 line-clamp-1">{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ưu tiên</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="urgent">Khẩn</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hạn xử lý</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ── Chương trình / Nghị quyết ── */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen size={11} /> Chương trình / Nghị quyết
            </label>
            <select
              value={programId ?? ''}
              onChange={(e) => setProgramId(e.target.value ? Number(e.target.value) : null)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Không thuộc chương trình nào --</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.short_name ? `[${p.short_name}] ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* ── SECTION 2: Nguồn sinh nhiệm vụ ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nguồn sinh nhiệm vụ</p>

            {/* Source type tabs */}
            <div className="flex gap-2 flex-wrap">
              {SOURCE_TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = sourceType === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSourceTypeChange(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg transition-all ${isActive ? TAB_ACTIVE[tab.id] : TAB_IDLE}`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Source picker */}
            {sourceType !== 'none' && (
              <div ref={sourceRef} className="relative">
                {/* Selected chip or picker trigger */}
                <button
                  type="button"
                  onClick={() => setShowSourcePicker((v) => !v)}
                  className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm transition-colors ${
                    (sourceType === 'directive' ? selectedDirId : selectedDocId)
                      ? 'border-blue-400 bg-blue-50 text-blue-800'
                      : 'border-slate-300 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <span className="truncate text-left">
                    {currentSourceLabel}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-slate-400" />
                </button>

                {/* Dropdown */}
                {showSourcePicker && (
                  <div className="absolute z-30 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded-lg">
                        <Search size={13} className="text-slate-400 shrink-0" />
                        <input
                          autoFocus
                          type="text"
                          placeholder={sourceType === 'directive' ? 'Tìm chỉ đạo...' : 'Tìm văn bản...'}
                          value={sourceSearch}
                          onChange={(e) => setSourceSearch(e.target.value)}
                          className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                        />
                      </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {loadingSrc && (
                        <p className="text-xs text-slate-400 text-center py-4">Đang tải...</p>
                      )}
                      {!loadingSrc && sourceType !== 'directive' && filteredDocs.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">Không có văn bản</p>
                      )}
                      {!loadingSrc && sourceType === 'directive' && filteredDirs.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">Không có chỉ đạo</p>
                      )}

                      {sourceType !== 'directive' && filteredDocs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => selectDoc(doc)}
                          className={`w-full flex items-start gap-2 px-4 py-2.5 text-left hover:bg-blue-50 transition-colors ${
                            selectedDocId === doc.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <FileText size={13} className="text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            {doc.doc_number && (
                              <span className="text-xs font-mono text-slate-400 mr-1">{doc.doc_number}</span>
                            )}
                            <span className="text-sm text-slate-700 line-clamp-1">{doc.title}</span>
                          </div>
                          {selectedDocId === doc.id && <Check size={13} className="text-blue-600 shrink-0 mt-0.5" />}
                        </button>
                      ))}

                      {sourceType === 'directive' && filteredDirs.map((dir) => (
                        <button
                          key={dir.id}
                          type="button"
                          onClick={() => selectDir(dir)}
                          className={`w-full flex items-start gap-2 px-4 py-2.5 text-left hover:bg-purple-50 transition-colors ${
                            selectedDirId === dir.id ? 'bg-purple-50' : ''
                          }`}
                        >
                          <ClipboardList size={13} className="text-purple-400 shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-700 line-clamp-2">{dir.title}</span>
                          {selectedDirId === dir.id && <Check size={13} className="text-purple-600 shrink-0 mt-0.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 3: Phân công & Đơn vị ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Phân công & Đơn vị</p>

            <div className="grid grid-cols-2 gap-3">
              {/* Assignee — searchable staff picker */}
              <div ref={assigneeRef} className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <UserIcon size={12} className="text-blue-500" /> Người thực hiện
                </label>
                <button
                  type="button"
                  onClick={() => setShowAssigneePicker((v) => !v)}
                  className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm transition-colors ${
                    assigneeStaffId || assigneeId
                      ? 'border-blue-400 bg-blue-50 text-blue-800'
                      : 'border-slate-300 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <span className="truncate text-left text-xs">
                    {assigneeDisplayLabel ?? '-- Chưa phân công --'}
                  </span>
                  <ChevronDown size={13} className="shrink-0 text-slate-400" />
                </button>

                {showAssigneePicker && (
                  <div className="absolute z-40 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {/* Search + dept filter */}
                    <div className="p-2 border-b border-slate-100 space-y-1.5">
                      <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded-lg">
                        <Search size={12} className="text-slate-400 shrink-0" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Tìm nhân sự..."
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                          className="flex-1 bg-transparent text-xs outline-none text-slate-700"
                        />
                      </div>
                      <select
                        value={staffDeptFilter}
                        onChange={(e) => setStaffDeptFilter(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                      >
                        <option value="">-- Tất cả đơn vị --</option>
                        {departments.filter((d) => d.is_active).map((d) => (
                          <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {/* Clear option */}
                      <button
                        type="button"
                        onClick={() => { setAssigneeId(''); setAssigneeStaffId(null); setShowAssigneePicker(false) }}
                        className="w-full px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100"
                      >
                        -- Chưa phân công --
                      </button>
                      {filteredStaff.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">Không tìm thấy nhân sự</p>
                      )}
                      {filteredStaff.map((s) => {
                        const isSelected = s.id === assigneeStaffId
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setAssigneeStaffId(s.id)
                              setAssigneeId('')
                              setShowAssigneePicker(false)
                              setStaffSearch('')
                            }}
                            className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors ${
                              isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                {s.full_name}
                                {s.employee_code && <span className="text-slate-400 font-normal ml-1">({s.employee_code})</span>}
                              </p>
                              {(s.position || s.department) && (
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {[s.position, s.department?.short_name ?? s.department?.name].filter(Boolean).join(' · ')}
                                </p>
                              )}
                              {!s.user_id && <p className="text-[10px] text-amber-500">Không có tài khoản hệ thống</p>}
                            </div>
                            {isSelected && <Check size={12} className="text-blue-600 shrink-0 mt-0.5" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Lead department */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Building2 size={12} className="text-blue-500" /> Đơn vị chủ trì
                </label>
                <select
                  value={leadDeptId ?? ''}
                  onChange={(e) => setLeadDeptId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Chưa xác định --</option>
                  {departments.filter((d) => d.is_active).map((d) => (
                    <option key={d.id} value={d.id}>{d.short_name || d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Coordinating departments */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                <Building2 size={12} className="text-slate-400" />
                Đơn vị phối hợp
                {coordIds.length > 0 && (
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Đã chọn {coordIds.length}
                  </span>
                )}
              </label>

              {/* Search */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 mb-2">
                <Search size={12} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Lọc đơn vị..."
                  value={deptSearch}
                  onChange={(e) => setDeptSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs outline-none text-slate-600"
                />
              </div>

              {/* Checkbox grid */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {filteredDepts.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">Không tìm thấy đơn vị</p>
                )}
                <div className="grid grid-cols-2">
                  {filteredDepts.map((dept, i) => {
                    const isLead = dept.id === leadDeptId
                    const isChecked = coordIds.includes(dept.id)
                    return (
                      <label
                        key={dept.id}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors select-none text-xs ${
                          i % 2 === 0 ? 'border-r border-slate-100' : ''
                        } ${isLead ? 'opacity-40 cursor-not-allowed bg-slate-50' : isChecked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        title={isLead ? 'Đã là đơn vị chủ trì' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isLead}
                          onChange={() => !isLead && toggleCoord(dept.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-400 shrink-0"
                        />
                        <span className={`truncate ${isChecked ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>
                          {dept.short_name || dept.name}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Selected chips */}
              {coordIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {coordIds.map((id) => {
                    const d = departments.find((dep) => dep.id === id)
                    if (!d) return null
                    return (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {d.short_name || d.name}
                        <button type="button" onClick={() => toggleCoord(id)} className="hover:text-red-500 ml-0.5">
                          <X size={10} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 font-medium"
            >
              {loading ? 'Đang lưu...' : task ? 'Cập nhật' : 'Tạo nhiệm vụ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
