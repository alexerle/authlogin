import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Loader, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import api from '../utils/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('E-Mail ist erforderlich')
      return
    }

    setIsLoading(true)

    try {
      const response = await api.post('/auth/user/password/reset/token', {
        formFields: [{ id: 'email', value: email }],
      })

      if (response.data.status === 'OK') {
        setSuccess(true)
      } else {
        // SuperTokens returns OK even if email doesn't exist (security)
        setSuccess(true)
      }
    } catch (err: any) {
      // Still show success for security (don't reveal if email exists)
      setSuccess(true)
    } finally {
      setIsLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <AuthLayout title="E-Mail gesendet">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Überprüfen Sie Ihren Posteingang
          </h2>
          <p className="text-gray-600 mb-4">
            Falls ein Konto mit <strong>{email}</strong> existiert, haben wir Ihnen einen Link zum Zurücksetzen Ihres Passworts gesendet.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Der Link ist 24 Stunden gültig.
          </p>
          <Link to="/login" className="auth-button inline-flex">
            <ArrowLeft size={18} />
            Zurück zum Login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Passwort vergessen?"
      subtitle="Geben Sie Ihre E-Mail-Adresse ein"
    >
      {/* Back Link */}
      <Link to="/login" className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1 mb-6">
        <ArrowLeft size={16} />
        Zurück zum Login
      </Link>

      {/* Error Message */}
      {error && (
        <div className="auth-error mb-6">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            E-Mail-Adresse
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ihre@email.de"
              className="auth-input pl-10"
              disabled={isLoading}
              autoComplete="email"
              required
            />
          </div>
        </div>

        <p className="text-sm text-gray-500">
          Wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
        </p>

        {/* Submit Button */}
        <button type="submit" disabled={isLoading} className="auth-button">
          {isLoading && <Loader size={18} className="animate-spin" />}
          {isLoading ? 'Senden...' : 'Link senden'}
        </button>
      </form>
    </AuthLayout>
  )
}
