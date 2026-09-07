import type { ReactNode } from 'react'
import { Shield, Server, Search, Users, Headphones, Briefcase, Plus } from 'lucide-react'
import Logo from './Logo'

interface AuthLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

const FEATURES = [
  { icon: <Shield className="w-5 h-5" />, text: 'Sicheres Single Sign-On' },
  { icon: <Headphones className="w-5 h-5" />, text: 'Ticket-System' },
  { icon: <Briefcase className="w-5 h-5" />, text: 'Projektverwaltung' },
  { icon: <Users className="w-5 h-5" />, text: 'Kunden- & Partnerportal' },
  { icon: <Server className="w-5 h-5" />, text: 'Cloud / Hosting' },
  { icon: <Search className="w-5 h-5" />, text: 'eazyfind Produktsuche' },
  { icon: <Plus className="w-5 h-5" />, text: '+ Weitere Dienste' },
]

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">

      {/* Linke Seite — Branding */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)' }}>

        {/* Hintergrund-Deko */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #60a5fa, transparent)' }} />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Logo white />
        </div>

        {/* Mitte — Claim */}
        <div className="relative z-10">
          <h2 className="text-white text-3xl font-bold leading-tight mb-4">
            Ein Login.<br />
            Alle Dienste.
          </h2>
          <p className="text-blue-200 text-base leading-relaxed mb-10">
            Melden Sie sich einmal an und erreichen Sie alle 10hoch2-Services direkt.
          </p>

          <div className="space-y-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-blue-300 flex-shrink-0">
                  {f.icon}
                </div>
                <span className="text-blue-100 text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Unten — Footer */}
        <div className="relative z-10">
          <div className="flex gap-4">
            <a href="https://10hoch2.de/datenschutz" className="text-blue-300/70 hover:text-blue-200 text-xs transition-colors">Datenschutz</a>
            <a href="https://10hoch2.de/impressum" className="text-blue-300/70 hover:text-blue-200 text-xs transition-colors">Impressum</a>
            <a href="https://10hoch2.de/agb" className="text-blue-300/70 hover:text-blue-200 text-xs transition-colors">AGB</a>
          </div>
          <p className="text-blue-300/50 text-xs mt-2">© {new Date().getFullYear()} 10hoch2</p>
        </div>
      </div>

      {/* Rechte Seite — Form */}
      <div className="flex-1 flex flex-col">

        {/* Mobile Logo */}
        <div className="lg:hidden px-6 pt-8 pb-4">
          <Logo />
        </div>

        {/* Form-Bereich */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 bg-gray-50">
          <div className="w-full max-w-md">

            {/* Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 auth-card">
              {(title || subtitle) && (
                <div className="mb-7">
                  {title && <h1 className="text-2xl font-bold text-gray-900">{title}</h1>}
                  {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
                </div>
              )}
              {children}
            </div>

            {/* Support + Footer */}
            <div className="mt-5 flex items-center justify-between text-xs text-gray-400">
              <p>
                Probleme?{' '}
                <a href="mailto:support@10hoch2.de" className="text-blue-600 hover:text-blue-700 hover:underline">
                  support@10hoch2.de
                </a>
              </p>
              <div className="flex gap-3">
                <a href="https://10hoch2.de/datenschutz" className="hover:text-gray-600 lg:hidden">Datenschutz</a>
                <a href="https://10hoch2.de/impressum" className="hover:text-gray-600 lg:hidden">Impressum</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
