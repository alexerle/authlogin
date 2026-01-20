# 10hoch2 Auth Portal

Zentrales Login-Portal für alle 10hoch2 Dienste mit SuperTokens Authentication.

**Live:** https://auth.10hoch2.de

## Features

- **Email/Passwort Login** - Klassische Anmeldung mit E-Mail und Passwort
- **OTP Login** - Passwordless Login per 6-stelligem Code via E-Mail
- **Registrierung** - Mit Passwort-Stärke-Anzeige und Validierung
- **Passwort vergessen** - Reset-Link per E-Mail
- **E-Mail-Verifizierung** - Bestätigungslink per E-Mail
- **Social Login** - Google & GitHub OAuth (vorbereitet)
- **HTTPS-Only** - Automatische Umleitung, HSTS aktiviert
- **Multi-Domain SSO** - Session-Sharing über Cookie-Domain

## Technologie-Stack

### Frontend
| Technologie | Version | Zweck |
|-------------|---------|-------|
| React | 18.x | UI Framework |
| Vite | 5.x | Build Tool |
| TypeScript | 5.x | Type Safety |
| Tailwind CSS | 3.x | Styling |
| React Router | 6.x | Routing |
| Lucide React | - | Icons |
| Axios | - | HTTP Client |

### Backend
| Technologie | Version | Zweck |
|-------------|---------|-------|
| Node.js | 20.x | Runtime |
| Express | 4.x | Web Framework |
| SuperTokens Node | 17.x | Authentication |
| Nodemailer | 6.x | E-Mail Versand |
| Helmet | 7.x | Security Headers |
| PM2 | 6.x | Process Manager |

### Infrastruktur
| Komponente | Details |
|------------|---------|
| Server | Ubuntu 24.04, Hetzner (37.27.254.59) |
| SuperTokens Core | Docker Container, Port 3567 |
| PostgreSQL | Docker Container (für SuperTokens) |
| Nginx | Reverse Proxy + SSL Termination |
| Let's Encrypt | SSL Zertifikat (auto-renewal) |

## Projektstruktur

```
authlogin/
├── src/                      # Frontend Source
│   ├── components/           # React Components
│   │   ├── AuthLayout.tsx    # Layout für Auth-Seiten
│   │   └── Logo.tsx          # Logo Component
│   ├── config/
│   │   └── supertokens.ts    # SuperTokens Konfiguration
│   ├── pages/                # Seiten
│   │   ├── LoginPage.tsx     # Login (Passwort + OTP)
│   │   ├── RegisterPage.tsx  # Registrierung
│   │   ├── ForgotPasswordPage.tsx
│   │   ├── ResetPasswordPage.tsx
│   │   ├── VerifyEmailPage.tsx
│   │   └── ServicesPage.tsx  # Dienst-Auswahl nach Login
│   ├── utils/
│   │   └── api.ts            # Axios API Client
│   ├── App.tsx               # Router Setup
│   ├── main.tsx              # Entry Point
│   └── index.css             # Tailwind + Custom Styles
├── server/                   # Backend
│   ├── index.js              # Express Server + SuperTokens
│   ├── email.js              # E-Mail Service (Nodemailer)
│   ├── package.json
│   └── .env.example          # Umgebungsvariablen Template
├── public/
│   └── favicon.svg           # Favicon
├── nginx.conf                # Nginx Konfiguration
├── deploy.sh                 # Deployment Script
├── server-setup.sh           # Server Setup Script
└── package.json              # Frontend Dependencies
```

## Entwicklung

### Voraussetzungen
- Node.js 20.x
- npm 10.x
- SuperTokens Core (lokal oder remote)

### Installation

```bash
# Repository klonen
git clone https://github.com/alexerle/authlogin.git
cd authlogin

# Frontend Dependencies installieren
npm install

# Backend Dependencies installieren
cd server
npm install
cp .env.example .env
# .env konfigurieren
cd ..
```

### Lokale Entwicklung

```bash
# Terminal 1: Frontend starten
npm run dev

# Terminal 2: Backend starten
cd server
npm run dev
```

Frontend läuft auf http://localhost:5173
Backend läuft auf http://localhost:3001

### Build

```bash
npm run build
# Output in dist/
```

## Deployment

### Automatisch (empfohlen)

```bash
chmod +x deploy.sh
./deploy.sh
```

### Manuell

1. **Frontend bauen:**
   ```bash
   npm run build
   ```

2. **Dateien auf Server kopieren:**
   ```bash
   scp -r dist/ server/ root@37.27.254.59:/var/www/auth.10hoch2.de/
   ```

3. **Backend Dependencies installieren:**
   ```bash
   ssh root@37.27.254.59
   cd /var/www/auth.10hoch2.de/server
   npm install --production
   ```

4. **PM2 neu starten:**
   ```bash
   pm2 restart auth-portal
   ```

## Server-Konfiguration

### Verzeichnisse
```
/var/www/auth.10hoch2.de/
├── dist/           # Frontend Build
└── server/         # Backend
    ├── index.js
    ├── email.js
    ├── node_modules/
    └── .env
```

### PM2 Prozess
```bash
pm2 status           # Status anzeigen
pm2 logs auth-portal # Logs anzeigen
pm2 restart auth-portal # Neustart
```

### Nginx
```
/etc/nginx/sites-available/auth.10hoch2.de
/etc/nginx/sites-enabled/auth.10hoch2.de -> ../sites-available/auth.10hoch2.de
```

### SSL Zertifikat
```bash
# Manuell erneuern (normalerweise automatisch)
certbot renew

# Zertifikat-Status
certbot certificates
```

## Umgebungsvariablen

`server/.env`:

```env
# Server
PORT=3001
NODE_ENV=production

# SuperTokens Core
SUPERTOKENS_CONNECTION_URI=http://localhost:3567
SUPERTOKENS_API_KEY=

# Domains
API_DOMAIN=https://auth.10hoch2.de
WEBSITE_DOMAIN=https://auth.10hoch2.de
COOKIE_DOMAIN=.10hoch2.de

# E-Mail (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@10hoch2.de
SMTP_PASS=your-password
SMTP_FROM=10hoch2 <noreply@10hoch2.de>

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## API Endpoints

### SuperTokens (via Middleware)
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/auth/signup` | POST | Registrierung |
| `/auth/signin` | POST | Login |
| `/auth/signout` | POST | Logout |
| `/auth/user/password/reset/token` | POST | Passwort-Reset anfordern |
| `/auth/user/password/reset` | POST | Passwort zurücksetzen |
| `/auth/user/email/verify/token` | POST | Verifizierungs-E-Mail senden |
| `/auth/user/email/verify` | POST | E-Mail verifizieren |
| `/auth/signinup/code` | POST | OTP Code anfordern |
| `/auth/signinup/code/consume` | POST | OTP Code verifizieren |

### Custom Endpoints
| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health Check |
| `/auth/session/verify` | GET | Session prüfen |
| `/auth/user` | GET | User Info (authentifiziert) |

## Security

- **HTTPS-Only:** HTTP wird auf HTTPS umgeleitet
- **HSTS:** `max-age=31536000; includeSubDomains`
- **Security Headers:**
  - X-Frame-Options: SAMEORIGIN
  - X-Content-Type-Options: nosniff
  - X-XSS-Protection: 1; mode=block
  - Referrer-Policy: strict-origin-when-cross-origin
- **Cookie Security:** HttpOnly, Secure, SameSite
- **CORS:** Whitelist für erlaubte Domains

## Multi-Domain SSO

Das Portal unterstützt SSO für mehrere Domains:

1. **Erlaubte Domains** (in `src/config/supertokens.ts`):
   - eazyfind.me
   - login.eazyfind.me
   - search01.eazyfind.me
   - 10hoch2.de
   - auth.10hoch2.de

2. **Redirect-Flow:**
   ```
   1. User besucht app.10hoch2.de (nicht eingeloggt)
   2. Redirect zu: auth.10hoch2.de/login?redirect=app.10hoch2.de
   3. User loggt sich ein
   4. Redirect zurück zu: app.10hoch2.de?token=xxx
   ```

3. **Cookie-Domain:** `.10hoch2.de` (alle Subdomains)

## Wartung

### Logs prüfen
```bash
pm2 logs auth-portal --lines 100
```

### SuperTokens Core Status
```bash
docker ps | grep supertokens
curl http://localhost:3567/hello
```

### Nginx Logs
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## Entwicklungshistorie

Dieses Projekt wurde am **20. Januar 2026** entwickelt.

### Entwicklungsschritte

1. **Projekt-Setup**
   - React + Vite + TypeScript Projekt erstellt
   - Tailwind CSS 3 für Styling eingerichtet
   - React Router 6 für Navigation

2. **Frontend-Entwicklung**
   - `LoginPage.tsx` - Login mit Passwort und OTP (6-stelliger Code)
   - `RegisterPage.tsx` - Registrierung mit Passwort-Stärke-Anzeige
   - `ForgotPasswordPage.tsx` - Passwort-Reset anfordern
   - `ResetPasswordPage.tsx` - Neues Passwort setzen
   - `VerifyEmailPage.tsx` - E-Mail-Verifizierung
   - `ServicesPage.tsx` - Dienst-Auswahl nach Login
   - `AuthLayout.tsx` - Wiederverwendbares Layout
   - Responsive Design für Mobile/Desktop

3. **Backend-Entwicklung**
   - Express Server mit SuperTokens SDK
   - Email/Password Recipe
   - Passwordless Recipe (OTP)
   - ThirdParty Recipe (OAuth vorbereitet)
   - Email Verification Recipe
   - Session Management mit Cookies
   - Custom Email Templates (Deutsch)

4. **Server-Setup**
   - Node.js 20.x installiert
   - Nginx als Reverse Proxy
   - PM2 als Process Manager
   - SuperTokens Core (bereits vorhanden auf Port 3567)

5. **SSL & Security**
   - Let's Encrypt Zertifikat via Certbot
   - HTTP → HTTPS Redirect
   - HSTS Header aktiviert
   - Security Headers konfiguriert

### Tools & KI-Unterstützung

- **Claude Code** (Anthropic) - KI-gestützte Entwicklung
- **SuperTokens** - Open Source Authentication Platform
- **Let's Encrypt** - Kostenlose SSL Zertifikate

---

## Lizenz

Proprietär - 10hoch2 GmbH

## Support

Bei Fragen oder Problemen: support@10hoch2.de
