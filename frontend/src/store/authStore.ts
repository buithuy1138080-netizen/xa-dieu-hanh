import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  token: string | null        // in-memory only (WebSocket auth), NOT persisted
  user: User | null           // persisted (for role checks, display name, etc.)
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'auth-storage',
      // Only persist user info — never persist tokens to localStorage
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
