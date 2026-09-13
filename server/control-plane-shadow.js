function normalizeServices(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter(service => typeof service === 'string' && service.trim())
    .map(service => service.trim()))].sort()
}

function buildShadowObservation(enforcedAccess, shadowDecision) {
  const enforced = normalizeServices(enforcedAccess?.services)
  const observedLegacy = normalizeServices(shadowDecision?.legacy?.services)
  const central = normalizeServices(shadowDecision?.central?.services)
  return {
    mode: shadowDecision?.mode || 'unknown',
    enforcedDecision: shadowDecision?.enforcedDecision || 'legacy',
    identityStatus: shadowDecision?.identity?.status || 'unknown',
    legacyMatches: JSON.stringify(enforced) === JSON.stringify(observedLegacy),
    onlyEnforced: enforced.filter(service => !observedLegacy.includes(service)),
    onlyObservedLegacy: observedLegacy.filter(service => !enforced.includes(service)),
    centralOnly: central.filter(service => !enforced.includes(service)),
    legacyOnly: enforced.filter(service => !central.includes(service)),
  }
}

module.exports = { buildShadowObservation, normalizeServices }

