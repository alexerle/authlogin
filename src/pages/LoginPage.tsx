import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Mail, Lock, Loader, AlertCircle, KeyRound, ArrowLeft, Chrome } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import { isAllowedRedirect } from '../config/supertokens'
import api from '../utils/api'

type LoginMethod = 'password' | 'otp'
type OtpStep = 'request' | 'verify'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const redirectUrl = searchParams.get('redirect') || ''
  const serviceName = searchParams.get('service') || ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password')
  const [otpStep, setOtpStep] = useState<OtpStep>('request')
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Cooldown timer
  useEffect(() => {
    if (otpCooldown > 0) {
      const timer = setTimeout(() => setOtpCooldown(otpCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [otpCooldown])

  // Handle successful login
  const handleLoginSuccess = (token: string) => {
    if (redirectUrl && isAllowedRedirect(redirectUrl)) {
      // Redirect back to original service with token
      const separator = redirectUrl.includes('?') ? '&' : '?'
      window.location.href = `${redirectUrl}${separator}token=${token}`
    } else {
      // Default: go to dashboard or service selection
      navigate('/services')
    }
  }

  // Password Login
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('E-Mail und Passwort sind erforderlich')
      return
    }

    setIsLoading(true)

    try {
      const response = await api.post('/auth/signin', {
        formFields: [
          { id: 'email', value: email },
          { id: 'password', value: password },
        ],
      })

      if (response.data.status === 'OK') {
        const token = response.data.accessToken || response.data.session?.accessToken
        handleLoginSuccess(token)
      } else {
        setError(response.data.message || 'Login fehlgeschlagen')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login fehlgeschlagen')
    } finally {
      setIsLoading(false)
    }
  }

  // OTP Request
  const handleOtpRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!email) {
      setError('E-Mail ist erforderlich')
      return
    }

    setIsLoading(true)

    try {
      await api.post('/auth/signinup/code', {
        email,
      })
      setSuccessMessage('Login-Code wurde an Ihre E-Mail gesendet')
      setOtpStep('verify')
      setOtpCode(['', '', '', '', '', ''])
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      if (err.response?.status === 429) {
        setOtpCooldown(err.response?.data?.retryAfter || 60)
        setError('Bitte warten Sie bevor Sie einen neuen Code anfordern')
      } else {
        setError(err.response?.data?.message || 'Fehler beim Senden des Codes')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // OTP Input handling
  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return

    const newOtp = [...otpCode]
    newOtp[index] = value
    setOtpCode(newOtp)

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }

    if (value && index === 5 && newOtp.every(d => d !== '')) {
      handleOtpVerify(newOtp.join(''))
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      const newOtp = pasted.split('')
      setOtpCode(newOtp)
      handleOtpVerify(pasted)
    }
  }

  // OTP Verify
  const handleOtpVerify = async (code?: string) => {
    setError('')
    const codeToVerify = code || otpCode.join('')

    if (codeToVerify.length !== 6) {
      setError('Bitte geben Sie den 6-stelligen Code ein')
      return
    }

    setIsLoading(true)

    try {
      const response = await api.post('/auth/signinup/code/consume', {
        preAuthSessionId: email, // This should come from the request step
        userInputCode: codeToVerify,
      })

      if (response.data.status === 'OK') {
        const token = response.data.accessToken || response.data.session?.accessToken
        handleLoginSuccess(token)
      } else {
        setError(response.data.message || 'Ungültiger Code')
        setOtpCode(['', '', '', '', '', ''])
        otpInputRefs.current[0]?.focus()
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ungültiger Code')
      setOtpCode(['', '', '', '', '', ''])
      otpInputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  // Social Login
  const handleGoogleLogin = () => {
    const redirectParam = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''
    window.location.href = `/auth/authorisationurl?thirdPartyId=google${redirectParam}`
  }

  const handleGitHubLogin = () => {
    const redirectParam = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''
    window.location.href = `/auth/authorisationurl?thirdPartyId=github${redirectParam}`
  }

  return (
    <AuthLayout
      title="Willkommen zurück"
      subtitle={serviceName ? `Anmelden bei ${serviceName}` : 'Melden Sie sich an'}
    >
      {/* Error Message */}
      {error && (
        <div className="auth-error mb-6">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="auth-success mb-6">
          <Mail size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-700 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Social Login Buttons */}
      <div className="flex gap-3 mb-6">
        <button onClick={handleGoogleLogin} className="social-button">
          <Chrome size={20} />
          <span className="hidden sm:inline">Google</span>
        </button>
        <button onClick={handleGitHubLogin} className="social-button">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          <span className="hidden sm:inline">GitHub</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-gray-500">oder</span>
        </div>
      </div>

      {/* Password Login Form */}
      {loginMethod === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              E-Mail
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
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Passwort
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-input pl-10"
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm auth-link">
              Passwort vergessen?
            </Link>
          </div>

          {/* Submit Button */}
          <button type="submit" disabled={isLoading} className="auth-button">
            {isLoading && <Loader size={18} className="animate-spin" />}
            {isLoading ? 'Anmelden...' : 'Anmelden'}
          </button>

          {/* Switch to OTP */}
          <button
            type="button"
            onClick={() => {
              setLoginMethod('otp')
              setOtpStep('request')
              setError('')
            }}
            className="w-full text-sm text-gray-600 hover:text-blue-600 flex items-center justify-center gap-2 py-2"
          >
            <Mail size={16} />
            Mit Login-Code anmelden
          </button>
        </form>
      )}

      {/* OTP Login - Request Step */}
      {loginMethod === 'otp' && otpStep === 'request' && (
        <form onSubmit={handleOtpRequest} className="space-y-4">
          <div>
            <label htmlFor="otp-email" className="block text-sm font-medium text-gray-700 mb-2">
              E-Mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="otp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ihre@email.de"
                className="auth-input pl-10"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <p className="text-sm text-gray-500">
            Wir senden Ihnen einen 6-stelligen Code per E-Mail zu.
          </p>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || otpCooldown > 0}
            className="auth-button"
          >
            {isLoading && <Loader size={18} className="animate-spin" />}
            {otpCooldown > 0 ? `Warten (${otpCooldown}s)` : isLoading ? 'Senden...' : 'Code senden'}
          </button>

          {/* Switch to Password */}
          <button
            type="button"
            onClick={() => {
              setLoginMethod('password')
              setError('')
            }}
            className="w-full text-sm text-gray-600 hover:text-blue-600 flex items-center justify-center gap-2 py-2"
          >
            <KeyRound size={16} />
            Mit Passwort anmelden
          </button>
        </form>
      )}

      {/* OTP Login - Verify Step */}
      {loginMethod === 'otp' && otpStep === 'verify' && (
        <div className="space-y-4">
          {/* Back Button */}
          <button
            type="button"
            onClick={() => {
              setOtpStep('request')
              setOtpCode(['', '', '', '', '', ''])
              setError('')
              setSuccessMessage('')
            }}
            className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1"
          >
            <ArrowLeft size={16} />
            Zurück
          </button>

          <p className="text-sm text-gray-600">
            Code wurde an <strong>{email}</strong> gesendet
          </p>

          {/* OTP Input */}
          <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otpCode.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { otpInputRefs.current[index] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="otp-input"
                disabled={isLoading}
              />
            ))}
          </div>

          {/* Verify Button */}
          <button
            type="button"
            onClick={() => handleOtpVerify()}
            disabled={isLoading || otpCode.some(d => d === '')}
            className="auth-button"
          >
            {isLoading && <Loader size={18} className="animate-spin" />}
            {isLoading ? 'Prüfen...' : 'Anmelden'}
          </button>

          {/* Resend Code */}
          <button
            type="button"
            onClick={() => handleOtpRequest()}
            disabled={isLoading || otpCooldown > 0}
            className="w-full text-sm text-gray-600 hover:text-blue-600 disabled:text-gray-400 py-2"
          >
            {otpCooldown > 0 ? `Neuen Code senden (${otpCooldown}s)` : 'Neuen Code senden'}
          </button>
        </div>
      )}

      {/* Register Link */}
      <div className="mt-6 text-center">
        <span className="text-gray-600 text-sm">Noch kein Konto? </span>
        <Link to="/register" className="text-sm auth-link font-medium">
          Jetzt registrieren
        </Link>
      </div>
    </AuthLayout>
  )
}
