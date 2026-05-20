import { useEffect, useRef, useState } from 'react'
import { syncApi } from '../../api/gsheet'
import type {
  ConflictResolution,
  EntityType,
  FieldMapping,
  SyncConfigCreate,
  SyncConfigRead,
  SyncConfigUpdate,
  SyncConflictRead,
  SyncDirection,
  SyncLogRead,
  SyncStats,
} from '../../types/gsheet'
import {
  CONFLICT_LABELS,
  DIRECTION_LABELS,
  ENTITY_LABELS,
} from '../../types/gsheet'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    running: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
  }
  const label: Record<string, string> = {
    running: 'Đang chạy', done: 'Hoàn thành', failed: 'Lỗi', partial: 'Một phần',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] ?? 'bg-slate-100 text-slate-600'}`}>
      {label[s] ?? s}
    </span>
  )
}

function conflictBadge(r: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    ioc_wins: 'bg-blue-100 text-blue-700',
    sheet_wins: 'bg-purple-100 text-purple-700',
    manual: 'bg-slate-100 text-slate-600',
  }
  const label: Record<string, string> = {
    pending: 'Chờ xử lý', ioc_wins: 'IOC thắng', sheet_wins: 'Sheet thắng', manual: 'Thủ công',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[r] ?? 'bg-slate-100'}`}>
      {label[r] ?? r}
    </span>
  )
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'nq57',       label: 'NQ57 Nhiệm vụ' },
  { value: 'task',       label: 'Nhiệm vụ' },
  { value: 'kpi',        label: 'KPI' },
]

const TRANSFORMS = ['', 'date', 'int', 'float', 'bool', 'status_nq57', 'status_task', 'status_kpi']

// ── Field Mapping Editor ──────────────────────────────────────────────────────

function MappingEditor({
  mappings, onChange,
}: {
  mappings: FieldMapping[]
  onChange: (m: FieldMapping[]) => void
}) {
  function update(i: number, key: keyof FieldMapping, val: string) {
    const copy = mappings.map((m, idx) => idx === i ? { ...m, [key]: val || null } : m)
    onChange(copy)
  }
  function add() {
    onChange([...mappings, { ioc_field: '', sheet_col: '', transform: null }])
  }
  function remove(i: number) {
    onChange(mappings.filter((_, idx) => idx !== i))
  }

  return (
    <div className="mt-1">
      <div className="grid grid-cols-[1fr_80px_120px_32px] gap-1 text-xs font-semibold text-slate-500 mb-1 px-1">
        <span>Trường IOC</span><span>Cột Sheet</span><span>Transform</span><span />
      </div>
      {mappings.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_120px_32px] gap-1 mb-1">
          <input
            className="border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={m.ioc_field}
            placeholder="vd: title"
            onChange={e => update(i, 'ioc_field', e.target.value)}
          />
          <input
            className="border border-slate-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={m.sheet_col}
            placeholder="B"
            onChange={e => update(i, 'sheet_col', e.target.value.toUpperCase())}
          />
          <select
            className="border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={m.transform ?? ''}
            onChange={e => update(i, 'transform', e.target.value)}
          >
            {TRANSFORMS.map(t => <option key={t} value={t}>{t || '— không —'}</option>)}
          </select>
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-sm font-bold">✕</button>
        </div>
      ))}
      <button
        onClick={add}
        className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        + Thêm dòng
      </button>
    </div>
  )
}

// ── Config Modal ──────────────────────────────────────────────────────────────

function ConfigModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: SyncConfigRead
  onSave: () => void
  onClose: () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<Partial<SyncConfigCreate & SyncConfigUpdate>>({
    name: initial?.name ?? '',
    entity_type: initial?.entity_type ?? 'nq57',
    sheet_id: initial?.sheet_id ?? '',
    sheet_tab: initial?.sheet_tab ?? 'Sheet1',
    data_range: initial?.data_range ?? 'A2:Z1000',
    credentials_json: '',
    key_field: initial?.key_field ?? 'code',
    key_col: initial?.key_col ?? 'B',
    sync_direction: initial?.sync_direction ?? 'bidirectional',
    conflict_resolution: initial?.conflict_resolution ?? 'latest_wins',
    auto_sync_minutes: initial?.auto_sync_minutes ?? 0,
  })
  const [mappings, setMappings] = useState<FieldMapping[]>(initial?.field_mappings ?? [])
  const [loadingDef, setLoadingDef] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [showMapping, setShowMapping] = useState(false)

  async function loadDefaults() {
    if (!form.entity_type) return
    setLoadingDef(true)
    try {
      const res = await syncApi.getDefaultMappings(form.entity_type as string)
      setMappings(res.data as FieldMapping[])
    } finally { setLoadingDef(false) }
  }

  async function handleSave() {
    if (!form.name?.trim()) { setErr('Tên cấu hình không được để trống'); return }
    setSaving(true)
    setErr('')
    try {
      const payload = { ...form, field_mappings: mappings }
      if (!payload.credentials_json) delete payload.credentials_json
      if (isEdit) {
        await syncApi.updateConfig(initial!.id, payload as SyncConfigUpdate)
      } else {
        await syncApi.createConfig(payload as SyncConfigCreate)
      }
      onSave()
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Lỗi khi lưu')
    } finally { setSaving(false) }
  }

  function extractSheetId(input: string) {
    const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : input
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? 'Cập nhật cấu hình đồng bộ' : 'Tạo cấu hình đồng bộ mới'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {err && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{err}</div>}

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tên cấu hình *</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.name ?? ''}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="vd: Đồng bộ NQ57 từ Sheet cũ"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Loại dữ liệu *</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.entity_type ?? 'nq57'}
                onChange={e => setForm(f => ({ ...f, entity_type: e.target.value as EntityType }))}
              >
                {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Chiều đồng bộ</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.sync_direction ?? 'bidirectional'}
                onChange={e => setForm(f => ({ ...f, sync_direction: e.target.value as SyncDirection }))}
              >
                {Object.entries(DIRECTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Sheet config */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Google Sheet</p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Sheet URL hoặc Sheet ID
              </label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.sheet_id ?? ''}
                onChange={e => setForm(f => ({ ...f, sheet_id: extractSheetId(e.target.value) }))}
                placeholder="Dán URL Google Sheet hoặc nhập Sheet ID"
              />
              <p className="text-xs text-slate-400 mt-1">
                ID sẽ được tự động trích xuất từ URL nếu bạn dán link đầy đủ.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tên tab (sheet)</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.sheet_tab ?? 'Sheet1'}
                  onChange={e => setForm(f => ({ ...f, sheet_tab: e.target.value }))}
                  placeholder="Sheet1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Phạm vi dữ liệu</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.data_range ?? 'A2:Z1000'}
                  onChange={e => setForm(f => ({ ...f, data_range: e.target.value }))}
                  placeholder="A2:Z1000"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Service Account JSON {isEdit && initial?.has_credentials && <span className="text-green-600 font-normal">(đã có, để trống nếu không đổi)</span>}
              </label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                rows={4}
                value={form.credentials_json ?? ''}
                onChange={e => setForm(f => ({ ...f, credentials_json: e.target.value }))}
                placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"...",...}'
              />
              <p className="text-xs text-slate-400 mt-1">
                Lấy từ Google Cloud Console → IAM → Service Accounts → Keys. Chia sẻ Sheet với email của service account.
              </p>
            </div>
          </div>

          {/* Dedup key */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Trường dedup (IOC)</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.key_field ?? 'code'}
                onChange={e => setForm(f => ({ ...f, key_field: e.target.value }))}
                placeholder="code"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cột dedup (Sheet)</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.key_col ?? 'B'}
                onChange={e => setForm(f => ({ ...f, key_col: e.target.value.toUpperCase() }))}
                placeholder="B"
              />
            </div>
          </div>

          {/* Conflict + interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Xử lý xung đột</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.conflict_resolution ?? 'latest_wins'}
                onChange={e => setForm(f => ({ ...f, conflict_resolution: e.target.value as ConflictResolution }))}
              >
                {Object.entries(CONFLICT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tự động sync (phút, 0=tắt)</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.auto_sync_minutes ?? 0}
                onChange={e => setForm(f => ({ ...f, auto_sync_minutes: Number(e.target.value) }))}
              >
                <option value={0}>Tắt</option>
                <option value={15}>15 phút</option>
                <option value={30}>30 phút</option>
                <option value={60}>60 phút</option>
                <option value={360}>6 giờ</option>
                <option value={1440}>Hàng ngày</option>
              </select>
            </div>
          </div>

          {/* Field mapping */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowMapping(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-700"
            >
              <span>⚙️ Cấu hình Field Mapping ({mappings.length} dòng)</span>
              <span>{showMapping ? '▲' : '▼'}</span>
            </button>
            {showMapping && (
              <div className="p-4">
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={loadDefaults}
                    disabled={loadingDef}
                    className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium"
                  >
                    {loadingDef ? 'Đang tải...' : '↺ Tải mapping mặc định'}
                  </button>
                </div>
                <MappingEditor mappings={mappings} onChange={setMappings} />
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium">
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo cấu hình'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Webhook Instructions Modal ────────────────────────────────────────────────

function WebhookModal({ config, onClose }: { config: SyncConfigRead; onClose: () => void }) {
  const url = `${window.location.origin.replace('3000', '8000')}/api/v1/sync/webhook/${config.webhook_token}`
  const gsCode = `// Google Apps Script — gọi khi dữ liệu thay đổi
function syncToIOC() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("${config.sheet_tab}");
  var data = sheet.getDataRange().getValues();
  var cols = ["A","B","C","D","E","F","G","H","I","J"];
  var rows = data.slice(1).map(function(row) { // bỏ dòng header
    var obj = {};
    cols.forEach(function(c, i) { obj[c] = String(row[i] || ""); });
    return obj;
  });
  UrlFetchApp.fetch("${url}", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ action: "upsert", data: rows }),
    muteHttpExceptions: true
  });
}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">📡 Webhook — Apps Script</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Webhook URL</label>
            <div className="flex gap-2">
              <input readOnly value={url} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono bg-slate-50" />
              <button
                onClick={() => navigator.clipboard.writeText(url)}
                className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Mã Apps Script mẫu</label>
            <pre className="bg-slate-900 text-green-400 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap">
              {gsCode}
            </pre>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 space-y-1">
            <p className="font-semibold">Hướng dẫn cài Apps Script:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Mở Google Sheet → Extensions → Apps Script</li>
              <li>Paste đoạn code trên vào editor</li>
              <li>Tạo Trigger: Run → syncToIOC → on edit / on change</li>
              <li>Khi dữ liệu thay đổi, IOC sẽ nhận ngay</li>
            </ol>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SyncCenterPage() {
  const [tab, setTab] = useState<'configs' | 'logs' | 'conflicts'>('configs')
  const [configs, setConfigs] = useState<SyncConfigRead[]>([])
  const [logs, setLogs] = useState<SyncLogRead[]>([])
  const [conflicts, setConflicts] = useState<SyncConflictRead[]>([])
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [loading, setLoading] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [editConfig, setEditConfig] = useState<SyncConfigRead | null>(null)
  const [webhookConfig, setWebhookConfig] = useState<SyncConfigRead | null>(null)
  const [syncing, setSyncing] = useState<number | null>(null)
  const [testing, setTesting] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [c, l, con, s] = await Promise.all([
        syncApi.listConfigs(),
        syncApi.getAllLogs(),
        syncApi.getConflicts('pending'),
        syncApi.getStats(),
      ])
      setConfigs(c.data)
      setLogs(l.data)
      setConflicts(con.data)
      setStats(s.data)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    loadAll()
    pollRef.current = setInterval(loadAll, 10000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function handleTrigger(config: SyncConfigRead) {
    setSyncing(config.id)
    try {
      await syncApi.triggerSync(config.id, config.sync_direction)
      await loadAll()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Lỗi đồng bộ')
    } finally { setSyncing(null) }
  }

  async function handleTest(config: SyncConfigRead) {
    setTesting(config.id)
    setTestResult(null)
    try {
      const res = await syncApi.testConnection(config.id)
      setTestResult({
        id: config.id,
        ok: res.data.ok,
        msg: res.data.ok
          ? `✅ Kết nối thành công: "${res.data.title}" — ${res.data.tabs?.join(', ')}`
          : `❌ ${res.data.error}`,
      })
    } finally { setTesting(null) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Xóa cấu hình đồng bộ này?')) return
    await syncApi.deleteConfig(id)
    await loadAll()
  }

  async function handleResolve(id: number, resolution: 'ioc_wins' | 'sheet_wins') {
    await syncApi.resolveConflict(id, resolution)
    setConflicts(c => c.filter(x => x.id !== id))
    setStats(s => s ? { ...s, pending_conflicts: s.pending_conflicts - 1 } : s)
  }

  const TABS = [
    { key: 'configs', label: `⚙️ Cấu hình (${configs.length})` },
    { key: 'logs',    label: `📋 Lịch sử (${logs.length})` },
    { key: 'conflicts', label: `⚡ Xung đột${(stats?.pending_conflicts ?? 0) > 0 ? ` (${stats!.pending_conflicts})` : ''}` },
  ] as const

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Đồng bộ Google Sheet & Apps Script</h1>
          <p className="text-slate-500 text-sm mt-1">Quản lý đồng bộ 2 chiều giữa IOC và Google Sheet / Apps Script</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow"
        >
          + Thêm cấu hình
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Tổng cấu hình',   value: stats.configs_total,    color: 'blue' },
            { label: 'Đang hoạt động',  value: stats.configs_active,   color: 'green' },
            { label: 'Lần đồng bộ',     value: stats.logs_total,       color: 'slate' },
            { label: 'Xung đột chờ',    value: stats.pending_conflicts, color: stats.pending_conflicts > 0 ? 'amber' : 'slate' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${
                s.color === 'blue' ? 'text-blue-600' :
                s.color === 'green' ? 'text-green-600' :
                s.color === 'amber' ? 'text-amber-600' : 'text-slate-700'
              }`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-100 px-4 pt-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg mr-1 transition-colors ${
                tab === t.key
                  ? 'bg-blue-600/10 text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Configs tab ── */}
        {tab === 'configs' && (
          <div className="divide-y divide-slate-50">
            {loading && configs.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">Đang tải...</div>
            )}
            {configs.length === 0 && !loading && (
              <div className="p-10 text-center">
                <p className="text-4xl mb-3">🔗</p>
                <p className="text-slate-500 font-medium">Chưa có cấu hình đồng bộ nào</p>
                <p className="text-slate-400 text-sm mt-1">Tạo cấu hình để kết nối Google Sheet với IOC</p>
              </div>
            )}
            {configs.map(config => (
              <div key={config.id} className="p-5">
                {testResult?.id === config.id && (
                  <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testResult.msg}
                  </div>
                )}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
                      <h3 className="font-semibold text-slate-800 truncate">{config.name}</h3>
                      <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                        {ENTITY_LABELS[config.entity_type] ?? config.entity_type}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full font-medium">
                        {DIRECTION_LABELS[config.sync_direction]}
                      </span>
                      {!config.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full">Tắt</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                      {config.sheet_id && (
                        <span>📊 Sheet: <code className="font-mono">{config.sheet_id.slice(0, 20)}…</code></span>
                      )}
                      <span>Tab: {config.sheet_tab}</span>
                      {config.auto_sync_minutes > 0 && (
                        <span>⏱ {config.auto_sync_minutes} phút / lần</span>
                      )}
                      {config.has_credentials
                        ? <span className="text-green-600">🔑 Đã có credentials</span>
                        : <span className="text-amber-500">⚠️ Chưa có credentials</span>
                      }
                      <span>Đồng bộ cuối: {fmtDt(config.last_sync_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => handleTest(config)}
                      disabled={testing === config.id}
                      className="px-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg font-medium border border-slate-200 disabled:opacity-60"
                    >
                      {testing === config.id ? '...' : '🔌 Test'}
                    </button>
                    <button
                      onClick={() => setWebhookConfig(config)}
                      className="px-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg font-medium border border-slate-200"
                    >
                      📡 Webhook
                    </button>
                    <button
                      onClick={() => handleTrigger(config)}
                      disabled={syncing === config.id || !config.is_active}
                      className="px-3 py-1.5 text-xs bg-green-50 hover:bg-green-100 text-green-700 rounded-lg font-semibold border border-green-200 disabled:opacity-60"
                    >
                      {syncing === config.id ? '⏳ Đang sync...' : '▶ Sync ngay'}
                    </button>
                    <button
                      onClick={() => setEditConfig(config)}
                      className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg font-medium border border-blue-200"
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium border border-red-200"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Logs tab ── */}
        {tab === 'logs' && (
          <div className="overflow-x-auto">
            {logs.length === 0 ? (
              <div className="p-10 text-center text-slate-400">Chưa có lịch sử đồng bộ</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Cấu hình</th>
                    <th className="px-4 py-3 text-left">Chiều</th>
                    <th className="px-4 py-3 text-left">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Đọc</th>
                    <th className="px-4 py-3 text-right">Tạo</th>
                    <th className="px-4 py-3 text-right">Cập nhật</th>
                    <th className="px-4 py-3 text-right">Bỏ qua</th>
                    <th className="px-4 py-3 text-right">Lỗi</th>
                    <th className="px-4 py-3 text-left">Kích hoạt</th>
                    <th className="px-4 py-3 text-left">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map(log => {
                    const cfg = configs.find(c => c.id === log.config_id)
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{cfg?.name ?? `#${log.config_id}`}</td>
                        <td className="px-4 py-3 text-slate-500">{log.direction}</td>
                        <td className="px-4 py-3">{statusBadge(log.status)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{log.records_read}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">{log.records_created}</td>
                        <td className="px-4 py-3 text-right text-blue-600 font-medium">{log.records_updated}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{log.records_skipped}</td>
                        <td className="px-4 py-3 text-right text-red-500 font-medium">{log.records_failed}</td>
                        <td className="px-4 py-3 text-slate-500">{log.triggered_by}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDt(log.started_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Conflicts tab ── */}
        {tab === 'conflicts' && (
          <div>
            {conflicts.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-slate-500">Không có xung đột nào cần xử lý</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">Entity</th>
                      <th className="px-4 py-3 text-left">Trường</th>
                      <th className="px-4 py-3 text-left">Giá trị IOC</th>
                      <th className="px-4 py-3 text-left">Giá trị Sheet</th>
                      <th className="px-4 py-3 text-left">Trạng thái</th>
                      <th className="px-4 py-3 text-left">Thời gian</th>
                      <th className="px-4 py-3 text-left">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {conflicts.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-700">{ENTITY_LABELS[c.entity_type] ?? c.entity_type}</span>
                          {c.entity_id && <span className="text-slate-400 text-xs ml-1">#{c.entity_id}</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.field_name}</td>
                        <td className="px-4 py-3 max-w-[150px] truncate text-blue-700 bg-blue-50 rounded px-2">{c.ioc_value ?? '—'}</td>
                        <td className="px-4 py-3 max-w-[150px] truncate text-purple-700 bg-purple-50 rounded px-2">{c.sheet_value ?? '—'}</td>
                        <td className="px-4 py-3">{conflictBadge(c.resolution)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDt(c.created_at)}</td>
                        <td className="px-4 py-3">
                          {c.resolution === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolve(c.id, 'ioc_wins')}
                                className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded font-medium"
                              >
                                IOC thắng
                              </button>
                              <button
                                onClick={() => handleResolve(c.id, 'sheet_wins')}
                                className="px-2 py-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-600 rounded font-medium"
                              >
                                Sheet thắng
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <ConfigModal
          onSave={() => { setShowCreate(false); loadAll() }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editConfig && (
        <ConfigModal
          initial={editConfig}
          onSave={() => { setEditConfig(null); loadAll() }}
          onClose={() => setEditConfig(null)}
        />
      )}
      {webhookConfig && (
        <WebhookModal config={webhookConfig} onClose={() => setWebhookConfig(null)} />
      )}
    </div>
  )
}
