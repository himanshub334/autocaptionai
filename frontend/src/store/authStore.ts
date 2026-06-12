import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setTokens: (access: string, refresh: string, user: User) => void
  logout: () => void
  refreshAccessToken: () => Promise<string | null>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setTokens: (accessToken, refreshToken, user) => {
        set({ accessToken, refreshToken, user })
      },

      logout: () => {
        const { refreshToken } = get()
        if (refreshToken) {
          api.post('/api/auth/logout', { refreshToken }).catch(() => {})
        }
        set({ user: null, accessToken: null, refreshToken: null })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return null
        try {
          const res = await api.post('/api/auth/refresh', { refreshToken })
          const { accessToken, refreshToken: newRefresh } = res.data
          set({ accessToken, refreshToken: newRefresh })
          return accessToken
        } catch {
          set({ user: null, accessToken: null, refreshToken: null })
          return null
        }
      },
    }),
    {
      name: 'autocaption-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    }
  )
)
