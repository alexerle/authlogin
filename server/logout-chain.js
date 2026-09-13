const DEFAULT_LOGOUT_ENDPOINTS = [
  'https://crm.10hoch2.de/api/auth/central-logout',
  'https://cp.zhzcloud.de/api/auth/central-logout',
  'https://web.zhzcloud.de/auth/central-logout',
  'https://app1.betterassist.me/auth/central-logout',
  'https://v2.betterassist.me/auth/central-logout',
  'https://login.eazyfind.me/central-logout',
]

function safeFinalUrl(value, websiteDomain) {
  try {
    const target = new URL(String(value || ''), websiteDomain)
    return target.origin === websiteDomain ? target.toString() : new URL('/login', websiteDomain).toString()
  } catch (_) {
    return new URL('/login', websiteDomain).toString()
  }
}

function configuredLogoutEndpoints(raw) {
  if (!raw) return DEFAULT_LOGOUT_ENDPOINTS
  return String(raw).split(',').map(value => value.trim()).filter(Boolean).map(value => new URL(value).toString())
}

function nextLogoutUrl({ step, finalUrl, websiteDomain, endpoints }) {
  const safeStep = Number.isInteger(step) && step >= 0 ? step : 0
  const safeFinal = safeFinalUrl(finalUrl, websiteDomain)
  if (safeStep >= endpoints.length) return safeFinal

  const continuation = new URL('/auth/signout/continue', websiteDomain)
  continuation.searchParams.set('step', String(safeStep + 1))
  continuation.searchParams.set('redirect', safeFinal)
  const service = new URL(endpoints[safeStep])
  service.searchParams.set('return', continuation.toString())
  return service.toString()
}

module.exports = { DEFAULT_LOGOUT_ENDPOINTS, configuredLogoutEndpoints, nextLogoutUrl, safeFinalUrl }
