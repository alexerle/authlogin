const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  FileHandoffV2ReplayStore,
  InMemoryHandoffV2ReplayStore,
  createHandoffV2Token,
  verifyAndConsumeHandoffV2Token,
} = require('./handoff-v2')

const secret = 'test-only-handoff-v2-secret-with-at-least-32-bytes'
const targetDomain = 'v2.betterassist.me'
const nowMs = Date.parse('2026-08-27T12:00:00.000Z')

function token(overrides = {}) {
  return createHandoffV2Token({
    secret,
    userId: 'auth-user-1',
    role: 'customer',
    name: 'Test User',
    targetDomain,
    mfaDone: true,
    authMethod: 'emailpassword',
    nowMs,
    jti: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  })
}

test('signs all security-relevant BetterAssist claims', () => {
  const value = token()
  const verified = verifyAndConsumeHandoffV2Token({
    token: value,
    secret,
    expectedTargetDomain: targetDomain,
    replayStore: new InMemoryHandoffV2ReplayStore(),
    nowMs: nowMs + 1000,
  })
  assert.equal(verified.v, 2)
  assert.equal(verified.targetDomain, targetDomain)
  assert.equal(verified.mfaDone, true)
  assert.equal(verified.authMethod, 'emailpassword')
})

test('rejects a changed MFA claim', () => {
  const value = token()
  const [encoded, signature] = value.split('.')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  payload.mfaDone = false
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`
  assert.throws(() => verifyAndConsumeHandoffV2Token({
    token: tampered,
    secret,
    expectedTargetDomain: targetDomain,
    replayStore: new InMemoryHandoffV2ReplayStore(),
    nowMs: nowMs + 1000,
  }), /Invalid/)
})

test('binds the token to the exact BetterAssist target', () => {
  assert.throws(() => verifyAndConsumeHandoffV2Token({
    token: token(),
    secret,
    expectedTargetDomain: 'evil.v2.betterassist.me',
    replayStore: new InMemoryHandoffV2ReplayStore(),
    nowMs: nowMs + 1000,
  }), /Invalid/)
})

test('consumes every jti exactly once', () => {
  const replayStore = new InMemoryHandoffV2ReplayStore()
  const value = token()
  const input = {
    token: value,
    secret,
    expectedTargetDomain: targetDomain,
    replayStore,
    nowMs: nowMs + 1000,
  }
  assert.doesNotThrow(() => verifyAndConsumeHandoffV2Token(input))
  assert.throws(() => verifyAndConsumeHandoffV2Token(input), /already used/)
})

test('persists replay consumption across store instances', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betterassist-handoff-v2-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const value = token()
  const input = {
    token: value,
    secret,
    expectedTargetDomain: targetDomain,
    nowMs: nowMs + 1000,
  }

  assert.doesNotThrow(() => verifyAndConsumeHandoffV2Token({
    ...input,
    replayStore: new FileHandoffV2ReplayStore(directory),
  }))
  assert.throws(() => verifyAndConsumeHandoffV2Token({
    ...input,
    replayStore: new FileHandoffV2ReplayStore(directory),
  }), /already used/)
})

test('rejects expired tokens and weak secrets', () => {
  assert.throws(() => verifyAndConsumeHandoffV2Token({
    token: token(),
    secret,
    expectedTargetDomain: targetDomain,
    replayStore: new InMemoryHandoffV2ReplayStore(),
    nowMs: nowMs + 61_000,
  }), /Invalid/)
  assert.throws(() => token({ secret: 'short' }), /32 bytes/)
})
