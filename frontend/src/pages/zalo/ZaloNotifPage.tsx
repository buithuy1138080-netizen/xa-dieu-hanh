import { useEffect, useRef, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { zaloApi } from '../../api/zalo'
import type {
  ZaloChannel,
  ZaloConfigRead,
  ZaloConfigUpsert,
  ZaloLogRead,
  ZaloSendRequest,
  ZaloStats,
  ZaloTemplateCreate,
  ZaloTemplateRead,
  ZaloUserLinkRead,
} from '../../types/zalo'
import { NOTIF_TYPE_LABELS, STATUS_LABELS } from '../../types/zalo'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    sent: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    delivered: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] ?? 'bg-slate-100 text-slate-500'}`}>
      {STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s}
    </span>
  )
}

// ── Config Tab ────────────────────────────────────────────────────────────────

function ConfigTab() {
  const [config, setConfig] = useState<ZaloConfigRead | null>(null)
  const [form, setForm] = useState<ZaloConfigUpsert>({
    app_id: '', app_secret: '', oa_id: '', access_token: '', refresh_token: '', is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    zaloApi.getConfig().then(r => {
      if (r.data) {
        setConfig(r.data)
        setForm(f => ({ ...f, app_id: r.data!.app_id, oa_id: r.data!.oa_id }))
      }
    })
  }, [])

  async function save() {
    setSaving(true); setMsg('')
    try {
      const r = await zaloApi.upsertConfig(form)
      setConfig(r.data); setMsg('✅ Đã lưu cấu hình Zalo')
    } catch { setMsg('❌ Lỗi khi lưu') } finally { setSaving(false) }
  }

  async function doRefresh() {
    setRefreshing(true); setMsg('')
    try {
      const r = await zaloApi.refreshToken()
      setConfig(r.data); setMsg('✅ Làm mới token thành công')
    } catch (e: any) {
      setMsg(`❌ ${e?.response?.data?.detail ?? 'Lỗi làm mới token'}`)
    } finally { setRefreshing(false) }
  }

  function inp(key: keyof ZaloConfigUpsert) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  return (
    <div className="max-w-2xl space-y-5">
      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msg}
        </div>
      )}

      {/* Status */}
      {config && (
        <div className="bg-slate-50 rounded-xl p-4 flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-slate-500">App ID: </span>
            <code className="font-mono text-slate-800">{config.app_id || '—'}</code>
          </div>
          <div>
            <span className="text-slate-500">OA ID: </span>
            <code className="font-mono text-slate-800">{config.oa_id || '—'}</code>
          </div>
          <div>
            <span className="text-slate-500">Access token: </span>
            <span className={config.has_access_token ? 'text-green-600 font-semibold' : 'text-red-500'}>
              {config.has_access_token ? '✅ Có' : '❌ Chưa có'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Token hết hạn: </span>
            <span className={config.token_expiry ? 'text-slate-700' : 'text-slate-400'}>
              {fmtDt(config.token_expiry)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Trạng thái: </span>
            <span className={config.is_active ? 'text-green-600 font-semibold' : 'text-slate-400'}>
              {config.is_active ? 'Hoạt động' : 'Tắt'}
            </span>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-700">Thông tin Zalo OA</h3>
        {[
          { key: 'app_id', label: 'App ID', placeholder: 'Lấy từ Zalo Developer Console' },
          { key: 'app_secret', label: 'App Secret', placeholder: '••••••••' },
          { key: 'oa_id', label: 'OA ID (Official Account)', placeholder: 'ID trang OA của bạn' },
          { key: 'access_token', label: 'Access Token (tùy chọn)', placeholder: 'Để trống nếu dùng refresh token' },
          { key: 'refresh_token', label: 'Refresh Token', placeholder: 'Lấy từ bước OAuth2' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
            <input
              type={f.key.includes('secret') || f.key.includes('token') ? 'password' : 'text'}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={(form[f.key as keyof ZaloConfigUpsert] ?? '') as string}
              placeholder={f.placeholder}
              onChange={inp(f.key as keyof ZaloConfigUpsert)}
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active ?? true}
            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            className="rounded"
          />
          <label htmlFor="is_active" className="text-sm text-slate-600">Bật Zalo notification</label>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : '💾 Lưu cấu hình'}
          </button>
          <button
            onClick={doRefresh}
            disabled={refreshing}
            className="px-5 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold rounded-lg border border-green-200 disabled:opacity-60"
          >
            {refreshing ? '...' : '🔄 Làm mới token'}
          </button>
        </div>
      </div>

      {/* Setup guide */}
      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Hướng dẫn cài đặt Zalo OA:</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-blue-700">
          <li>Đăng ký Zalo Official Account tại oa.zalo.me</li>
          <li>Tạo ứng dụng tại developers.zalo.me → lấy App ID + App Secret</li>
          <li>Thực hiện OAuth2 Authorization Code Flow để lấy access_token + refresh_token</li>
          <li>Nhập thông tin trên và nhấn "Lưu cấu hình"</li>
          <li>Chia sẻ trang OA để người dùng follow → mới nhận được tin nhắn</li>
          <li>Bật "Liên kết người dùng" để map số điện thoại nhân viên với Zalo</li>
        </ol>
      </div>
    </div>
  )
}

// ── Templates Tab ─────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<ZaloTemplateRead[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editTmpl, setEditTmpl] = useState<ZaloTemplateRead | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState('')

  async function load() {
    const r = await zaloApi.listTemplates()
    setTemplates(r.data)
  }
  useEffect(() => { load() }, [])

  async function doSeed() {
    setSeeding(true); setSeedMsg('')
    try {
      const r = await zaloApi.seedDefaults()
      setSeedMsg(`✅ ${r.data.message}`)
      await load()
    } catch { setSeedMsg('❌ Lỗi khi tạo mẫu mặc định') } finally { setSeeding(false) }
  }

  async function doDelete(id: number) {
    if (!confirm('Xóa mẫu tin nhắn này?')) return
    await zaloApi.deleteTemplate(id)
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            + Tạo mẫu mới
          </button>
          <button
            onClick={doSeed}
            disabled={seeding}
            className="px-4 py-2 text-sm bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium rounded-lg border border-slate-200"
          >
            {seeding ? '...' : '↺ Tạo mẫu mặc định'}
          </button>
        </div>
        {seedMsg && <span className="text-sm text-green-600">{seedMsg}</span>}
      </div>

      <div className="grid gap-3">
        {templates.map(t => (
          <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">{t.name}</span>
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                    {NOTIF_TYPE_LABELS[t.notif_type] ?? t.notif_type}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full">
                    {t.channel === 'oa_message' ? '💬 OA Message' : '📱 ZNS'}
                  </span>
                  {!t.is_active && <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-400 rounded-full">Tắt</span>}
                  {t.is_default && <span className="px-2 py-0.5 text-xs bg-green-50 text-green-600 rounded-full">Mặc định</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">{t.subject}</p>
                <p className="text-sm text-slate-600 mt-1 font-mono bg-slate-50 px-2 py-1 rounded text-xs truncate">
                  {t.content}
                </p>
                {t.variables && t.variables.length > 0 && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {t.variables.map(v => (
                      <code key={v} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{`{${v}}`}</code>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setEditTmpl(t)}
                  className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg border border-blue-200"
                >
                  ✏️ Sửa
                </button>
                {!t.is_default && (
                  <button
                    onClick={() => doDelete(t.id)}
                    className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-500 rounded-lg border border-red-200"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <p className="text-3xl mb-2">📝</p>
            <p>Chưa có mẫu tin nhắn. Nhấn "Tạo mẫu mặc định" để bắt đầu.</p>
          </div>
        )}
      </div>

      {(showCreate || editTmpl) && (
        <TemplateModal
          initial={editTmpl ?? undefined}
          onSave={() => { setShowCreate(false); setEditTmpl(null); load() }}
          onClose={() => { setShowCreate(false); setEditTmpl(null) }}
        />
      )}
    </div>
  )
}

function TemplateModal({ initial, onSave, onClose }: {
  initial?: ZaloTemplateRead; onSave: () => void; onClose: () => void
}) {
  const isEdit = !!initial
  const [form, setForm] = useState<ZaloTemplateCreate>({
    name: initial?.name ?? '',
    notif_type: initial?.notif_type ?? 'task_overdue',
    channel: initial?.channel ?? 'oa_message',
    subject: initial?.subject ?? '',
    content: initial?.content ?? '',
    variables: initial?.variables ?? [],
    zns_template_id: initial?.zns_template_id ?? '',
    is_active: initial?.is_active ?? true,
  })
  const [varsStr, setVarsStr] = useState((initial?.variables ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.name || !form.subject || !form.content) { setErr('Điền đầy đủ tên, tiêu đề và nội dung'); return }
    setSaving(true); setErr('')
    const vars = varsStr.split(',').map(v => v.trim()).filter(Boolean)
    try {
      if (isEdit) {
        await zaloApi.updateTemplate(initial!.id, { ...form, variables: vars })
      } else {
        await zaloApi.createTemplate({ ...form, variables: vars })
      }
      onSave()
    } catch { setErr('Lỗi khi lưu') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{isEdit ? 'Sửa mẫu tin nhắn' : 'Tạo mẫu mới'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {err && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tên mẫu *</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Loại thông báo</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.notif_type} onChange={e => setForm(f => ({ ...f, notif_type: e.target.value }))}>
                {Object.entries(NOTIF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Kênh gửi</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value as ZaloChannel }))}>
                <option value="oa_message">💬 OA Message</option>
                <option value="zns">📱 ZNS</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tiêu đề *</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Nội dung * <span className="font-normal text-slate-400">(dùng {'{tên_biến}'} để chèn dữ liệu)</span>
            </label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={4} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Các biến <span className="font-normal text-slate-400">(phân cách bằng dấu phẩy, vd: task_title, due_date)</span>
            </label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={varsStr} onChange={e => setVarsStr(e.target.value)}
              placeholder="task_title, due_date, days_left" />
          </div>
          {form.channel === 'zns' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">ZNS Template ID (Zalo cấp)</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.zns_template_id ?? ''} onChange={e => setForm(f => ({ ...f, zns_template_id: e.target.value }))} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tmpl_active" checked={form.is_active ?? true}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
            <label htmlFor="tmpl_active" className="text-sm text-slate-600">Kích hoạt mẫu này</label>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 font-medium">Hủy</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-60">
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo mẫu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── User Links Tab ────────────────────────────────────────────────────────────

function UserLinksTab() {
  const [links, setLinks] = useState<ZaloUserLinkRead[]>([])
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [editLink, setEditLink] = useState<{ userId: number; phone: string; zaloUid: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const r = await zaloApi.listUserLinks(); setLinks(r.data)
  }
  useEffect(() => { load() }, [])

  async function doImport() {
    setImporting(true); setImportMsg('')
    try {
      const r = await zaloApi.importFromStaff()
      setImportMsg(`✅ Đã nhập ${r.data.imported} liên kết từ ${r.data.total_staff} nhân sự`)
      await load()
    } catch { setImportMsg('❌ Lỗi khi nhập') } finally { setImporting(false) }
  }

  async function saveEdit() {
    if (!editLink) return
    setSaving(true)
    try {
      await zaloApi.upsertUserLink({ user_id: editLink.userId, zalo_phone: editLink.phone || undefined, zalo_user_id: editLink.zaloUid || undefined })
      setEditLink(null); await load()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">Liên kết tài khoản IOC với số Zalo để nhận thông báo.</p>
        <div className="flex gap-3">
          <button onClick={doImport} disabled={importing}
            className="px-4 py-2 text-sm bg-green-50 hover:bg-green-100 text-green-700 font-semibold rounded-lg border border-green-200 disabled:opacity-60">
            {importing ? '...' : '📥 Nhập từ nhân sự'}
          </button>
        </div>
      </div>
      {importMsg && <div className="text-sm px-3 py-2 rounded-lg bg-green-50 text-green-700">{importMsg}</div>}

      {editLink && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-slate-700 text-sm">Chỉnh sửa liên kết — User #{editLink.userId}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Số điện thoại Zalo</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={editLink.phone} onChange={e => setEditLink(l => l ? { ...l, phone: e.target.value } : l)}
                placeholder="0912345678" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zalo User ID (OA follower)</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={editLink.zaloUid} onChange={e => setEditLink(l => l ? { ...l, zaloUid: e.target.value } : l)}
                placeholder="Lấy từ Zalo OA webhook" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg disabled:opacity-60">
              {saving ? '...' : 'Lưu'}
            </button>
            <button onClick={() => setEditLink(null)} className="px-4 py-2 text-sm text-slate-500 font-medium">Hủy</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        {links.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <p className="text-3xl mb-2">👥</p>
            <p>Chưa có liên kết. Nhấn "Nhập từ nhân sự" để tự động nhập số điện thoại.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">User ID</th>
                <th className="px-4 py-3 text-left">Số Zalo</th>
                <th className="px-4 py-3 text-left">Zalo UID</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-left">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {links.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-slate-700">#{l.user_id}</td>
                  <td className="px-4 py-3">{l.zalo_phone ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.zalo_user_id ? l.zalo_user_id.slice(0, 16) + '…' : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${l.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {l.is_active ? 'Hoạt động' : 'Tắt'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditLink({ userId: l.user_id, phone: l.zalo_phone ?? '', zaloUid: l.zalo_user_id ?? '' })}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium mr-3"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={async () => { await zaloApi.deleteUserLink(l.user_id); await load() }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Send Tab ──────────────────────────────────────────────────────────────────

function SendTab({ templates }: { templates: ZaloTemplateRead[] }) {
  const [form, setForm] = useState<ZaloSendRequest>({
    notif_type: 'system_alert',
    recipient_user_ids: [],
    context: {},
  })
  const [uidInput, setUidInput] = useState('')
  const [contextInput, setContextInput] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; no_link: number } | null>(null)

  const selectedTmpl = templates.find(t => t.notif_type === form.notif_type)

  async function send() {
    setSending(true); setResult(null)
    try {
      const uids = uidInput.split(/[\s,]+/).map(Number).filter(Boolean)
      let ctx: Record<string, string> = {}
      try { ctx = JSON.parse(contextInput) } catch { ctx = {} }
      const r = await zaloApi.send({ ...form, recipient_user_ids: uids, context: ctx })
      setResult(r.data)
    } finally { setSending(false) }
  }

  return (
    <div className="max-w-xl space-y-4">
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
          ✅ Đã gửi: <strong className="text-green-700">{result.sent}</strong> &nbsp;|&nbsp;
          ❌ Thất bại: <strong className="text-red-600">{result.failed}</strong> &nbsp;|&nbsp;
          ⚠️ Không có Zalo: <strong className="text-amber-600">{result.no_link}</strong>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Loại thông báo</label>
        <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={form.notif_type} onChange={e => setForm(f => ({ ...f, notif_type: e.target.value }))}>
          {Object.entries(NOTIF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {selectedTmpl && (
          <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs">
            <p className="font-semibold text-slate-600 mb-1">Nội dung mẫu:</p>
            <p className="font-mono text-slate-700">{selectedTmpl.content}</p>
            {selectedTmpl.variables && selectedTmpl.variables.length > 0 && (
              <div className="mt-1 flex gap-1 flex-wrap">
                {selectedTmpl.variables.map(v => (
                  <code key={v} className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{`{${v}}`}</code>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">User ID người nhận (phân cách bằng dấu phẩy)</label>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={uidInput} onChange={e => setUidInput(e.target.value)} placeholder="1, 2, 3" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Dữ liệu template (JSON) <span className="font-normal text-slate-400">— vd: {'{'}&#34;task_title&#34;: &#34;Báo cáo tháng 5&#34;{'}'}</span>
        </label>
        <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          rows={3} value={contextInput} onChange={e => setContextInput(e.target.value)}
          placeholder='{"message": "Hệ thống sẽ bảo trì lúc 22:00 hôm nay."}' />
      </div>
      <button onClick={send} disabled={sending || !uidInput.trim()}
        className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
        {sending ? '⏳ Đang gửi...' : '📤 Gửi thông báo Zalo'}
      </button>
    </div>
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<ZaloLogRead[]>([])
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    zaloApi.getLogs({ limit: 200, notif_type: filterType || undefined, status: filterStatus || undefined })
      .then(r => setLogs(r.data))
  }, [filterType, filterStatus])

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tất cả loại</option>
          {Object.entries(NOTIF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="sent">Đã gửi</option>
          <option value="failed">Thất bại</option>
          <option value="pending">Chờ gửi</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        {logs.length === 0 ? (
          <div className="py-10 text-center text-slate-400">Chưa có lịch sử gửi</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Người nhận</th>
                <th className="px-4 py-3 text-left">Loại</th>
                <th className="px-4 py-3 text-left">Nội dung</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-left">Kích hoạt</th>
                <th className="px-4 py-3 text-left">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {l.recipient_phone ? (
                      <span className="font-mono text-sm">{l.recipient_phone}</span>
                    ) : (
                      <span className="text-slate-400">User #{l.recipient_user_id}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{NOTIF_TYPE_LABELS[l.notif_type] ?? l.notif_type}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-slate-600 text-xs">{l.content_rendered}</td>
                  <td className="px-4 py-3">{statusBadge(l.status)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{l.triggered_by}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDt(l.sent_at ?? l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ZaloNotifPage() {
  const [tab, setTab] = useState<'config' | 'templates' | 'users' | 'send' | 'logs'>('config')
  const [stats, setStats] = useState<ZaloStats | null>(null)
  const [templates, setTemplates] = useState<ZaloTemplateRead[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    zaloApi.getStats().then(r => setStats(r.data)).catch(() => {})
    zaloApi.listTemplates().then(r => setTemplates(r.data)).catch(() => {})
    pollRef.current = setInterval(() => {
      zaloApi.getStats().then(r => setStats(r.data)).catch(() => {})
    }, 15000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const TABS = [
    { key: 'config',    label: '⚙️ Kết nối Zalo' },
    { key: 'templates', label: '📝 Mẫu tin nhắn' },
    { key: 'users',     label: '👥 Danh sách nhận' },
    { key: 'send',      label: '📤 Gửi thủ công' },
    { key: 'logs',      label: '📋 Lịch sử' },
  ] as const

  return (
    <AppLayout>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Thông báo Zalo</h1>
        <p className="text-slate-500 text-sm mt-1">Gửi thông báo tự động qua Zalo OA cho cán bộ, lãnh đạo</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Tổng đã gửi',      value: stats.total_sent,    color: 'blue' },
            { label: 'Gửi hôm nay',       value: stats.sent_today,    color: 'green' },
            { label: 'Thất bại hôm nay',  value: stats.failed_today,  color: stats.failed_today > 0 ? 'red' : 'slate' },
            { label: 'Người nhận liên kết', value: stats.users_linked, color: 'purple' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${
                s.color === 'blue' ? 'text-blue-600' :
                s.color === 'green' ? 'text-green-600' :
                s.color === 'red' ? 'text-red-500' :
                s.color === 'purple' ? 'text-purple-600' : 'text-slate-700'
              }`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-100 px-4 pt-2 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg mr-1 whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-blue-600/10 text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'config'    && <ConfigTab />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'users'     && <UserLinksTab />}
          {tab === 'send'      && <SendTab templates={templates} />}
          {tab === 'logs'      && <LogsTab />}
        </div>
      </div>
    </div>
    </AppLayout>
  )
}
