const test = require('node:test')
const assert = require('node:assert/strict')
const { readCompleteProfile, validateProfileNames } = require('./profile-fields')

test('validates and normalizes mandatory profile names', () => {
  assert.deepEqual(validateProfileNames('  Anna   Maria ', ' Muster '), {
    ok: true,
    firstName: 'Anna Maria',
    lastName: 'Muster',
    name: 'Anna Maria Muster',
  })
})

test('rejects incomplete and oversized profile names', () => {
  assert.equal(validateProfileNames('', 'Muster').ok, false)
  assert.equal(validateProfileNames('Anna', '').ok, false)
  assert.equal(validateProfileNames('A'.repeat(101), 'Muster').ok, false)
})

test('does not guess separated names from the legacy name field', () => {
  assert.equal(readCompleteProfile([{ metadata: { name: 'Anna Muster' } }]).ok, false)
  assert.equal(readCompleteProfile([
    { metadata: { name: 'Altbestand' } },
    { metadata: { firstName: 'Anna', lastName: 'Muster' } },
  ]).name, 'Anna Muster')
})
