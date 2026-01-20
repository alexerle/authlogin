import SuperTokens from 'supertokens-auth-react'
import EmailPassword from 'supertokens-auth-react/recipe/emailpassword'
import Session from 'supertokens-auth-react/recipe/session'
import Passwordless from 'supertokens-auth-react/recipe/passwordless'
import ThirdParty from 'supertokens-auth-react/recipe/thirdparty'
import EmailVerification from 'supertokens-auth-react/recipe/emailverification'

// Environment-based configuration
const getConfig = () => {
  const isProduction = import.meta.env.PROD

  return {
    // API Domain - where SuperTokens Core runs
    apiDomain: isProduction
      ? 'https://auth.10hoch2.de'
      : 'http://localhost:3001',

    // Website Domain - where this frontend runs
    websiteDomain: isProduction
      ? 'https://auth.10hoch2.de'
      : 'http://localhost:5173',

    // SuperTokens Core URL
    connectionUri: isProduction
      ? 'http://localhost:3567'  // Internal connection on server
      : 'http://37.27.254.59:3567',

    // API Key for SuperTokens (set via environment)
    apiKey: import.meta.env.VITE_SUPERTOKENS_API_KEY || '',
  }
}

export const config = getConfig()

// Allowed redirect domains after login
export const ALLOWED_REDIRECT_DOMAINS = [
  'eazyfind.me',
  'login.eazyfind.me',
  'search01.eazyfind.me',
  '10hoch2.de',
  'auth.10hoch2.de',
  'localhost',
]

// Check if redirect URL is allowed
export const isAllowedRedirect = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    return ALLOWED_REDIRECT_DOMAINS.some(domain =>
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
    )
  } catch {
    return false
  }
}

// Initialize SuperTokens
export const initSuperTokens = () => {
  SuperTokens.init({
    appInfo: {
      appName: '10hoch2 Auth Portal',
      apiDomain: config.apiDomain,
      websiteDomain: config.websiteDomain,
      apiBasePath: '/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [
      // Email + Password Authentication
      EmailPassword.init({
        signInAndUpFeature: {
          signUpForm: {
            formFields: [
              {
                id: 'email',
                label: 'E-Mail',
                placeholder: 'ihre@email.de',
              },
              {
                id: 'password',
                label: 'Passwort',
                placeholder: 'Mindestens 8 Zeichen',
              },
              {
                id: 'name',
                label: 'Name (optional)',
                placeholder: 'Ihr Name',
                optional: true,
              },
            ],
          },
        },
        // Custom email/password validation
        override: {
          functions: (originalImplementation) => ({
            ...originalImplementation,
          }),
        },
      }),

      // Passwordless (OTP via Email)
      Passwordless.init({
        contactMethod: 'EMAIL',
      }),

      // Social Login (Google, GitHub)
      ThirdParty.init({
        signInAndUpFeature: {
          providers: [
            // Will be configured on backend
          ],
        },
      }),

      // Email Verification
      EmailVerification.init({
        mode: 'OPTIONAL', // or 'REQUIRED'
      }),

      // Session Management
      Session.init({
        tokenTransferMethod: 'header', // Use Authorization header
        sessionTokenFrontendDomain: '.10hoch2.de', // Share session across subdomains
      }),
    ],
  })
}

export default initSuperTokens
