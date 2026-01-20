interface LogoProps {
  className?: string
  showText?: boolean
}

export default function Logo({ className = '', showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Icon */}
      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-7 h-7 text-white"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M11 8v6" />
          <path d="M8 11h6" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-gray-800">10hoch2</span>
          <span className="text-xs text-gray-500 -mt-1">Auth Portal</span>
        </div>
      )}
    </div>
  )
}
