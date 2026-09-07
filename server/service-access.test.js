const assert = require('node:assert/strict')
const test = require('node:test')

const { updateProvisionedServices } = require('./service-access')

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
