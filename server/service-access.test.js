const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isBetterAssistRegistrationContext,
  isBetterAssistHandoffTarget,
  isBetterAssistRegistrationHandoff,
  shouldLoadCrmSecurityPolicy,
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

test('normal BetterAssist handoffs are delegated only to BetterAssist itself', () => {
  assert.equal(isBetterAssistHandoffTarget('v2.betterassist.me'), true)
  assert.equal(isBetterAssistHandoffTarget('app1.betterassist.me'), true)
  assert.equal(isBetterAssistHandoffTarget('crm.10hoch2.de'), false)
  assert.equal(isBetterAssistHandoffTarget('cp.zhzcloud.de'), false)
  assert.equal(isBetterAssistHandoffTarget('web.zhzcloud.de'), false)
  assert.equal(isBetterAssistHandoffTarget('evil.app1.betterassist.me'), false)
})

test('BetterAssist registration does not depend on CRM security policies', () => {
  assert.equal(isBetterAssistRegistrationContext('betterassist', 'registration'), true)
  assert.equal(isBetterAssistRegistrationContext('v2.betterassist.me', 'registration'), true)
  assert.equal(isBetterAssistRegistrationContext('app1.betterassist.me', 'registration'), true)
  assert.equal(shouldLoadCrmSecurityPolicy({
    targetOrService: 'v2.betterassist.me', purpose: 'registration',
  }), false)
  assert.equal(shouldLoadCrmSecurityPolicy({
    targetOrService: 'betterassist', purpose: 'registration',
  }), false)
})

test('normal service logins keep their CRM security-policy enforcement', () => {
  assert.equal(shouldLoadCrmSecurityPolicy({
    targetOrService: 'v2.betterassist.me', purpose: '',
  }), true)
  assert.equal(shouldLoadCrmSecurityPolicy({
    targetOrService: 'crm', purpose: 'registration',
  }), true)
  assert.equal(shouldLoadCrmSecurityPolicy({
    targetOrService: 'access-portal', purpose: '', centrallyManaged: false,
  }), false)
})
