import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
})

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('autocaption-auth')
  if (stored) {
    const { state } = JSON.parse(stored)
    if (state?.accessToken) {
      config.headers.Authorization = `Bearer ${state.accessToken}`
    }
  }
  return config
})

// Response interceptor: handle 401 + token refresh
let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true

      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push((token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }

      isRefreshing = true

      try {
        const { useAuthStore } = await import('../store/authStore')
        const newToken = await useAuthStore.getState().refreshAccessToken()
        if (newToken) {
          pendingRequests.forEach(cb => cb(newToken))
          pendingRequests = []
          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        }
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
