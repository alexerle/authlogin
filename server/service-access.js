const PROVISIONABLE_SERVICES = new Set([
  'crm', 'betterassist', 'hosting-panel', 'access-portal', 'pm', 'tickets',
  'eazyfind', 'analytics', 'it-audit', 'sign',
])

function updateProvisionedServices(current, service, enabled) {
  if (!PROVISIONABLE_SERVICES.has(service) || typeof enabled !== 'boolean') {
    throw new Error('invalid_service_access')
  }
  const values = Array.isArray(current)
    ? current.filter(value => typeof value === 'string')
    : []
  return enabled
    ? [...new Set([...values, service])]
    : values.filter(value => value !== service)
}

function isBetterAssistRegistrationHandoff(targetDomain, purpose) {
  return targetDomain === 'v2.betterassist.me' && purpose === 'registration'
}

module.exports = {
  PROVISIONABLE_SERVICES,
  updateProvisionedServices,
  isBetterAssistRegistrationHandoff,
}
