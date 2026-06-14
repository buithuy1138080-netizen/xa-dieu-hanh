import { useEffect, useRef, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { zaloApi } from '../../api/zalo'
import type {
  ZaloChannel,
  ZaloConfigRead,
  ZaloConfigUpsert,
  ZaloFollower,
  ZaloLogRead,
  ZaloSendRequest,
  ZaloSendResult,
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

      {/* Webhook URL — for Zalo OA configuration */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
        <p className="font-semibold text-indigo-800 text-sm">🔗 Webhook URL (cấu hình trong Zalo OA Manager)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-xs font-mono text-indigo-700 break-all">
            {window.location.origin}/api/v1/zalo/webhook
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/v1/zalo/webhook`)}
            className="px-3 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shrink-0"
          >
            Copy
          </button>
        </div>
        <ol className="list-decimal list-inside text-xs text-indigo-700 space-y-1 mt-1">
          <li>Vào <strong>oa.zalo.me</strong> → chọn OA → <strong>Quản lý</strong> → <strong>API & Webhook</strong></li>
          <li>Dán URL trên vào ô <strong>Webhook URL</strong>, bật event <strong>user_send_text</strong></li>
          <li>Nhân viên nhắn mã nhân viên (VD: <code className="bg-indigo-100 px-1 rounded">NS001</code>) vào OA → hệ thống tự liên kết UID</li>
        </ol>
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
  const [loadErr, setLoadErr] = useState('')

  async function load() {
    try {
      const r = await zaloApi.listTemplates()
      setTemplates(r.data)
      setLoadErr('')
    } catch { setLoadErr('Không tải được danh sách mẫu tin nhắn') }
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
    try {
      await zaloApi.deleteTemplate(id)
      await load()
    } catch { setSeedMsg('❌ Lỗi khi xóa mẫu') }
  }

  return (
    <div className="space-y-4">
      {loadErr && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{loadErr}</div>}
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

// ── Followers panel (import UID from OA) ─────────────────────────────────────

function FollowersPanel({ links, onLinked }: { links: ZaloUserLinkRead[]; onLinked: () => void }) {
  const [followers, setFollowers] = useState<ZaloFollower[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [linkingUid, setLinkingUid] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<Record<string, string>>({})
  const [savingUid, setSavingUid] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true); setErr('')
    try {
      const r = await zaloApi.getFollowers(0, 50)
      setFollowers(r.data.followers)
      setTotal(r.data.total)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Lỗi khi tải danh sách người quan tâm')
    } finally { setLoading(false) }
  }

  // IOC users who don't have a zalo_user_id yet — candidates for linking
  const unlinkedUsers = links.filter(l => !l.zalo_user_id && l.is_active)

  async function doLink(follower: ZaloFollower) {
    const userId = parseInt(selectedUser[follower.zalo_user_id] || '')
    if (!userId) return
    setSavingUid(follower.zalo_user_id)
    try {
      await zaloApi.upsertUserLink({ user_id: userId, zalo_user_id: follower.zalo_user_id })
      setSavedMsg(m => ({ ...m, [follower.zalo_user_id]: `✅ Đã liên kết với User #${userId}` }))
      setLinkingUid(null)
      onLinked()
      // Refresh follower list to update linked_user_id
      const r = await zaloApi.getFollowers(0, 50)
      setFollowers(r.data.followers)
    } catch {
      setSavedMsg(m => ({ ...m, [follower.zalo_user_id]: '❌ Lỗi khi lưu' }))
    } finally { setSavingUid(null) }
  }

  const linkedSet = new Set(links.filter(l => l.zalo_user_id).map(l => l.zalo_user_id))

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div>
          <p className="font-semibold text-slate-700 text-sm">📡 Người quan tâm OA Zalo</p>
          {total > 0 && <p className="text-xs text-slate-400">{total} người quan tâm tổng cộng</p>}
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-60">
          {loading ? '⏳ Đang tải...' : followers.length ? '↺ Làm mới' : '📥 Tải từ Zalo OA'}
        </button>
      </div>

      {err && (
        <div className="px-4 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{err}</div>
      )}

      {followers.length === 0 && !loading && !err && (
        <div className="py-8 text-center text-slate-400 text-sm">
          Nhấn "Tải từ Zalo OA" để lấy danh sách người quan tâm
        </div>
      )}

      {followers.length > 0 && (
        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {followers.map(f => {
            const isLinked = linkedSet.has(f.zalo_user_id) || f.linked_user_id != null
            const isLinking = linkingUid === f.zalo_user_id
            return (
              <div key={f.zalo_user_id} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${isLinked ? 'bg-green-50/40' : ''}`}>
                {/* Avatar */}
                {f.avatar
                  ? <img src={f.avatar} className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-100" alt="" />
                  : <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600 font-bold text-sm">
                      {f.display_name?.[0] ?? '?'}
                    </div>
                }

                {/* Name + UID */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{f.display_name || 'Không có tên'}</p>
                  <p className="text-xs font-mono text-slate-400 truncate">{f.zalo_user_id}</p>
                  {savedMsg[f.zalo_user_id] && (
                    <p className="text-xs mt-0.5 text-green-600">{savedMsg[f.zalo_user_id]}</p>
                  )}
                </div>

                {/* Status / Link action */}
                <div className="shrink-0 flex items-center gap-2">
                  {isLinked ? (
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                      ✅ Đã liên kết
                    </span>
                  ) : isLinking ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={selectedUser[f.zalo_user_id] ?? ''}
                        onChange={e => setSelectedUser(s => ({ ...s, [f.zalo_user_id]: e.target.value }))}
                      >
                        <option value="">-- Chọn user IOC --</option>
                        {unlinkedUsers.map(u => (
                          <option key={u.user_id} value={u.user_id}>
                            User #{u.user_id} ({u.zalo_phone ?? 'không có SĐT'})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => doLink(f)}
                        disabled={!selectedUser[f.zalo_user_id] || savingUid === f.zalo_user_id}
                        className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {savingUid === f.zalo_user_id ? '...' : 'Lưu'}
                      </button>
                      <button onClick={() => setLinkingUid(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLinkingUid(f.zalo_user_id)}
                      className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg font-medium"
                    >
                      Liên kết
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UserLinksTab() {
  const [links, setLinks] = useState<ZaloUserLinkRead[]>([])
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [editLink, setEditLink] = useState<{ userId: number; phone: string; zaloUid: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  async function load() {
    try {
      const r = await zaloApi.listUserLinks(); setLinks(r.data)
    } catch { /* fail silently — table shows empty */ }
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
    setSaving(true); setSaveErr('')
    try {
      await zaloApi.upsertUserLink({ user_id: editLink.userId, zalo_phone: editLink.phone || undefined, zalo_user_id: editLink.zaloUid || undefined })
      setEditLink(null); await load()
    } catch (e: any) {
      setSaveErr(e?.response?.data?.detail ?? 'Lỗi khi lưu liên kết')
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
          {saveErr && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveErr}</div>}
          <div className="flex gap-3">
            <button onClick={saveEdit} disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg disabled:opacity-60">
              {saving ? '...' : 'Lưu'}
            </button>
            <button onClick={() => { setEditLink(null); setSaveErr('') }} className="px-4 py-2 text-sm text-slate-500 font-medium">Hủy</button>
          </div>
        </div>
      )}

      {/* Warning: users with phone but no zalo_user_id can't receive OA messages */}
      {links.filter(l => !l.zalo_user_id && l.is_active).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">
            ⚠️ {links.filter(l => !l.zalo_user_id && l.is_active).length} người dùng chưa có Zalo User ID — không nhận được OA Message
          </p>
          <p className="text-xs text-amber-700">
            <strong>Cách khắc phục:</strong> Yêu cầu nhân viên nhắn mã nhân sự (VD: <code className="bg-amber-100 px-1 rounded">NS001</code>) vào trang Zalo OA.
            Hệ thống sẽ tự động ghi nhận Zalo User ID qua webhook.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Hoặc admin có thể lấy UID từ trang <strong>oa.zalo.me → Người quan tâm</strong> rồi nhập thủ công bằng nút "Sửa".
          </p>
        </div>
      )}

      {/* Followers panel — pull from Zalo OA */}
      <FollowersPanel links={links} onLinked={load} />

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
                <th className="px-4 py-3 text-left">Zalo UID (OA)</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-left">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {links.map(l => (
                <tr key={l.id} className={`hover:bg-slate-50 ${!l.zalo_user_id && l.is_active ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3 font-mono text-slate-700">#{l.user_id}</td>
                  <td className="px-4 py-3">{l.zalo_phone ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {l.zalo_user_id
                      ? <span className="font-mono text-xs text-slate-600">{l.zalo_user_id.slice(0, 18)}…</span>
                      : <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">⚠️ Chưa có UID</span>
                    }
                  </td>
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
  const [result, setResult] = useState<ZaloSendResult | null>(null)
  const [recentFailedLogs, setRecentFailedLogs] = useState<ZaloLogRead[]>([])

  const selectedTmpl = templates.find(t => t.notif_type === form.notif_type)

  async function send() {
    setSending(true); setResult(null); setRecentFailedLogs([])
    try {
      const uids = uidInput.split(/[\s,]+/).map(Number).filter(Boolean)
      let ctx: Record<string, string> = {}
      try { ctx = JSON.parse(contextInput) } catch { ctx = {} }
      const r = await zaloApi.send({ ...form, recipient_user_ids: uids, context: ctx })
      setResult(r.data)
      if (r.data.failed > 0) {
        setTimeout(async () => {
          try {
            const logsR = await zaloApi.getLogs({ status: 'failed', limit: 5 })
            setRecentFailedLogs(logsR.data.slice(0, 5))
          } catch { /* ignore */ }
        }, 500)
      }
    } catch (e: any) {
      setResult({ sent: 0, failed: 0, no_link: 0, errors: [{ user_id: 0, error: e?.response?.data?.detail ?? 'Lỗi kết nối server' }] })
    } finally { setSending(false) }
  }

  return (
    <div className="max-w-xl space-y-4">
      {result && (
        <div className={`border rounded-xl px-4 py-3 text-sm space-y-2 ${result.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div>
            ✅ Đã gửi: <strong className="text-green-700">{result.sent}</strong> &nbsp;|&nbsp;
            ❌ Thất bại: <strong className="text-red-600">{result.failed}</strong> &nbsp;|&nbsp;
            ⚠️ Không có Zalo: <strong className="text-amber-600">{result.no_link}</strong>
          </div>
          {/* Error detail from backend (new API) */}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-semibold text-red-700">Chi tiết lỗi từ Zalo:</p>
              {result.errors.map((e, i) => (
                <div key={i} className="bg-white border border-red-100 rounded-lg px-3 py-2 text-xs font-mono text-red-700">
                  User #{e.user_id}: {e.error}
                </div>
              ))}
            </div>
          )}
          {/* Auto-fetched recent failed logs for older backend */}
          {result.failed > 0 && recentFailedLogs.length > 0 && !result.errors?.length && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-semibold text-red-700">Lỗi gần nhất từ Zalo (Lịch sử):</p>
              {recentFailedLogs.map(l => (
                <div key={l.id} className="bg-white border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                  <span className="font-semibold">User #{l.recipient_user_id}:</span>{' '}
                  <span className="font-mono">{l.error_msg || 'Không có chi tiết'}</span>
                </div>
              ))}
            </div>
          )}
          {result.failed > 0 && (
            <div className="text-xs text-slate-500 pt-1 border-t border-red-100">
              💡 Lỗi phổ biến: &nbsp;
              <code className="bg-red-50 px-1 rounded">-14</code> chưa nhắn tin OA trong 7 ngày &nbsp;|&nbsp;
              <code className="bg-red-50 px-1 rounded">-216</code> chưa quan tâm OA &nbsp;|&nbsp;
              <code className="bg-red-50 px-1 rounded">-201</code> token hết hạn &nbsp;|&nbsp;
              <code className="bg-red-50 px-1 rounded">-1</code> thiếu Zalo User ID
            </div>
          )}
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
          Dữ liệu template (JSON) <span className="font-normal text-slate-400">— vd: {'{'}&#34;message&#34;: &#34;Nội dung&#34;{'}'}</span>
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

// ── Test Direct Tab ───────────────────────────────────────────────────────────

function TestTab() {
  const [zaloUid, setZaloUid] = useState('')
  const [text, setText] = useState('Xin chào! Đây là tin nhắn test từ hệ thống IOC.')
  const [sending, setSending] = useState(false)
  const [resp, setResp] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState('')

  // Broadcast section
  const [bcSubject, setBcSubject] = useState('Thông báo hệ thống')
  const [bcText, setBcText] = useState('')
  const [bcUids, setBcUids] = useState('')
  const [bcSending, setBcSending] = useState(false)
  const [bcResult, setBcResult] = useState<ZaloSendResult | null>(null)

  async function doTest() {
    if (!zaloUid.trim() || !text.trim()) return
    setSending(true); setResp(null); setErr('')
    try {
      const r = await zaloApi.sendText({ zalo_user_id: zaloUid.trim(), text })
      setResp(r.data.zalo_response)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? JSON.stringify(e?.response?.data ?? 'Lỗi không xác định'))
    } finally { setSending(false) }
  }

  async function doBroadcast() {
    const uids = bcUids.split(/[\s,]+/).map(Number).filter(Boolean)
    if (!bcText.trim() || uids.length === 0) return
    setBcSending(true); setBcResult(null)
    try {
      const r = await zaloApi.broadcast({ subject: bcSubject, text: bcText, recipient_user_ids: uids })
      setBcResult(r.data)
    } catch (e: any) {
      setBcResult({ sent: 0, failed: 0, no_link: 0, errors: [{ user_id: 0, error: e?.response?.data?.detail ?? 'Lỗi kết nối server' }] })
    } finally { setBcSending(false) }
  }

  return (
    <div className="space-y-6">
      {/* Direct test */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">🔬 Test gửi trực tiếp (debug)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Bỏ qua template/userlink — gửi thẳng đến Zalo User ID để kiểm tra token &amp; kết nối.
          </p>
        </div>
        {resp && (
          <div className={`rounded-lg px-3 py-2.5 text-xs font-mono ${
            (resp.error as number) === 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <p className="font-semibold mb-1">
              {(resp.error as number) === 0 ? '✅ Gửi thành công!' : `❌ Lỗi Zalo (error: ${resp.error})`}
            </p>
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(resp, null, 2)}</pre>
            {(resp.error as number) !== 0 && (
              <div className="mt-2 text-xs text-red-600 space-y-0.5">
                {(resp.error as number) === -201 && <p>→ <strong>-201</strong>: Access token không hợp lệ hoặc đã hết hạn. Vào tab "Kết nối Zalo" → Làm mới token.</p>}
                {(resp.error as number) === -216 && <p>→ <strong>-216</strong>: Người dùng chưa quan tâm (follow) OA này. Yêu cầu họ follow OA trước.</p>}
                {(resp.error as number) === -14  && <p>→ <strong>-14</strong>: Người dùng chưa nhắn tin cho OA trong 7 ngày gần đây (CS message). Họ cần nhắn một tin bất kỳ cho OA.</p>}
                {(resp.error as number) === -13  && <p>→ <strong>-13</strong>: Zalo User ID không đúng. Kiểm tra lại ID trong mục "Danh sách nhận".</p>}
              </div>
            )}
          </div>
        )}
        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
            <p className="font-semibold">❌ Lỗi HTTP từ server:</p>
            <p className="font-mono mt-1">{err}</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Zalo User ID (OA follower ID)
            <span className="font-normal text-slate-400 ml-1">— Lấy từ tab "Danh sách nhận" hoặc webhook</span>
          </label>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={zaloUid} onChange={e => setZaloUid(e.target.value)}
            placeholder="Vd: 3806521040273920021" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nội dung tin nhắn</label>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={3} value={text} onChange={e => setText(e.target.value)} />
        </div>
        <button onClick={doTest} disabled={sending || !zaloUid.trim()}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
          {sending ? '⏳ Đang gửi...' : '🧪 Test gửi'}
        </button>
      </div>

      {/* Broadcast */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">📢 Gửi broadcast (văn bản tùy ý)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Gửi tin nhắn tùy ý (không dùng template) đến nhiều User ID.</p>
        </div>
        {bcResult && (
          <div className={`rounded-xl px-4 py-3 text-sm space-y-1 ${bcResult.failed > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
            ✅ Đã gửi: <strong className="text-green-700">{bcResult.sent}</strong> &nbsp;|&nbsp;
            ❌ Thất bại: <strong className="text-red-600">{bcResult.failed}</strong> &nbsp;|&nbsp;
            ⚠️ Không có Zalo: <strong className="text-amber-600">{bcResult.no_link}</strong>
            {bcResult.errors && bcResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {bcResult.errors.map((e, i) => (
                  <div key={i} className="text-xs font-mono text-red-700 bg-white rounded px-2 py-1 border border-red-100">
                    User #{e.user_id}: {e.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tiêu đề</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={bcSubject} onChange={e => setBcSubject(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nội dung</label>
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={4} value={bcText} onChange={e => setBcText(e.target.value)}
            placeholder="Nhập nội dung thông báo..." />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">User ID (phân cách bằng dấu phẩy)</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={bcUids} onChange={e => setBcUids(e.target.value)} placeholder="1, 2, 3" />
        </div>
        <button onClick={doBroadcast} disabled={bcSending || !bcText.trim() || !bcUids.trim()}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
          {bcSending ? '⏳ Đang gửi...' : '📢 Gửi broadcast'}
        </button>
      </div>
    </div>
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<ZaloLogRead[]>([])
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('failed') // default: show failed first
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await zaloApi.getLogs({ limit: 200, notif_type: filterType || undefined, status: filterStatus || undefined })
      setLogs(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterType, filterStatus])

  // Parse error_msg to extract Zalo error code
  function parseZaloError(msg: string | null): { code: string | null; hint: string } {
    if (!msg) return { code: null, hint: '' }
    const codeMatch = msg.match(/"error"\s*:\s*(-?\d+)/)
    const code = codeMatch ? codeMatch[1] : null
    const hints: Record<string, string> = {
      '-14':  'Người dùng chưa nhắn tin cho OA trong 7 ngày gần đây → Yêu cầu họ nhắn bất kỳ tin gì cho OA',
      '-216': 'Người dùng chưa quan tâm (follow) OA → Yêu cầu họ nhấn "Quan tâm" OA Zalo',
      '-201': 'Access token không hợp lệ hoặc hết hạn → Vào tab Kết nối Zalo → Làm mới token',
      '-13':  'Zalo User ID sai định dạng → Kiểm tra lại UID trong Danh sách nhận',
      '-1':   'Lỗi nội bộ: không đủ thông tin (thiếu zalo_user_id hoặc kênh gửi sai)',
    }
    return { code, hint: code ? (hints[code] ?? '') : '' }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="failed">❌ Thất bại</option>
          <option value="sent">✅ Đã gửi</option>
          <option value="pending">⏳ Chờ gửi</option>
        </select>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tất cả loại</option>
          {Object.entries(NOTIF_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="px-3 py-2 text-sm bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-medium disabled:opacity-50">
          {loading ? '...' : '↺ Làm mới'}
        </button>
        {logs.length > 0 && (
          <span className="text-xs text-slate-400">{logs.length} bản ghi</span>
        )}
      </div>

      <div className="overflow-x-auto">
        {logs.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            {filterStatus === 'failed' ? '✅ Không có lỗi nào.' : 'Chưa có lịch sử gửi'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Người nhận</th>
                <th className="px-4 py-3 text-left">Loại</th>
                <th className="px-4 py-3 text-left">Nội dung</th>
                <th className="px-4 py-3 text-left">Trạng thái</th>
                <th className="px-4 py-3 text-left">Lỗi Zalo</th>
                <th className="px-4 py-3 text-left">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map(l => {
                const { code, hint } = parseZaloError(l.error_msg)
                const isExpanded = expandedId === l.id
                return (
                  <tr key={l.id} className={`hover:bg-slate-50 ${l.status === 'failed' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">User #{l.recipient_user_id}</div>
                      {l.recipient_phone && <div className="text-xs text-slate-400 font-mono">{l.recipient_phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">{NOTIF_TYPE_LABELS[l.notif_type] ?? l.notif_type}</td>
                    <td className="px-4 py-3 max-w-[160px] truncate text-slate-600 text-xs">{l.content_rendered}</td>
                    <td className="px-4 py-3">{statusBadge(l.status)}</td>
                    <td className="px-4 py-3 max-w-xs">
                      {l.error_msg ? (
                        <div>
                          {code && (
                            <span className="inline-block px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded font-mono mr-1">
                              err {code}
                            </span>
                          )}
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : l.id)}
                            className="text-xs text-red-600 hover:text-red-800 underline"
                          >
                            {isExpanded ? 'ẩn' : 'xem lỗi'}
                          </button>
                          {isExpanded && (
                            <div className="mt-1 space-y-1">
                              <div className="font-mono text-xs text-red-700 bg-red-50 px-2 py-1.5 rounded border border-red-100 break-all">
                                {l.error_msg}
                              </div>
                              {hint && (
                                <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                  💡 {hint}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDt(l.sent_at ?? l.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ZaloNotifPage() {
  const [tab, setTab] = useState<'config' | 'templates' | 'users' | 'send' | 'test' | 'logs'>('config')
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
    { key: 'test',      label: '🧪 Test & Broadcast' },
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
          {tab === 'test'      && <TestTab />}
          {tab === 'logs'      && <LogsTab />}
        </div>
      </div>
    </div>
    </AppLayout>
  )
}
