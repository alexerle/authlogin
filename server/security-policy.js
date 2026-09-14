function resolveServiceMfaRequirement(profileRequired, policiesPayload, service) {
  const policies = Array.isArray(policiesPayload?.policies) ? policiesPayload.policies : []
  const policy = policies.find(candidate => candidate?.service === service)
  return policy ? policy.enabled === true : profileRequired === true
}

function resolveServiceSecurityCompliance({
  security,
  sessionMfaDone,
  passwordLoginRequired,
  policiesPayload,
  service,
}) {
  const mfaRequired = resolveServiceMfaRequirement(
    security?.mfaRequiredNow,
    policiesPayload,
    service,
  )
  return {
    mfaRequired,
    compliant: (!security?.passwordRequiredNow || security?.passwordConfigured === true)
      && passwordLoginRequired !== true
      && (!mfaRequired || sessionMfaDone === true),
  }
}

module.exports = { resolveServiceMfaRequirement, resolveServiceSecurityCompliance }
