import { Search, BarChart3, ShoppingCart, Users, Settings, Zap, Globe, Shield } from 'lucide-react'

const apps = [
  { name: 'eazyfind', icon: Search, color: 'from-blue-500 to-purple-600' },
  { name: 'Analytics', icon: BarChart3, color: 'from-green-500 to-teal-600' },
  { name: 'Shop', icon: ShoppingCart, color: 'from-orange-500 to-red-500' },
  { name: 'CRM', icon: Users, color: 'from-pink-500 to-rose-600' },
  { name: 'Admin', icon: Settings, color: 'from-gray-500 to-gray-700' },
  { name: 'API', icon: Zap, color: 'from-yellow-500 to-amber-600' },
  { name: 'Portal', icon: Globe, color: 'from-cyan-500 to-blue-600' },
  { name: 'Security', icon: Shield, color: 'from-indigo-500 to-purple-600' },
]

export default function AppCarousel() {
  return (
    <div className="relative overflow-hidden">
      {/* Gradient Overlays für Fade-Effekt */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

      {/* Scrolling Container */}
      <div className="flex animate-scroll">
        {/* Dupliziere Apps für nahtlose Animation */}
        {[...apps, ...apps].map((app, index) => (
          <div
            key={`${app.name}-${index}`}
            className="flex-shrink-0 mx-2 group"
          >
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center shadow-md transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}
            >
              <app.icon className="w-5 h-5 text-white" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
