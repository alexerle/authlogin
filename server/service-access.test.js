const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isBetterAssistRegistrationHandoff,
  updateProvisionedServices,
} = require('./service-access')

test('service grants and revocations are idempotent', () => {
  assert.deepEqual(updateProvisionedServices(['crm'], 'betterassist', true), ['crm', 'betterassist'])
  assert.deepEqual(
    updateProvisionedServices(['crm', 'betterassist'], 'betterassist', true),
    ['crm', 'betterassist'],
  )
  assert.deepEqual(updateProvisionedServices(['crm', 'betterassist'], 'betterassist', false), ['crm'])
})

test('unknown services are rejected', () => {
  assert.throws(() => updateProvisionedServices([], 'arbitrary-service', true), /invalid_service_access/)
})

test('only the explicit BetterAssist registration handoff bypasses prior service access', () => {
  assert.equal(isBetterAssistRegistrationHandoff('v2.betterassist.me', 'registration'), true)
  assert.equal(isBetterAssistRegistrationHandoff('app1.betterassist.me', 'registration'), true)
  assert.equal(isBetterAssistRegistrationHandoff('v2.betterassist.me', ''), false)
  assert.equal(isBetterAssistRegistrationHandoff('crm.10hoch2.de', 'registration'), false)
})
