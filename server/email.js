const nodemailer = require('nodemailer')

// Create transporter
const createTransporter = () => {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }

  // Fallback: Log to console in development
  return {
    sendMail: async (options) => {
      console.log('=== EMAIL (Dev Mode) ===')
      console.log('To:', options.to)
      console.log('Subject:', options.subject)
      console.log('HTML:', options.html?.substring(0, 200) + '...')
      console.log('========================')
      return { messageId: 'dev-mode' }
    },
  }
}

const transporter = createTransporter()

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || '10hoch2 <noreply@10hoch2.de>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
    })

    console.log(`Email sent to ${to}: ${result.messageId}`)
    return result
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error)
    throw error
  }
}

module.exports = { sendEmail }
