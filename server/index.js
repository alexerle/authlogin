require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const supertokens = require('supertokens-node')
const Session = require('supertokens-node/recipe/session')
const EmailPassword = require('supertokens-node/recipe/emailpassword')
const Passwordless = require('supertokens-node/recipe/passwordless')
const ThirdParty = require('supertokens-node/recipe/thirdparty')
const EmailVerification = require('supertokens-node/recipe/emailverification')
const UserRoles = require('supertokens-node/recipe/userroles')
const UserMetadata = require('supertokens-node/recipe/usermetadata')
const Dashboard = require('supertokens-node/recipe/dashboard')
const { middleware, errorHandler } = require('supertokens-node/framework/express')
const { verifySession } = require('supertokens-node/recipe/session/framework/express')
const { sendEmail } = require('./email')
const {
  PROVISIONABLE_SERVICES,
  isBetterAssistRegistrationHandoff,
  updateProvisionedServices,
} = require('./service-access')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const QRCode = require('qrcode')
const {
  FileHandoffV2ReplayStore,
  createHandoffV2Token,
  verifyAndConsumeHandoffV2Token,
} = require('./handoff-v2')
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server')

function requireSecret(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} must be configured`)
  return value
}

const app = express()
const PORT = process.env.PORT || 3001
const isProduction = process.env.NODE_ENV === 'production'
const apiDomain = process.env.API_DOMAIN || 'http://localhost:3001'
const websiteDomain = process.env.WEBSITE_DOMAIN || 'http://localhost:5173'
const cookieDomain = process.env.COOKIE_DOMAIN || undefined
const handoffSecret = requireSecret('HANDOFF_SECRET')
const betterAssistHandoffV2Enabled = process.env.BETTERASSIST_HANDOFF_V2_ENABLED === 'true'
const betterAssistHandoffV2Target = 'v2.betterassist.me'
const betterAssistHandoffV2Secret = betterAssistHandoffV2Enabled
  ? requireSecret('BETTERASSIST_HANDOFF_V2_SECRET')
  : ''
const betterAssistHandoffV2VerifyKey = betterAssistHandoffV2Enabled
  ? requireSecret('BETTERASSIST_HANDOFF_V2_VERIFY_KEY')
  : ''
const betterAssistHandoffV2ReplayDir = betterAssistHandoffV2Enabled
  ? requireSecret('BETTERASSIST_HANDOFF_V2_REPLAY_DIR')
  : ''
if (betterAssistHandoffV2Enabled && (
  Buffer.byteLength(betterAssistHandoffV2Secret, 'utf8') < 32
  || Buffer.byteLength(betterAssistHandoffV2VerifyKey, 'utf8') < 32
)) {
  throw new Error('BetterAssist handoff v2 secrets must each contain at least 32 bytes')
}
const betterAssistHandoffV2ReplayStore = betterAssistHandoffV2Enabled
  ? new FileHandoffV2ReplayStore(betterAssistHandoffV2ReplayDir)
  : null

function betterAssistVerifyKeyMatches(provided) {
  if (!provided || !betterAssistHandoffV2VerifyKey) return false
  const actual = Buffer.from(String(provided))
  const expected = Buffer.from(betterAssistHandoffV2VerifyKey)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
const passkeyRpName = process.env.WEBAUTHN_RP_NAME || '10hoch2 Auth'
const passkeyRpId = process.env.WEBAUTHN_RP_ID || 'auth.10hoch2.de'
const passkeyOrigin = process.env.WEBAUTHN_ORIGIN || 'https://auth.10hoch2.de'
const passkeyStorePath = process.env.PASSKEY_STORE_PATH || (
  isProduction ? '/var/lib/authlogin/passkeys.json' : path.join(__dirname, 'data', 'passkeys.json')
)
const cpBridgeApiUrl = (process.env.CP_BRIDGE_API_URL || process.env.HOSTING_BRIDGE_API_URL || '').replace(/\/+$/, '')
const cpBridgeApiKey = process.env.CP_BRIDGE_API_KEY || process.env.HOSTING_BRIDGE_API_KEY || ''
const crmServicesApiUrl = (process.env.CRM_SERVICES_API_URL || 'https://crm.10hoch2.de/api/internal/auth/services').replace(/\/+$/, '')
const crmServicesApiKey = process.env.CRM_SERVICES_API_KEY || process.env.AUTH_INTERNAL_API_KEY || process.env.INTERNAL_PROVISION_SECRET || ''
const internalProvisionSecret = requireSecret('INTERNAL_PROVISION_SECRET')
const internalHandoffSecrets = new Set([
  internalProvisionSecret,
  process.env.AUTH_INTERNAL_API_KEY,
  process.env.CRM_SERVICES_API_KEY,
].filter(Boolean))
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || ''
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || ''
const turnstileHostnames = new Set(
  (process.env.TURNSTILE_ALLOWED_HOSTNAMES || 'auth.10hoch2.de,localhost')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
)
const customerSecurityDeadline = new Date(
  process.env.CUSTOMER_SECURITY_DEADLINE || '2026-10-01T00:00:00+02:00'
)
const trustedMfaCookieName = 'zhz_trusted_mfa_device'
const trustedMfaMaxAgeMs = Math.max(1, Number(process.env.TRUSTED_MFA_DEVICE_DAYS || 90)) * 24 * 60 * 60 * 1000
const emailMfaChallenges = new Map()
const emailMfaRequestWindows = new Map()

function trustedMfaSignature(payload) {
  return crypto.createHmac('sha256', handoffSecret).update(payload).digest('base64url')
}

function setTrustedMfaDevice(res, userId) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + trustedMfaMaxAgeMs, v: 1 })).toString('base64url')
  res.cookie(trustedMfaCookieName, `${payload}.${trustedMfaSignature(payload)}`, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: trustedMfaMaxAgeMs,
  })
}

function isTrustedMfaDevice(req, userId) {
  try {
    const token = String(req.cookies?.[trustedMfaCookieName] || '')
    const separator = token.lastIndexOf('.')
    if (separator <= 0) return false
    const payload = token.slice(0, separator)
    const signature = token.slice(separator + 1)
    const expected = Buffer.from(trustedMfaSignature(payload))
    const actual = Buffer.from(signature)
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return decoded.v === 1 && decoded.userId === userId && Number(decoded.exp) > Date.now()
  } catch (_) {
    return false
  }
}

function clearTrustedMfaDevice(res) {
  res.clearCookie(trustedMfaCookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  })
}

async function verifyTurnstile(token, request) {
  if (!turnstileSecretKey || !token) return false

  try {
    const body = new URLSearchParams({
      secret: turnstileSecretKey,
      response: token,
    })
    const getHeader = name => {
      if (typeof request.getHeaderValue === 'function') return request.getHeaderValue(name)
      if (typeof request.get === 'function') return request.get(name)
      return request.headers?.[name]
    }
    const remoteIp = getHeader('cf-connecting-ip') || getHeader('x-forwarded-for')
    if (remoteIp) body.set('remoteip', remoteIp.split(',')[0].trim())

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) return false

    const result = await response.json()
    const hostname = String(result.hostname || '').toLowerCase()
    const allowedHostname = turnstileHostnames.has(hostname)
    if (!result.success || !allowedHostname) {
      console.warn('[Turnstile] Registration rejected', {
        hostname: hostname || null,
        errors: result['error-codes'] || [],
      })
    }
    return result.success === true && allowedHostname
  } catch (error) {
    console.error('[Turnstile] Verification failed', error.message)
    return false
  }
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://auth.10hoch2.de',
  'https://cp.zhzcloud.de',
  'https://zhzcloud.de',
  'https://login.eazyfind.me',
  'https://eazyfind.me',
  'https://search01.eazyfind.me',
  'https://portal.10hoch2.de',
  'https://admin.10hoch2.de',
]

// --- SuperTokens init ---
supertokens.init({
  framework: 'express',
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI || 'http://localhost:3567',
    apiKey: process.env.SUPERTOKENS_API_KEY || undefined,
  },
  appInfo: {
    appName: '10hoch2 Auth',
    apiDomain,
    websiteDomain,
    apiBasePath: '/auth',
    websiteBasePath: '/auth',
  },
  recipeList: [
    UserRoles.init(),
    UserMetadata.init(),


    EmailPassword.init({
      signUpFeature: {
        formFields: [
          { id: 'email' },
          { id: 'password' },
          { id: 'name', optional: true },
        ],
      },
      override: {
        functions: (original) => ({
          ...original,
          signUp: async (input) => {
            const result = await original.signUp(input)
            if (result.status === 'OK') {
              // formFields sind im function-level nicht verfügbar (nur API-level)
              // Rolle setzen, Name wird separat über Profil-Seite gesetzt
              await UserRoles.addRoleToUser('public', result.user.id, 'customer')
            }
            return result
          },
        }),
        apis: (original) => ({
          ...original,
          signUpPOST: async (input) => {
            const result = await original.signUpPOST(input)
            if (result.status === 'OK') {
              // Name aus formFields holen und in UserMetadata speichern
              const name = input.formFields.find(f => f.id === 'name')?.value
              if (name) {
                try {
                  await UserMetadata.updateUserMetadata(result.user.id, { name })
                } catch (_) {}
              }
              const email = result.user.emails?.[0] || input.formFields.find(f => f.id === 'email')?.value
              if (email) {
                try {
                  await notifyNewCentralRegistration({ email, name, authUserId: result.user.id })
                } catch (error) {
                  console.error('[Registration notification]', error.message)
                }
              }
            }
            return result
          },
        }),
      },
      emailDelivery: {
        override: (orig) => ({
          ...orig,
          sendEmail: async (input) => {
            if (input.type === 'PASSWORD_RESET') {
              const resetUrl = new URL(input.passwordResetLink)
              resetUrl.pathname = '/reset-password'
              await sendEmail({
                to: input.user.email,
                subject: 'Passwort zurücksetzen – 10hoch2',
                html: emailTemplate('Passwort zurücksetzen', `
                  <p>Hallo,</p>
                  <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
                  <p style="text-align:center;margin:32px 0">
                    <a href="${resetUrl.toString()}" style="${btnStyle}">Passwort zurücksetzen</a>
                  </p>
                  <p style="color:#6b7280;font-size:13px">Dieser Link ist 24 Stunden gültig.</p>
                `),
              })
            }
          },
        }),
      },
    }),

    Passwordless.init({
      flowType: 'USER_INPUT_CODE',
      contactMethod: 'EMAIL',
      override: {
        functions: (original) => ({
          ...original,
          consumeCode: async (input) => {
            const result = await original.consumeCode(input)
            if (result.status === 'OK') {
              const userId = result.user.id
              const email = result.user.emails?.[0]
              // Check current roles
              let currentRoles = []
              try { const r = await UserRoles.getRolesForUser('public', userId); currentRoles = r.roles || [] } catch (_) {}

              if (currentRoles.length === 0) {
                // No role yet — try to sync from emailpassword user with same email
                let synced = false
                if (email) {
                  try {
                    const linked = await supertokens.listUsersByAccountInfo('public', { email })
                    const epUser = linked.find(u => u.loginMethods?.some(m => m.recipeId === 'emailpassword'))
                    if (epUser && epUser.id !== userId) {
                      const epRoles = await UserRoles.getRolesForUser('public', epUser.id)
                      for (const role of (epRoles.roles || [])) {
                        await UserRoles.addRoleToUser('public', userId, role)
                      }
                      synced = (epRoles.roles?.length || 0) > 0
                    }
                  } catch (_) {}
                }
                if (!synced) {
                  await UserRoles.addRoleToUser('public', userId, 'customer')
                }
              }
            }
            return result
          },
        }),
      },
      emailDelivery: {
        override: (orig) => ({
          ...orig,
          sendEmail: async (input) => {
            await sendEmail({
              to: input.email,
              subject: `Ihr Einmalcode: ${input.userInputCode} – ZHZ 10hoch2`,
              html: emailTemplate('Ihr Einmalcode zum Anmelden', `
                <p>Guten Tag,</p>
                <p>Ihr Einmalcode zum Anmelden:</p>
                <p style="text-align:center;margin:32px 0;font-size:40px;font-weight:700;letter-spacing:12px;color:#2563eb">${input.userInputCode}</p>
                <p style="color:#6b7280;font-size:13px">Dieser Code ist 15 Minuten gültig.</p>
              `),
            })
          },
        }),
      },
    }),

    ThirdParty.init({
      signInAndUpFeature: {
        providers: [
          ...(process.env.GOOGLE_CLIENT_ID ? [{
            config: {
              thirdPartyId: 'google',
              clients: [{ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }],
            },
          }] : []),
          ...(process.env.GITHUB_CLIENT_ID ? [{
            config: {
              thirdPartyId: 'github',
              clients: [{ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET }],
            },
          }] : []),
        ],
      },
      override: {
        functions: (original) => ({
          ...original,
          signInUp: async (input) => {
            const result = await original.signInUp(input)
            if (result.status === 'OK' && result.createdNewRecipeUser) {
              await UserRoles.addRoleToUser('public', result.user.id, 'customer')
            }
            return result
          },
        }),
      },
    }),

    EmailVerification.init({
      mode: 'OPTIONAL',
      emailDelivery: {
        override: (orig) => ({
          ...orig,
          sendEmail: async (input) => {
            await sendEmail({
              to: input.user.email,
              subject: 'E-Mail-Adresse bestätigen – 10hoch2',
              html: emailTemplate('E-Mail bestätigen', `
                <p>Hallo,</p>
                <p>Bitte bestätigen Sie Ihre E-Mail-Adresse.</p>
                <p style="text-align:center;margin:32px 0">
                  <a href="${input.emailVerifyLink}" style="${btnStyle}">E-Mail bestätigen</a>
                </p>
              `),
            })
          },
        }),
      },
    }),

    Session.init({
      cookieDomain: isProduction ? cookieDomain : undefined,
      olderCookieDomain: 'auth.10hoch2.de',
      cookieSecure: isProduction,
      tokenTransferMethod: 'cookie',
      sessionExpiredStatusCode: 401,
      override: {
        functions: (original) => ({
          ...original,
          createNewSession: async (input) => {
            const userId = input.userId
            // Rolle aus UserRoles in Token schreiben
            let role = 'customer'
            try {
              const r = await UserRoles.getRolesForUser('public', userId)
              if (r.status === 'OK' && r.roles.length > 0) {
                const priority = ['superadmin', 'admin', 'support', 'partner', 'customer']
                role = priority.find(p => r.roles.includes(p)) || r.roles[0]
              }
            } catch (_) {}

            let name = ''
            let totpEnabled = false
            try {
              const meta = await UserMetadata.getUserMetadata(userId)
              name = meta.metadata?.name || ''
              totpEnabled = !!meta.metadata?.totpEnabled
            } catch (_) {}

            // Die konkrete Recipe-User-ID zeigt, welches Anmeldeverfahren diese
            // Sitzung erzeugt hat. loginMethods[0] ist bei verknüpften Konten nicht
            // zwingend die aktuelle Methode und darf dafür nicht verwendet werden.
            let authMethod = 'unknown'
            let mfaDone = false
            try {
              const userInfo = await supertokens.getUser(userId)
              const sessionRecipeUserId = input.recipeUserId?.getAsString?.()
              const loginMethod = userInfo?.loginMethods?.find(method =>
                method.recipeUserId?.getAsString?.() === sessionRecipeUserId
              )
              authMethod = loginMethod?.recipeId || 'unknown'
              // Der E-Mail-Einmalcode beweist vor dem Stichtag den Mailbesitz.
              // Nach dem Stichtag prüft der Handoff zusätzlich, dass die Sitzung
              // mit Passwort oder Passkey begonnen wurde.
              if (authMethod === 'passwordless' || authMethod === 'thirdparty') mfaDone = true
            } catch (_) {}

            return original.createNewSession({
              ...input,
              accessTokenPayload: { ...input.accessTokenPayload, role, name, authMethod, mfaDone, hasTotpEnabled: totpEnabled },
            })
          },
        }),
      },
    }),

    Dashboard.init({
      apiKey: requireSecret('SUPERTOKENS_DASHBOARD_API_KEY'),
    }),
  ],
})

// --- Middleware ---
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    if (origin.endsWith('.10hoch2.de') || origin.endsWith('.eazyfind.me') || origin.endsWith('.zhzcloud.de')) {
      return callback(null, true)
    }
    callback(null, false)
  },
  credentials: true,
  allowedHeaders: ['content-type', 'x-turnstile-token', ...supertokens.getAllCORSHeaders()],
}))
app.use(express.json())
app.use(cookieParser())
const authAttemptWindows = new Map()
function authRateLimit({ windowMs, max, includeEmail = false }) {
  return (req, res, next) => {
    const now = Date.now()
    const ip = String(req.headers['cf-connecting-ip'] || req.ip || 'unknown').split(',')[0].trim()
    const email = includeEmail
      ? String(
          (Array.isArray(req.body?.formFields)
            ? req.body.formFields.find(field => field?.id === 'email')?.value
            : req.body?.email) || ''
        ).trim().toLowerCase()
      : ''
    const key = `${req.path}:${ip}:${email}`
    const current = authAttemptWindows.get(key)
    const state = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current
    state.count += 1
    authAttemptWindows.set(key, state)

    if (state.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((state.resetAt - now) / 1000)))
      return res.status(429).json({ status: 'ERROR', message: 'Zu viele Versuche. Bitte später erneut versuchen.' })
    }
    next()
  }
}

app.use('/auth/signup', authRateLimit({ windowMs: 60 * 60 * 1000, max: 8 }))
app.use('/auth/signin', authRateLimit({ windowMs: 15 * 60 * 1000, max: 12, includeEmail: true }))
app.use('/auth/user/password/reset/token', authRateLimit({ windowMs: 60 * 60 * 1000, max: 4, includeEmail: true }))
app.post('/auth/signinup/code', authRateLimit({ windowMs: 15 * 60 * 1000, max: 5, includeEmail: true }), async (req, res, next) => {
  const verified = await verifyTurnstile(req.get('x-turnstile-token'), req)
  if (!verified) {
    return res.status(403).json({
      status: 'GENERAL_ERROR',
      message: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es erneut.',
    })
  }
  next()
})
app.get('/auth/security/turnstile/config', (_req, res) => {
  if (!turnstileSiteKey) {
    return res.status(503).json({ status: 'ERROR', message: 'Die Sicherheitsprüfung ist nicht konfiguriert.' })
  }
  return res.json({ status: 'OK', siteKey: turnstileSiteKey })
})
app.use('/auth/signup', async (req, res, next) => {
  const verified = await verifyTurnstile(req.get('x-turnstile-token'), req)
  if (!verified) {
    return res.status(403).json({
      status: 'GENERAL_ERROR',
      message: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es erneut.',
    })
  }
  next()
})
app.use('/auth/user/password/reset/token', async (req, res, next) => {
  const verified = await verifyTurnstile(req.get('x-turnstile-token'), req)
  if (!verified) {
    return res.status(403).json({
      status: 'GENERAL_ERROR',
      message: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es erneut.',
    })
  }
  try {
    const email = Array.isArray(req.body?.formFields)
      ? String(req.body.formFields.find(field => field?.id === 'email')?.value || '').trim().toLowerCase()
      : ''
    if (email) {
      const users = await supertokens.listUsersByAccountInfo('public', { email })
      let passwordUser = users.find(user => user.loginMethods.some(method => method.recipeId === 'emailpassword'))
      if (users.length > 0 && !passwordUser) {
        const result = await EmailPassword.signUp('public', email, crypto.randomBytes(32).toString('base64url'))
        if (result.status === 'OK') {
          await UserRoles.addRoleToUser('public', result.user.id, 'customer')
          await UserMetadata.updateUserMetadata(result.user.id, { passwordLoginAddedByReset: true })
          passwordUser = result.user
        } else if (result.status !== 'EMAIL_ALREADY_EXISTS_ERROR') {
          throw new Error(`Password login provisioning failed: ${result.status}`)
        }
      }
      if (passwordUser) {
        const sent = await EmailPassword.sendResetPasswordEmail('public', passwordUser.id, email)
        if (sent.status !== 'OK') throw new Error(`Password reset email failed: ${sent.status}`)
      }
    }
    return res.json({ status: 'OK' })
  } catch (error) {
    console.error('[Password reset] Could not prepare password login', error.message)
    return res.status(500).json({ status: 'ERROR', message: 'Der Passwort-Reset konnte nicht vorbereitet werden.' })
  }
})
app.use(middleware())
app.post('/auth/signout', handleSignout)
app.get('/auth/signout', verifySession({ sessionRequired: false }), handleSignout)

// --- Routes ---

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-portal' }))

// --- Admin: Userverwaltung ---

// Middleware: nur für Admins
const requireAdmin = [
  verifySession(),
  (req, res, next) => {
    const payload = req.session.getAccessTokenPayload()
    if (payload?.role !== 'admin') return res.status(403).json({ status: 'ERROR', message: 'Forbidden' })
    next()
  },
]

function readPasskeyStore() {
  try {
    if (!fs.existsSync(passkeyStorePath)) return { passkeys: [], challenges: [] }
    const data = JSON.parse(fs.readFileSync(passkeyStorePath, 'utf8'))
    return {
      passkeys: Array.isArray(data.passkeys) ? data.passkeys : [],
      challenges: Array.isArray(data.challenges) ? data.challenges : [],
    }
  } catch (error) {
    console.error('[Passkey] Store read failed:', error)
    return { passkeys: [], challenges: [] }
  }
}

function writePasskeyStore(store) {
  fs.mkdirSync(path.dirname(passkeyStorePath), { recursive: true })
  const cleaned = {
    passkeys: store.passkeys || [],
    challenges: (store.challenges || []).filter(c => c.expiresAt > Date.now()),
  }
  fs.writeFileSync(passkeyStorePath, JSON.stringify(cleaned, null, 2), 'utf8')
}

function savePasskeyChallenge(challenge, userId, type) {
  const store = readPasskeyStore()
  store.challenges = (store.challenges || []).filter(c => c.expiresAt > Date.now())
  store.challenges.push({ challenge, userId, type, expiresAt: Date.now() + 5 * 60 * 1000 })
  writePasskeyStore(store)
}

function consumePasskeyChallenge(challenge, type) {
  const store = readPasskeyStore()
  const entry = store.challenges.find(c => c.challenge === challenge && c.type === type && c.expiresAt > Date.now())
  store.challenges = store.challenges.filter(c => c.challenge !== challenge)
  writePasskeyStore(store)
  return entry || null
}

async function buildSessionPayload(userId, mfaDone = false, authMethod = 'unknown') {
  let role = 'customer'
  try {
    const r = await UserRoles.getRolesForUser('public', userId)
    if (r.status === 'OK' && r.roles.length > 0) {
      const priority = ['superadmin', 'admin', 'support', 'partner', 'customer']
      role = priority.find(p => r.roles.includes(p)) || r.roles[0]
    }
  } catch (_) {}

  let name = ''
  let totpEnabled = false
  try {
    const meta = await UserMetadata.getUserMetadata(userId)
    name = meta.metadata?.name || ''
    totpEnabled = !!meta.metadata?.totpEnabled
  } catch (_) {}

  return { role, name, authMethod, mfaDone, hasTotpEnabled: totpEnabled }
}

async function getSecurityProfile(userId, roleHint = '') {
  const currentUser = await supertokens.getUser(userId)
  const email = currentUser?.emails?.[0] || ''
  const users = email
    ? await supertokens.listUsersByAccountInfo('public', { email })
    : (currentUser ? [currentUser] : [])
  const metadataEntries = await Promise.all(users.map(async user => {
    try {
      const result = await UserMetadata.getUserMetadata(user.id)
      return { user, metadata: result.metadata || {} }
    } catch (_) {
      return { user, metadata: {} }
    }
  }))

  const passwordEntry = metadataEntries.find(({ user }) =>
    user.loginMethods?.some(method => method.recipeId === 'emailpassword')
  )
  const totpEntry = metadataEntries.find(({ metadata }) => metadata.totpEnabled && metadata.totpSecret)
  const emailMfaEntry = metadataEntries.find(({ metadata }) => metadata.emailMfaEnabled === true)
  const passkeyConfigured = readPasskeyStore().passkeys.some(passkey =>
    users.some(user => user.id === passkey.userId) && passkey.rpId === passkeyRpId
  )

  let role = roleHint || 'customer'
  if (!roleHint) {
    try {
      const result = await UserRoles.getRolesForUser('public', userId)
      const priority = ['superadmin', 'admin', 'support', 'partner', 'customer']
      role = priority.find(candidate => result.roles?.includes(candidate)) || result.roles?.[0] || 'customer'
    } catch (_) {}
  }

  const passwordConfigured = passwordEntry?.metadata?.userSetPassword === true
  const totpEnabled = !!totpEntry
  const emailMfaEnabled = !!emailMfaEntry
  const mfaConfigured = totpEnabled || emailMfaEnabled || passkeyConfigured
  const preferredMfaMethod = totpEnabled
    ? 'totp'
    : emailMfaEnabled
      ? 'email'
      : passkeyConfigured
        ? 'passkey'
        : null
  const deadlineReached = Date.now() >= customerSecurityDeadline.getTime()
  const privileged = role === 'admin' || role === 'superadmin'

  return {
    userId,
    email,
    role,
    users,
    passwordUser: passwordEntry?.user || null,
    passwordConfigured,
    totpEnabled,
    totpSecret: totpEntry?.metadata?.totpSecret || null,
    emailMfaEnabled,
    passkeyConfigured,
    mfaConfigured,
    preferredMfaMethod,
    deadlineReached,
    passwordRequiredNow: deadlineReached && role === 'customer',
    mfaRequiredNow: privileged || deadlineReached || mfaConfigured,
  }
}

function emailMfaHash(userId, code) {
  return crypto.createHmac('sha256', handoffSecret).update(`${userId}:${code}`).digest('hex')
}

function canRequestEmailMfa(userId) {
  const now = Date.now()
  const state = emailMfaRequestWindows.get(userId)
  if (!state || state.resetAt <= now) {
    emailMfaRequestWindows.set(userId, { count: 1, resetAt: now + 10 * 60 * 1000, lastAt: now })
    return { allowed: true, retryAfter: 0 }
  }
  if (now - state.lastAt < 60 * 1000) {
    return { allowed: false, retryAfter: Math.ceil((60 * 1000 - (now - state.lastAt)) / 1000) }
  }
  if (state.count >= 5) {
    return { allowed: false, retryAfter: Math.ceil((state.resetAt - now) / 1000) }
  }
  state.count += 1
  state.lastAt = now
  return { allowed: true, retryAfter: 0 }
}

function hasRecentPasskeyLogin(userId, windowMs = 10 * 60 * 1000) {
  const store = readPasskeyStore()
  return store.passkeys.some(pk => {
    if (pk.userId !== userId || pk.rpId !== passkeyRpId || !pk.lastUsedAt) return false
    const lastUsed = new Date(pk.lastUsedAt).getTime()
    return Number.isFinite(lastUsed) && Date.now() - lastUsed <= windowMs
  })
}

async function createCookieSessionResponse(res, userId, payload = {}) {
  const session = await Session.createNewSessionWithoutRequestResponse(
    'public',
    supertokens.convertToRecipeUserId(userId),
    payload,
  )
  const tokens = session.getAllSessionTokensDangerously()
  const baseCookie = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    domain: isProduction ? cookieDomain : undefined,
  }
  res.cookie('sAccessToken', tokens.accessToken, { ...baseCookie, path: '/' })
  if (tokens.refreshToken) {
    res.clearCookie('sRefreshToken', { path: '/', domain: isProduction ? cookieDomain : undefined })
    res.cookie('sRefreshToken', tokens.refreshToken, { ...baseCookie, path: '/auth/session/refresh' })
  }
  if (tokens.frontToken) {
    res.cookie('sFrontToken', tokens.frontToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? cookieDomain : undefined,
      path: '/',
    })
  }
  res.cookie('st-last-access-token-update', Date.now().toString(), {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    domain: isProduction ? cookieDomain : undefined,
    path: '/',
  })
  if (tokens.antiCsrfToken) {
    res.cookie('sAntiCsrf', tokens.antiCsrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? cookieDomain : undefined,
      path: '/',
    })
  }
}

function clearSessionCookies(res) {
  const clear = (name, path) => {
    const options = {
      path,
      secure: isProduction,
      sameSite: 'lax',
    }
    res.clearCookie(name, options)
    res.cookie(name, '', { ...options, expires: new Date(0) })

    if (isProduction && cookieDomain) {
      const domainOptions = { ...options, domain: cookieDomain }
      res.clearCookie(name, domainOptions)
      res.cookie(name, '', { ...domainOptions, expires: new Date(0) })
    }
  }

  clear('sAccessToken', '/')
  clear('sFrontToken', '/')
  clear('st-last-access-token-update', '/')
  clear('sAntiCsrf', '/')
  clear('sRefreshToken', '/auth/session/refresh')
  clear('sRefreshToken', '/')
}

async function cpBridgeRequest(pathname) {
  if (!cpBridgeApiUrl || !cpBridgeApiKey) return null
  const response = await fetch(`${cpBridgeApiUrl}${pathname}`, {
    headers: { 'X-API-Key': cpBridgeApiKey },
    timeout: 4000,
  })
  if (!response.ok) return null
  return response.json()
}

async function zammadUserExists(email) {
  if (!email) return false
  const apiToken = process.env.ZAMMAD_API_TOKEN || ''
  if (!apiToken) return false
  const response = await fetch(`https://service.10hoch2.de/api/v1/users/search?query=${encodeURIComponent(email)}&limit=10`, {
    headers: { Authorization: `Token token=${apiToken}` },
    timeout: 5000,
  })
  if (!response.ok) return false
  const users = await response.json()
  return Array.isArray(users) && users.some(user => user.email?.toLowerCase() === email.toLowerCase())
}

async function detectProvisionedServices(email, existing = [], authUserId = null) {
  const services = new Set(existing || [])
  if (!email) return [...services]
  try {
    const crmAccess = await crmServiceAccess(email, authUserId)
    if (crmAccess?.services) {
      for (const service of crmAccess.services) services.add(service)
    }
    if (crmAccess?.needsCompanyRegistration) services.add('crm')
  } catch (error) {
    console.warn('[CRM services] lookup failed:', error.message)
  }
  return [...services]
}

async function crmServiceAccess(email, authUserId) {
  if (!crmServicesApiUrl || !crmServicesApiKey || !email) return null
  const response = await fetch(crmServicesApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': crmServicesApiKey,
    },
    body: JSON.stringify({ email, authUserId }),
    timeout: 5000,
  })
  if (!response.ok) return null
  const payload = await response.json()
  return payload?.access || null
}

async function notifyNewCentralRegistration({ email, name, authUserId }) {
  const access = await crmServiceAccess(email, authUserId)
  const safeEmail = escapeHtml(email)
  const safeName = escapeHtml(name || 'Nicht angegeben')
  const crmUserId = access?.crmUserId ? escapeHtml(access.crmUserId) : 'noch nicht im CRM angelegt'

  await sendEmail({
    to: process.env.ADMIN_EMAIL || 'ae@10hoch2.de',
    subject: `Neue zentrale Registrierung: ${email}`,
    html: emailTemplate('Neue zentrale Registrierung', `
      <p>Guten Tag,</p>
      <p>im zentralen 10hoch2 Login wurde ein neues Benutzerkonto registriert.</p>
      <p><strong>E-Mail:</strong> ${safeEmail}<br><strong>Name:</strong> ${safeName}<br><strong>CRM-User:</strong> ${crmUserId}</p>
      <p>Bitte ordnen Sie den Benutzer im CRM einer Firma und dem passenden WAWI-Kunden zu und schalten Sie anschließend nur die benötigten Dienste frei.</p>
      <p style="text-align:center;margin:32px 0"><a href="https://crm.10hoch2.de/admin/users?q=${encodeURIComponent(email)}" style="${btnStyle}">Benutzer im CRM pr&uuml;fen</a></p>
      <p>Bis zur Zuordnung bleiben nicht freigegebene Dienste gesperrt.</p>
    `),
  })
}

async function hasCrmServiceAccess(email, service, authUserId) {
  const access = await crmServiceAccess(email, authUserId)
  if (!access) return false
  if (service === 'crm' && access.needsCompanyRegistration) return true
  return Array.isArray(access.services) && access.services.includes(service)
}

async function hasCrmStaffServiceAccess(email, service, authUserId) {
  const access = await crmServiceAccess(email, authUserId)
  if (!access || !['admin', 'support'].includes(access.role)) return false
  return Array.isArray(access.services) && access.services.includes(service)
}

// Alle User auflisten mit Rollen + verknüpfte Accounts (mit optionaler Suche)
app.get('/auth/admin/users', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const paginationToken = req.query.paginationToken || undefined
    const search = (req.query.search || '').trim().toLowerCase()
    const roleFilter = (req.query.role || '').trim().toLowerCase()

    let rawUsers = []
    let total = 0
    let nextPaginationToken = null

    if (search || roleFilter) {
      let token
      const all = []
      do {
        const page = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit: 200, paginationToken: token })
        all.push(...page.users)
        token = page.nextPaginationToken
      } while (token && all.length < 5000)

      rawUsers = all.filter(user => {
        const email = (user.emails?.[0] || '').toLowerCase()
        return !search || email.includes(search) || user.id.toLowerCase().includes(search)
      })
    } else {
      total = await supertokens.getUserCount()
      const page = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit, paginationToken })
      rawUsers = page.users
      nextPaginationToken = page.nextPaginationToken || null
    }

    // Rollen für alle User parallel laden
    const users = await Promise.all(rawUsers.map(async (user) => {
      let roles = []
      try {
        const r = await UserRoles.getRolesForUser('public', user.id)
        roles = r.roles || []
      } catch (_) {}

      // Verknüpfte Accounts: andere User mit derselben E-Mail
      const email = user.emails?.[0]
      let linked = []
      if (email) {
        try {
          const all = await supertokens.listUsersByAccountInfo('public', { email })
          linked = all
            .filter(u => u.id !== user.id)
            .map(u => ({
              id: u.id,
              recipes: u.loginMethods.map(m => m.recipeId),
            }))
        } catch (_) {}
      }

      return {
        id: user.id,
        email,
        recipes: user.loginMethods.map(m => m.recipeId),
        roles,
        timeJoined: user.timeJoined,
        linked,
      }
    }))

    const filteredUsers = roleFilter
      ? users.filter(user => (user.roles || []).includes(roleFilter))
      : users

    res.json({
      status: 'OK',
      users: (search || roleFilter) ? filteredUsers.slice(0, limit) : filteredUsers,
      total: (search || roleFilter) ? filteredUsers.length : total,
      nextPaginationToken: (search || roleFilter) ? null : nextPaginationToken,
    })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

// Rolle eines Users ändern
app.patch('/auth/admin/users/:userId/role', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params
    const { role } = req.body
    const validRoles = ['superadmin', 'admin', 'support', 'partner', 'customer']
    if (!validRoles.includes(role)) return res.status(400).json({ status: 'ERROR', message: 'Ungültige Rolle' })

    // Alle bisherigen Rollen entfernen
    const current = await UserRoles.getRolesForUser('public', userId)
    for (const r of (current.roles || [])) {
      await UserRoles.removeUserRole('public', userId, r)
    }
    await UserRoles.addRoleToUser('public', userId, role)

    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

// User löschen
app.delete('/auth/admin/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params
    // Eigenen Account nicht löschbar
    if (userId === req.session.getUserId()) {
      return res.status(400).json({ status: 'ERROR', message: 'Eigener Account kann nicht gelöscht werden' })
    }
    await supertokens.deleteUser(userId)
    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

async function handleSignout(req, res) {
  const redirectAfterSignout = () => {
    const requested = String(req.query?.redirect || '').trim()
    if (!requested) return false
    try {
      const target = new URL(requested, websiteDomain)
      if (target.origin !== websiteDomain) return false
      res.redirect(303, target.toString())
      return true
    } catch (_) {
      return false
    }
  }
  try {
    if (req.session) {
      try { await req.session.revokeSession() } catch (_) {}
    }
    clearSessionCookies(res)
    if (redirectAfterSignout()) return
    res.json({ status: 'OK' })
  } catch (err) {
    clearSessionCookies(res)
    if (redirectAfterSignout()) return
    res.status(200).json({ status: 'OK' })
  }
}

// Nutzer-Info mit Rolle aus Session
app.get('/auth/session/user', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const payload = req.session.getAccessTokenPayload()
    const user = await supertokens.getUser(userId)
    let meta = {}
    try { const r = await UserMetadata.getUserMetadata(userId); meta = r.metadata || {} } catch (_) {}
    const email = user?.emails?.[0] || ''
    const services = await detectProvisionedServices(email, meta.provisionedServices || [], userId)
    const security = await getSecurityProfile(userId, payload?.role || 'customer')
    const sessionMfaDone = !!payload?.mfaDone || hasRecentPasskeyLogin(userId) || isTrustedMfaDevice(req, userId)
    const passwordLoginRequired = security.deadlineReached
      && security.role === 'customer'
      && security.passwordConfigured
      && payload?.authMethod === 'passwordless'
    const securityCompliant = (!security.passwordRequiredNow || security.passwordConfigured)
      && !passwordLoginRequired
      && (!security.mfaRequiredNow || sessionMfaDone)
    res.json({
      status: 'OK',
      user: {
        id: userId,
        email,
        role: payload?.role || 'customer',
        name: payload?.name || meta.name || '',
        totpEnabled: security.totpEnabled,
        emailMfaEnabled: security.emailMfaEnabled,
        mfaMethod: security.preferredMfaMethod,
        passwordConfigured: security.passwordConfigured,
        mfaDone: sessionMfaDone,
        mfaRequiredNow: security.mfaRequiredNow,
        passwordRequiredNow: security.passwordRequiredNow,
        passwordLoginRequired,
        securityCompliant,
        services,
      },
    })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

// Session prüfen (optional)
app.get('/auth/session/verify', verifySession({ sessionRequired: false }), (req, res) => {
  if (req.session) {
    const payload = req.session.getAccessTokenPayload()
    res.json({ status: 'OK', session: { userId: req.session.getUserId(), ...payload } })
  } else {
    res.json({ status: 'NO_SESSION' })
  }
})

// Handoff-Token für Cross-Domain SSO (cp.zhzcloud.de, login.eazyfind.me)
// Zentraler Passkey-Login (WebAuthn auf auth.10hoch2.de)
app.get('/auth/passkeys', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const store = readPasskeyStore()
    const passkeys = store.passkeys
      .filter(pk => pk.userId === userId && pk.rpId === passkeyRpId)
      .map(pk => ({ id: pk.id, deviceName: pk.deviceName, createdAt: pk.createdAt, lastUsedAt: pk.lastUsedAt || null }))
    res.json({ status: 'OK', passkeys })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.post('/auth/passkeys/register-options', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0] || userId
    const store = readPasskeyStore()
    const existing = store.passkeys.filter(pk => pk.userId === userId && pk.rpId === passkeyRpId)
    const options = await generateRegistrationOptions({
      rpName: passkeyRpName,
      rpID: passkeyRpId,
      userName: email,
      userDisplayName: email,
      attestationType: 'none',
      excludeCredentials: existing.map(pk => ({ id: pk.credentialId, transports: pk.transports || undefined })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    })
    savePasskeyChallenge(options.challenge, userId, 'register')
    res.json({ status: 'OK', options, challenge: options.challenge })
  } catch (err) {
    console.error('[Passkey register-options]', err)
    res.status(500).json({ status: 'ERROR', message: 'Passkey-Registrierung konnte nicht vorbereitet werden.' })
  }
})

app.post('/auth/passkeys/register-verify', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0] || ''
    const { credential, challenge, deviceName } = req.body || {}
    if (!credential || !challenge) return res.status(400).json({ status: 'ERROR', message: 'Credential und Challenge erforderlich.' })
    const stored = consumePasskeyChallenge(challenge, 'register')
    if (!stored || stored.userId !== userId) return res.status(400).json({ status: 'ERROR', message: 'Challenge abgelaufen oder ungültig.' })

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: passkeyOrigin,
      expectedRPID: passkeyRpId,
    })
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ status: 'ERROR', message: 'Passkey konnte nicht verifiziert werden.' })
    }

    const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
    const store = readPasskeyStore()
    const credentialId = cred.id
    if (store.passkeys.some(pk => pk.credentialId === credentialId && pk.rpId === passkeyRpId)) {
      return res.status(409).json({ status: 'ERROR', message: 'Dieser Passkey ist bereits registriert.' })
    }
    store.passkeys.push({
      id: crypto.randomUUID(),
      userId,
      email,
      rpId: passkeyRpId,
      credentialId,
      publicKey: Buffer.from(cred.publicKey).toString('base64url'),
      counter: cred.counter,
      deviceName: deviceName || `${credentialDeviceType}${credentialBackedUp ? ' (synchronisiert)' : ''}`,
      transports: credential.response?.transports || [],
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    })
    writePasskeyStore(store)
    res.json({ status: 'OK' })
  } catch (err) {
    console.error('[Passkey register-verify]', err)
    res.status(500).json({ status: 'ERROR', message: 'Passkey-Registrierung fehlgeschlagen.' })
  }
})

app.delete('/auth/passkeys/:id', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const store = readPasskeyStore()
    const before = store.passkeys.length
    store.passkeys = store.passkeys.filter(pk => !(pk.id === req.params.id && pk.userId === userId))
    writePasskeyStore(store)
    res.json({ status: before === store.passkeys.length ? 'NOT_FOUND' : 'OK' })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.post('/auth/passkeys/login-options', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase()
    const store = readPasskeyStore()
    const candidates = email
      ? store.passkeys.filter(pk => pk.email?.toLowerCase() === email && pk.rpId === passkeyRpId)
      : store.passkeys.filter(pk => pk.rpId === passkeyRpId)
    const options = await generateAuthenticationOptions({
      rpID: passkeyRpId,
      userVerification: 'preferred',
      allowCredentials: candidates.length ? candidates.map(pk => ({ id: pk.credentialId, transports: pk.transports || undefined })) : undefined,
    })
    savePasskeyChallenge(options.challenge, '', 'login')
    res.json({ status: 'OK', options, challenge: options.challenge })
  } catch (err) {
    console.error('[Passkey login-options]', err)
    res.status(500).json({ status: 'ERROR', message: 'Passkey-Login konnte nicht vorbereitet werden.' })
  }
})

app.post('/auth/passkeys/login-verify', async (req, res) => {
  try {
    const { credential, challenge } = req.body || {}
    if (!credential || !challenge) return res.status(400).json({ status: 'ERROR', message: 'Credential und Challenge erforderlich.' })
    const stored = consumePasskeyChallenge(challenge, 'login')
    if (!stored) return res.status(400).json({ status: 'ERROR', message: 'Challenge abgelaufen oder ungültig.' })

    const store = readPasskeyStore()
    const passkey = store.passkeys.find(pk => pk.credentialId === credential.id && pk.rpId === passkeyRpId)
    if (!passkey) return res.status(404).json({ status: 'ERROR', message: 'Passkey nicht gefunden.' })

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: passkeyOrigin,
      expectedRPID: passkeyRpId,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, 'base64url'),
        counter: passkey.counter || 0,
        transports: passkey.transports || undefined,
      },
    })
    if (!verification.verified) return res.status(401).json({ status: 'ERROR', message: 'Passkey-Verifizierung fehlgeschlagen.' })

    passkey.counter = verification.authenticationInfo.newCounter
    passkey.lastUsedAt = new Date().toISOString()
    writePasskeyStore(store)

    const payload = await buildSessionPayload(passkey.userId, true, 'passkey')
    await createCookieSessionResponse(res, passkey.userId, payload)
    setTrustedMfaDevice(res, passkey.userId)
    res.json({ status: 'OK' })
  } catch (err) {
    console.error('[Passkey login-verify]', err)
    res.status(500).json({ status: 'ERROR', message: 'Passkey-Login fehlgeschlagen.' })
  }
})

app.post('/auth/handoff-token', verifySession(), async (req, res) => {
  try {
    let userId = req.session.getUserId()
    const payload = req.session.getAccessTokenPayload()
    const { targetDomain } = req.body
    const handoffPurpose = req.body?.purpose === 'registration' ? 'registration' : ''

    if (!isAllowedHandoffTarget(targetDomain)) {
      return res.status(400).json({ status: 'ERROR', message: 'Unauthorized target domain' })
    }

    const securityProfile = await getSecurityProfile(userId, payload?.role || 'customer')
    const sessionMfaDone = !!payload?.mfaDone || hasRecentPasskeyLogin(userId) || isTrustedMfaDevice(req, userId)
    const passwordLoginRequired = securityProfile.deadlineReached
      && securityProfile.role === 'customer'
      && securityProfile.passwordConfigured
      && payload?.authMethod === 'passwordless'
    const centrallyManagedSecurity = targetDomain !== 'web.zhzcloud.de'
    if (centrallyManagedSecurity && securityProfile.passwordRequiredNow && !securityProfile.passwordConfigured) {
      return res.status(403).json({ status: 'PASSWORD_SETUP_REQUIRED', message: 'Bitte legen Sie zuerst ein Passwort fest.' })
    }
    if (centrallyManagedSecurity && passwordLoginRequired) {
      return res.status(403).json({ status: 'PASSWORD_LOGIN_REQUIRED', message: 'Bitte melden Sie sich mit Ihrem Passwort an und bestätigen Sie danach den zweiten Faktor.' })
    }
    if (centrallyManagedSecurity && securityProfile.mfaRequiredNow && !sessionMfaDone) {
      return res.status(403).json({ status: 'MFA_REQUIRED', message: 'Bitte bestätigen Sie die Anmeldung mit Ihrem zweiten Faktor.' })
    }

    // Kanonische User-ID auflösen: Wenn der aktuelle User ein passwordless/thirdparty-Account ist,
    // bevorzuge den emailpassword-Account mit derselben E-Mail — der hat den Customer-Record im Zieldienst.
    try {
      const user = await supertokens.getUser(userId)
      const currentRecipe = user?.loginMethods?.[0]?.recipeId
      if (currentRecipe && currentRecipe !== 'emailpassword') {
        const email = user?.emails?.[0]
        if (email) {
          const allUsers = await supertokens.listUsersByAccountInfo('public', { email })
          const epUser = allUsers.find(u =>
            u.id !== userId &&
            u.loginMethods?.some(m => m.recipeId === 'emailpassword')
          )
          if (epUser) userId = epUser.id
        }
      }
    } catch (_) { /* Fallback: originale userId behalten */ }

    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0] || ''
    const requiredService = handoffServiceByDomain[targetDomain]
    const betterAssistRegistration = isBetterAssistRegistrationHandoff(
      targetDomain,
      handoffPurpose,
    )
    if (requiredService && !betterAssistRegistration
        && !(await hasCrmServiceAccess(email, requiredService, userId))) {
      return res.status(403).json({ status: 'ERROR', message: 'No service access' })
    }

    const mfaDone = sessionMfaDone
    const token = targetDomain === betterAssistHandoffV2Target
      ? createHandoffV2Token({
        secret: betterAssistHandoffV2Secret,
        userId,
        role: payload.role || 'customer',
        name: payload.name || '',
        targetDomain,
        mfaDone,
        authMethod: payload.authMethod || 'unknown',
      })
      : createHandoffToken({
        userId,
        role: payload.role || 'customer',
        name: payload.name || '',
        targetDomain,
        exp: Math.floor(Date.now() / 1000) + 60,
        mfaDone,
      })

    res.json({ status: 'OK', token })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

const allowedHandoffTargets = [
  'cp.zhzcloud.de', 'web.zhzcloud.de', 'zhzcloud.de', 'login.eazyfind.me',
  'portal.10hoch2.de', 'admin.10hoch2.de',
  'crm.cp.zhzcloud.de', 'crm.10hoch2.de', 'auth.10hoch2.de',
  ...(betterAssistHandoffV2Enabled ? [betterAssistHandoffV2Target] : []),
]

const handoffServiceByDomain = {
  'crm.cp.zhzcloud.de': 'crm',
  'crm.10hoch2.de': 'crm',
  'cp.zhzcloud.de': 'hosting-panel',
  'web.zhzcloud.de': 'access-portal',
  'zhzcloud.de': 'hosting-panel',
  'portal.10hoch2.de': 'crm',
  'admin.10hoch2.de': 'crm',
  'login.eazyfind.me': 'eazyfind',
  ...(betterAssistHandoffV2Enabled ? { [betterAssistHandoffV2Target]: 'betterassist' } : {}),
}

const allowedHandoffNextHosts = [
  'auth.10hoch2.de',
  'service.10hoch2.de',
  'pm.10hoch2.de',
  'analytics.10hoch2.de',
  'sign.10hoch2.de',
  'login.eazyfind.me',
  'eazyfind.me',
]

function isAllowedHandoffTarget(targetDomain) {
  return typeof targetDomain === 'string' && allowedHandoffTargets.includes(targetDomain)
}

function createHandoffToken({ userId, role = 'customer', name = '', targetDomain, exp, mfaDone = false }) {
  const data = `${userId}|${role}|${exp}|${targetDomain}`
  const hmac = crypto.createHmac('sha256', handoffSecret).update(data).digest('hex')
  return Buffer.from(JSON.stringify({
    userId, role, name, exp, targetDomain, hmac, mfaDone,
  })).toString('base64url')
}

function verifyHandoffToken(token) {
  const decoded = JSON.parse(Buffer.from(token, 'base64url').toString())
  const { userId, role, exp, targetDomain, hmac } = decoded

  if (Math.floor(Date.now() / 1000) > exp) {
    const error = new Error('Token expired')
    error.statusCode = 401
    throw error
  }

  const data = `${userId}|${role}|${exp}|${targetDomain}`
  const expected = crypto.createHmac('sha256', handoffSecret).update(data).digest('hex')
  if (!hmac || hmac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) {
    const error = new Error('Invalid token')
    error.statusCode = 401
    throw error
  }

  return decoded
}

function sanitizeHandoffNext(next) {
  if (!next) return '/account'
  try {
    const url = new URL(next, websiteDomain)
    if (url.origin === websiteDomain || allowedHandoffNextHosts.includes(url.hostname)) {
      return url.toString()
    }
  } catch (_) {}
  return '/account'
}

async function findCanonicalUserByEmail(email) {
  const users = await supertokens.listUsersByAccountInfo('public', { email })
  return users.find(user => user.loginMethods?.some(method => method.recipeId === 'emailpassword')) || users[0] || null
}

app.post('/internal/handoff-token', async (req, res) => {
  const secret = req.headers['x-provision-secret'] || req.headers['x-internal-api-key'] || req.body?.secret
  if (!internalHandoffSecrets.has(secret)) {
    return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' })
  }

  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const { targetDomain } = req.body
    if (!email) return res.status(400).json({ status: 'ERROR', message: 'Email required' })
    if (!isAllowedHandoffTarget(targetDomain)) {
      return res.status(400).json({ status: 'ERROR', message: 'Unauthorized target domain' })
    }
    if (targetDomain === betterAssistHandoffV2Target) {
      return res.status(400).json({ status: 'ERROR', message: 'Interactive handoff required' })
    }

    const user = await findCanonicalUserByEmail(email)
    if (!user) return res.status(404).json({ status: 'ERROR', message: 'Auth user not found' })

    const access = await crmServiceAccess(email, user.id)
    const requiredService = handoffServiceByDomain[targetDomain]
    if (requiredService && !(requiredService === 'crm' && access?.needsCompanyRegistration) && !access?.services?.includes(requiredService)) {
      return res.status(403).json({ status: 'ERROR', message: 'No service access' })
    }

    let metadata = {}
    try {
      const meta = await UserMetadata.getUserMetadata(user.id)
      metadata = meta.metadata || {}
    } catch (_) {}

    const role = req.body?.role || access?.role || 'customer'
    const exp = Math.floor(Date.now() / 1000) + 60
    const token = createHandoffToken({
      userId: user.id,
      role,
      name: req.body?.name || metadata.name || '',
      targetDomain,
      exp,
      // Trusted portals may forward the MFA result from the handoff token they
      // verified when establishing their own short-lived session.
      mfaDone: req.body?.mfaDone === true,
    })

    res.json({ status: 'OK', token })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.get('/auth/handoff-login', async (req, res) => {
  try {
    const token = req.query.sso_token || req.query.token
    if (!token) return res.status(400).json({ status: 'ERROR', message: 'Token required' })

    const decoded = verifyHandoffToken(token)
    if (decoded.targetDomain !== 'auth.10hoch2.de') {
      return res.status(400).json({ status: 'ERROR', message: 'Invalid target domain' })
    }

    const user = await supertokens.getUser(decoded.userId)
    const payload = {
      role: decoded.role || 'customer',
      name: decoded.name || '',
      email: user?.emails?.[0] || '',
      mfaDone: decoded.mfaDone || false,
    }
    await createCookieSessionResponse(res, decoded.userId, payload)
    res.redirect(sanitizeHandoffNext(req.query.next))
  } catch (err) {
    res.status(err.statusCode || 401).json({ status: 'ERROR', message: err.message || 'Invalid token' })
  }
})

// Handoff-Token validieren (vom Zieldienst aufgerufen)
app.post('/auth/verify-handoff-token', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ status: 'ERROR', message: 'Token required' })

    const decoded = token.includes('.')
      ? (() => {
        if (!betterAssistHandoffV2Enabled) throw new Error('Handoff v2 is disabled')
        if (!betterAssistVerifyKeyMatches(req.headers['x-betterassist-verify-key'])) {
          throw new Error('Unauthorized handoff v2 verifier')
        }
        return verifyAndConsumeHandoffV2Token({
          token,
          secret: betterAssistHandoffV2Secret,
          expectedTargetDomain: betterAssistHandoffV2Target,
          replayStore: betterAssistHandoffV2ReplayStore,
        })
      })()
      : verifyHandoffToken(token)
    const { userId, role, name, targetDomain } = decoded
    if (targetDomain === betterAssistHandoffV2Target && decoded.v !== 2) {
      throw new Error('Handoff v2 required for BetterAssist')
    }

    const user = await supertokens.getUser(userId)
    res.json({
      status: 'OK',
      userId,
      email: user?.emails?.[0] || '',
      role,
      name,
      targetDomain,
      mfaDone: decoded.mfaDone || false,
      ...(decoded.v === 2 ? {
        v: decoded.v,
        jti: decoded.jti,
        iat: decoded.iat,
        exp: decoded.exp,
        authMethod: decoded.authMethod,
      } : {}),
    })
  } catch (err) {
    res.status(401).json({ status: 'ERROR', message: 'Invalid token' })
  }
})

// TOTP-Challenge während Login (setzt mfaDone=true in Session)
app.get('/auth/onboarding/status', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const payload = req.session.getAccessTokenPayload()
    const profile = await getSecurityProfile(userId, payload?.role || 'customer')
    const trustedDevice = isTrustedMfaDevice(req, userId)
    const mfaDone = !!payload?.mfaDone || hasRecentPasskeyLogin(userId) || trustedDevice
    if (trustedDevice && !payload?.mfaDone) {
      await req.session.mergeIntoAccessTokenPayload({ mfaDone: true })
    }
    const passwordLoginRequired = profile.deadlineReached
      && profile.role === 'customer'
      && profile.passwordConfigured
      && payload?.authMethod === 'passwordless'
    res.json({
      status: 'OK',
      role: profile.role,
      passwordConfigured: profile.passwordConfigured,
      passwordRequiredNow: profile.passwordRequiredNow,
      canSkipPassword: !profile.passwordRequiredNow && profile.role === 'customer',
      mfaConfigured: profile.mfaConfigured,
      mfaMethod: profile.preferredMfaMethod,
      mfaDone,
      authMethod: payload?.authMethod || 'unknown',
      passwordLoginRequired,
      mfaRequiredNow: profile.mfaRequiredNow,
      canSkipMfa: !profile.mfaRequiredNow && profile.role === 'customer',
      deadline: customerSecurityDeadline.toISOString(),
    })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.post('/auth/mfa/email/request', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const profile = await getSecurityProfile(userId, req.session.getAccessTokenPayload()?.role || 'customer')
    if (!profile.email) return res.status(400).json({ status: 'ERROR', message: 'Keine E-Mail-Adresse hinterlegt.' })
    const rate = canRequestEmailMfa(userId)
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter))
      return res.status(429).json({ status: 'ERROR', message: 'Bitte warten Sie, bevor Sie einen neuen Code anfordern.', retryAfter: rate.retryAfter })
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    emailMfaChallenges.set(userId, { hash: emailMfaHash(userId, code), expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 })
    await sendEmail({
      to: profile.email,
      subject: 'Ihr Sicherheitscode – 10hoch2',
      html: emailTemplate('Anmeldung bestätigen', `<p>Guten Tag,</p><p>Ihr Sicherheitscode lautet:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;margin:28px 0">${code}</p><p>Der Code ist zehn Minuten gültig. Wenn Sie diese Anmeldung nicht gestartet haben, ändern Sie bitte umgehend Ihr Passwort.</p>`),
      text: `Ihr 10hoch2 Sicherheitscode lautet ${code}. Der Code ist zehn Minuten gültig.`,
    })
    res.json({ status: 'OK', expiresIn: 600 })
  } catch (err) {
    console.error('[Email MFA request]', err.message)
    res.status(503).json({ status: 'ERROR', message: 'Der E-Mail-Code konnte nicht versendet werden. Bitte versuchen Sie es erneut.' })
  }
})

app.post('/auth/mfa/email/verify', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const code = String(req.body?.code || '').replace(/\D/g, '')
    const challenge = emailMfaChallenges.get(userId)
    if (!challenge || challenge.expiresAt <= Date.now()) {
      emailMfaChallenges.delete(userId)
      return res.status(401).json({ status: 'INVALID_CODE', message: 'Der Code ist abgelaufen. Bitte fordern Sie einen neuen an.' })
    }
    challenge.attempts += 1
    if (challenge.attempts > 5) {
      emailMfaChallenges.delete(userId)
      return res.status(429).json({ status: 'INVALID_CODE', message: 'Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.' })
    }
    const expected = Buffer.from(challenge.hash, 'hex')
    const actual = Buffer.from(emailMfaHash(userId, code), 'hex')
    if (code.length !== 6 || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ status: 'INVALID_CODE', message: 'Der eingegebene Code ist ungültig.' })
    }
    emailMfaChallenges.delete(userId)
    await UserMetadata.updateUserMetadata(userId, { emailMfaEnabled: true, preferredMfaMethod: 'email' })
    await req.session.mergeIntoAccessTokenPayload({ mfaDone: true })
    setTrustedMfaDevice(res, userId)
    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.post('/auth/totp/verify-login', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { totp } = req.body
    const profile = await getSecurityProfile(userId, req.session.getAccessTokenPayload()?.role || 'customer')
    if (!profile.totpEnabled || !profile.totpSecret) {
      return res.status(400).json({ status: 'TOTP_NOT_CONFIGURED', message: 'Authenticator-App ist nicht eingerichtet.' })
    }

    if (!totp || !validateTotp(profile.totpSecret, totp)) {
      return res.status(401).json({ status: 'INVALID_TOTP', message: 'Ungültiger Code' })
    }

    await req.session.mergeIntoAccessTokenPayload({ mfaDone: true })
    setTrustedMfaDevice(res, userId)
    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

// --- Account / 2FA Routes ---

// TOTP Status abfragen
app.get('/auth/totp/status', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    // Prüfen ob TOTP-Devices existieren (über UserMetadata speichern wir es manuell)
    let meta = {}
    try { const r = await UserMetadata.getUserMetadata(userId); meta = r.metadata || {} } catch (_) {}
    res.json({ enabled: !!meta.totpEnabled, deviceCount: meta.totpEnabled ? 1 : 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// TOTP-Device erstellen (QR-Code + Secret)
app.post('/auth/totp/create-device', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0] || userId

    // Secret generieren
    const secret = generateBase32Secret()
    const issuer = 'ZHZ - 10hoch2 - Login'
    const label = encodeURIComponent(`${issuer}:${email}`)
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
    const qrUrl = await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 2, errorCorrectionLevel: 'M' })

    // Secret temporär in UserMetadata speichern (bis Bestätigung)
    await UserMetadata.updateUserMetadata(userId, { totpSecretPending: secret })

    res.json({ status: 'OK', qrCodeUrl: qrUrl, secret })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// TOTP-Device bestätigen
app.post('/auth/totp/verify-device', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { totp } = req.body
    const meta = (await UserMetadata.getUserMetadata(userId)).metadata || {}

    if (!meta.totpSecretPending) {
      return res.status(400).json({ status: 'ERROR', message: 'Kein TOTP-Setup ausstehend' })
    }

    // Code validieren
    const valid = validateTotp(meta.totpSecretPending, totp)
    if (!valid) return res.json({ status: 'INVALID_CODE' })

    // Secret dauerhaft speichern
    await UserMetadata.updateUserMetadata(userId, {
      totpEnabled: true,
      totpSecret: meta.totpSecretPending,
      totpSecretPending: null,
      preferredMfaMethod: 'totp',
    })
    // mfaDone in Session-Payload setzen
    await req.session.mergeIntoAccessTokenPayload({ mfaDone: true })
    setTrustedMfaDevice(res, userId)

    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// TOTP-Device löschen
app.delete('/auth/totp/device', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    await UserMetadata.updateUserMetadata(userId, { totpEnabled: false, totpSecret: null })
    await req.session.mergeIntoAccessTokenPayload({ mfaDone: false })
    clearTrustedMfaDevice(res)
    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/mfa/trusted-device/forget', verifySession(), async (req, res) => {
  await req.session.mergeIntoAccessTokenPayload({ mfaDone: false })
  clearTrustedMfaDevice(res)
  res.json({ status: 'OK' })
})

// Passwort ändern / erstmals setzen
app.post('/auth/user/password', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0]
    const { oldPassword, newPassword } = req.body

    if (!newPassword || newPassword.length < 8) {
      return res.json({ status: 'ERROR', message: 'Neues Passwort muss mindestens 8 Zeichen haben.' })
    }

    // EmailPassword-User für diese Email finden (kann ein anderer ST-User sein, da Account Linking deaktiviert)
    const allUsersWithEmail = await supertokens.listUsersByAccountInfo('public', { email })
    let epUser = allUsersWithEmail.find(u => u.loginMethods.some(m => m.recipeId === 'emailpassword'))
    if (!epUser) {
      const created = await EmailPassword.signUp('public', email, crypto.randomBytes(32).toString('base64url'))
      if (created.status !== 'OK') {
        return res.status(409).json({ status: 'ERROR', message: 'Der Passwortzugang konnte nicht angelegt werden.' })
      }
      epUser = created.user
      const currentRoles = await UserRoles.getRolesForUser('public', userId)
      for (const role of currentRoles.roles || ['customer']) {
        await UserRoles.addRoleToUser('public', epUser.id, role)
      }
    }
    const epLoginMethod = epUser.loginMethods.find(m => m.recipeId === 'emailpassword')

    // Prüfen ob bereits ein eigenes PW gesetzt wurde (Metadaten des EP-Users)
    const epMeta = await UserMetadata.getUserMetadata(epUser.id)
    const hasSetPassword = epMeta.metadata?.userSetPassword === true

    if (hasSetPassword) {
      // Altes Passwort erforderlich
      if (!oldPassword) return res.json({ status: 'WRONG_PASSWORD', message: 'Aktuelles Passwort ist erforderlich.' })
      const signInResult = await EmailPassword.signIn('public', email, oldPassword)
      if (signInResult.status !== 'OK') {
        return res.json({ status: 'WRONG_PASSWORD', message: 'Aktuelles Passwort ist falsch.' })
      }
    }

    await EmailPassword.updateEmailOrPassword({ recipeUserId: epLoginMethod.recipeUserId, password: newPassword })
    await UserMetadata.updateUserMetadata(epUser.id, { userSetPassword: true })
    res.json({ status: 'OK' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- TOTP Helpers ---
function generateBase32Secret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let secret = ''
  const bytes = crypto.randomBytes(20)
  for (let i = 0; i < 32; i++) {
    secret += chars[bytes[i % 20] % 32]
  }
  return secret
}

function validateTotp(secret, token) {
  if (!token || token.length !== 6) return false
  const period = 30
  const now = Math.floor(Date.now() / 1000)
  for (let offset = -1; offset <= 1; offset++) {
    const counter = Math.floor((now + offset * period) / period)
    const expected = generateHotp(secret, counter)
    if (expected === token) return true
  }
  return false
}

function base32Decode(encoded) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const output = []
  for (const c of encoded.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | chars.indexOf(c)
    bits += 5
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(output)
}

function generateHotp(secret, counter) {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buf).digest()
  const offset = hmac[19] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset+1] << 16) | (hmac[offset+2] << 8) | hmac[offset+3]
  return String(code % 1000000).padStart(6, '0')
}

// ── OIDC Provider ─────────────────────────────────────────────────────────────

const oidcKeyPair = (() => {
  const { generateKeyPairSync, createPublicKey } = require('crypto')
  const kp = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  const jwk = { ...createPublicKey(kp.publicKey).export({ format: 'jwk' }), use: 'sig', alg: 'RS256', kid: 'op-key-1' }
  return { privateKey: kp.privateKey, publicJwk: jwk }
})()

const OIDC_ISSUER = 'https://auth.10hoch2.de'
const oidcCodes = new Map()
const oidcTokens = new Map()

// Registered OIDC clients
const OIDC_CLIENTS = {
  'openproject': {
    // Keep the existing OpenProject registration operational on older
    // installations whose .env predates OIDC_OP_SECRET. New deployments
    // should still set the variable explicitly.
    secret: process.env.OIDC_OP_SECRET || 'OPoidcZHZ2026!',
    serviceId: 'pm',
    checkAndProvision: async (email, userId) => hasCrmServiceAccess(email, 'pm', userId),
  },
  'matomo': {
    secret: process.env.OIDC_MATOMO_SECRET || '',
    serviceId: 'analytics',
    checkAndProvision: null, // Matomo: only admin users → no check, provisionedServices controls visibility
  },
  'zammad': {
    secret: process.env.OIDC_ZAMMAD_SECRET || '',
    serviceId: 'tickets',
    checkAndProvision: async (email, userId) => hasCrmServiceAccess(email, 'tickets', userId),
  },
  'documenso': {
    secret: process.env.OIDC_DOCUMENSO_SECRET,
    serviceId: 'sign',
    redirectUris: ['https://sign.10hoch2.de/api/auth/callback/oidc'],
    // Customers must never enter contract administration. Both a staff role and
    // the explicit central sign entitlement are required server-side.
    checkAndProvision: async (email, userId) => hasCrmStaffServiceAccess(email, 'sign', userId),
  },
}
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of oidcCodes) if (now > v.exp) oidcCodes.delete(k)
  for (const [k, v] of oidcTokens) if (now > v.exp) oidcTokens.delete(k)
}, 5 * 60 * 1000)

app.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: OIDC_ISSUER,
    authorization_endpoint: `${OIDC_ISSUER}/oauth/authorize`,
    token_endpoint: `${OIDC_ISSUER}/oauth/token`,
    userinfo_endpoint: `${OIDC_ISSUER}/oauth/userinfo`,
    jwks_uri: `${OIDC_ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'email', 'email_verified', 'name', 'given_name', 'family_name'],
    grant_types_supported: ['authorization_code'],
  })
})

app.get('/.well-known/jwks.json', (req, res) => {
  res.json({ keys: [oidcKeyPair.publicJwk] })
})

app.get('/oauth/authorize', verifySession({ sessionRequired: false }), (req, res) => {
  const { client_id, redirect_uri, state, scope, nonce, response_type, code_challenge, code_challenge_method } = req.query
  const clientCfg = OIDC_CLIENTS[client_id]
  if (!clientCfg) return res.status(400).send('Invalid client_id')
  if (clientCfg.redirectUris && !clientCfg.redirectUris.includes(redirect_uri)) {
    return res.status(400).send('Invalid redirect_uri')
  }
  if (response_type !== 'code') return res.status(400).send('Only authorization_code flow supported')
  const oidcKey = crypto.randomBytes(16).toString('hex')
  oidcCodes.set(`pending:${oidcKey}`, { client_id, redirect_uri, state, scope, nonce, response_type, code_challenge, code_challenge_method, exp: Date.now() + 10 * 60 * 1000 })
  const pendingData = Buffer.from(JSON.stringify({ client_id, redirect_uri, state, scope, nonce, response_type, code_challenge, code_challenge_method })).toString('base64url')
  res.cookie('oidc_pending', pendingData, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, domain: 'auth.10hoch2.de',
  })
  if (req.session) {
    return res.redirect(`https://auth.10hoch2.de/oauth/complete?oidc_key=${oidcKey}`)
  }
  res.redirect(`https://auth.10hoch2.de/login?mode=oidc&oidc_key=${oidcKey}`)
})

app.get('/oauth/complete', verifySession(), async (req, res) => {
  // Try URL key first (reliable), then fall back to cookie
  let pending
  const oidcKey = req.query.oidc_key
  if (oidcKey) {
    const stored = oidcCodes.get(`pending:${oidcKey}`)
    if (stored && Date.now() < stored.exp) {
      pending = stored
      oidcCodes.delete(`pending:${oidcKey}`)
    }
  }
  if (!pending) {
    const pendingRaw = req.cookies?.oidc_pending
    if (!pendingRaw) return res.status(400).send('Keine OIDC-Anfrage gefunden. Bitte gehe zu pm.10hoch2.de/login.')
    try { pending = JSON.parse(Buffer.from(pendingRaw, 'base64url').toString()) }
    catch { return res.status(400).send('Ungültige OIDC-Anfrage') }
  }
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0] || ''
    let meta = {}
    try { const r = await UserMetadata.getUserMetadata(userId); meta = r.metadata || {} } catch (_) {}
    const name = meta.name || email.split('@')[0]

    const clientCfg = OIDC_CLIENTS[pending.client_id]
    if (clientCfg?.checkAndProvision) {
      const exists = await clientCfg.checkAndProvision(email, userId)
      if (!exists) {
        res.clearCookie('oidc_pending', { domain: 'auth.10hoch2.de' })
        return res.status(403).send(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Kein Zugang</title>
<style>body{font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
.box{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:420px;text-align:center}
h2{color:#1e293b;margin:0 0 8px}p{color:#64748b;margin:0 0 24px;font-size:14px}
a{display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500}</style></head>
<body><div class="box"><h2>Kein Zugang</h2>
<p>Dein Account (<strong>${email}</strong>) ist nicht für diesen Dienst freigeschaltet.<br>Bitte wende dich an den Support.</p>
<a href="https://auth.10hoch2.de/services">Zurück zum Portal</a></div></body></html>`)
      }
      // User exists in the service → provision auth account if not there yet, add serviceId
      const allUsers = await supertokens.listUsersByAccountInfo('public', { email })
      const authUserId = allUsers.length > 0 ? allUsers[0].id : null
      if (authUserId) {
        const authMeta = await UserMetadata.getUserMetadata(authUserId)
        const services = authMeta.metadata?.provisionedServices || []
        if (!services.includes(clientCfg.serviceId)) {
          await UserMetadata.updateUserMetadata(authUserId, { provisionedServices: [...services, clientCfg.serviceId] })
        }
      }
    }

    const code = crypto.randomBytes(16).toString('hex')
    oidcCodes.set(code, { email, name, nonce: pending.nonce, redirectUri: pending.redirect_uri, code_challenge: pending.code_challenge, code_challenge_method: pending.code_challenge_method, exp: Date.now() + 60_000 })
    res.clearCookie('oidc_pending', { domain: 'auth.10hoch2.de' })
    const url = new URL(pending.redirect_uri)
    url.searchParams.set('code', code)
    if (pending.state) url.searchParams.set('state', pending.state)
    res.redirect(url.toString())
  } catch (err) {
    console.error('[OIDC /oauth/complete]', err)
    res.status(500).send('OIDC-Fehler. Bitte erneut versuchen.')
  }
})

app.post('/oauth/token', express.urlencoded({ extended: false }), (req, res) => {
  let { grant_type, code, client_id, client_secret, code_verifier } = req.body
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Basic ')) {
    const [id, sec] = Buffer.from(authHeader.slice(6), 'base64').toString().split(':')
    if (!client_id) client_id = id
    if (!client_secret) client_secret = decodeURIComponent(sec || '')
  }
  const clientCfg = OIDC_CLIENTS[client_id]
  if (!clientCfg || !clientCfg.secret) return res.status(401).json({ error: 'invalid_client' })

  // Validate: either client_secret or PKCE code_verifier must be provided
  const info = oidcCodes.get(code)
  if (!info || Date.now() > info.exp) {
    oidcCodes.delete(code)
    return res.status(400).json({ error: 'invalid_grant' })
  }
  if (info.code_challenge) {
    // PKCE flow: verify code_verifier
    if (!code_verifier) return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier required' })
    const expected = crypto.createHash('sha256').update(code_verifier).digest('base64url')
    if (expected !== info.code_challenge) return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier mismatch' })
  } else {
    // Secret flow
    if (client_secret !== clientCfg.secret) return res.status(401).json({ error: 'invalid_client' })
  }
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' })
  }
  oidcCodes.delete(code)
  const now = Math.floor(Date.now() / 1000)
  const idToken = jwt.sign({
    iss: OIDC_ISSUER, sub: info.email, aud: client_id, iat: now, exp: now + 3600,
    email: info.email, email_verified: true, name: info.name, given_name: info.name, family_name: '',
    ...(info.nonce ? { nonce: info.nonce } : {}),
  }, oidcKeyPair.privateKey, { algorithm: 'RS256', keyid: oidcKeyPair.publicJwk.kid })
  const accessToken = crypto.randomBytes(32).toString('hex')
  oidcTokens.set(accessToken, { email: info.email, name: info.name, exp: Date.now() + 3_600_000 })
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, id_token: idToken, scope: 'openid email profile' })
})

app.get('/oauth/userinfo', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  const info = oidcTokens.get(token)
  if (!info || Date.now() > info.exp) {
    oidcTokens.delete(token)
    return res.status(401).json({ error: 'invalid_token' })
  }
  res.json({ sub: info.email, email: info.email, email_verified: true, name: info.name, given_name: info.name, family_name: '' })
})

// ── End OIDC ──────────────────────────────────────────────────────────────────

// One-time migration: add service to provisionedServices for a list of emails
app.post('/internal/migrate-services', async (req, res) => {
  const secret = req.headers['x-provision-secret'] || req.body?.secret
  if (secret !== (internalProvisionSecret)) {
    return res.status(401).json({ status: 'ERROR' })
  }
  const { emails, service } = req.body
  if (!emails || !service) return res.status(400).json({ status: 'ERROR', message: 'emails and service required' })

  const results = []
  for (const email of emails) {
    try {
      const users = await supertokens.listUsersByAccountInfo('public', { email })
      if (users.length === 0) { results.push({ email, status: 'not_found' }); continue }
      const userId = users[0].id
      const meta = await UserMetadata.getUserMetadata(userId)
      const services = meta.metadata?.provisionedServices || []
      if (!services.includes(service)) {
        await UserMetadata.updateUserMetadata(userId, { provisionedServices: [...services, service] })
        results.push({ email, status: 'updated' })
      } else {
        results.push({ email, status: 'already_set' })
      }
    } catch (e) {
      results.push({ email, status: 'error', message: e.message })
    }
  }
  res.json({ status: 'OK', results })
})

// Check if user needs to set a password (used after OTP login)
app.get('/auth/user/needs-password', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user?.emails?.[0]
    // Check EP user metadata (may be a different ST user when account linking is disabled)
    const allUsersWithEmail = await supertokens.listUsersByAccountInfo('public', { email })
    const epUser = allUsersWithEmail.find(u => u.loginMethods.some(m => m.recipeId === 'emailpassword'))
    if (!epUser) {
      return res.json({ needsPassword: true })
    }
    const epMeta = await UserMetadata.getUserMetadata(epUser.id)
    res.json({ needsPassword: !epMeta.metadata?.userSetPassword })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Internal Provisioning (called by OpenProject / other services) ─────────────
// Only accessible from internal IPs (127.x, 172.x, 10.x, 192.168.x)
const INTERNAL_PROVISION_SECRET = internalProvisionSecret

app.get('/internal/users', async (req, res) => {
  const secret = req.headers['x-provision-secret'] || req.query?.secret
  if (secret !== INTERNAL_PROVISION_SECRET) {
    return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' })
  }

  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 200)
    const paginationToken = req.query.paginationToken || undefined
    const page = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit, paginationToken })

    const users = await Promise.all(page.users.map(async (user) => {
      let roles = []
      let metadata = {}
      try {
        const roleResult = await UserRoles.getRolesForUser('public', user.id)
        roles = roleResult.roles || []
      } catch (_) {}
      try {
        const metaResult = await UserMetadata.getUserMetadata(user.id)
        metadata = metaResult.metadata || {}
      } catch (_) {}

      return {
        id: user.id,
        email: user.emails?.[0] || null,
        recipes: user.loginMethods.map(m => m.recipeId),
        roles,
        timeJoined: user.timeJoined,
        provisionedServices: metadata.provisionedServices || [],
      }
    }))

    res.json({
      status: 'OK',
      users,
      nextPaginationToken: page.nextPaginationToken || null,
    })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.delete('/internal/users/:userId', async (req, res) => {
  const secret = req.headers['x-provision-secret'] || req.headers['x-internal-api-key'] || req.body?.secret
  if (secret !== INTERNAL_PROVISION_SECRET) {
    return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' })
  }

  try {
    const userId = String(req.params.userId || '').trim()
    const expectedEmail = String(req.body?.email || '').trim().toLowerCase()
    const user = await supertokens.getUser(userId)
    if (!user) return res.json({ status: 'OK', message: 'already_deleted' })

    const actualEmail = String(user.emails?.[0] || '').trim().toLowerCase()
    if (!expectedEmail || actualEmail !== expectedEmail) {
      return res.status(409).json({ status: 'ERROR', message: 'User identity mismatch' })
    }

    await supertokens.deleteUser(userId)
    res.json({ status: 'OK', message: 'deleted' })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.post('/internal/provision-user', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  const secret = req.headers['x-provision-secret'] || req.body?.secret
  if (secret !== INTERNAL_PROVISION_SECRET) {
    return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' })
  }

  const { email, name } = req.body
  if (!email) return res.status(400).json({ status: 'ERROR', message: 'Email required' })

  const service = req.body?.service || 'pm'

  try {
    const existing = await supertokens.listUsersByAccountInfo('public', { email })
    if (existing.length > 0) {
      // User exists – add service to their provisionedServices if not already there
      const userId = existing[0].id
      const meta = await UserMetadata.getUserMetadata(userId)
      const services = meta.metadata?.provisionedServices || []
      if (!services.includes(service)) {
        await UserMetadata.updateUserMetadata(userId, { provisionedServices: [...services, service] })
      }
      return res.json({ status: 'OK', message: 'exists', userId })
    }

    const password = crypto.randomBytes(24).toString('base64url')
    const result = await EmailPassword.signUp('public', email, password)
    if (result.status !== 'OK') {
      return res.status(500).json({ status: 'ERROR', message: result.status })
    }

    const userId = result.user.id
    await UserRoles.addRoleToUser('public', userId, 'customer')
    await UserMetadata.updateUserMetadata(userId, {
      ...(name ? { name } : {}),
      provisionedServices: [service],
    })

    res.json({ status: 'OK', message: 'created', userId, email })
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

// ── End Internal ───────────────────────────────────────────────────────────────

// CRM remains authoritative. This endpoint only mirrors service access into
// central identity metadata and never removes the identity or grants a company.
app.post('/internal/service-access', async (req, res) => {
  const secret = req.headers['x-provision-secret'] || req.body?.secret
  if (secret !== INTERNAL_PROVISION_SECRET) {
    return res.status(401).json({ status: 'ERROR', message: 'Unauthorized' })
  }

  const email = String(req.body?.email || '').trim().toLowerCase()
  const expectedUserId = String(req.body?.userId || '').trim()
  const service = String(req.body?.service || '').trim()
  const enabled = req.body?.enabled
  if (!email || !email.includes('@') || !PROVISIONABLE_SERVICES.has(service) || typeof enabled !== 'boolean') {
    return res.status(400).json({ status: 'ERROR', message: 'Invalid service access request' })
  }

  try {
    const existing = await supertokens.listUsersByAccountInfo('public', { email })
    if (!existing.length) {
      if (!enabled) return res.json({ status: 'OK', message: 'already_absent', userId: null, services: [] })
      return res.status(404).json({ status: 'ERROR', message: 'User not found' })
    }
    const userId = existing[0].id
    if (expectedUserId && expectedUserId !== userId) {
      return res.status(409).json({ status: 'ERROR', message: 'User identity mismatch' })
    }
    const meta = await UserMetadata.getUserMetadata(userId)
    const current = Array.isArray(meta.metadata?.provisionedServices)
      ? meta.metadata.provisionedServices.filter(value => typeof value === 'string')
      : []
    const services = updateProvisionedServices(current, service, enabled)
    await UserMetadata.updateUserMetadata(userId, { provisionedServices: services })
    return res.json({ status: 'OK', message: enabled ? 'granted' : 'revoked', userId, services })
  } catch (err) {
    return res.status(500).json({ status: 'ERROR', message: err.message })
  }
})

app.use(errorHandler())
app.use((req, res) => res.status(404).json({ status: 'ERROR', message: 'Not found' }))

app.listen(PORT, () => {
  console.log(`Auth Portal running on port ${PORT} [${isProduction ? 'production' : 'dev'}]`)
})

// --- E-Mail Template ---
const btnStyle = 'background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function emailTemplate(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="font-family:Inter,system-ui,sans-serif;background:#f3f4f6;margin:0;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
      <div style="background:#2563eb;padding:24px 32px;display:flex;align-items:center;gap:12px">
        <span style="color:white;font-weight:700;font-size:20px">ZHZ – 10hoch2</span>
      </div>
      <div style="padding:32px">
        <h2 style="margin:0 0 16px;color:#111827;font-size:20px">${title}</h2>
        ${body}
      </div>
      <div style="padding:18px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.6;text-align:center">
        Alexander Erlenbusch | Panoramaweg 5A | 89346 Bibertal<br>
        +49 7308 7046100 | support@10hoch2.de | USt-IdNr.: DE354962715<br>
        <a href="https://10hoch2.de/datenschutz" style="color:#64748b">Datenschutz</a> ·
        <a href="https://10hoch2.de/impressum" style="color:#64748b">Impressum</a>
      </div>
    </div>
  </body></html>`
}
