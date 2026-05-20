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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-blue-700 mb-2">
          Hệ Thống Điều Hành
        </h1>
        <p className="text-center text-gray-500 text-sm mb-6">Cổng thông tin cấp xã</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="username"
            type="text"
            placeholder="Tên đăng nhập"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            name="password"
            type="password"
            placeholder="Mật khẩu"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
