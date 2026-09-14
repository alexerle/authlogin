const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveServiceMfaRequirement } = require('./security-policy')

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
