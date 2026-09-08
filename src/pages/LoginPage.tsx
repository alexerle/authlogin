import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Mail, Lock, Loader, AlertCircle, KeyRound, ArrowLeft, Fingerprint } from 'lucide-react'
import { startAuthentication } from '@simplewebauthn/browser'
import AuthLayout from '../components/AuthLayout'
import { isAllowedRedirect } from '../config/supertokens'
import api from '../utils/api'
import { requestTurnstileToken } from '../utils/turnstile'
import PostLoginSecuritySetup, { type SecuritySetupStatus } from '../components/PostLoginSecuritySetup'

type LoginMethod = 'otp' | 'password' | 'passkey'
type OtpStep = 'request' | 'verify'
interface OtpSession { preAuthSessionId: string; deviceId: string }

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const inferredEntry = (() => {
    const explicitRedirect = searchParams.get('redirect') || ''
    const explicitService = searchParams.get('service') || ''
    if (explicitRedirect || explicitService || typeof document === 'undefined') {
      return { redirect: explicitRedirect, service: explicitService }
    }
    try {
      const referrerHost = new URL(document.referrer).hostname
      if (referrerHost === 'crm.10hoch2.de' || referrerHost === 'crm.cp.zhzcloud.de') {
        return {
          redirect: `https://${referrerHost}/auth/callback?next=%2Fdashboard`,
          service: referrerHost,
        }
      }
      if (referrerHost === 'cp.zhzcloud.de') {
        return { redirect: 'https://cp.zhzcloud.de/api/auth/sso', service: 'cp.zhzcloud.de' }
      }
      if (referrerHost === 'web.zhzcloud.de') {
        return { redirect: 'https://web.zhzcloud.de/api/access/sso', service: 'web.zhzcloud.de' }
      }
    } catch (_) {}
    return { redirect: '', service: '' }
  })()
  const redirectUrl = inferredEntry.redirect
  const serviceName = inferredEntry.service
  const forceLogin = searchParams.get('prompt') === 'login'
  const loginHint = searchParams.get('login_hint') || ''
  const handoffPurpose = searchParams.get('purpose') === 'registration' ? 'registration' : undefined
  const registerHref = `/register${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const crmFallback = 'https://crm.10hoch2.de/auth/callback?next=%2Fdashboard'
  const redirectTargetHost = (() => {
    try {
      return redirectUrl ? new URL(redirectUrl).hostname : ''
    } catch {
      return ''
    }
  })()
  const handoffDomains = ['crm.10hoch2.de', 'crm.cp.zhzcloud.de', 'cp.zhzcloud.de', 'web.zhzcloud.de', 'zhzcloud.de', 'login.eazyfind.me', 'v2.betterassist.me']
  const needsHandoff = handoffDomains.includes(redirectTargetHost) || handoffDomains.includes(serviceName)

  const [email, setEmail] = useState(loginHint)
  const [password, setPassword] = useState('')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('otp')
  const [otpStep, setOtpStep] = useState<OtpStep>('request')
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', ''])
  const [otpSession, setOtpSession] = useState<OtpSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isCheckingOidc, setIsCheckingOidc] = useState(searchParams.get('mode') === 'oidc')
  const [oidcActiveUser, setOidcActiveUser] = useState<{ email: string; name?: string } | null>(null)
  const [securitySetup, setSecuritySetup] = useState<{ status: SecuritySetupStatus; token: string; isOtp: boolean } | null>(null)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const loginErrorMessage = (err: any, fallback: string) => {
    const message = err?.response?.data?.message
    return message === 'try refresh token'
      ? 'Die alte Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.'
      : message || fallback
  }

  const clearStaleSession = async () => {
    localStorage.removeItem('anti-csrf-token')
    try { await api.post('/auth/signout', {}, { skipAuthRefresh: true } as any) } catch (_) {}
  }

  // Save OIDC state to sessionStorage on load (survives tab state changes)
  useEffect(() => {
    const mode = searchParams.get('mode')
    const oidcKey = searchParams.get('oidc_key')
    if (mode === 'oidc') {
      sessionStorage.setItem('oidcMode', 'true')
      if (oidcKey) sessionStorage.setItem('oidcKey', oidcKey)
      // Check if already logged in → show confirmation screen (not auto-redirect, user may want to switch)
      api.get('/auth/session/user', { skipAuthRefresh: true } as any).then(res => {
        if (res.data.status === 'OK') {
          // If clicked from services page within the last 10s → auto-complete silently
          const fromServices = localStorage.getItem('oidcFromServices')
          if (fromServices && Date.now() - parseInt(fromServices) < 10000) {
            localStorage.removeItem('oidcFromServices')
            handleLoginSuccess('', false)
            return
          }
          setOidcActiveUser({ email: res.data.user.email, name: res.data.user.name })
        }
        setIsCheckingOidc(false)
      }).catch(async (err) => {
        if (err?.response?.data?.message === 'try refresh token') await clearStaleSession()
        setIsCheckingOidc(false)
      })
    }
  }, [])

  const handleOidcSwitchUser = async () => {
    try { await api.post('/auth/signout') } catch (_) {}
    setOidcActiveUser(null)
  }

  // Cooldown timer
  useEffect(() => {
    if (otpCooldown > 0) {
      const timer = setTimeout(() => setOtpCooldown(otpCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [otpCooldown])

  const completeOidcFlow = () => {
    const key = searchParams.get('oidc_key') || sessionStorage.getItem('oidcKey')
    sessionStorage.removeItem('oidcMode')
    sessionStorage.removeItem('oidcKey')
    window.location.href = key ? `/oauth/complete?oidc_key=${key}` : '/oauth/complete'
  }

  const completeHandoff = async () => {
    const targetDomain = redirectTargetHost || serviceName || 'crm.10hoch2.de'
    const res = await api.post('/auth/handoff-token', { targetDomain, purpose: handoffPurpose })
    if (res.data.status !== 'OK' || !res.data.token) {
      throw new Error('SSO handoff failed')
    }

    const callbackUrl = redirectUrl || crmFallback
    const callback = new URL(callbackUrl)
    callback.searchParams.set('sso_token', res.data.token)
    window.location.href = callback.toString()
  }

  const redirectAfterHandoffFailure = () => {
    if (redirectTargetHost === 'cp.zhzcloud.de') {
      window.location.href = 'https://cp.zhzcloud.de/auth/login?error=sso_failed'
    } else if (redirectTargetHost === 'web.zhzcloud.de') {
      window.location.href = 'https://web.zhzcloud.de/?legacy=1&sso_error=no_service_access'
    } else if (redirectTargetHost === 'v2.betterassist.me') {
      window.location.href = 'https://v2.betterassist.me/auth/login?error=sso_failed'
    } else {
      window.location.href = crmFallback
    }
  }

  useEffect(() => {
    if (!redirectUrl || !isAllowedRedirect(redirectUrl) || !needsHandoff) return

    let cancelled = false
    if (forceLogin) {
      clearStaleSession().catch(() => undefined)
      return () => {
        cancelled = true
      }
    }
    api.get('/auth/session/user', { skipAuthRefresh: true } as any).then(res => {
      if (!cancelled && res.data.status === 'OK') {
        handleLoginSuccess('', false).catch(() => {
          if (!cancelled) redirectAfterHandoffFailure()
        })
      }
    }).catch(async (err) => {
      if (err?.response?.data?.message === 'try refresh token') await clearStaleSession()
    })

    return () => {
      cancelled = true
    }
  }, [])

  // Handle successful login
  const continueAfterLogin = async (_token: string, isOtp = false) => {
    const mode = searchParams.get('mode') || sessionStorage.getItem('oidcMode')
    if (mode === 'oidc' || mode === 'true') {
      // After OTP login: check if user needs to set a password first
      if (isOtp) {
        try {
          const res = await api.get('/auth/user/needs-password')
          if (res.data.needsPassword) {
            const key = searchParams.get('oidc_key') || sessionStorage.getItem('oidcKey')
            const next = key ? `/oauth/complete?oidc_key=${key}` : '/oauth/complete'
            sessionStorage.removeItem('oidcMode')
            sessionStorage.removeItem('oidcKey')
            navigate(`/account?setup=1&next=${encodeURIComponent(next)}`)
            return
          }
        } catch (_) {}
      }
      completeOidcFlow()
      return
    }
    if (redirectUrl && isAllowedRedirect(redirectUrl) && needsHandoff) {
      try {
        await completeHandoff()
        return
      } catch (_) {
        redirectAfterHandoffFailure()
        return
      }
    }
    if (redirectUrl && isAllowedRedirect(redirectUrl)) {
      const separator = redirectUrl.includes('?') ? '&' : '?'
      window.location.href = `${redirectUrl}${separator}token=${_token}`
    } else {
      window.location.href = serviceName === 'crm.10hoch2.de' || serviceName === 'crm.cp.zhzcloud.de'
        ? `${crmFallback}&token=${encodeURIComponent(_token)}`
        : '/services'
    }
  }

  const handleLoginSuccess = async (_token: string, isOtp = false) => {
    try {
      const serviceManagesOwnMfa = serviceName === 'web.zhzcloud.de' || redirectTargetHost === 'web.zhzcloud.de'
      if (serviceManagesOwnMfa) {
        await continueAfterLogin(_token, isOtp)
        return
      }
      const response = await api.get('/auth/onboarding/status')
      const status = response.data as SecuritySetupStatus
      if (status.passwordLoginRequired) {
        await clearStaleSession()
        setLoginMethod('password')
        setOtpStep('request')
        setOtpSession(null)
        setOtpCode(['', '', '', '', '', ''])
        setError('Ab dem 01.10.2026 ist die Anmeldung mit Passwort und einem zweiten Faktor erforderlich. Bitte melden Sie sich jetzt mit Ihrem Passwort an.')
        return
      }
      const customerNeedsPassword = status.role === 'customer' && !status.passwordConfigured
      const needsSecuritySetup = customerNeedsPassword
        || !status.mfaConfigured
        || (status.mfaRequiredNow && !status.mfaDone)

      if (needsSecuritySetup) {
        setSecuritySetup({ status, token: _token, isOtp })
        return
      }
      await continueAfterLogin(_token, isOtp)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Der Sicherheitsstatus konnte nicht geprüft werden. Bitte versuchen Sie es erneut.')
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
      await clearStaleSession()
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
      setError(loginErrorMessage(err, 'Login fehlgeschlagen'))
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
      await clearStaleSession()
      const securityResponse = await api.get('/auth/security/turnstile/config')
      const turnstileToken = await requestTurnstileToken(securityResponse.data.siteKey)
      const res = await api.post('/auth/signinup/code', { email }, {
        headers: { 'x-turnstile-token': turnstileToken },
      })
      // Store deviceId + preAuthSessionId returned by SuperTokens for the consume step
      setOtpSession({
        preAuthSessionId: res.data.preAuthSessionId,
        deviceId: res.data.deviceId,
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
        setError(loginErrorMessage(err, 'Fehler beim Senden des Codes'))
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
      await clearStaleSession()
      const response = await api.post('/auth/signinup/code/consume', {
        preAuthSessionId: otpSession?.preAuthSessionId,
        deviceId: otpSession?.deviceId,
        userInputCode: codeToVerify,
      })

      if (response.data.status === 'OK') {
        const token = response.data.accessToken || response.data.session?.accessToken
        handleLoginSuccess(token, true)  // isOtp=true
      } else {
        setError(response.data.message || 'Ungültiger Code')
        setOtpCode(['', '', '', '', '', ''])
        otpInputRefs.current[0]?.focus()
      }
    } catch (err: any) {
      setError(loginErrorMessage(err, 'Ungültiger Code'))
      setOtpCode(['', '', '', '', '', ''])
      otpInputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    setError('')
    setSuccessMessage('')
    setIsLoading(true)
    try {
      await clearStaleSession()
      const optionsRes = await api.post('/auth/passkeys/login-options', { email: email || undefined })
      const credential = await startAuthentication({ optionsJSON: optionsRes.data.options })
      const verifyRes = await api.post('/auth/passkeys/login-verify', {
        credential,
        challenge: optionsRes.data.challenge,
      })
      if (verifyRes.data.status === 'OK') {
        await handleLoginSuccess('passkey')
      } else {
        setError(verifyRes.data.message || 'Passkey-Login fehlgeschlagen')
      }
    } catch (err: any) {
      setError(loginErrorMessage(err, err.message || 'Passkey-Login fehlgeschlagen'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isCheckingOidc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (oidcActiveUser) {
    return (
      <AuthLayout title="Anmelden" subtitle={serviceName ? `bei ${serviceName}` : ''}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {(oidcActiveUser.name || oidcActiveUser.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              {oidcActiveUser.name && <p className="text-sm font-medium text-gray-800 truncate">{oidcActiveUser.name}</p>}
              <p className="text-sm text-gray-500 truncate">{oidcActiveUser.email}</p>
            </div>
          </div>
          <button onClick={() => handleLoginSuccess('', false)} className="auth-button">
            Weiter als {oidcActiveUser.name || oidcActiveUser.email.split('@')[0]}
          </button>
          <button
            onClick={handleOidcSwitchUser}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 flex items-center justify-center gap-1.5"
          >
            <ArrowLeft size={14} /> Anderes Konto verwenden
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Willkommen zurück"
      subtitle={serviceName ? `Anmelden bei ${serviceName}` : 'Melden Sie sich an'}
    >
      {securitySetup && (
        <PostLoginSecuritySetup
          initialStatus={securitySetup.status}
          onComplete={() => {
            const pending = securitySetup
            setSecuritySetup(null)
            continueAfterLogin(pending.token, pending.isOtp).catch(() => {
              setError('Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.')
            })
          }}
        />
      )}
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

      {otpStep === 'request' && (
        <div className="mb-6 grid grid-cols-3 rounded-xl border border-gray-200 bg-gray-50 p-1">
          {[
            { id: 'otp' as const, label: 'E-Mail Code', icon: Mail },
            { id: 'password' as const, label: 'Passwort', icon: KeyRound },
            { id: 'passkey' as const, label: 'Passkey', icon: Fingerprint },
          ].map((item) => {
            const Icon = item.icon
            const active = loginMethod === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setLoginMethod(item.id)
                  setError('')
                  setSuccessMessage('')
                }}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition sm:text-sm ${
                  active
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      )}

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
                className="auth-input pl-11"
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
                className="auth-input pl-11"
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
                className="auth-input pl-11"
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
        </form>
      )}

      {loginMethod === 'passkey' && (
        <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Fingerprint className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-700" />
            <div>
              <p className="text-sm font-semibold text-blue-950">Mit Passkey anmelden</p>
              <p className="mt-1 text-sm leading-5 text-blue-800">
                Nutzen Sie Fingerabdruck, Face ID, Windows Hello oder einen Sicherheitsschlüssel.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={isLoading}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800"
          >
            {isLoading && <Loader size={16} className="mr-2 animate-spin" />}
            Passkey verwenden
          </button>
        </div>
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
              setOtpSession(null)
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
        <Link to={registerHref} className="text-sm auth-link font-medium">
          Jetzt registrieren
        </Link>
      </div>
    </AuthLayout>
  )
}
