function resolveServiceMfaRequirement(profileRequired, policiesPayload, service) {
  const policies = Array.isArray(policiesPayload?.policies) ? policiesPayload.policies : []
  const policy = policies.find(candidate => candidate?.service === service)
  return policy ? policy.enabled === true : profileRequired === true
}

module.exports = { resolveServiceMfaRequirement }
