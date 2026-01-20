interface LogoProps {
  className?: string
  size?: 'small' | 'medium' | 'large'
}

export default function Logo({ className = '', size = 'medium' }: LogoProps) {
  const sizes = {
    small: 'w-12 h-12',
    medium: 'w-20 h-20',
    large: 'w-28 h-28',
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img
        src="/logo.png"
        alt="10hoch2"
        className={`${sizes[size]} object-contain`}
      />
    </div>
  )
}
