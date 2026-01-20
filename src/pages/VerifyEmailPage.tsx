import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Loader, CheckCircle, AlertCircle, Mail } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import api from '../utils/api'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'resend'>('loading')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  useEffect(() => {
    if (token) {
      verifyEmail()
    } else {
      setStatus('resend')
    }
  }, [token])

  const verifyEmail = async () => {
    try {
      const response = await api.post('/auth/user/email/verify', {
        method: 'token',
        token,
      })

      if (response.data.status === 'OK') {
        setStatus('success')
      } else if (response.data.status === 'EMAIL_VERIFICATION_INVALID_TOKEN_ERROR') {
        setError('Der Bestätigungslink ist ungültig oder abgelaufen.')
        setStatus('error')
      } else {
        setError(response.data.message || 'Fehler bei der Bestätigung')
        setStatus('error')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler bei der Bestätigung')
      setStatus('error')
    }
  }

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setResendLoading(true)

    try {
      const response = await api.post('/auth/user/email/verify/token', {
        formFields: [{ id: 'email', value: email }],
      })

      if (response.data.status === 'OK' || response.data.status === 'EMAIL_ALREADY_VERIFIED_ERROR') {
        setResendSuccess(true)
      }
    } catch (err) {
      // Still show success for security
      setResendSuccess(true)
    } finally {
      setResendLoading(false)
    }
  }

  // Loading state
  if (status === 'loading') {
    return (
      <AuthLayout title="E-Mail wird bestätigt">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Bitte warten...</p>
        </div>
      </AuthLayout>
    )
  }

  // Success state
  if (status === 'success') {
    return (
      <AuthLayout title="E-Mail bestätigt">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            E-Mail erfolgreich bestätigt!
          </h2>
          <p className="text-gray-600 mb-6">
            Ihr Konto ist jetzt vollständig aktiviert.
          </p>
          <Link to="/login" className="auth-button inline-flex">
            Zum Login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <AuthLayout title="Bestätigung fehlgeschlagen">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Bestätigung fehlgeschlagen
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>

          {/* Resend form */}
          {!resendSuccess ? (
            <form onSubmit={handleResend} className="space-y-4 text-left">
              <p className="text-sm text-gray-600 text-center">
                Neue Bestätigungs-E-Mail anfordern:
              </p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ihre@email.de"
                  className="auth-input pl-10"
                  disabled={resendLoading}
                  required
                />
              </div>
              <button type="submit" disabled={resendLoading} className="auth-button">
                {resendLoading && <Loader size={18} className="animate-spin" />}
                {resendLoading ? 'Senden...' : 'Neuen Link senden'}
              </button>
            </form>
          ) : (
            <div className="auth-success">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
              <p className="text-green-700 text-sm">
                Falls ein Konto existiert, wurde eine neue Bestätigungs-E-Mail gesendet.
              </p>
            </div>
          )}

          <div className="mt-6">
            <Link to="/login" className="auth-link text-sm">
              Zurück zum Login
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  // Resend state (no token provided)
  return (
    <AuthLayout
      title="E-Mail bestätigen"
      subtitle="Bestätigungs-E-Mail erneut senden"
    >
      {!resendSuccess ? (
        <form onSubmit={handleResend} className="space-y-4">
          <p className="text-sm text-gray-600">
            Geben Sie Ihre E-Mail-Adresse ein, um eine neue Bestätigungs-E-Mail zu erhalten.
          </p>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ihre@email.de"
              className="auth-input pl-10"
              disabled={resendLoading}
              required
            />
          </div>
          <button type="submit" disabled={resendLoading} className="auth-button">
            {resendLoading && <Loader size={18} className="animate-spin" />}
            {resendLoading ? 'Senden...' : 'Bestätigungs-E-Mail senden'}
          </button>
        </form>
      ) : (
        <div className="text-center">
          <div className="auth-success mb-4">
            <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-green-700 text-sm">
              Falls ein Konto existiert, wurde eine Bestätigungs-E-Mail gesendet.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/login" className="auth-link text-sm">
          Zurück zum Login
        </Link>
      </div>
    </AuthLayout>
  )
}
