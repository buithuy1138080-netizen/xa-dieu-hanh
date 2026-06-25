import { useState, useEffect } from 'react'
import { Eye, EyeOff, KeyRound, X } from 'lucide-react'
import apiClient from '../../api/client'

interface Props {
  onClose: () => void
}

export default function ChangePasswordModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const [oldPwd,  setOldPwd]  = useState('')
  const [newPwd,  setNewPwd]  = useState('')
  const [confPwd, setConfPwd] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const inp = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!oldPwd.trim() || !newPwd.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin'); return
    }
    if (newPwd.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự'); return
    }
    if (newPwd !== confPwd) {
      setError('Mật khẩu xác nhận không khớp'); return
    }

    setSaving(true)
    try {
      await apiClient.post('/auth/change-password', {
        old_password: oldPwd,
        new_password: newPwd,
      })
      setSuccess(true)
      setTimeout(onClose, 2000)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Đổi mật khẩu thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <KeyRound size={16} className="text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-800">Đổi mật khẩu</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {success ? (
            <div className="text-center py-4 space-y-2">
              <div className="text-3xl">✅</div>
              <p className="font-semibold text-emerald-600">Đổi mật khẩu thành công!</p>
              <p className="text-sm text-slate-400">Đang đóng...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-xl">
                  {error}
                </div>
              )}

              {/* Mật khẩu cũ */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Mật khẩu hiện tại *
                </label>
                <div className="relative">
                  <input
                    type={showOld ? 'text' : 'password'}
                    value={oldPwd}
                    onChange={e => setOldPwd(e.target.value)}
                    className={inp}
                    placeholder="Nhập mật khẩu hiện tại"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowOld(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Mật khẩu mới */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Mật khẩu mới * <span className="font-normal text-slate-400">(ít nhất 6 ký tự)</span>
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    className={inp}
                    placeholder="Mật khẩu mới"
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {/* Strength indicator */}
                {newPwd && (
                  <div className="flex gap-1 mt-1.5">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                        newPwd.length >= i * 3
                          ? i <= 2 ? 'bg-red-400' : i === 3 ? 'bg-amber-400' : 'bg-emerald-500'
                          : 'bg-slate-100'
                      }`} />
                    ))}
                    <span className="text-[10px] text-slate-400 ml-1">
                      {newPwd.length < 6 ? 'Yếu' : newPwd.length < 9 ? 'Trung bình' : newPwd.length < 12 ? 'Tốt' : 'Mạnh'}
                    </span>
                  </div>
                )}
              </div>

              {/* Xác nhận */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Xác nhận mật khẩu mới *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={confPwd}
                    onChange={e => setConfPwd(e.target.value)}
                    className={`${inp} ${confPwd && confPwd !== newPwd ? 'border-red-300 focus:ring-red-400' : ''}`}
                    placeholder="Nhập lại mật khẩu mới"
                  />
                  {confPwd && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      {confPwd === newPwd ? '✅' : '❌'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Hủy
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                  {saving ? '⏳ Đang lưu...' : '🔒 Đổi mật khẩu'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
