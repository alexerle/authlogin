import type { ReactNode } from 'react'
import Logo from './Logo'

interface AuthLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Auth Card */}
        <div className="auth-card bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <Logo />
            {title && (
              <h1 className="mt-6 text-2xl font-bold text-gray-800">{title}</h1>
            )}
            {subtitle && (
              <p className="mt-2 text-gray-600 text-center">{subtitle}</p>
            )}
          </div>

          {/* Content */}
          {children}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-center text-gray-500 text-xs">
              © {new Date().getFullYear()} 10hoch2 GmbH
            </p>
            <div className="flex justify-center gap-4 mt-2">
              <a href="https://10hoch2.de/datenschutz" className="text-xs text-gray-400 hover:text-gray-600">
                Datenschutz
              </a>
              <a href="https://10hoch2.de/impressum" className="text-xs text-gray-400 hover:text-gray-600">
                Impressum
              </a>
              <a href="https://10hoch2.de/agb" className="text-xs text-gray-400 hover:text-gray-600">
                AGB
              </a>
            </div>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-4 text-center">
          <p className="text-white text-sm opacity-90">
            Probleme beim Login?{' '}
            <a href="mailto:support@10hoch2.de" className="underline hover:no-underline">
              Support kontaktieren
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
