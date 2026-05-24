import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../store/authStore'
import type { User } from '../types'

interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth, setUser } = useAuthStore()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(e.currentTarget)

    try {
      const { data: tokenData } = await apiClient.post<TokenResponse>(
        '/auth/login',
        new URLSearchParams({
          username: form.get('username') as string,
          password: form.get('password') as string,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      setAuth(tokenData.access_token, tokenData.refresh_token)
      const { data: userData } = await apiClient.get<User>('/auth/me')
      setUser(userData)
      navigate('/dashboard')
    } catch {
      setError('Sai tên đăng nhập hoặc mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 relative overflow-hidden">
      {/* Soft background blobs */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm px-4">
        {/* Logo + branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 mb-3">
            <div className="w-6 h-6 rounded-md border-2 border-white/80" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Hệ Thống Điều Hành</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cổng thông tin IOC cấp xã</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Đăng nhập tài khoản</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email hoặc tên đăng nhập</label>
              <input
                name="username"
                type="text"
                placeholder="Nhập email hoặc username..."
                required
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition bg-slate-50/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mật khẩu</label>
              <input
                name="password"
                type="password"
                placeholder="Nhập mật khẩu..."
                required
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition bg-slate-50/50"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3.5 py-2.5">
                <span className="shrink-0 font-bold">!</span>
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-blue-600/20 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang đăng nhập...
                </span>
              ) : 'Đăng nhập'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">IOC Platform · Xã Điều Hành v2.0</p>
      </div>
    </div>
  )
}
