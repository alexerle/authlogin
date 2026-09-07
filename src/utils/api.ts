import axios from 'axios'

const BASE_URL = import.meta.env.PROD ? 'https://auth.10hoch2.de' : 'http://localhost:3001'

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'st-auth-mode': 'cookie',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('anti-csrf-token')
  if (token) config.headers['anti-csrf'] = token
  return config
})

let isRefreshing = false
let refreshQueue: Array<() => void> = []

api.interceptors.response.use(
  (response) => {
    const token = response.headers['anti-csrf']
    if (token) localStorage.setItem('anti-csrf-token', token)
    return response
  },
  async (error) => {
    const original = error.config

    if (!original || (original as any).skipAuthRefresh) {
      return Promise.reject(error)
    }

    if (
      error.response?.status === 401 &&
      error.response?.data?.message === 'try refresh token' &&
      !(original as any)._retried
    ) {
      ;(original as any)._retried = true

      if (isRefreshing) {
        await new Promise<void>((resolve) => refreshQueue.push(resolve))
        return api(original)
      }

      isRefreshing = true
      try {
        await axios.post(`${BASE_URL}/auth/session/refresh`, {}, {
          withCredentials: true,
          headers: { 'st-auth-mode': 'cookie' },
        })
        refreshQueue.forEach(r => r())
        refreshQueue = []
        return api(original)
      } catch {
        refreshQueue = []
        localStorage.removeItem('anti-csrf-token')
        try {
          await axios.post(`${BASE_URL}/auth/signout`, {}, {
            withCredentials: true,
            headers: { 'st-auth-mode': 'cookie' },
          })
        } catch (_) {}
        if (window.location.pathname !== '/login') {
          window.location.href = `/login${window.location.search || ''}`
        }
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api
