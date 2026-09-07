import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Shield, KeyRound, Smartphone, ArrowLeft, Loader,
  CheckCircle, AlertCircle, Copy, Eye, EyeOff, Trash2, Fingerprint,
} from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'
import Logo from '../components/Logo'
import api from '../utils/api'

interface UserInfo {
  id: string
  email: string
  role: string
  name?: string
}

interface TotpStatus {
  enabled: boolean
  deviceCount: number
}

interface PasskeyEntry {
  id: string
  deviceName: string
  createdAt: string
  lastUsedAt: string | null
}

export default function AccountPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSetup = searchParams.get('setup') === '1'
  const nextUrl = searchParams.get('next') || '/services'
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [totpStatus, setTotpStatus] = useState<TotpStatus>({ enabled: false, deviceCount: 0 })
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([])
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyMsg, setPasskeyMsg] = useState('')

  // TOTP Setup State
  const [totpSetup, setTotpSetup] = useState<{ qrUrl: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)
  const [totpMsg, setTotpMsg] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)

  // Password Change State
  const [pwOld, setPwOld] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [userRes, totpRes] = await Promise.all([
        api.get('/auth/session/user'),
        api.get('/auth/totp/status').catch(() => ({ data: { enabled: false, deviceCount: 0 } })),
      ])
      if (userRes.data.status === 'OK') setUser(userRes.data.user)
      else { navigate('/login'); return }
      setTotpStatus(totpRes.data)
      const passkeyRes = await api.get('/auth/passkeys').catch(() => ({ data: { passkeys: [] } }))
      setPasskeys(passkeyRes.data.passkeys || [])
    } catch {
      navigate('/login')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTotpCreate = async () => {
    setTotpLoading(true)
    setTotpMsg('')
    try {
      const res = await api.post('/auth/totp/create-device')
      if (res.data.status === 'OK') {
        setTotpSetup({ qrUrl: res.data.qrCodeUrl, secret: res.data.secret })
      }
    } catch {
      setTotpMsg('Fehler beim Erstellen des 2FA-Geräts.')
    } finally {
      setTotpLoading(false)
    }
  }

  const handleTotpVerify = async () => {
    if (totpCode.length !== 6) return
    setTotpLoading(true)
    setTotpMsg('')
    try {
      const res = await api.post('/auth/totp/verify-device', { totp: totpCode })
      if (res.data.status === 'OK') {
        setTotpSetup(null)
        setTotpCode('')
        setTotpMsg('✓ 2FA erfolgreich eingerichtet!')
        setTotpStatus({ enabled: true, deviceCount: 1 })
      } else {
        setTotpMsg('Ungültiger Code. Bitte erneut versuchen.')
      }
    } catch {
      setTotpMsg('Ungültiger Code.')
    } finally {
      setTotpLoading(false)
    }
  }

  const handleTotpRemove = async () => {
    if (!confirm('2FA wirklich deaktivieren? Ihr Konto wird weniger sicher.')) return
    setTotpLoading(true)
    try {
      await api.delete('/auth/totp/device')
      setTotpStatus({ enabled: false, deviceCount: 0 })
      setTotpMsg('2FA wurde deaktiviert.')
    } catch {
      setTotpMsg('Fehler beim Deaktivieren.')
    } finally {
      setTotpLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwNew || pwNew.length < 8) { setPwMsg('Passwort muss mindestens 8 Zeichen haben.'); return }
    if (!isSetup && !pwOld) { setPwMsg('Bitte aktuelles Passwort eingeben.'); return }
    setPwLoading(true)
    setPwMsg('')
    try {
      const res = await api.post('/auth/user/password', { oldPassword: pwOld, newPassword: pwNew })
      if (res.data.status === 'OK') {
        setPwMsg('✓ Passwort erfolgreich gesetzt.')
        setPwOld(''); setPwNew('')
        if (isSetup) {
          setTimeout(() => { window.location.href = nextUrl }, 1200)
        }
      } else {
        setPwMsg(res.data.message || 'Altes Passwort falsch.')
      }
    } catch {
      setPwMsg('Fehler beim Ändern des Passworts.')
    } finally {
      setPwLoading(false)
    }
  }

  const handlePasskeyCreate = async () => {
    setPasskeyLoading(true)
    setPasskeyMsg('')
    try {
      const optionsRes = await api.post('/auth/passkeys/register-options')
      const credential = await startRegistration({ optionsJSON: optionsRes.data.options })
      const deviceName = window.prompt('Name für diesen Passkey', 'Mein Gerät') || 'Mein Gerät'
      const verifyRes = await api.post('/auth/passkeys/register-verify', {
        credential,
        challenge: optionsRes.data.challenge,
        deviceName,
      })
      if (verifyRes.data.status === 'OK') {
        setPasskeyMsg('Passkey wurde gespeichert.')
        const listRes = await api.get('/auth/passkeys')
        setPasskeys(listRes.data.passkeys || [])
      } else {
        setPasskeyMsg(verifyRes.data.message || 'Passkey konnte nicht gespeichert werden.')
      }
    } catch (err: any) {
      setPasskeyMsg(err.response?.data?.message || err.message || 'Passkey konnte nicht gespeichert werden.')
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handlePasskeyDelete = async (id: string) => {
    if (!confirm('Passkey wirklich entfernen?')) return
    setPasskeyLoading(true)
    setPasskeyMsg('')
    try {
      await api.delete(`/auth/passkeys/${id}`)
      setPasskeys(prev => prev.filter(pk => pk.id !== id))
      setPasskeyMsg('Passkey wurde entfernt.')
    } catch {
      setPasskeyMsg('Passkey konnte nicht entfernt werden.')
    } finally {
      setPasskeyLoading(false)
    }
  }

  const copySecret = () => {
    if (totpSetup?.secret) {
      navigator.clipboard.writeText(totpSetup.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-800">{user?.name || user?.email}</p>
              {user?.name && <p className="text-xs text-gray-400">{user?.email}</p>}
            </div>
            <button onClick={() => navigate('/services')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-4 h-4" /> Zurück
            </button>
          </div>
        </div>

        {isSetup ? (
          <div className="bg-blue-600 text-white rounded-2xl p-5 mb-4 flex items-start gap-3">
            <KeyRound className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Passwort festlegen</p>
              <p className="text-sm text-blue-100 mt-0.5">Lege ein Passwort für deinen Account fest, damit du dich zukünftig ohne Login-Code anmelden kannst.</p>
            </div>
          </div>
        ) : (
          <h1 className="text-lg font-semibold text-gray-800 mb-4 px-1">Konto & Sicherheit</h1>
        )}

        {/* 2FA / TOTP */}
        {!isSetup && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Zwei-Faktor-Authentifizierung</h2>
              <p className="text-xs text-gray-400">TOTP mit Authenticator-App</p>
            </div>
            {totpStatus.enabled && (
              <span className="ml-auto text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Aktiv
              </span>
            )}
          </div>

          {totpMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm mb-4 ${totpMsg.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {totpMsg.startsWith('✓') ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {totpMsg}
            </div>
          )}

          {!totpStatus.enabled && !totpSetup && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Schütze dein Konto mit einer Authenticator-App (z.B. Google Authenticator, Authy).
              </p>
              <button onClick={handleTotpCreate} disabled={totpLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition">
                {totpLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                2FA einrichten
              </button>
            </div>
          )}

          {totpSetup && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Scanne den QR-Code mit deiner Authenticator-App, dann gib den 6-stelligen Code ein.
              </p>
              {/* QR Code */}
              <div className="flex justify-center">
                <img src={totpSetup.qrUrl} alt="QR Code" className="w-48 h-48 border border-gray-200 rounded-xl p-2" />
              </div>
              {/* Secret */}
              <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-2">
                <code className="text-xs text-gray-600 font-mono break-all flex-1">
                  {showSecret ? totpSetup.secret : '•'.repeat(32)}
                </code>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setShowSecret(!showSecret)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={copySecret} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                    <Copy className="w-4 h-4" />
                  </button>
                  {copied && <span className="text-xs text-green-600 self-center">Kopiert!</span>}
                </div>
              </div>
              {/* Verify */}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-stelliger Code"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono tracking-widest"
                  autoFocus
                />
                <button onClick={handleTotpVerify} disabled={totpLoading || totpCode.length !== 6}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition flex items-center gap-1.5">
                  {totpLoading && <Loader className="w-3.5 h-3.5 animate-spin" />}
                  Bestätigen
                </button>
              </div>
              <button onClick={() => { setTotpSetup(null); setTotpCode('') }}
                className="text-sm text-gray-400 hover:text-gray-600">
                Abbrechen
              </button>
            </div>
          )}

          {totpStatus.enabled && !totpSetup && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">2FA ist aktiv. Dein Konto ist geschützt.</p>
              <button onClick={handleTotpRemove} disabled={totpLoading}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-1.5 hover:bg-red-50 rounded-lg transition">
                <Trash2 className="w-3.5 h-3.5" />
                Deaktivieren
              </button>
            </div>
          )}
        </div>

        )}

        {!isSetup && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-800">Passkeys</h2>
                <p className="text-xs text-gray-400">Fingerabdruck, Face ID, Windows Hello oder Sicherheitsschluessel</p>
              </div>
              <button
                onClick={handlePasskeyCreate}
                disabled={passkeyLoading}
                className="ml-auto flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition"
              >
                {passkeyLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                Passkey hinzufuegen
              </button>
            </div>

            {passkeyMsg && (
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                {passkeyMsg}
              </div>
            )}

            <div className="space-y-2">
              {passkeys.length === 0 ? (
                <p className="text-sm text-gray-500">Noch kein Passkey hinterlegt.</p>
              ) : passkeys.map((passkey) => (
                <div key={passkey.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{passkey.deviceName}</p>
                    <p className="text-xs text-gray-400">
                      Angelegt am {new Date(passkey.createdAt).toLocaleDateString('de-DE')}
                      {passkey.lastUsedAt ? ` · Zuletzt genutzt ${new Date(passkey.lastUsedAt).toLocaleDateString('de-DE')}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePasskeyDelete(passkey.id)}
                    disabled={passkeyLoading}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Passkey entfernen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Passwort ändern */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">{isSetup ? 'Passwort festlegen' : 'Passwort ändern'}</h2>
              <p className="text-xs text-gray-400">Mindestens 8 Zeichen</p>
            </div>
          </div>

          {pwMsg && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm mb-4 ${pwMsg.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {pwMsg.startsWith('✓') ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              {pwMsg}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-3">
            {!isSetup && (
              <input type="password" placeholder="Aktuelles Passwort" value={pwOld}
                onChange={e => setPwOld(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
            <input type="password" placeholder="Neues Passwort (min. 8 Zeichen)" value={pwNew}
              onChange={e => setPwNew(e.target.value)} required autoFocus={isSetup}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" disabled={pwLoading}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition ${isSetup ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300' : 'bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300'}`}>
              {pwLoading && <Loader className="w-3.5 h-3.5 animate-spin" />}
              {isSetup ? 'Passwort festlegen & weiter' : 'Passwort ändern'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} 10hoch2 ·{' '}
          <a href="https://10hoch2.de/datenschutz" className="hover:text-gray-600">Datenschutz</a>
        </p>
      </div>
    </div>
  )
}
