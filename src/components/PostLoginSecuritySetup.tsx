import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, Loader, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import api from '../utils/api'

export interface SecuritySetupStatus {
  role: string
  passwordConfigured: boolean
  passwordRequiredNow: boolean
  canSkipPassword: boolean
  mfaConfigured: boolean
  mfaMethod: 'totp' | 'email' | 'passkey' | null
  mfaDone: boolean
  authMethod: 'emailpassword' | 'passwordless' | 'thirdparty' | 'passkey' | 'unknown'
  passwordLoginRequired: boolean
  mfaRequiredNow: boolean
  canSkipMfa: boolean
  deadline: string
}

type Step = 'password' | 'mfa-choice' | 'mfa-login-choice' | 'totp-setup' | 'totp-challenge' | 'email-code'

interface Props {
  initialStatus: SecuritySetupStatus
  onComplete: () => void
}

function nextMfaStep(status: SecuritySetupStatus): Step | null {
  if (!status.mfaConfigured) return 'mfa-choice'
  if (status.mfaDone || status.mfaMethod === 'passkey') return null
  return status.mfaMethod === 'email' ? 'email-code' : 'mfa-login-choice'
}

export default function PostLoginSecuritySetup({ initialStatus, onComplete }: Props) {
  const customerNeedsPassword = initialStatus.role === 'customer' && !initialStatus.passwordConfigured
  const [status, setStatus] = useState(initialStatus)
  const [step, setStep] = useState<Step>(() => customerNeedsPassword ? 'password' : (nextMfaStep(initialStatus) || 'mfa-choice'))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [totpSetup, setTotpSetup] = useState<{ qrCodeUrl: string; secret: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const refreshStatus = async () => {
    const response = await api.get('/auth/onboarding/status')
    setStatus(response.data)
    return response.data as SecuritySetupStatus
  }

  const continueAfterPassword = async () => {
    const updated = await refreshStatus()
    const next = nextMfaStep(updated)
    if (next) setStep(next)
    else onComplete()
  }

  const setNewPassword = async () => {
    setError('')
    if (password.length < 8) return setError('Das Passwort muss mindestens 8 Zeichen haben.')
    if (password !== confirmPassword) return setError('Die beiden Passwörter stimmen nicht überein.')
    setLoading(true)
    try {
      const response = await api.post('/auth/user/password', { newPassword: password })
      if (response.data.status !== 'OK') throw new Error(response.data.message || 'Das Passwort konnte nicht gespeichert werden.')
      await continueAfterPassword()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Das Passwort konnte nicht gespeichert werden.')
    } finally {
      setLoading(false)
    }
  }

  const skipPassword = () => {
    const next = nextMfaStep(status)
    if (next) setStep(next)
    else onComplete()
  }

  const startTotp = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.post('/auth/totp/create-device')
      setTotpSetup(response.data)
      setStep('totp-setup')
      setCode('')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Die Authenticator-App konnte nicht eingerichtet werden.')
    } finally {
      setLoading(false)
    }
  }

  const requestEmailCode = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/mfa/email/request')
      setEmailSent(true)
      setStep('email-code')
      setCode('')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Der E-Mail-Code konnte nicht versendet werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (step === 'email-code' && !emailSent) requestEmailCode()
  }, [step])

  const verifyTotpSetup = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.post('/auth/totp/verify-device', { totp: code })
      if (response.data.status !== 'OK') throw new Error('Der eingegebene Code ist ungültig.')
      onComplete()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Der eingegebene Code ist ungültig.')
    } finally {
      setLoading(false)
    }
  }

  const verifyTotpLogin = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/totp/verify-login', { totp: code })
      onComplete()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Der eingegebene Code ist ungültig.')
    } finally {
      setLoading(false)
    }
  }

  const verifyEmailCode = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/mfa/email/verify', { code })
      onComplete()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Der eingegebene Code ist ungültig.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        {step === 'password' && (
          <>
            <div className="mb-5 flex items-center gap-3"><KeyRound className="h-7 w-7 text-blue-600" /><div><h2 className="text-xl font-semibold text-slate-900">Jetzt Passwort festlegen</h2><p className="text-sm text-slate-500">Schützen Sie Ihren Zugang zusätzlich mit einem persönlichen Passwort.</p></div></div>
            <div className="space-y-3">
              <input className="auth-input" type="password" autoComplete="new-password" placeholder="Neues Passwort" value={password} onChange={event => setPassword(event.target.value)} />
              <input className="auth-input" type="password" autoComplete="new-password" placeholder="Passwort wiederholen" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
            </div>
            <div className="mt-5 flex flex-col gap-2"><button className="auth-button" disabled={loading} onClick={setNewPassword}>{loading && <Loader className="h-4 w-4 animate-spin" />} Passwort speichern</button>{status.canSkipPassword && <button className="py-2 text-sm text-slate-500 hover:text-slate-800" onClick={skipPassword}>Passwort später festlegen</button>}</div>
          </>
        )}

        {step === 'mfa-choice' && (
          <>
            <div className="mb-5 flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-blue-600" /><div><h2 className="text-xl font-semibold text-slate-900">Zwei-Faktor-Authentifizierung einrichten</h2><p className="text-sm text-slate-500">Wählen Sie, wie Sie zukünftige Anmeldungen bestätigen möchten.</p></div></div>
            <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><span>Die Zwei-Faktor-Authentifizierung ist ab dem 01.10.2026 verpflichtend. Richten Sie sie am besten jetzt ein.</span></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50" onClick={startTotp}><Smartphone className="mb-2 h-6 w-6 text-blue-600" /><strong className="block text-slate-900">Authenticator-App</strong><span className="text-sm text-slate-500">QR-Code mit einer TOTP-App scannen</span></button>
              <button className="rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50" onClick={requestEmailCode}><Mail className="mb-2 h-6 w-6 text-blue-600" /><strong className="block text-slate-900">E-Mail-Code</strong><span className="text-sm text-slate-500">Bei jeder Anmeldung einen Code erhalten</span></button>
            </div>
            {status.canSkipMfa && <button className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-800" onClick={onComplete}>Zunächst überspringen</button>}
          </>
        )}

        {step === 'mfa-login-choice' && (
          <>
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck className="h-7 w-7 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Anmeldung bestätigen</h2>
                <p className="text-sm text-slate-500">Wählen Sie den zweiten Faktor für diese Anmeldung.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50" onClick={() => { setCode(''); setError(''); setStep('totp-challenge') }}>
                <Smartphone className="mb-2 h-6 w-6 text-blue-600" />
                <strong className="block text-slate-900">Authenticator-App</strong>
                <span className="text-sm text-slate-500">Code aus Ihrer eingerichteten App verwenden</span>
              </button>
              <button className="rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50" onClick={requestEmailCode}>
                <Mail className="mb-2 h-6 w-6 text-blue-600" />
                <strong className="block text-slate-900">E-Mail-Code</strong>
                <span className="text-sm text-slate-500">Einmalcode an Ihre E-Mail-Adresse senden</span>
              </button>
            </div>
            <p className="mt-4 text-center text-xs text-slate-500">Nach erfolgreicher Bestätigung bleibt dieses Gerät 90 Tage vertrauenswürdig.</p>
          </>
        )}

        {step === 'totp-setup' && totpSetup && (
          <>
            <h2 className="text-xl font-semibold text-slate-900">Authenticator-App verbinden</h2><p className="mt-1 text-sm text-slate-500">Scannen Sie den QR-Code und geben Sie anschließend den sechsstelligen Code ein.</p>
            <img className="mx-auto my-5 h-56 w-56 rounded-xl border p-2" src={totpSetup.qrCodeUrl} alt="QR-Code für die Zwei-Faktor-Authentifizierung" />
            <p className="mb-4 break-all rounded-lg bg-slate-50 p-3 text-center font-mono text-sm">{totpSetup.secret}</p>
            <input className="auth-input text-center text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button className="auth-button mt-4" disabled={loading || code.length !== 6} onClick={verifyTotpSetup}>Einrichtung bestätigen</button>
          </>
        )}

        {step === 'totp-challenge' && (
          <><h2 className="text-xl font-semibold text-slate-900">Anmeldung bestätigen</h2><p className="mb-5 mt-1 text-sm text-slate-500">Geben Sie den Code aus Ihrer Authenticator-App ein.</p><input className="auth-input text-center text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button className="auth-button mt-4" disabled={loading || code.length !== 6} onClick={verifyTotpLogin}>Anmeldung bestätigen</button><button className="mt-3 w-full py-2 text-sm text-blue-600 hover:text-blue-800" disabled={loading} onClick={requestEmailCode}>Stattdessen E-Mail-Code verwenden</button></>
        )}

        {step === 'email-code' && (
          <><div className="mb-5 flex items-center gap-3"><Mail className="h-7 w-7 text-blue-600" /><div><h2 className="text-xl font-semibold text-slate-900">E-Mail-Code eingeben</h2><p className="text-sm text-slate-500">Wir haben einen sechsstelligen Sicherheitscode an Ihre E-Mail-Adresse gesendet.</p></div></div><input className="auth-input text-center text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /><button className="auth-button mt-4" disabled={loading || code.length !== 6} onClick={verifyEmailCode}>Code bestätigen</button><button className="mt-3 w-full py-2 text-sm text-blue-600 hover:text-blue-800" disabled={loading} onClick={requestEmailCode}>Neuen Code senden</button>{status.mfaMethod === 'totp' && <button className="mt-1 w-full py-2 text-sm text-slate-500 hover:text-slate-800" onClick={() => { setCode(''); setError(''); setStep('totp-challenge') }}>Stattdessen Authenticator-App verwenden</button>}</>
        )}

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      </div>
    </div>
  )
}
