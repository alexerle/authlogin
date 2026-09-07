import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, BarChart3, Settings, LogOut, User,
  Globe, Headphones, Building2, ChevronRight, Loader,
  Shield, AlertCircle, UsersRound, Briefcase, FileSignature, Bot,
} from 'lucide-react'
import Logo from '../components/Logo'
import api from '../utils/api'

interface UserInfo {
  id: string
  email: string
  role: 'admin' | 'support' | 'partner' | 'customer'
  name?: string
  totpEnabled?: boolean
  mfaDone?: boolean
  services?: string[]
}

interface ServiceDef {
  id: string
  name: string
  description: string
  url: string             // Ziel-URL nach erfolgreichem Login
  ssoCallbackUrl?: string // SSO-Callback-Endpunkt (falls abweichend von url)
  targetDomain?: string   // gesetzt wenn Cross-Domain Handoff nötig
  icon: React.ReactNode
  color: string
  bgColor: string
  roles: string[]         // welche Rollen sehen diesen Dienst
  requiresService?: string // nur anzeigen wenn user.services diesen Wert enthält
  badge?: string
}

const ALL_SERVICES: ServiceDef[] = [
  {
    id: 'betterassist',
    name: 'BetterAssist',
    description: 'KI-Assistenten und Shop-Beratung verwalten',
    url: 'https://v2.betterassist.me',
    ssoCallbackUrl: 'https://v2.betterassist.me/auth/callback',
    targetDomain: 'v2.betterassist.me',
    icon: <Bot className="w-5 h-5" />,
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    roles: ['customer', 'partner', 'admin', 'support'],
    requiresService: 'betterassist',
  },
  {
    id: 'crm-portal',
    name: 'CRM Kundenportal',
    description: 'Kundenbereich, Verträge, Rechnungen & Support',
    url: 'https://crm.10hoch2.de',
    ssoCallbackUrl: 'https://crm.10hoch2.de/auth/callback',
    targetDomain: 'crm.10hoch2.de',
    icon: <Building2 className="w-5 h-5" />,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    roles: ['customer', 'partner', 'admin', 'support'],
  },
  {
    id: 'hosting-panel',
    name: 'Hosting Panel',
    description: 'Server, Domains & Konfiguration',
    url: 'https://cp.zhzcloud.de',
    ssoCallbackUrl: 'https://cp.zhzcloud.de/api/auth/sso',
    targetDomain: 'cp.zhzcloud.de',
    icon: <Settings className="w-5 h-5" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    roles: ['admin', 'support', 'partner', 'customer'],
    requiresService: 'hosting-panel',
  },
  {
    id: 'access-portal',
    name: 'ZHZ Access Portal',
    description: 'Sichere Server- und App-Zugriffe',
    url: 'https://web.zhzcloud.de',
    ssoCallbackUrl: 'https://web.zhzcloud.de/api/access/sso',
    targetDomain: 'web.zhzcloud.de',
    icon: <Shield className="w-5 h-5" />,
    color: 'text-teal-700',
    bgColor: 'bg-teal-50',
    roles: ['admin', 'support', 'partner', 'customer'],
    requiresService: 'access-portal',
  },
  {
    id: 'eazyfind-admin',
    name: 'eazyfind Admin',
    description: 'Kunden, Abos & Einstellungen',
    url: 'https://login.eazyfind.me',
    // kein targetDomain: eazyfind hat eigene Auth, kein SSO-Callback implementiert
    icon: <Search className="w-5 h-5" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    roles: ['admin', 'support'],
    badge: 'Admin',
  },
  {
    id: 'eazyfind',
    name: 'eazyfind Dashboard',
    description: 'Verwaltung Ihrer Shop-Suche',
    url: 'https://login.eazyfind.me',
    icon: <Search className="w-5 h-5" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    roles: ['customer', 'partner'],
    requiresService: 'eazyfind',
  },
  {
    id: 'portal',
    name: 'Kundenportal',
    description: 'Verträge, Rechnungen & Services',
    url: 'https://portal.10hoch2.de',
    icon: <Building2 className="w-5 h-5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    roles: ['customer', 'partner', 'admin', 'support'],
    requiresService: 'portal',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Statistiken und Auswertungen',
    url: 'https://analytics.10hoch2.de/index.php?module=LoginOIDC&action=signin',
    icon: <BarChart3 className="w-5 h-5" />,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    roles: ['admin', 'support'],
    requiresService: 'analytics',
  },
  {
    id: 'projektverwaltung',
    name: 'Projektverwaltung',
    description: 'Aufgaben, Projekte & Zeiterfassung',
    url: 'https://pm.10hoch2.de',
    icon: <Briefcase className="w-5 h-5" />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    roles: ['admin', 'support', 'partner', 'customer'],
    requiresService: 'pm',
  },
  {
    id: 'tickets',
    name: 'Support-Tickets',
    description: 'Anfragen & Helpdesk',
    url: 'https://service.10hoch2.de/auth/openid_connect',
    icon: <Headphones className="w-5 h-5" />,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    roles: ['admin', 'support', 'customer', 'partner'],
    requiresService: 'tickets',
  },
  {
    id: 'sign',
    name: 'Sign / Verträge',
    description: 'Verträge, Vorlagen und Signaturvorgänge verwalten',
    url: 'https://sign.10hoch2.de',
    icon: <FileSignature className="w-5 h-5" />,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    roles: ['admin', 'support'],
    requiresService: 'sign',
  },
  {
    id: 'website',
    name: '10hoch2.de',
    description: 'Unternehmenswebsite',
    url: 'https://10hoch2.de',
    icon: <Globe className="w-5 h-5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    roles: ['admin'],
  },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  support: 'Support',
  partner: 'Partner',
  customer: 'Kunde',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  support: 'bg-yellow-100 text-yellow-700',
  partner: 'bg-violet-100 text-violet-700',
  customer: 'bg-blue-100 text-blue-700',
}

export default function ServicesPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openingService, setOpeningService] = useState<string | null>(null)

  // TOTP Challenge State
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', ''])
  const [totpLoading, setTotpLoading] = useState(false)
  const [totpError, setTotpError] = useState('')
  const totpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { loadUser() }, [])

  const loadUser = async () => {
    try {
      const res = await api.get('/auth/session/user')
      if (res.data.status === 'OK') {
        setUser(res.data.user)
      } else {
        navigate('/login')
      }
    } catch {
      navigate('/login')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try { await api.post('/auth/signout') } catch (_) {}
    navigate('/login')
  }

  const handleTotpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return
    const next = [...totpCode]
    next[index] = value
    setTotpCode(next)
    if (value && index < 5) totpRefs.current[index + 1]?.focus()
    if (value && index === 5 && next.every(d => d !== '')) handleTotpVerify(next.join(''))
  }

  const handleTotpVerify = async (code?: string) => {
    const codeStr = code || totpCode.join('')
    if (codeStr.length !== 6) return
    setTotpLoading(true)
    setTotpError('')
    try {
      const res = await api.post('/auth/totp/verify-login', { totp: codeStr })
      if (res.data.status === 'OK') {
        // Reload user info - mfaDone is now true in the session
        const userRes = await api.get('/auth/session/user')
        if (userRes.data.status === 'OK') setUser(userRes.data.user)
      } else {
        setTotpError('Ungültiger Code. Bitte erneut versuchen.')
        setTotpCode(['', '', '', '', '', ''])
        totpRefs.current[0]?.focus()
      }
    } catch {
      setTotpError('Ungültiger Code. Bitte erneut versuchen.')
      setTotpCode(['', '', '', '', '', ''])
      totpRefs.current[0]?.focus()
    } finally {
      setTotpLoading(false)
    }
  }

  const handleServiceClick = async (service: ServiceDef) => {
    setOpeningService(service.id)
    // Signal for the login page: this click came from the services page → auto-complete OIDC without confirmation
    localStorage.setItem('oidcFromServices', Date.now().toString())
    try {
      if (service.targetDomain) {
        // Cross-Domain: Handoff-Token anfordern
        const res = await api.post('/auth/handoff-token', { targetDomain: service.targetDomain })
        if (res.data.status === 'OK') {
          const callbackUrl = service.ssoCallbackUrl || service.url
          const sep = callbackUrl.includes('?') ? '&' : '?'
          window.open(`${callbackUrl}${sep}sso_token=${res.data.token}`, '_blank')
        } else {
          // Fallback: direkt öffnen
          window.open(service.url, '_blank')
        }
      } else {
        // Gleiche Domain-Familie (*.10hoch2.de): Session-Cookie reicht
        window.open(service.url, '_blank')
      }
    } catch {
      window.open(service.url, '_blank')
    } finally {
      setOpeningService(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  // Show TOTP challenge if 2FA is enabled but not yet verified this session
  if (user && user.totpEnabled && !user.mfaDone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex justify-center mb-5">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                <Shield className="w-7 h-7 text-blue-600" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 text-center mb-1">Zwei-Faktor-Authentifizierung</h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              Bitte geben Sie den Code aus Ihrer Authenticator-App ein.
            </p>

            {totpError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {totpError}
              </div>
            )}

            <div className="flex justify-center gap-2 mb-4"
              onPaste={(e) => {
                e.preventDefault()
                const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                if (pasted.length === 6) {
                  setTotpCode(pasted.split(''))
                  handleTotpVerify(pasted)
                }
              }}
            >
              {totpCode.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { totpRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleTotpChange(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Backspace' && !totpCode[i] && i > 0) totpRefs.current[i - 1]?.focus() }}
                  disabled={totpLoading}
                  autoFocus={i === 0}
                  className="w-11 h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              ))}
            </div>

            <button
              onClick={() => handleTotpVerify()}
              disabled={totpLoading || totpCode.some(d => d === '')}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {totpLoading && <Loader className="w-4 h-4 animate-spin" />}
              Bestätigen
            </button>

            <button onClick={handleLogout} className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600 py-1">
              Abmelden
            </button>
          </div>
        </div>
      </div>
    )
  }

  const visibleServices = ALL_SERVICES.filter(s => {
    if (!user) return false
    if (s.id === 'portal' || s.id === 'website') return false
    if (!s.roles.includes(user.role)) return false
    if (s.requiresService) {
      return (user.services || []).includes(s.requiresService)
    }
    return true
  })

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-800">{user?.name || user?.email}</p>
              {user?.name && <p className="text-xs text-gray-400">{user.email}</p>}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[user?.role || 'customer']}`}>
              {ROLE_LABELS[user?.role || 'customer']}
            </span>
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/users')}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                title="Userverwaltung"
              >
                <UsersRound size={18} />
              </button>
            )}
            <button
              onClick={() => navigate('/account')}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Konto"
            >
              <User size={18} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              title="Abmelden"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Ihre Dienste</h2>
          <p className="text-sm text-gray-400 mb-6">
            Wählen Sie einen Dienst um fortzufahren
          </p>

          {/* Admin-only: Userverwaltung */}
          {user?.role === 'admin' && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Administration</p>
              <button
                onClick={() => navigate('/users')}
                className="group flex items-center gap-4 p-4 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 hover:shadow-md transition-all duration-150 text-left w-full"
              >
                <div className="p-2.5 rounded-lg bg-blue-100 flex-shrink-0">
                  <span className="text-blue-600"><UsersRound className="w-5 h-5" /></span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800 text-sm group-hover:text-gray-900">Userverwaltung</span>
                  <p className="text-xs text-gray-400 mt-0.5">Accounts, Rollen & Verknüpfungen</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleServices.map((service) => (
              <button
                key={service.id}
                onClick={() => handleServiceClick(service)}
                disabled={openingService === service.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-150 text-left disabled:opacity-60"
              >
                <div className={`p-2.5 rounded-lg ${service.bgColor} flex-shrink-0`}>
                  <span className={service.color}>
                    {openingService === service.id
                      ? <Loader className="w-5 h-5 animate-spin" />
                      : service.icon
                    }
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm group-hover:text-gray-900">
                      {service.name}
                    </span>
                    {service.badge && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {service.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{service.description}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>

          {visibleServices.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p>Keine Dienste verfügbar.</p>
              <p className="text-sm mt-1">Bitte kontaktieren Sie den Support.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-xs mt-6">
          © {new Date().getFullYear()} 10hoch2 GmbH ·{' '}
          <a href="https://10hoch2.de/datenschutz" className="hover:text-white/90">Datenschutz</a> ·{' '}
          <a href="https://10hoch2.de/impressum" className="hover:text-white/90">Impressum</a>
        </p>
      </div>
    </div>
  )
}
