interface LogoProps {
  className?: string
  showText?: boolean
  white?: boolean
}

export default function Logo({ className = '', showText = true, white = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/10hoch2-logo.png?v=20260513-2"
        alt="10hoch2"
        className="w-9 h-9 rounded-lg object-contain"
      />
      {showText && (
        <div className="flex flex-col">
          <span className={`text-xl font-bold leading-tight ${white ? 'text-white' : 'text-gray-800'}`}>
            10hoch2
          </span>
          <span className={`text-xs -mt-0.5 ${white ? 'text-blue-300' : 'text-gray-400'}`}>
            Zentraler Login
          </span>
        </div>
      )}
    </div>
  )
}
