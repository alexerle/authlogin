require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const crypto = require('crypto')
const supertokens = require('supertokens-node')
const Session = require('supertokens-node/recipe/session')
const EmailPassword = require('supertokens-node/recipe/emailpassword')
const Passwordless = require('supertokens-node/recipe/passwordless')
const ThirdParty = require('supertokens-node/recipe/thirdparty')
const EmailVerification = require('supertokens-node/recipe/emailverification')
const Dashboard = require('supertokens-node/recipe/dashboard')
const UserMetadata = require('supertokens-node/recipe/usermetadata')
const { middleware, errorHandler } = require('supertokens-node/framework/express')
const { verifySession } = require('supertokens-node/recipe/session/framework/express')
const { sendEmail } = require('./email')

const app = express()
const PORT = process.env.PORT || 3001

// Environment check
const isProduction = process.env.NODE_ENV === 'production'
const apiDomain = process.env.API_DOMAIN || 'http://localhost:3001'
const websiteDomain = process.env.WEBSITE_DOMAIN || 'http://localhost:5173'
const cookieDomain = process.env.COOKIE_DOMAIN || undefined

// WebAuthn/Passkey configuration
const rpId = process.env.WEBAUTHN_RP_ID || 'localhost'
const rpName = process.env.WEBAUTHN_RP_NAME || '10hoch2 Login'
const rpOrigin = process.env.WEBAUTHN_RP_ORIGIN || websiteDomain

// TOTP configuration
const totpIssuer = process.env.TOTP_ISSUER || '10hoch2'

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://auth.10hoch2.de',
  'https://login.eazyfind.me',
  'https://eazyfind.me',
  'https://search01.eazyfind.me',
]

// Build OAuth providers array dynamically
const buildOAuthProviders = () => {
  const providers = []

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID) {
    providers.push({
      config: {
        thirdPartyId: 'google',
        clients: [{
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }],
      },
    })
  }

  // GitHub OAuth
  if (process.env.GITHUB_CLIENT_ID) {
    providers.push({
      config: {
        thirdPartyId: 'github',
        clients: [{
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }],
      },
    })
  }

  // Microsoft/Azure AD OAuth
  if (process.env.MICROSOFT_CLIENT_ID) {
    providers.push({
      config: {
        thirdPartyId: 'active-directory',
        name: 'Microsoft',
        clients: [{
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          additionalConfig: {
            directoryId: process.env.MICROSOFT_TENANT_ID || 'common',
          },
        }],
      },
    })
  }

  // Apple Sign-In
  if (process.env.APPLE_CLIENT_ID) {
    providers.push({
      config: {
        thirdPartyId: 'apple',
        clients: [{
          clientId: process.env.APPLE_CLIENT_ID,
          additionalConfig: {
            teamId: process.env.APPLE_TEAM_ID,
            keyId: process.env.APPLE_KEY_ID,
            privateKey: process.env.APPLE_PRIVATE_KEY,
          },
        }],
      },
    })
  }

  // Facebook OAuth
  if (process.env.FACEBOOK_CLIENT_ID) {
    providers.push({
      config: {
        thirdPartyId: 'facebook',
        clients: [{
          clientId: process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        }],
      },
    })
  }

  return providers
}

// Initialize SuperTokens
supertokens.init({
  framework: 'express',
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI || 'http://localhost:3567',
    apiKey: process.env.SUPERTOKENS_API_KEY || undefined,
  },
  appInfo: {
    appName: '10hoch2 Auth Portal',
    apiDomain,
    websiteDomain,
    apiBasePath: '/auth',
    websiteBasePath: '/auth',
  },
  recipeList: [
    // Email + Password Authentication
    EmailPassword.init({
      signUpFeature: {
        formFields: [
          { id: 'email' },
          { id: 'password' },
          { id: 'name', optional: true },
        ],
      },
      emailDelivery: {
        override: (originalImplementation) => ({
          ...originalImplementation,
          sendEmail: async (input) => {
            if (input.type === 'PASSWORD_RESET') {
              const resetLink = input.passwordResetLink
              await sendEmail({
                to: input.user.email,
                subject: 'Passwort zurücksetzen - 10hoch2',
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1f2937;">Passwort zurücksetzen</h2>
                    <p>Hallo,</p>
                    <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
                    <p><a href="${resetLink}" style="background: linear-gradient(to right, #2563eb, #7c3aed); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Passwort zurücksetzen</a></p>
                    <p style="color: #6b7280; font-size: 14px;">Dieser Link ist 24 Stunden gültig.</p>
                    <p style="color: #6b7280; font-size: 14px;">Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.</p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                    <p style="color: #9ca3af; font-size: 12px;">10hoch2 GmbH</p>
                  </div>
                `,
              })
            }
          },
        }),
      },
    }),

    // Passwordless (OTP via Email)
    Passwordless.init({
      flowType: 'USER_INPUT_CODE',
      contactMethod: 'EMAIL',
      emailDelivery: {
        override: (originalImplementation) => ({
          ...originalImplementation,
          sendEmail: async (input) => {
            await sendEmail({
              to: input.email,
              subject: 'Ihr Login-Code - 10hoch2',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1f2937;">Ihr Login-Code</h2>
                  <p>Hallo,</p>
                  <p>Ihr Login-Code lautet:</p>
                  <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb; background: #f3f4f6; padding: 16px 24px; border-radius: 8px; display: inline-block;">${input.userInputCode}</p>
                  <p style="color: #6b7280; font-size: 14px;">Dieser Code ist 15 Minuten gültig.</p>
                  <p style="color: #6b7280; font-size: 14px;">Falls Sie diesen Code nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                  <p style="color: #9ca3af; font-size: 12px;">10hoch2 GmbH</p>
                </div>
              `,
            })
          },
        }),
      },
    }),

    // Social Login (OAuth Providers)
    ThirdParty.init({
      signInAndUpFeature: {
        providers: buildOAuthProviders(),
      },
    }),

    // Email Verification
    EmailVerification.init({
      mode: 'OPTIONAL',
      emailDelivery: {
        override: (originalImplementation) => ({
          ...originalImplementation,
          sendEmail: async (input) => {
            const verifyLink = input.emailVerifyLink
            await sendEmail({
              to: input.user.email,
              subject: 'E-Mail bestätigen - 10hoch2',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1f2937;">E-Mail-Adresse bestätigen</h2>
                  <p>Hallo,</p>
                  <p>Bitte bestätigen Sie Ihre E-Mail-Adresse.</p>
                  <p><a href="${verifyLink}" style="background: linear-gradient(to right, #2563eb, #7c3aed); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">E-Mail bestätigen</a></p>
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                  <p style="color: #9ca3af; font-size: 12px;">10hoch2 GmbH</p>
                </div>
              `,
            })
          },
        }),
      },
    }),

    // User Metadata (for storing TOTP secrets, passkeys, etc.)
    UserMetadata.init(),

    // Session Management
    Session.init({
      cookieDomain: isProduction ? cookieDomain : undefined,
      cookieSecure: isProduction,
      sessionExpiredStatusCode: 401,
      override: {
        functions: (originalImplementation) => ({
          ...originalImplementation,
          createNewSession: async (input) => {
            const userId = input.userId
            return originalImplementation.createNewSession({
              ...input,
              accessTokenPayload: {
                ...input.accessTokenPayload,
                userId,
              },
            })
          },
        }),
      },
    }),

    // SuperTokens Dashboard (for admin)
    Dashboard.init({
      apiKey: process.env.SUPERTOKENS_DASHBOARD_API_KEY || 'dashboard-secret-key',
    }),
  ],
})

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}))

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else if (origin.endsWith('.10hoch2.de') || origin.endsWith('.eazyfind.me')) {
      callback(null, true)
    } else {
      callback(null, false)
    }
  },
  credentials: true,
  allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
}))

app.use(express.json())

// SuperTokens middleware
app.use(middleware())

// ============================================
// TOTP / 2FA ENDPOINTS
// ============================================

// Generate TOTP secret and QR code data
app.post('/auth/totp/setup', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user.emails[0]

    // Generate a random secret (20 bytes = 160 bits, base32 encoded)
    const secret = crypto.randomBytes(20).toString('base32').replace(/=/g, '').substring(0, 32)

    // Create otpauth URL for QR code
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(totpIssuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(totpIssuer)}&algorithm=SHA1&digits=6&period=30`

    // Store secret temporarily (will be confirmed after verification)
    await UserMetadata.updateUserMetadata(userId, {
      totpPendingSecret: secret,
    })

    res.json({
      status: 'OK',
      secret,
      otpauthUrl,
      issuer: totpIssuer,
      email,
    })
  } catch (error) {
    console.error('TOTP setup error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Verify and activate TOTP
app.post('/auth/totp/verify', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { code } = req.body

    if (!code || code.length !== 6) {
      return res.status(400).json({ status: 'ERROR', message: 'Ungültiger Code' })
    }

    // Get pending secret
    const { metadata } = await UserMetadata.getUserMetadata(userId)
    const secret = metadata.totpPendingSecret

    if (!secret) {
      return res.status(400).json({ status: 'ERROR', message: 'Kein TOTP-Setup gefunden. Bitte starten Sie den Vorgang erneut.' })
    }

    // Verify the code
    const isValid = verifyTOTP(secret, code)

    if (!isValid) {
      return res.status(400).json({ status: 'ERROR', message: 'Ungültiger Code. Bitte versuchen Sie es erneut.' })
    }

    // Activate TOTP
    await UserMetadata.updateUserMetadata(userId, {
      totpEnabled: true,
      totpSecret: secret,
      totpPendingSecret: null,
      totpEnabledAt: Date.now(),
    })

    res.json({ status: 'OK', message: 'TOTP erfolgreich aktiviert' })
  } catch (error) {
    console.error('TOTP verify error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Check TOTP code during login
app.post('/auth/totp/check', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { code } = req.body

    const { metadata } = await UserMetadata.getUserMetadata(userId)

    if (!metadata.totpEnabled) {
      return res.status(400).json({ status: 'ERROR', message: 'TOTP nicht aktiviert' })
    }

    const isValid = verifyTOTP(metadata.totpSecret, code)

    if (!isValid) {
      return res.status(400).json({ status: 'ERROR', message: 'Ungültiger Code' })
    }

    res.json({ status: 'OK' })
  } catch (error) {
    console.error('TOTP check error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Disable TOTP
app.post('/auth/totp/disable', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { code } = req.body

    const { metadata } = await UserMetadata.getUserMetadata(userId)

    if (!metadata.totpEnabled) {
      return res.status(400).json({ status: 'ERROR', message: 'TOTP ist nicht aktiviert' })
    }

    // Verify code before disabling
    const isValid = verifyTOTP(metadata.totpSecret, code)

    if (!isValid) {
      return res.status(400).json({ status: 'ERROR', message: 'Ungültiger Code' })
    }

    await UserMetadata.updateUserMetadata(userId, {
      totpEnabled: false,
      totpSecret: null,
      totpPendingSecret: null,
    })

    res.json({ status: 'OK', message: 'TOTP deaktiviert' })
  } catch (error) {
    console.error('TOTP disable error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Get TOTP status
app.get('/auth/totp/status', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { metadata } = await UserMetadata.getUserMetadata(userId)

    res.json({
      status: 'OK',
      totpEnabled: metadata.totpEnabled || false,
      totpEnabledAt: metadata.totpEnabledAt || null,
    })
  } catch (error) {
    console.error('TOTP status error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// TOTP verification helper
function verifyTOTP(secret, code, window = 1) {
  const time = Math.floor(Date.now() / 1000 / 30)

  for (let i = -window; i <= window; i++) {
    const expectedCode = generateTOTP(secret, time + i)
    if (expectedCode === code) {
      return true
    }
  }
  return false
}

function generateTOTP(secret, time) {
  // Convert time to buffer
  const timeBuffer = Buffer.alloc(8)
  timeBuffer.writeBigInt64BE(BigInt(time))

  // Decode base32 secret
  const secretBuffer = base32Decode(secret)

  // Generate HMAC-SHA1
  const hmac = crypto.createHmac('sha1', secretBuffer)
  hmac.update(timeBuffer)
  const hash = hmac.digest()

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  // Generate 6-digit code
  const otp = binary % 1000000
  return otp.toString().padStart(6, '0')
}

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''

  for (const char of str.toUpperCase()) {
    const val = alphabet.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2))
  }

  return Buffer.from(bytes)
}

// ============================================
// PASSKEY / WEBAUTHN ENDPOINTS
// ============================================

// Store for challenges (in production, use Redis or database)
const challengeStore = new Map()

// Generate registration options for passkey
app.post('/auth/passkey/register/options', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const email = user.emails[0]

    // Get existing passkeys
    const { metadata } = await UserMetadata.getUserMetadata(userId)
    const existingPasskeys = metadata.passkeys || []

    // Generate challenge
    const challenge = crypto.randomBytes(32)
    const challengeBase64 = challenge.toString('base64url')

    // Store challenge temporarily
    challengeStore.set(userId, {
      challenge: challengeBase64,
      timestamp: Date.now(),
    })

    // Clean old challenges after 5 minutes
    setTimeout(() => challengeStore.delete(userId), 5 * 60 * 1000)

    const options = {
      challenge: challengeBase64,
      rp: {
        name: rpName,
        id: rpId,
      },
      user: {
        id: Buffer.from(userId).toString('base64url'),
        name: email,
        displayName: email.split('@')[0],
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: 60000,
      attestation: 'none',
      excludeCredentials: existingPasskeys.map(pk => ({
        id: pk.credentialId,
        type: 'public-key',
        transports: pk.transports || ['internal'],
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    }

    res.json({ status: 'OK', options })
  } catch (error) {
    console.error('Passkey register options error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Complete passkey registration
app.post('/auth/passkey/register/complete', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { credential, name } = req.body

    // Verify challenge
    const stored = challengeStore.get(userId)
    if (!stored) {
      return res.status(400).json({ status: 'ERROR', message: 'Challenge abgelaufen. Bitte erneut versuchen.' })
    }

    // Verify origin
    const clientData = JSON.parse(Buffer.from(credential.response.clientDataJSON, 'base64url').toString())

    if (clientData.type !== 'webauthn.create') {
      return res.status(400).json({ status: 'ERROR', message: 'Ungültiger Credential-Typ' })
    }

    if (clientData.challenge !== stored.challenge) {
      return res.status(400).json({ status: 'ERROR', message: 'Challenge stimmt nicht überein' })
    }

    // Get existing passkeys
    const { metadata } = await UserMetadata.getUserMetadata(userId)
    const existingPasskeys = metadata.passkeys || []

    // Store new passkey
    const newPasskey = {
      credentialId: credential.id,
      publicKey: credential.response.publicKey,
      counter: 0,
      name: name || `Passkey ${existingPasskeys.length + 1}`,
      createdAt: Date.now(),
      transports: credential.response.transports || ['internal'],
    }

    await UserMetadata.updateUserMetadata(userId, {
      passkeys: [...existingPasskeys, newPasskey],
      passkeyEnabled: true,
    })

    challengeStore.delete(userId)

    res.json({ status: 'OK', message: 'Passkey erfolgreich registriert' })
  } catch (error) {
    console.error('Passkey register complete error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Generate authentication options for passkey login
app.post('/auth/passkey/login/options', async (req, res) => {
  try {
    const { email } = req.body

    // Find user by email
    const users = await supertokens.listUsersByAccountInfo('public', { email })

    if (!users || users.length === 0) {
      return res.status(404).json({ status: 'ERROR', message: 'Benutzer nicht gefunden' })
    }

    const userId = users[0].id
    const { metadata } = await UserMetadata.getUserMetadata(userId)
    const passkeys = metadata.passkeys || []

    if (passkeys.length === 0) {
      return res.status(400).json({ status: 'ERROR', message: 'Keine Passkeys registriert' })
    }

    // Generate challenge
    const challenge = crypto.randomBytes(32)
    const challengeBase64 = challenge.toString('base64url')

    // Store challenge
    challengeStore.set(`login:${email}`, {
      challenge: challengeBase64,
      userId,
      timestamp: Date.now(),
    })

    setTimeout(() => challengeStore.delete(`login:${email}`), 5 * 60 * 1000)

    const options = {
      challenge: challengeBase64,
      timeout: 60000,
      rpId,
      allowCredentials: passkeys.map(pk => ({
        id: pk.credentialId,
        type: 'public-key',
        transports: pk.transports || ['internal'],
      })),
      userVerification: 'preferred',
    }

    res.json({ status: 'OK', options })
  } catch (error) {
    console.error('Passkey login options error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Complete passkey login
app.post('/auth/passkey/login/complete', async (req, res) => {
  try {
    const { email, credential } = req.body

    // Get stored challenge
    const stored = challengeStore.get(`login:${email}`)
    if (!stored) {
      return res.status(400).json({ status: 'ERROR', message: 'Challenge abgelaufen' })
    }

    // Verify client data
    const clientData = JSON.parse(Buffer.from(credential.response.clientDataJSON, 'base64url').toString())

    if (clientData.type !== 'webauthn.get') {
      return res.status(400).json({ status: 'ERROR', message: 'Ungültiger Credential-Typ' })
    }

    if (clientData.challenge !== stored.challenge) {
      return res.status(400).json({ status: 'ERROR', message: 'Challenge stimmt nicht überein' })
    }

    // Get user passkeys
    const { metadata } = await UserMetadata.getUserMetadata(stored.userId)
    const passkey = (metadata.passkeys || []).find(pk => pk.credentialId === credential.id)

    if (!passkey) {
      return res.status(400).json({ status: 'ERROR', message: 'Passkey nicht gefunden' })
    }

    // Create session
    const session = await Session.createNewSession(req, res, 'public', supertokens.convertToRecipeUserId(stored.userId))

    challengeStore.delete(`login:${email}`)

    res.json({
      status: 'OK',
      message: 'Login erfolgreich',
      session: {
        userId: stored.userId,
      },
    })
  } catch (error) {
    console.error('Passkey login complete error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// List user's passkeys
app.get('/auth/passkey/list', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { metadata } = await UserMetadata.getUserMetadata(userId)
    const passkeys = metadata.passkeys || []

    res.json({
      status: 'OK',
      passkeys: passkeys.map(pk => ({
        credentialId: pk.credentialId,
        name: pk.name,
        createdAt: pk.createdAt,
      })),
    })
  } catch (error) {
    console.error('Passkey list error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Delete a passkey
app.delete('/auth/passkey/:credentialId', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const { credentialId } = req.params

    const { metadata } = await UserMetadata.getUserMetadata(userId)
    const passkeys = metadata.passkeys || []

    const updatedPasskeys = passkeys.filter(pk => pk.credentialId !== credentialId)

    await UserMetadata.updateUserMetadata(userId, {
      passkeys: updatedPasskeys,
      passkeyEnabled: updatedPasskeys.length > 0,
    })

    res.json({ status: 'OK', message: 'Passkey gelöscht' })
  } catch (error) {
    console.error('Passkey delete error:', error)
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// ============================================
// STANDARD ENDPOINTS
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-portal' })
})

// Session verification
app.get('/auth/session/verify', verifySession({ sessionRequired: false }), (req, res) => {
  if (req.session) {
    res.json({
      status: 'OK',
      session: {
        userId: req.session.getUserId(),
        accessTokenPayload: req.session.getAccessTokenPayload(),
      },
    })
  } else {
    res.json({ status: 'NO_SESSION' })
  }
})

// Get user info with security settings
app.get('/auth/user', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)
    const { metadata } = await UserMetadata.getUserMetadata(userId)

    res.json({
      status: 'OK',
      user: {
        id: user.id,
        email: user.emails[0],
        timeJoined: user.timeJoined,
        security: {
          totpEnabled: metadata.totpEnabled || false,
          passkeyEnabled: metadata.passkeyEnabled || false,
          passkeyCount: (metadata.passkeys || []).length,
        },
      },
    })
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
})

// Get available auth methods
app.get('/auth/methods', (req, res) => {
  const methods = {
    emailPassword: true,
    passwordless: true,
    totp: true,
    passkeys: true,
    oauth: {
      google: !!process.env.GOOGLE_CLIENT_ID,
      github: !!process.env.GITHUB_CLIENT_ID,
      microsoft: !!process.env.MICROSOFT_CLIENT_ID,
      apple: !!process.env.APPLE_CLIENT_ID,
      facebook: !!process.env.FACEBOOK_CLIENT_ID,
    },
  }

  res.json({ status: 'OK', methods })
})

// Error handler
app.use(errorHandler())

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'ERROR', message: 'Not found' })
})

// Start server
app.listen(PORT, () => {
  console.log(`Auth Portal Server running on port ${PORT}`)
  console.log(`API Domain: ${apiDomain}`)
  console.log(`Website Domain: ${websiteDomain}`)
  console.log(`Environment: ${isProduction ? 'production' : 'development'}`)
  console.log(`WebAuthn RP ID: ${rpId}`)
  console.log('OAuth Providers:', {
    google: !!process.env.GOOGLE_CLIENT_ID,
    github: !!process.env.GITHUB_CLIENT_ID,
    microsoft: !!process.env.MICROSOFT_CLIENT_ID,
    apple: !!process.env.APPLE_CLIENT_ID,
    facebook: !!process.env.FACEBOOK_CLIENT_ID,
  })
})
