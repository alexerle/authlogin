const assert = require('node:assert/strict')
const test = require('node:test')

const { nextLogoutUrl, safeFinalUrl } = require('./logout-chain')

const websiteDomain = 'https://auth.10hoch2.de'
const endpoints = ['https://crm.10hoch2.de/logout', 'https://cp.zhzcloud.de/logout']

test('keeps the final redirect on the auth origin', () => {
  assert.equal(safeFinalUrl('/login?service=crm', websiteDomain), 'https://auth.10hoch2.de/login?service=crm')
  assert.equal(safeFinalUrl('https://evil.example/', websiteDomain), 'https://auth.10hoch2.de/login')
})

test('allows only the BetterAssist login entry as a cross-origin logout destination', () => {
  assert.equal(
    safeFinalUrl('https://app1.betterassist.me/auth/login?return_path=%2Fapp', websiteDomain),
    'https://app1.betterassist.me/auth/login?return_path=%2Fapp',
  )
  assert.equal(
    safeFinalUrl('https://v2.betterassist.me/auth/login?return_path=%2Fapp%2Faccount', websiteDomain),
    'https://v2.betterassist.me/auth/login?return_path=%2Fapp%2Faccount',
  )
  assert.equal(safeFinalUrl('https://app1.betterassist.me/app', websiteDomain), 'https://auth.10hoch2.de/login')
  assert.equal(safeFinalUrl('https://app1.betterassist.me/auth/login?return_path=https%3A%2F%2Fevil.example', websiteDomain), 'https://auth.10hoch2.de/login')
  assert.equal(safeFinalUrl('https://app1.betterassist.me/auth/login?return_path=%2F%2Fevil.example', websiteDomain), 'https://auth.10hoch2.de/login')
})

test('builds a fixed sequential service logout chain', () => {
  const first = new URL(nextLogoutUrl({ step: 0, finalUrl: '/login', websiteDomain, endpoints }))
  assert.equal(first.origin + first.pathname, endpoints[0])
  const continuation = new URL(first.searchParams.get('return'))
  assert.equal(continuation.origin, websiteDomain)
  assert.equal(continuation.searchParams.get('step'), '1')

  const second = new URL(nextLogoutUrl({ step: 1, finalUrl: continuation.searchParams.get('redirect'), websiteDomain, endpoints }))
  assert.equal(second.origin + second.pathname, endpoints[1])
  assert.equal(nextLogoutUrl({ step: 2, finalUrl: '/login', websiteDomain, endpoints }), `${websiteDomain}/login`)
})
