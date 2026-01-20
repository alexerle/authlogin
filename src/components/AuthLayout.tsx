import type { ReactNode } from 'react'
import Logo from './Logo'
import AppCarousel from './AppCarousel'

interface AuthLayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Auth Card */}
        <div className="auth-card bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo - zentriert oben */}
          <div className="mb-6 flex flex-col items-center">
            <Logo size="large" />
            <h1 className="mt-4 text-xl font-semibold text-gray-600">Zentraler Login</h1>
          </div>

          {/* Title/Subtitle falls vorhanden */}
          {(title || subtitle) && (
            <div className="mb-6 text-center">
              {title && (
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
              )}
              {subtitle && (
                <p className="mt-1 text-gray-500">{subtitle}</p>
              )}
            </div>
          )}

          {/* Content */}
          {children}

          {/* Animated App Footer */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400 mb-4">Zugang zu allen Diensten</p>
            <AppCarousel />
          </div>
        </div>
      </div>
    </div>
  )
}
