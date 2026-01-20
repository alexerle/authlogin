import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ServicesPage from './pages/ServicesPage'
import SecuritySettingsPage from './pages/SecuritySettingsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* User Dashboard & Settings */}
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/security" element={<SecuritySettingsPage />} />

        {/* OAuth callback routes */}
        <Route path="/auth/callback/google" element={<LoginPage />} />
        <Route path="/auth/callback/github" element={<LoginPage />} />
        <Route path="/auth/callback/apple" element={<LoginPage />} />
        <Route path="/auth/callback/facebook" element={<LoginPage />} />
        <Route path="/auth/callback/active-directory" element={<LoginPage />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
