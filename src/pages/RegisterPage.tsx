import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, User, Loader, AlertCircle, CheckCircle, Eye, EyeOff, Chrome, Fingerprint } from 'lucide-react'
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
    { met: formData.password.length >= 8, text: 'Min. 8 Zeichen' },
    { met: /[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password), text: 'Groß-/Kleinbuchstaben' },
    { met: /\d/.test(formData.password), text: 'Eine Zahl' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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
        setTimeout(() => navigate('/login'), 3000)
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

  // OAuth Registration
  const handleOAuthRegister = (provider: string) => {
    window.location.href = `/auth/authorisationurl?thirdPartyId=${provider}`
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
            Wir haben Ihnen eine Bestätigungs-E-Mail gesendet.
          </p>
          <p className="text-sm text-gray-500">
            Weiterleitung zum Login...
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
        <div className="auth-error mb-4">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="flex gap-6">
        {/* Left Column - Registration Form */}
        <div className="flex-1 min-w-0">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Name (optional) */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ihr Name"
                  className="auth-input pl-9 py-2 text-sm"
                  disabled={isLoading}
                  autoComplete="name"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ihre@email.de"
                  className="auth-input pl-9 py-2 text-sm"
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Passwort <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Min. 8 Zeichen"
                  className="auth-input pl-9 pr-9 py-2 text-sm"
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password Strength */}
              {formData.password && (
                <div className="mt-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`password-strength ${strengthClasses[passwordStrength]}`}></div>
                    </div>
                    <span className={`text-xs ${passwordStrength >= 3 ? 'text-green-600' : 'text-gray-500'}`}>
                      {strengthLabels[passwordStrength]}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1">
                    {passwordRequirements.map((req, index) => (
                      <span key={index} className={`text-xs flex items-center gap-0.5 ${req.met ? 'text-green-600' : 'text-gray-400'}`}>
                        {req.met ? <CheckCircle size={10} /> : <span className="w-2.5 h-2.5 rounded-full border border-current"></span>}
                        {req.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Passwort bestätigen <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Wiederholen"
                  className="auth-input pl-9 py-2 text-sm"
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                />
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-0.5 text-xs text-red-500">Passwörter stimmen nicht überein</p>
              )}
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2 pt-1">
              <input
                id="terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <label htmlFor="terms" className="text-xs text-gray-600 leading-tight">
                Ich akzeptiere die{' '}
                <a href="https://10hoch2.de/agb" target="_blank" rel="noopener noreferrer" className="auth-link">AGB</a>
                {' '}und{' '}
                <a href="https://10hoch2.de/datenschutz" target="_blank" rel="noopener noreferrer" className="auth-link">Datenschutz</a>
              </label>
            </div>

            {/* Submit */}
            <button type="submit" disabled={isLoading} className="auth-button py-2.5 text-sm">
              {isLoading && <Loader size={16} className="animate-spin" />}
              {isLoading ? 'Registrieren...' : 'Konto erstellen'}
            </button>
          </form>
        </div>

        {/* Vertical Divider */}
        <div className="flex flex-col items-center">
          <div className="flex-1 w-px bg-gray-200"></div>
          <span className="py-2 text-xs text-gray-400">oder</span>
          <div className="flex-1 w-px bg-gray-200"></div>
        </div>

        {/* Right Column - Alternative Registration */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs text-gray-500 text-center mb-3">
            Schneller mit einem Klick
          </p>

          {/* Passkey - kommt nach erster Registrierung */}
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center justify-center gap-2 shadow-sm"
          >
            <Fingerprint size={18} />
            Passkey
          </button>

          {/* Google */}
          <button
            onClick={() => handleOAuthRegister('google')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-700 flex items-center justify-center gap-2"
          >
            <Chrome size={18} />
            Google
          </button>

          {/* GitHub */}
          <button
            onClick={() => handleOAuthRegister('github')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center gap-2"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </button>

          {/* Microsoft */}
          <button
            onClick={() => handleOAuthRegister('active-directory')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-[#00a4ef] hover:bg-[#0095d9] text-white flex items-center justify-center gap-2"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
            </svg>
            Microsoft
          </button>

          {/* Apple */}
          <button
            onClick={() => handleOAuthRegister('apple')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-black hover:bg-gray-900 text-white flex items-center justify-center gap-2"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple
          </button>
        </div>
      </div>

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
