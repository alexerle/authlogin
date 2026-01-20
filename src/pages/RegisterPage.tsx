import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, User, Loader, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import api from '../utils/api'

export default function RegisterPage() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // Password strength calculation
  const getPasswordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 8) strength++
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++
    if (password.match(/\d/)) strength++
    if (password.match(/[^a-zA-Z\d]/)) strength++
    return strength
  }

  const passwordStrength = getPasswordStrength(formData.password)
  const strengthLabels = ['', 'Schwach', 'Mittel', 'Gut', 'Stark']
  const strengthClasses = ['', 'weak', 'fair', 'good', 'strong']

  // Password requirements check
  const passwordRequirements = [
    { met: formData.password.length >= 8, text: 'Mindestens 8 Zeichen' },
    { met: /[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password), text: 'Groß- und Kleinbuchstaben' },
    { met: /\d/.test(formData.password), text: 'Mindestens eine Zahl' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.email || !formData.password) {
      setError('E-Mail und Passwort sind erforderlich')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    if (formData.password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein')
      return
    }

    if (!acceptedTerms) {
      setError('Bitte akzeptieren Sie die Nutzungsbedingungen')
      return
    }

    setIsLoading(true)

    try {
      const response = await api.post('/auth/signup', {
        formFields: [
          { id: 'email', value: formData.email },
          { id: 'password', value: formData.password },
          ...(formData.name ? [{ id: 'name', value: formData.name }] : []),
        ],
      })

      if (response.data.status === 'OK') {
        setSuccess(true)
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login')
        }, 3000)
      } else if (response.data.status === 'FIELD_ERROR') {
        const fieldError = response.data.formFields?.find((f: any) => f.error)
        setError(fieldError?.error || 'Registrierung fehlgeschlagen')
      } else {
        setError(response.data.message || 'Registrierung fehlgeschlagen')
      }
    } catch (err: any) {
      if (err.response?.data?.message?.includes('already exists')) {
        setError('Diese E-Mail-Adresse ist bereits registriert')
      } else {
        setError(err.response?.data?.message || 'Registrierung fehlgeschlagen')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <AuthLayout title="Registrierung erfolgreich">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Willkommen bei 10hoch2!
          </h2>
          <p className="text-gray-600 mb-4">
            Wir haben Ihnen eine Bestätigungs-E-Mail gesendet. Bitte überprüfen Sie Ihren Posteingang.
          </p>
          <p className="text-sm text-gray-500">
            Sie werden in Kürze zum Login weitergeleitet...
          </p>
          <Link to="/login" className="mt-4 inline-block auth-link">
            Jetzt anmelden
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Konto erstellen"
      subtitle="Registrieren Sie sich kostenlos"
    >
      {/* Error Message */}
      {error && (
        <div className="auth-error mb-6">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name (optional) */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Name <span className="text-gray-400">(optional)</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ihr Name"
              className="auth-input pl-10"
              disabled={isLoading}
              autoComplete="name"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            E-Mail <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="ihre@email.de"
              className="auth-input pl-10"
              disabled={isLoading}
              autoComplete="email"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Passwort <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
          {formData.password && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`password-strength ${strengthClasses[passwordStrength]}`}></div>
                </div>
                <span className={`text-xs ${passwordStrength >= 3 ? 'text-green-600' : 'text-gray-500'}`}>
                  {strengthLabels[passwordStrength]}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {passwordRequirements.map((req, index) => (
                  <li key={index} className={`text-xs flex items-center gap-1 ${req.met ? 'text-green-600' : 'text-gray-400'}`}>
                    {req.met ? <CheckCircle size={12} /> : <span className="w-3 h-3 rounded-full border border-current"></span>}
                    {req.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Passwort bestätigen <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Passwort wiederholen"
              className="auth-input pl-10"
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
          </div>
          {formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <p className="mt-1 text-xs text-red-500">Passwörter stimmen nicht überein</p>
          )}
        </div>

        {/* Terms Checkbox */}
        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <label htmlFor="terms" className="text-sm text-gray-600">
            Ich akzeptiere die{' '}
            <a href="https://10hoch2.de/agb" target="_blank" rel="noopener noreferrer" className="auth-link">
              AGB
            </a>{' '}
            und{' '}
            <a href="https://10hoch2.de/datenschutz" target="_blank" rel="noopener noreferrer" className="auth-link">
              Datenschutzbestimmungen
            </a>
          </label>
        </div>

        {/* Submit Button */}
        <button type="submit" disabled={isLoading} className="auth-button">
          {isLoading && <Loader size={18} className="animate-spin" />}
          {isLoading ? 'Registrieren...' : 'Konto erstellen'}
        </button>
      </form>

      {/* Login Link */}
      <div className="mt-6 text-center">
        <span className="text-gray-600 text-sm">Bereits ein Konto? </span>
        <Link to="/login" className="text-sm auth-link font-medium">
          Jetzt anmelden
        </Link>
      </div>
    </AuthLayout>
  )
}
