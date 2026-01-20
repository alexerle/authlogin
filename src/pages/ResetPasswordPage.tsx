import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Loader, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import api from '../utils/api'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Password strength calculation
  const getPasswordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++
    if (password.match(/\d/)) strength++
    if (password.match(/[^a-zA-Z\d]/)) strength++
    return strength
  }

  const passwordStrength = getPasswordStrength(password)
  const strengthLabels = ['', 'Schwach', 'Mittel', 'Gut', 'Stark']
  const strengthClasses = ['', 'weak', 'fair', 'good', 'strong']

  // Check if token is present
  if (!token) {
    return (
      <AuthLayout title="Ungültiger Link">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Link ungültig oder abgelaufen
          </h2>
          <p className="text-gray-600 mb-6">
            Bitte fordern Sie einen neuen Link zum Zurücksetzen Ihres Passworts an.
          </p>
          <Link to="/forgot-password" className="auth-button inline-flex">
            Neuen Link anfordern
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Passwort ist erforderlich')
      return
    }

    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    setIsLoading(true)

    try {
      const response = await api.post('/auth/user/password/reset', {
        method: 'token',
        formFields: [{ id: 'password', value: password }],
        token,
      })

      if (response.data.status === 'OK') {
        setSuccess(true)
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login')
        }, 3000)
      } else if (response.data.status === 'RESET_PASSWORD_INVALID_TOKEN_ERROR') {
        setError('Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.')
      } else {
        setError(response.data.message || 'Fehler beim Zurücksetzen des Passworts')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Fehler beim Zurücksetzen des Passworts')
    } finally {
      setIsLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <AuthLayout title="Passwort geändert">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Passwort erfolgreich geändert!
          </h2>
          <p className="text-gray-600 mb-4">
            Sie können sich jetzt mit Ihrem neuen Passwort anmelden.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Sie werden in Kürze zum Login weitergeleitet...
          </p>
          <Link to="/login" className="auth-link">
            Jetzt anmelden
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Neues Passwort"
      subtitle="Wählen Sie ein neues Passwort"
    >
      {/* Error Message */}
      {error && (
        <div className="auth-error mb-6">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* New Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Neues Passwort
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mindestens 8 Zeichen"
              className="auth-input pl-10 pr-10"
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {/* Password Strength Indicator */}
          {password && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`password-strength ${strengthClasses[passwordStrength]}`}></div>
                </div>
                <span className={`text-xs ${passwordStrength >= 3 ? 'text-green-600' : 'text-gray-500'}`}>
                  {strengthLabels[passwordStrength]}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Passwort bestätigen
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Passwort wiederholen"
              className="auth-input pl-10"
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="mt-1 text-xs text-red-500">Passwörter stimmen nicht überein</p>
          )}
        </div>

        {/* Submit Button */}
        <button type="submit" disabled={isLoading} className="auth-button">
          {isLoading && <Loader size={18} className="animate-spin" />}
          {isLoading ? 'Speichern...' : 'Passwort ändern'}
        </button>
      </form>
    </AuthLayout>
  )
}
