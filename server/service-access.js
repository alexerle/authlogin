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
  return ['v2.betterassist.me', 'app1.betterassist.me'].includes(targetDomain)
    && purpose === 'registration'
}

function isBetterAssistRegistrationContext(targetOrService, purpose) {
  return ['betterassist', 'v2.betterassist.me', 'app1.betterassist.me'].includes(targetOrService)
    && purpose === 'registration'
}

function shouldLoadCrmSecurityPolicy({ targetOrService, purpose, centrallyManaged = true }) {
  return centrallyManaged
    && Boolean(targetOrService)
    && !isBetterAssistRegistrationContext(targetOrService, purpose)
}

module.exports = {
  PROVISIONABLE_SERVICES,
  isBetterAssistRegistrationContext,
  updateProvisionedServices,
  isBetterAssistRegistrationHandoff,
  shouldLoadCrmSecurityPolicy,
}
