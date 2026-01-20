import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.PROD ? 'https://auth.10hoch2.de' : 'http://localhost:3001',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth headers
api.interceptors.request.use(
  (config) => {
    // SuperTokens automatically handles session tokens via cookies
    // But we can add anti-CSRF token if needed
    const antiCsrfToken = localStorage.getItem('anti-csrf-token')
    if (antiCsrfToken) {
      config.headers['anti-csrf'] = antiCsrfToken
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => {
    // Store anti-CSRF token if present
    const antiCsrfToken = response.headers['anti-csrf']
    if (antiCsrfToken) {
      localStorage.setItem('anti-csrf-token', antiCsrfToken)
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config

    // Handle 401 Unauthorized - try to refresh session
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        // Attempt to refresh session
        await api.post('/auth/session/refresh')
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed - redirect to login
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
