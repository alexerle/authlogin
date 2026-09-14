const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveServiceMfaRequirement, resolveServiceSecurityCompliance } = require('./security-policy')

test('uses the service-specific MFA policy when present', () => {
  assert.equal(resolveServiceMfaRequirement(true, {
    policies: [{ service: 'hosting-panel', enabled: false }],
  }, 'hosting-panel'), false)
  assert.equal(resolveServiceMfaRequirement(false, {
    policies: [{ service: 'hosting-panel', enabled: true }],
  }, 'hosting-panel'), true)
})

test('falls back to the identity security profile without a service policy', () => {
  assert.equal(resolveServiceMfaRequirement(true, null, 'hosting-panel'), true)
  assert.equal(resolveServiceMfaRequirement(false, { policies: [] }, 'hosting-panel'), false)
})

test('service compliance honors disabled service MFA without weakening password checks', () => {
  const base = {
    security: { mfaRequiredNow: true, passwordRequiredNow: false, passwordConfigured: true },
    sessionMfaDone: false,
    passwordLoginRequired: false,
    policiesPayload: { policies: [{ service: 'crm', enabled: false }] },
    service: 'crm',
  }

  assert.deepEqual(resolveServiceSecurityCompliance(base), { mfaRequired: false, compliant: true })
  assert.equal(resolveServiceSecurityCompliance({
    ...base,
    security: { ...base.security, passwordRequiredNow: true, passwordConfigured: false },
  }).compliant, false)
})

test('service compliance requires MFA when the service policy enables it', () => {
  const result = resolveServiceSecurityCompliance({
    security: { mfaRequiredNow: false, passwordRequiredNow: false, passwordConfigured: true },
    sessionMfaDone: false,
    passwordLoginRequired: false,
    policiesPayload: { policies: [{ service: 'crm', enabled: true }] },
    service: 'crm',
  })

  assert.deepEqual(result, { mfaRequired: true, compliant: false })
})
