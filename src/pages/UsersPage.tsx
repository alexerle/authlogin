import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader, RefreshCw, Trash2, Shield, ChevronDown,
  Users, Link2, AlertCircle, CheckCircle, Search, X,
} from 'lucide-react'
import Logo from '../components/Logo'
import api from '../utils/api'

interface LinkedUser { id: string; recipes: string[] }
interface UserEntry {
  id: string
  email: string
  recipes: string[]
  roles: string[]
  timeJoined: number
  linked: LinkedUser[]
}

const ROLE_OPTIONS = ['superadmin', 'admin', 'support', 'partner', 'customer'] as const
type Role = typeof ROLE_OPTIONS[number]

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin:      'bg-red-100 text-red-700',
  support:    'bg-yellow-100 text-yellow-700',
  partner:    'bg-violet-100 text-violet-700',
  customer:   'bg-blue-100 text-blue-700',
}

const RECIPE_LABELS: Record<string, string> = {
  emailpassword: 'Passwort',
  passwordless:  'OTP',
  thirdparty:    'OAuth',
}

export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserEntry[]>([])
  const [total, setTotal] = useState(0)
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const loadUsers = useCallback(async (token?: string, searchTerm = search, role = roleFilter) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (token) params.set('paginationToken', token)
      if (searchTerm) params.set('search', searchTerm)
      if (role) params.set('role', role)
      const res = await api.get(`/auth/admin/users?${params}`)
      if (res.data.status === 'OK') {
        setUsers(prev => token ? [...prev, ...res.data.users] : res.data.users)
        setTotal(res.data.total)
        setNextToken(res.data.nextPaginationToken)
      }
    } catch (err: any) {
      if (err.response?.status === 403) navigate('/services')
    } finally {
      setIsLoading(false)
    }
  }, [navigate, search, roleFilter])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setUsers([])
    loadUsers(undefined, searchInput, roleFilter)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
    setUsers([])
    loadUsers(undefined, '', roleFilter)
  }

  const handleRoleFilterChange = (role: string) => {
    setRoleFilter(role)
    setUsers([])
    loadUsers(undefined, searchInput, role)
  }

  const handleRoleChange = async (userId: string, role: Role) => {
    setOpenDropdown(null)
    setChangingRole(userId)
    setMsg(null)
    try {
      await api.patch(`/auth/admin/users/${userId}/role`, { role })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: [role] } : u))
      setMsg({ text: 'Rolle gespeichert.', ok: true })
    } catch {
      setMsg({ text: 'Fehler beim Ändern der Rolle.', ok: false })
    } finally {
      setChangingRole(null)
    }
  }

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`User "${email}" wirklich löschen? Dieser Schritt kann nicht rückgängig gemacht werden.`)) return
    setDeletingId(userId)
    setMsg(null)
    try {
      await api.delete(`/auth/admin/users/${userId}`)
      setUsers(prev => prev.filter(u => u.id !== userId))
      setMsg({ text: `User ${email} gelöscht.`, ok: true })
    } catch {
      setMsg({ text: 'Fehler beim Löschen.', ok: false })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <button onClick={() => loadUsers()} disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Aktualisieren">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => navigate('/services')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-4 h-4" /> Zurück
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Userverwaltung</h1>
            <p className="text-xs text-gray-400">{total} User gesamt in SuperTokens</p>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Nach E-Mail suchen…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition">
            Suchen
          </button>
          <select
            value={roleFilter}
            onChange={e => handleRoleFilterChange(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Alle Rollen</option>
            {ROLE_OPTIONS.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </form>

        {/* Status message */}
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm mb-4 ${msg.ok
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {isLoading && users.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">E-Mail</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Login</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rolle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Verknüpft</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Registriert</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Email + ID */}
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{user.email || '—'}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{user.id.slice(0, 8)}…</p>
                      </td>

                      {/* Recipes */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.recipes.map(r => (
                            <span key={r} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                              {RECIPE_LABELS[r] || r}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Role with dropdown */}
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdown(openDropdown === user.id ? null : user.id)}
                            disabled={changingRole === user.id}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition ${ROLE_COLORS[user.roles[0] || 'customer']}`}
                          >
                            {changingRole === user.id
                              ? <Loader className="w-3 h-3 animate-spin" />
                              : <Shield className="w-3 h-3" />}
                            {user.roles[0] || 'keine'}
                            <ChevronDown className="w-3 h-3" />
                          </button>

                          {openDropdown === user.id && (
                            <div className="absolute z-10 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-32"
                              onBlur={() => setOpenDropdown(null)}>
                              {ROLE_OPTIONS.map(role => (
                                <button
                                  key={role}
                                  onClick={() => handleRoleChange(user.id, role)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${user.roles[0] === role ? 'font-semibold' : ''}`}
                                >
                                  <span className={`w-2 h-2 rounded-full ${ROLE_COLORS[role].split(' ')[0]}`} />
                                  {role}
                                  {user.roles[0] === role && <CheckCircle className="w-3 h-3 ml-auto text-green-500" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Linked accounts */}
                      <td className="px-4 py-3">
                        {user.linked.length > 0 ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600">
                            <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="font-medium">{user.linked.length}×</span>
                            <span className="text-gray-400">
                              {user.linked.map(l => l.recipes.map(r => RECIPE_LABELS[r] || r).join('/')).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(user.timeJoined).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(user.id, user.email)}
                          disabled={deletingId === user.id}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="User löschen"
                        >
                          {deletingId === user.id
                            ? <Loader className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Load more */}
          {nextToken && (
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => loadUsers(nextToken)}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
              >
                {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : null}
                Weitere laden
              </button>
            </div>
          )}
        </div>

        {/* Info box: Warum mehrere IDs */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Warum kann eine E-Mail mehrere IDs haben?
          </p>
          <p>
            SuperTokens legt für jede Login-Methode (Passwort, OTP, Google…) einen separaten User-Record an.
            Derselbe Mensch, der sich mit Passwort <em>und</em> per OTP anmeldet, erscheint hier zweimal mit
            derselben E-Mail aber verschiedenen IDs. <strong>Account Linking</strong> (opt-in, SuperTokens v17+)
            würde diese zusammenführen — noch nicht aktiviert. Verknüpfte Accounts werden in der Spalte
            &quot;Verknüpft&quot; angezeigt und teilen automatisch die Rolle (beim nächsten Login).
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} 10hoch2 ·{' '}
          <a href="https://10hoch2.de/datenschutz" className="hover:text-gray-600">Datenschutz</a>
        </p>
      </div>

      {/* Close dropdown on outside click */}
      {openDropdown && (
        <div className="fixed inset-0 z-0" onClick={() => setOpenDropdown(null)} />
      )}
    </div>
  )
}
