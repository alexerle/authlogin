const MAX_PROFILE_NAME_LENGTH = 100

function normalizeProfileName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function validateProfileNames(firstNameValue, lastNameValue) {
  const firstName = normalizeProfileName(firstNameValue)
  const lastName = normalizeProfileName(lastNameValue)

  if (!firstName || !lastName) {
    return { ok: false, message: 'Vorname und Nachname sind erforderlich.' }
  }
  if (firstName.length > MAX_PROFILE_NAME_LENGTH || lastName.length > MAX_PROFILE_NAME_LENGTH) {
    return { ok: false, message: `Vorname und Nachname dürfen jeweils höchstens ${MAX_PROFILE_NAME_LENGTH} Zeichen haben.` }
  }
  if (/\p{C}/u.test(firstName) || /\p{C}/u.test(lastName)) {
    return { ok: false, message: 'Vorname oder Nachname enthält ungültige Zeichen.' }
  }

  return { ok: true, firstName, lastName, name: `${firstName} ${lastName}` }
}

function readCompleteProfile(metadataEntries) {
  for (const entry of metadataEntries || []) {
    const result = validateProfileNames(entry?.metadata?.firstName, entry?.metadata?.lastName)
    if (result.ok) return result
  }
  return { ok: false, firstName: '', lastName: '', name: '' }
}

module.exports = { MAX_PROFILE_NAME_LENGTH, normalizeProfileName, readCompleteProfile, validateProfileNames }
