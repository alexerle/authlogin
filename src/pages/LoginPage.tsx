import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Mail, Lock, Loader, AlertCircle, KeyRound, ArrowLeft, Chrome, Fingerprint, Smartphone } from 'lucide-react'
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
      const separator = redirectUrl.includes('?') ? '&' : '?'
      window.location.href = `${redirectUrl}${separator}token=${token}`
    } else {
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
      await api.post('/auth/signinup/code', { email })
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
        preAuthSessionId: email,
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

  // Social Login handlers
  const handleOAuthLogin = (provider: string) => {
    const redirectParam = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''
    window.location.href = `/auth/authorisationurl?thirdPartyId=${provider}${redirectParam}`
  }

  // Passkey Login
  const handlePasskeyLogin = async () => {
    if (!email) {
      setError('Bitte geben Sie zuerst Ihre E-Mail ein')
      return
    }

    setError('')
    setIsLoading(true)

    try {
      // Get authentication options
      const optionsResponse = await api.post('/auth/passkey/login/options', { email })

      if (optionsResponse.data.status !== 'OK') {
        throw new Error(optionsResponse.data.message)
      }

      const options = optionsResponse.data.options

      // Convert challenge from base64url
      options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

      // Convert credential IDs
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        }))
      }

      // Request credential from browser
      const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential

      if (!credential) {
        throw new Error('Passkey-Authentifizierung abgebrochen')
      }

      const response = credential.response as AuthenticatorAssertionResponse

      // Complete login
      const completeResponse = await api.post('/auth/passkey/login/complete', {
        email,
        credential: {
          id: credential.id,
          response: {
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
          },
        },
      })

      if (completeResponse.data.status === 'OK') {
        handleLoginSuccess('')
      } else {
        throw new Error(completeResponse.data.message)
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey-Authentifizierung abgebrochen')
      } else {
        setError(err.message || 'Passkey-Login fehlgeschlagen')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Willkommen"
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

      {/* Two Column Layout */}
      <div className="flex gap-6">
        {/* Left Column - Main Login */}
        <div className="flex-1 min-w-0">
          {/* Password Login Form */}
          {loginMethod === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ihre@email.de"
                    className="auth-input pl-9 py-2.5 text-sm"
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Passwort
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="auth-input pl-9 py-2.5 text-sm"
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs auth-link">
                  Passwort vergessen?
                </Link>
              </div>

              <button type="submit" disabled={isLoading} className="auth-button py-2.5 text-sm">
                {isLoading && <Loader size={16} className="animate-spin" />}
                {isLoading ? 'Anmelden...' : 'Anmelden'}
              </button>
            </form>
          )}

          {/* OTP Login - Request Step */}
          {loginMethod === 'otp' && otpStep === 'request' && (
            <form onSubmit={handleOtpRequest} className="space-y-4">
              <div>
                <label htmlFor="otp-email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="otp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ihre@email.de"
                    className="auth-input pl-9 py-2.5 text-sm"
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Wir senden Ihnen einen 6-stelligen Code per E-Mail.
              </p>

              <button
                type="submit"
                disabled={isLoading || otpCooldown > 0}
                className="auth-button py-2.5 text-sm"
              >
                {isLoading && <Loader size={16} className="animate-spin" />}
                {otpCooldown > 0 ? `Warten (${otpCooldown}s)` : isLoading ? 'Senden...' : 'Code senden'}
              </button>

              <button
                type="button"
                onClick={() => { setLoginMethod('password'); setError('') }}
                className="w-full text-xs text-gray-600 hover:text-blue-600 flex items-center justify-center gap-1 py-2"
              >
                <KeyRound size={14} />
                Mit Passwort anmelden
              </button>
            </form>
          )}

          {/* OTP Login - Verify Step */}
          {loginMethod === 'otp' && otpStep === 'verify' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setOtpStep('request')
                  setOtpCode(['', '', '', '', '', ''])
                  setError('')
                  setSuccessMessage('')
                }}
                className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                Zurück
              </button>

              <p className="text-xs text-gray-600">
                Code an <strong>{email}</strong>
              </p>

              <div className="flex justify-center gap-1.5" onPaste={handleOtpPaste}>
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
                    className="w-10 h-11 text-center text-lg font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleOtpVerify()}
                disabled={isLoading || otpCode.some(d => d === '')}
                className="auth-button py-2.5 text-sm"
              >
                {isLoading && <Loader size={16} className="animate-spin" />}
                {isLoading ? 'Prüfen...' : 'Anmelden'}
              </button>

              <button
                type="button"
                onClick={() => handleOtpRequest()}
                disabled={isLoading || otpCooldown > 0}
                className="w-full text-xs text-gray-600 hover:text-blue-600 disabled:text-gray-400 py-1"
              >
                {otpCooldown > 0 ? `Neuer Code (${otpCooldown}s)` : 'Neuen Code senden'}
              </button>
            </div>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="flex flex-col items-center">
          <div className="flex-1 w-px bg-gray-200"></div>
          <span className="py-2 text-xs text-gray-400">oder</span>
          <div className="flex-1 w-px bg-gray-200"></div>
        </div>

        {/* Right Column - Alternative Methods */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Passkey Login */}
          <button
            onClick={handlePasskeyLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center justify-center gap-2 shadow-sm"
          >
            <Fingerprint size={18} />
            Passkey
          </button>

          {/* OTP / Email Code */}
          {loginMethod === 'password' && (
            <button
              onClick={() => { setLoginMethod('otp'); setOtpStep('request'); setError('') }}
              className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-700 flex items-center justify-center gap-2"
            >
              <Smartphone size={18} />
              E-Mail Code
            </button>
          )}

          {/* Google */}
          <button
            onClick={() => handleOAuthLogin('google')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-700 flex items-center justify-center gap-2"
          >
            <Chrome size={18} />
            Google
          </button>

          {/* GitHub */}
          <button
            onClick={() => handleOAuthLogin('github')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center gap-2"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </button>

          {/* Microsoft */}
          <button
            onClick={() => handleOAuthLogin('active-directory')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-[#00a4ef] hover:bg-[#0095d9] text-white flex items-center justify-center gap-2"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
            </svg>
            Microsoft
          </button>

          {/* Apple - nur anzeigen wenn auf iOS/macOS */}
          <button
            onClick={() => handleOAuthLogin('apple')}
            className="w-full py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 bg-black hover:bg-gray-900 text-white flex items-center justify-center gap-2"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple
          </button>
        </div>
      </div>

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
