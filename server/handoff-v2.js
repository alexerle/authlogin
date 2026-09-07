const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const HANDOFF_V2_VERSION = 2
const MAX_TOKEN_LENGTH = 4096
const MAX_LIFETIME_SECONDS = 90

function assertSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Handoff v2 secret must contain at least 32 bytes')
  }
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function safeEqualBase64Url(actual, expected) {
  try {
    const actualBuffer = Buffer.from(actual, 'base64url')
    const expectedBuffer = Buffer.from(expected, 'base64url')
    return actualBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  } catch (_) {
    return false
  }
}

class InMemoryHandoffV2ReplayStore {
  constructor() {
    this.used = new Map()
  }

  consume(jti, expiresAt, nowSeconds) {
    for (const [key, expiry] of this.used) {
      if (expiry <= nowSeconds) this.used.delete(key)
    }
    if (this.used.has(jti)) return false
    this.used.set(jti, expiresAt)
    return true
  }
}

class FileHandoffV2ReplayStore {
  constructor(directory) {
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new Error('Handoff v2 replay directory must be configured')
    }
    this.directory = path.resolve(directory)
    this.lastCleanup = 0
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    fs.accessSync(this.directory, fs.constants.R_OK | fs.constants.W_OK)
  }

  fileFor(jti) {
    const digest = crypto.createHash('sha256').update(jti).digest('hex')
    return path.join(this.directory, digest)
  }

  cleanup(nowSeconds) {
    if (nowSeconds - this.lastCleanup < 300) return
    this.lastCleanup = nowSeconds
    for (const entry of fs.readdirSync(this.directory)) {
      if (!/^[a-f0-9]{64}$/.test(entry)) continue
      const filename = path.join(this.directory, entry)
      try {
        const expiresAt = Number(fs.readFileSync(filename, 'utf8'))
        if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) fs.unlinkSync(filename)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }

  consume(jti, expiresAt, nowSeconds) {
    this.cleanup(nowSeconds)
    const filename = this.fileFor(jti)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let fd
      try {
        fd = fs.openSync(filename, 'wx', 0o600)
        fs.writeFileSync(fd, String(expiresAt), 'utf8')
        fs.fsyncSync(fd)
        return true
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        try {
          const storedExpiry = Number(fs.readFileSync(filename, 'utf8'))
          if (Number.isFinite(storedExpiry) && storedExpiry > nowSeconds) return false
          fs.unlinkSync(filename)
        } catch (readError) {
          if (readError?.code !== 'ENOENT') throw readError
        }
      } finally {
        if (fd !== undefined) fs.closeSync(fd)
      }
    }
    return false
  }
}

function createHandoffV2Token({
  secret,
  userId,
  role = 'customer',
  name = '',
  targetDomain,
  mfaDone = false,
  authMethod = 'unknown',
  nowMs = Date.now(),
  ttlSeconds = 60,
  jti = crypto.randomUUID(),
}) {
  assertSecret(secret)
  if (!userId || !targetDomain) throw new Error('Handoff v2 identity and target are required')
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_LIFETIME_SECONDS) {
    throw new Error('Invalid handoff v2 lifetime')
  }

  const iat = Math.floor(nowMs / 1000)
  const payload = {
    v: HANDOFF_V2_VERSION,
    jti,
    userId,
    role,
    name,
    iat,
    exp: iat + ttlSeconds,
    targetDomain,
    mfaDone: mfaDone === true,
    authMethod,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encodedPayload}.${sign(encodedPayload, secret)}`
}

function verifyAndConsumeHandoffV2Token({
  token,
  secret,
  expectedTargetDomain,
  replayStore,
  nowMs = Date.now(),
}) {
  assertSecret(secret)
  if (typeof token !== 'string' || token.length < 3 || token.length > MAX_TOKEN_LENGTH) {
    throw new Error('Invalid handoff v2 token')
  }
  if (!replayStore || typeof replayStore.consume !== 'function') {
    throw new Error('Handoff v2 replay protection is unavailable')
  }

  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Invalid handoff v2 token')
  const [encodedPayload, signature] = parts
  const expectedSignature = sign(encodedPayload, secret)
  if (!safeEqualBase64Url(signature, expectedSignature)) throw new Error('Invalid handoff v2 token')

  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch (_) {
    throw new Error('Invalid handoff v2 token')
  }

  const nowSeconds = Math.floor(nowMs / 1000)
  const valid = payload
    && payload.v === HANDOFF_V2_VERSION
    && typeof payload.jti === 'string'
    && payload.jti.length >= 16
    && payload.jti.length <= 128
    && typeof payload.userId === 'string'
    && payload.userId.length > 0
    && typeof payload.role === 'string'
    && typeof payload.name === 'string'
    && Number.isInteger(payload.iat)
    && Number.isInteger(payload.exp)
    && payload.exp > nowSeconds
    && payload.iat <= nowSeconds + 30
    && payload.exp > payload.iat
    && payload.exp - payload.iat <= MAX_LIFETIME_SECONDS
    && payload.targetDomain === expectedTargetDomain
    && typeof payload.mfaDone === 'boolean'
    && typeof payload.authMethod === 'string'
  if (!valid) throw new Error('Invalid handoff v2 token')

  if (!replayStore.consume(payload.jti, payload.exp, nowSeconds)) {
    throw new Error('Handoff v2 token already used')
  }
  return payload
}

module.exports = {
  HANDOFF_V2_VERSION,
  FileHandoffV2ReplayStore,
  InMemoryHandoffV2ReplayStore,
  createHandoffV2Token,
  verifyAndConsumeHandoffV2Token,
}
