const fetch = require('node-fetch')
const dns = require('dns')

// Prefer IPv4 so BREVO receives the authorized IPv4 address (not IPv6)
dns.setDefaultResultOrder('ipv4first')

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || ''
const SMTP_FROM = process.env.SMTP_FROM || '10hoch2 <info@10hoch2.de>'
const SENDER_NAME = process.env.EMAIL_SENDER_NAME || 'ZHZ | Auth'
const SENDER_EMAIL = process.env.EMAIL_SENDER_EMAIL || 'info@10hoch2.de'
const REPLY_TO_EMAIL = process.env.EMAIL_REPLY_TO || 'support@10hoch2.de'
const DELIVERY_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_DELIVERY_ATTEMPTS || 3))
const DELIVERY_TIMEOUT_MS = Math.max(3000, Number(process.env.EMAIL_DELIVERY_TIMEOUT_MS || 10000))

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Send email via BREVO Transactional API
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (BREVO_API_KEY) {
    return sendWithBrevo({ to, subject, html, text })
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return sendWithSmtp({ to, subject, html, text })
  }

  console.error(`Email delivery is not configured; cannot send "${subject}" to ${to}`)
  throw new Error('Email delivery is not configured')
}

const sendWithBrevo = async ({ to, subject, html, text }) => {
  const body = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    replyTo: { name: '10hoch2 Support', email: REPLY_TO_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text || html.replace(/<[^>]*>/g, ''),
  }

  let lastError
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify(body),
        timeout: DELIVERY_TIMEOUT_MS,
      })
      if (res.ok) {
        const data = await res.json()
        console.log(`Email sent to ${to} via BREVO: messageId=${data.messageId}`)
        return data
      }
      const detail = await res.text()
      lastError = new Error(`BREVO API error: ${res.status}`)
      console.error(`BREVO error sending to ${to}: status=${res.status} ${detail.slice(0, 300)}`)
      if (res.status < 500 && res.status !== 429) {
        // Permanente Client-/Konfigurationsfehler werden nicht durch Wiederholen besser.
        lastError.nonRetryable = true
        throw lastError
      }
    } catch (error) {
      lastError = error
      if (error.nonRetryable) throw error
      if (attempt === DELIVERY_ATTEMPTS) break
    }
    await wait(250 * (2 ** (attempt - 1)))
  }
  throw lastError || new Error('BREVO delivery failed')
}

const sendWithSmtp = async ({ to, subject, html, text }) => {
  const nodemailer = require('nodemailer')
  let lastError
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: DELIVERY_TIMEOUT_MS,
      greetingTimeout: DELIVERY_TIMEOUT_MS,
      socketTimeout: DELIVERY_TIMEOUT_MS,
    })
    try {
      const info = await transporter.sendMail({
        from: SMTP_FROM,
        replyTo: REPLY_TO_EMAIL,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      })
      console.log(`Email sent to ${to} via SMTP: messageId=${info.messageId}`)
      return info
    } catch (error) {
      lastError = error
      if (attempt < DELIVERY_ATTEMPTS) await wait(250 * (2 ** (attempt - 1)))
    } finally {
      transporter.close()
    }
  }
  throw lastError || new Error('SMTP delivery failed')
}

module.exports = { sendEmail }
