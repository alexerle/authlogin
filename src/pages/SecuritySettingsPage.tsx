import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Smartphone, Fingerprint, Loader, AlertCircle, CheckCircle, Trash2, Plus, ArrowLeft, Copy, QrCode } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import api from '../utils/api'

interface Passkey {
  credentialId: string
  name: string
  createdAt: number
}

interface SecurityStatus {
  totpEnabled: boolean
  passkeyEnabled: boolean
  passkeyCount: number
}

export default function SecuritySettingsPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])

  // TOTP Setup State
  const [showTotpSetup, setShowTotpSetup] = useState(false)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpOtpauthUrl, setTotpOtpauthUrl] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpLoading, setTotpLoading] = useState(false)

  // Passkey Setup State
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [newPasskeyName, setNewPasskeyName] = useState('')

  // Load security status
  useEffect(() => {
    loadSecurityStatus()
  }, [])

  const loadSecurityStatus = async () => {
    try {
      const [userResponse, passkeysResponse] = await Promise.all([
        api.get('/auth/user'),
        api.get('/auth/passkey/list'),
      ])

      if (userResponse.data.status === 'OK') {
        setSecurityStatus(userResponse.data.user.security)
      }

      if (passkeysResponse.data.status === 'OK') {
        setPasskeys(passkeysResponse.data.passkeys)
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login')
      } else {
        setError('Fehler beim Laden der Sicherheitseinstellungen')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ==================== TOTP Functions ====================

  const startTotpSetup = async () => {
    setTotpLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/totp/setup')

      if (response.data.status === 'OK') {
        setTotpSecret(response.data.secret)
        setTotpOtpauthUrl(response.data.otpauthUrl)
        setShowTotpSetup(true)
      } else {
        setError(response.data.message || 'TOTP-Setup fehlgeschlagen')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'TOTP-Setup fehlgeschlagen')
    } finally {
      setTotpLoading(false)
    }
  }

  const verifyTotpSetup = async () => {
    if (totpCode.length !== 6) {
      setError('Bitte geben Sie den 6-stelligen Code ein')
      return
    }

    setTotpLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/totp/verify', { code: totpCode })

      if (response.data.status === 'OK') {
        setSuccess('Authenticator-App erfolgreich aktiviert!')
        setShowTotpSetup(false)
        setTotpCode('')
        loadSecurityStatus()
      } else {
        setError(response.data.message || 'Ungültiger Code')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ungültiger Code')
    } finally {
      setTotpLoading(false)
    }
  }

  const disableTotp = async () => {
    const code = prompt('Geben Sie Ihren aktuellen TOTP-Code ein, um die 2FA zu deaktivieren:')
    if (!code) return

    setTotpLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/totp/disable', { code })

      if (response.data.status === 'OK') {
        setSuccess('Authenticator-App deaktiviert')
        loadSecurityStatus()
      } else {
        setError(response.data.message || 'Deaktivierung fehlgeschlagen')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Deaktivierung fehlgeschlagen')
    } finally {
      setTotpLoading(false)
    }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret)
    setSuccess('Secret kopiert!')
    setTimeout(() => setSuccess(''), 2000)
  }

  // ==================== Passkey Functions ====================

  const addPasskey = async () => {
    setPasskeyLoading(true)
    setError('')

    try {
      // Get registration options
      const optionsResponse = await api.post('/auth/passkey/register/options')

      if (optionsResponse.data.status !== 'OK') {
        throw new Error(optionsResponse.data.message)
      }

      const options = optionsResponse.data.options

      // Convert challenge from base64url
      options.challenge = Uint8Array.from(
        atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
      )

      // Convert user ID
      options.user.id = Uint8Array.from(
        atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
      )

      // Convert exclude credentials
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(
            atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
          ),
        }))
      }

      // Create credential
      const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential

      if (!credential) {
        throw new Error('Passkey-Erstellung abgebrochen')
      }

      const response = credential.response as AuthenticatorAttestationResponse

      // Complete registration
      const completeResponse = await api.post('/auth/passkey/register/complete', {
        credential: {
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
          response: {
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            publicKey: response.getPublicKey ? btoa(String.fromCharCode(...new Uint8Array(response.getPublicKey()!))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : undefined,
            transports: response.getTransports ? response.getTransports() : undefined,
          },
          type: credential.type,
        },
        name: newPasskeyName || undefined,
      })

      if (completeResponse.data.status === 'OK') {
        setSuccess('Passkey erfolgreich hinzugefügt!')
        setNewPasskeyName('')
        loadSecurityStatus()
      } else {
        throw new Error(completeResponse.data.message)
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey-Erstellung abgebrochen')
      } else {
        setError(err.message || 'Passkey-Erstellung fehlgeschlagen')
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  const deletePasskey = async (credentialId: string, name: string) => {
    if (!confirm(`Passkey "${name}" wirklich löschen?`)) return

    setPasskeyLoading(true)
    setError('')

    try {
      const response = await api.delete(`/auth/passkey/${encodeURIComponent(credentialId)}`)

      if (response.data.status === 'OK') {
        setSuccess('Passkey gelöscht')
        loadSecurityStatus()
      } else {
        setError(response.data.message || 'Löschen fehlgeschlagen')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Löschen fehlgeschlagen')
    } finally {
      setPasskeyLoading(false)
    }
  }

  // ==================== Render ====================

  if (isLoading) {
    return (
      <AuthLayout title="Sicherheit">
        <div className="flex justify-center py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Sicherheitseinstellungen">
      {/* Back Button */}
      <button
        onClick={() => navigate('/services')}
        className="mb-4 text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1"
      >
        <ArrowLeft size={16} />
        Zurück
      </button>

      {/* Messages */}
      {error && (
        <div className="auth-error mb-4">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="auth-success mb-4">
          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* ==================== TOTP Section ==================== */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${securityStatus?.totpEnabled ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Smartphone className={`w-5 h-5 ${securityStatus?.totpEnabled ? 'text-green-600' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800">Authenticator-App</h3>
                {securityStatus?.totpEnabled && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Aktiv</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Verwenden Sie eine Authenticator-App wie Google Authenticator, Authy oder 1Password für zusätzliche Sicherheit.
              </p>

              {/* TOTP Setup Form */}
              {showTotpSetup && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-3">
                      Scannen Sie den QR-Code mit Ihrer Authenticator-App:
                    </p>
                    {/* QR Code würde hier mit einer Library wie qrcode.react gerendert */}
                    <div className="bg-white p-4 inline-block rounded-lg border border-gray-200 mb-3">
                      <div className="flex items-center justify-center gap-2 text-gray-400">
                        <QrCode size={48} />
                        <span className="text-xs">QR-Code</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 break-all max-w-xs">
                        {totpOtpauthUrl}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">Oder geben Sie den Code manuell ein:</p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="px-3 py-1.5 bg-gray-100 rounded text-sm font-mono">{totpSecret}</code>
                      <button onClick={copySecret} className="p-1.5 text-gray-500 hover:text-blue-600">
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bestätigungscode eingeben:
                    </label>
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="auth-input text-center text-lg tracking-widest font-mono"
                      maxLength={6}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowTotpSetup(false)}
                      className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={verifyTotpSetup}
                      disabled={totpLoading || totpCode.length !== 6}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 text-sm flex items-center justify-center gap-2"
                    >
                      {totpLoading && <Loader size={14} className="animate-spin" />}
                      Aktivieren
                    </button>
                  </div>
                </div>
              )}

              {/* TOTP Actions */}
              {!showTotpSetup && (
                <div className="mt-3">
                  {securityStatus?.totpEnabled ? (
                    <button
                      onClick={disableTotp}
                      disabled={totpLoading}
                      className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                      {totpLoading && <Loader size={14} className="animate-spin" />}
                      Deaktivieren
                    </button>
                  ) : (
                    <button
                      onClick={startTotpSetup}
                      disabled={totpLoading}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      {totpLoading && <Loader size={14} className="animate-spin" />}
                      <Plus size={14} />
                      Einrichten
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================== Passkeys Section ==================== */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${passkeys.length > 0 ? 'bg-purple-100' : 'bg-gray-100'}`}>
              <Fingerprint className={`w-5 h-5 ${passkeys.length > 0 ? 'text-purple-600' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800">Passkeys</h3>
                {passkeys.length > 0 && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                    {passkeys.length} registriert
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Passkeys ermöglichen passwortloses Anmelden mit Fingerabdruck, Face ID oder Hardware-Key.
              </p>

              {/* Passkeys List */}
              {passkeys.length > 0 && (
                <div className="mt-3 space-y-2">
                  {passkeys.map((passkey) => (
                    <div
                      key={passkey.credentialId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{passkey.name}</p>
                        <p className="text-xs text-gray-500">
                          Erstellt: {new Date(passkey.createdAt).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                      <button
                        onClick={() => deletePasskey(passkey.credentialId, passkey.name)}
                        disabled={passkeyLoading}
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Passkey */}
              <div className="mt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPasskeyName}
                    onChange={(e) => setNewPasskeyName(e.target.value)}
                    placeholder="Name (optional)"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={addPasskey}
                    disabled={passkeyLoading}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400 text-sm flex items-center gap-1"
                  >
                    {passkeyLoading && <Loader size={14} className="animate-spin" />}
                    <Plus size={14} />
                    Hinzufügen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== Security Status Summary ==================== */}
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">Sicherheitsstatus</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              {securityStatus?.totpEnabled ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={securityStatus?.totpEnabled ? 'text-green-700' : 'text-gray-500'}>
                Authenticator-App
              </span>
            </div>
            <div className="flex items-center gap-2">
              {passkeys.length > 0 ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
              <span className={passkeys.length > 0 ? 'text-green-700' : 'text-gray-500'}>
                Passkeys ({passkeys.length})
              </span>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
