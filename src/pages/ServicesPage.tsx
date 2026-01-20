import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, BarChart3, Users, Settings, LogOut, ExternalLink, User } from 'lucide-react'
import Logo from '../components/Logo'
import api from '../utils/api'

interface UserInfo {
  id: string
  email: string
  name?: string
}

interface Service {
  id: string
  name: string
  description: string
  url: string
  icon: React.ReactNode
  color: string
}

const SERVICES: Service[] = [
  {
    id: 'eazyfind',
    name: 'eazyfind Dashboard',
    description: 'Verwaltung Ihrer Shop-Suche',
    url: 'https://login.eazyfind.me',
    icon: <Search className="w-6 h-6" />,
    color: 'from-blue-500 to-purple-600',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Statistiken und Auswertungen',
    url: 'https://analytics.10hoch2.de',
    icon: <BarChart3 className="w-6 h-6" />,
    color: 'from-green-500 to-teal-600',
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Kundenverwaltung',
    url: 'https://crm.10hoch2.de',
    icon: <Users className="w-6 h-6" />,
    color: 'from-orange-500 to-red-600',
  },
  {
    id: 'admin',
    name: 'Admin Panel',
    description: 'Systemverwaltung',
    url: 'https://admin.10hoch2.de',
    icon: <Settings className="w-6 h-6" />,
    color: 'from-gray-600 to-gray-800',
  },
]

export default function ServicesPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  const checkSession = async () => {
    try {
      const response = await api.get('/auth/session/verify')
      if (response.data.status === 'OK') {
        setUser({
          id: response.data.session?.userId,
          email: response.data.session?.email || '',
          name: response.data.session?.name,
        })
      } else {
        navigate('/login')
      }
    } catch (err) {
      navigate('/login')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await api.post('/auth/signout')
    } catch (err) {
      // Ignore errors
    }
    navigate('/login')
  }

  const handleServiceClick = (service: Service) => {
    // Redirect to service with auth token
    window.location.href = `${service.url}?from=auth`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Angemeldet als</p>
                <p className="font-medium text-gray-800">{user?.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/account')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                  title="Konto verwalten"
                >
                  <User size={20} />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Abmelden"
                >
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Ihre Dienste</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SERVICES.map((service) => (
              <button
                key={service.id}
                onClick={() => handleServiceClick(service)}
                className="group p-6 rounded-xl border border-gray-200 hover:border-transparent hover:shadow-lg transition-all duration-200 text-left"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${service.color} text-white shadow-lg`}>
                    {service.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition">
                        {service.name}
                      </h3>
                      <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-600 transition" />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-white/80 text-sm">
            © {new Date().getFullYear()} 10hoch2 GmbH ·
            <a href="https://10hoch2.de/datenschutz" className="hover:text-white ml-2">Datenschutz</a> ·
            <a href="https://10hoch2.de/impressum" className="hover:text-white ml-2">Impressum</a>
          </p>
        </div>
      </div>
    </div>
  )
}
