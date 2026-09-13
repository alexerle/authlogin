const assert = require('node:assert/strict')
const test = require('node:test')

const { buildShadowObservation, normalizeServices } = require('./control-plane-shadow')

test('normalizes duplicate service values deterministically', () => {
  assert.deepEqual(normalizeServices(['crm', 'tickets', 'crm', null]), ['crm', 'tickets'])
})

test('compares enforced legacy access with the read-only v2 decision', () => {
  assert.deepEqual(buildShadowObservation(
    { services: ['tickets', 'crm'] },
    {
      mode: 'shadow',
      enforcedDecision: 'legacy',
      identity: { status: 'exact_auth_id' },
      legacy: { services: ['crm', 'tickets'] },
      central: { services: ['crm'] },
    },
  ), {
    mode: 'shadow',
    enforcedDecision: 'legacy',
    identityStatus: 'exact_auth_id',
    legacyMatches: true,
    onlyEnforced: [],
    onlyObservedLegacy: [],
    centralOnly: [],
    legacyOnly: ['tickets'],
  })
})

