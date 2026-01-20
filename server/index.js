require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const supertokens = require('supertokens-node')
const Session = require('supertokens-node/recipe/session')
const EmailPassword = require('supertokens-node/recipe/emailpassword')
const Passwordless = require('supertokens-node/recipe/passwordless')
const ThirdParty = require('supertokens-node/recipe/thirdparty')
const EmailVerification = require('supertokens-node/recipe/emailverification')
const Dashboard = require('supertokens-node/recipe/dashboard')
const { middleware, errorHandler, getSession } = require('supertokens-node/framework/express')
const { verifySession } = require('supertokens-node/recipe/session/framework/express')
const { sendEmail } = require('./email')

const app = express()
const PORT = process.env.PORT || 3001

// Environment check
const isProduction = process.env.NODE_ENV === 'production'
const apiDomain = process.env.API_DOMAIN || 'http://localhost:3001'
const websiteDomain = process.env.WEBSITE_DOMAIN || 'http://localhost:5173'
const cookieDomain = process.env.COOKIE_DOMAIN || undefined

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://auth.10hoch2.de',
  'https://login.eazyfind.me',
  'https://eazyfind.me',
  'https://search01.eazyfind.me',
]

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
          {
            id: 'name',
            optional: true,
          },
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
                  <h2>Passwort zurücksetzen</h2>
                  <p>Hallo,</p>
                  <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
                  <p><a href="${resetLink}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Passwort zurücksetzen</a></p>
                  <p>Dieser Link ist 24 Stunden gültig.</p>
                  <p>Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.</p>
                  <p>Mit freundlichen Grüßen,<br>Ihr 10hoch2 Team</p>
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
                <h2>Ihr Login-Code</h2>
                <p>Hallo,</p>
                <p>Ihr Login-Code lautet:</p>
                <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${input.userInputCode}</p>
                <p>Dieser Code ist 15 Minuten gültig.</p>
                <p>Falls Sie diesen Code nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
                <p>Mit freundlichen Grüßen,<br>Ihr 10hoch2 Team</p>
              `,
            })
          },
        }),
      },
    }),

    // Social Login (Google, GitHub)
    ThirdParty.init({
      signInAndUpFeature: {
        providers: [
          // Google OAuth
          ...(process.env.GOOGLE_CLIENT_ID
            ? [
                {
                  config: {
                    thirdPartyId: 'google',
                    clients: [
                      {
                        clientId: process.env.GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                      },
                    ],
                  },
                },
              ]
            : []),
          // GitHub OAuth
          ...(process.env.GITHUB_CLIENT_ID
            ? [
                {
                  config: {
                    thirdPartyId: 'github',
                    clients: [
                      {
                        clientId: process.env.GITHUB_CLIENT_ID,
                        clientSecret: process.env.GITHUB_CLIENT_SECRET,
                      },
                    ],
                  },
                },
              ]
            : []),
        ],
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
                <h2>E-Mail-Adresse bestätigen</h2>
                <p>Hallo,</p>
                <p>Bitte bestätigen Sie Ihre E-Mail-Adresse.</p>
                <p><a href="${verifyLink}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">E-Mail bestätigen</a></p>
                <p>Mit freundlichen Grüßen,<br>Ihr 10hoch2 Team</p>
              `,
            })
          },
        }),
      },
    }),

    // Session Management
    Session.init({
      cookieDomain: isProduction ? cookieDomain : undefined,
      cookieSecure: isProduction,
      sessionExpiredStatusCode: 401,
      override: {
        functions: (originalImplementation) => ({
          ...originalImplementation,
          createNewSession: async (input) => {
            // Add custom claims to session
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-portal' })
})

// Custom API routes
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

// Get user info
app.get('/auth/user', verifySession(), async (req, res) => {
  try {
    const userId = req.session.getUserId()
    const user = await supertokens.getUser(userId)

    res.json({
      status: 'OK',
      user: {
        id: user.id,
        email: user.emails[0],
        timeJoined: user.timeJoined,
      },
    })
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message })
  }
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
})
