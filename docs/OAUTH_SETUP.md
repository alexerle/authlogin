# OAuth & Auth Provider Setup - HowTo

Anleitung zur Einrichtung aller Authentifizierungsmethoden für das 10hoch2 Auth Portal.

## Inhaltsverzeichnis

1. [Google OAuth](#1-google-oauth)
2. [GitHub OAuth](#2-github-oauth)
3. [Microsoft/Azure AD](#3-microsoftazure-ad)
4. [Apple Sign-In](#4-apple-sign-in)
5. [Facebook Login](#5-facebook-login)
6. [TOTP 2FA (Authenticator App)](#6-totp-2fa-authenticator-app)
7. [Passkeys / WebAuthn](#7-passkeys--webauthn)
8. [Backend Konfiguration](#8-backend-konfiguration)

---

## 1. Google OAuth

### Schritt 1: Google Cloud Console öffnen
1. Gehe zu [Google Cloud Console](https://console.cloud.google.com/)
2. Melde dich mit einem Google-Konto an

### Schritt 2: Projekt erstellen
1. Klicke oben auf Projekt-Dropdown → **Neues Projekt**
2. Name: `10hoch2-auth`
3. Klicke **Erstellen**

### Schritt 3: OAuth-Zustimmungsbildschirm
1. **APIs & Dienste** → **OAuth-Zustimmungsbildschirm**
2. User Type: **Extern**
3. Ausfüllen:
   - App-Name: `10hoch2 Login`
   - Support-E-Mail: `support@10hoch2.de`
   - Autorisierte Domains: `10hoch2.de`, `eazyfind.me`
4. Scopes: `email`, `profile`, `openid`

### Schritt 4: OAuth 2.0 Client-ID erstellen
1. **APIs & Dienste** → **Anmeldedaten** → **+ Anmeldedaten erstellen** → **OAuth-Client-ID**
2. Anwendungstyp: **Webanwendung**
3. Autorisierte JavaScript-Quellen:
   ```
   https://auth.10hoch2.de
   http://localhost:5173
   ```
4. Autorisierte Weiterleitungs-URIs:
   ```
   https://auth.10hoch2.de/auth/callback/google
   http://localhost:3001/auth/callback/google
   ```

### Credentials
```env
GOOGLE_CLIENT_ID=123456789-xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
```

---

## 2. GitHub OAuth

### Schritt 1: GitHub Developer Settings
1. Gehe zu [GitHub Developer Settings](https://github.com/settings/developers)
2. **OAuth Apps** → **New OAuth App**

### Schritt 2: App konfigurieren
- Application name: `10hoch2 Login`
- Homepage URL: `https://10hoch2.de`
- Authorization callback URL: `https://auth.10hoch2.de/auth/callback/github`

### Schritt 3: Client Secret generieren
Nach Erstellung: **Generate a new client secret**

### Credentials
```env
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=xxx
```

---

## 3. Microsoft/Azure AD

### Schritt 1: Azure Portal
1. Gehe zu [Azure Portal](https://portal.azure.com/)
2. **Azure Active Directory** → **App-Registrierungen** → **+ Neue Registrierung**

### Schritt 2: App registrieren
- Name: `10hoch2 Login`
- Kontotypen: **Konten in beliebigem Organisationsverzeichnis + persönliche Microsoft-Konten**
- Umleitungs-URI: `https://auth.10hoch2.de/auth/callback/microsoft`

### Schritt 3: Client Secret
**Zertifikate & Geheimnisse** → **+ Neuer geheimer Clientschlüssel**

### Schritt 4: API-Berechtigungen
**Microsoft Graph** → Delegiert: `email`, `openid`, `profile`, `User.Read`

### Credentials
```env
MICROSOFT_CLIENT_ID=12345678-xxx
MICROSOFT_CLIENT_SECRET=xxx
MICROSOFT_TENANT_ID=common
```

---

## 4. Apple Sign-In

### Voraussetzungen
- Apple Developer Account (99$/Jahr)

### Schritt 1: Apple Developer Portal
[Apple Developer Portal](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**

### Schritt 2: App ID erstellen
**Identifiers** → **+** → **App IDs**
- Bundle ID: `de.10hoch2.auth`
- Capability: **Sign In with Apple**

### Schritt 3: Service ID erstellen
**Identifiers** → **+** → **Services IDs**
- Identifier: `de.10hoch2.auth.web`
- Domains: `auth.10hoch2.de`
- Return URL: `https://auth.10hoch2.de/auth/callback/apple`

### Schritt 4: Key erstellen
**Keys** → **+** → **Sign In with Apple** aktivieren
- `.p8` Datei herunterladen (nur einmal möglich!)

### Credentials
```env
APPLE_CLIENT_ID=de.10hoch2.auth.web
APPLE_TEAM_ID=ABC123DEF4
APPLE_KEY_ID=KEY123ABC
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

---

## 5. Facebook Login

### Schritt 1: Facebook Developers
1. Gehe zu [Facebook Developers](https://developers.facebook.com/)
2. **Meine Apps** → **App erstellen** → **Verbraucher**

### Schritt 2: Facebook Login hinzufügen
**Produkt hinzufügen** → **Facebook Login** → **Web**

### Schritt 3: Einstellungen
- Website-URL: `https://auth.10hoch2.de`
- Gültige OAuth-Redirect-URIs: `https://auth.10hoch2.de/auth/callback/facebook`

### Schritt 4: App-Einstellungen
- App-Domains: `auth.10hoch2.de`, `10hoch2.de`
- Datenschutz-URL: `https://10hoch2.de/datenschutz`

### Credentials
```env
FACEBOOK_CLIENT_ID=123456789
FACEBOOK_CLIENT_SECRET=xxx
```

---

## 6. TOTP 2FA (Authenticator App)

### Keine externe Registrierung nötig!

TOTP funktioniert lokal ohne externe Dienste. SuperTokens generiert:
- Secret Key (Base32)
- QR-Code für Authenticator-Apps

### Unterstützte Apps
- Google Authenticator (iOS/Android)
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden
- FreeOTP
- KeePassXC (mit TOTP-Plugin)

### Funktionsweise
1. User aktiviert 2FA in Account-Einstellungen
2. Server generiert TOTP-Secret
3. QR-Code wird angezeigt (otpauth://totp/...)
4. User scannt mit Authenticator-App
5. User gibt 6-stelligen Code zur Bestätigung ein
6. 2FA ist aktiv

### Konfiguration
```env
# Optional: App-Name der im Authenticator angezeigt wird
TOTP_ISSUER=10hoch2
```

---

## 7. Passkeys / WebAuthn

### Keine externe Registrierung nötig!

Passkeys nutzen den WebAuthn-Standard und funktionieren mit:

### Unterstützte Methoden
| Methode | Beispiele |
|---------|-----------|
| Fingerabdruck | Touch ID (Mac), Windows Hello |
| Gesichtserkennung | Face ID (iPhone), Windows Hello |
| Hardware-Keys | YubiKey, Titan Security Key |
| Passwort-Manager | 1Password, Bitwarden, KeePassXC |
| Betriebssystem | iCloud Keychain, Google Password Manager |

### Voraussetzungen
- HTTPS (Pflicht für WebAuthn)
- Moderne Browser (Chrome 67+, Firefox 60+, Safari 13+, Edge 18+)

### Konfiguration
```env
# Relying Party ID (Domain ohne Subdomain)
WEBAUTHN_RP_ID=10hoch2.de
WEBAUTHN_RP_NAME=10hoch2 Login
WEBAUTHN_RP_ORIGIN=https://auth.10hoch2.de
```

### Funktionsweise
1. User klickt "Passkey hinzufügen"
2. Browser fragt nach biometrischer Bestätigung
3. Öffentlicher Schlüssel wird auf Server gespeichert
4. Privater Schlüssel bleibt auf Gerät (sicher!)
5. Bei Login: Biometrische Bestätigung → fertig

---

## 8. Backend Konfiguration

### Komplette .env Datei

```env
# ============================================
# SERVER
# ============================================
PORT=3001
NODE_ENV=production

# ============================================
# SUPERTOKENS CORE
# ============================================
SUPERTOKENS_CONNECTION_URI=http://localhost:3567
SUPERTOKENS_API_KEY=

# ============================================
# DOMAINS
# ============================================
API_DOMAIN=https://auth.10hoch2.de
WEBSITE_DOMAIN=https://auth.10hoch2.de
COOKIE_DOMAIN=.10hoch2.de

# ============================================
# E-MAIL (SMTP)
# ============================================
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@10hoch2.de
SMTP_PASS=your-password
SMTP_FROM=10hoch2 <noreply@10hoch2.de>

# ============================================
# OAUTH PROVIDER
# ============================================
# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Microsoft
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common

# Apple
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# Facebook
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=

# ============================================
# TOTP / 2FA
# ============================================
TOTP_ISSUER=10hoch2

# ============================================
# WEBAUTHN / PASSKEYS
# ============================================
WEBAUTHN_RP_ID=10hoch2.de
WEBAUTHN_RP_NAME=10hoch2 Login
WEBAUTHN_RP_ORIGIN=https://auth.10hoch2.de
```

---

## Checkliste

### OAuth Provider
- [ ] Google: Cloud Console Projekt + OAuth Client
- [ ] GitHub: OAuth App erstellt
- [ ] Microsoft: Azure App Registration
- [ ] Apple: Developer Account + Service ID + Key
- [ ] Facebook: Developer App + Facebook Login

### Allgemein
- [ ] Alle Credentials in `server/.env`
- [ ] Redirect-URLs korrekt (HTTPS!)
- [ ] Datenschutzerklärung aktualisiert
- [ ] Backend neu gestartet
- [ ] Test-Login mit jedem Provider

---

## Troubleshooting

### "redirect_uri_mismatch"
- URI muss exakt übereinstimmen (Trailing Slash beachten)
- HTTP vs HTTPS prüfen

### "App not verified" (Google)
- Normal in Entwicklung
- Für Produktion: Verifizierung beantragen

### Passkeys funktionieren nicht
- HTTPS Pflicht (kein localhost ohne spezielle Config)
- Browser muss WebAuthn unterstützen

### TOTP-Code ungültig
- Uhrzeit auf Server und Gerät synchronisieren
- Max. 30 Sekunden Abweichung erlaubt

---

*Erstellt: 20. Januar 2026*
*10hoch2 Auth Portal*
