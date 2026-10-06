/**
 * Email service for sending verification codes
 *
 * Supports multiple providers:
 * - SMTP (any provider: Gmail, Outlook, custom SMTP servers)
 * - SendGrid (SMTP)
 * - Resend (HTTPS API, works where outbound SMTP ports are blocked)
 * - Development mode (console logging)
 *
 * Configuration via environment variables:
 *
 * For SMTP:
 *   SMTP_HOST=smtp.example.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-username
 *   SMTP_PASS=your-password
 *   EMAIL_FROM=noreply@yourdomain.com
 *
 * For SendGrid:
 *   SENDGRID_API_KEY=SG.xxxxx
 *   EMAIL_FROM=noreply@yourdomain.com
 *
 * For Resend:
 *   RESEND_API_KEY=re_xxxxx
 *   EMAIL_FROM=noreply@yourdomain.com
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { logger } from '../middleware/logger.js';

// For testing: returns the code so it can be used for dev bypass
let lastGeneratedCode: string | null = null;

export function getLastCode(): string | null {
  return lastGeneratedCode;
}

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'Robbie <noreply@robbie.app>';
const isProduction = process.env.NODE_ENV === 'production';

// Determine email provider based on environment variables
type EmailProvider = 'smtp' | 'sendgrid' | 'resend' | 'development';

function detectProvider(): EmailProvider {
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'development';
}

const emailProvider = detectProvider();

// Create transporter based on provider
let transporter: Transporter | null = null;

function createTransporter(): Transporter | null {
  switch (emailProvider) {
    case 'smtp':
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

    case 'sendgrid':
      // SendGrid uses SMTP with API key as password
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });

    // Resend sends through its HTTPS API (see resendClient), not SMTP
    case 'resend':
    case 'development':
    default:
      return null;
  }
}

// Initialize transporter
transporter = createTransporter();

const resendClient = emailProvider === 'resend' ? new Resend(process.env.RESEND_API_KEY) : null;

interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Deliver an email through the configured provider
 * @returns Provider message ID
 */
async function deliver(message: OutgoingEmail): Promise<string | undefined> {
  if (resendClient) {
    // The Resend SDK returns errors instead of throwing them
    const { data, error } = await resendClient.emails.send({ from: EMAIL_FROM, ...message });
    if (error) {
      throw new Error(`Resend error (${error.name}): ${error.message}`);
    }
    return data?.id;
  }

  if (!transporter) {
    throw new Error('Email transporter not configured');
  }
  const info = await transporter.sendMail({ from: EMAIL_FROM, ...message });
  return info.messageId;
}

// Log provider on startup
if (isProduction && emailProvider === 'development') {
  logger.error(
    'No email provider configured in production. Set one of: SMTP_HOST, SENDGRID_API_KEY, or RESEND_API_KEY'
  );
} else {
  logger.info({ emailProvider }, 'Email service initialized');
}

/**
 * Generate HTML email template for verification code
 */
function generateEmailHtml(code: string, meetingCode: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Robbie</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Parliamentary Procedure Made Easy</p>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
      <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 20px; font-weight: 600;">Your Verification Code</h2>
      <p style="color: #52525b; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
        Enter this code to join meeting <strong style="color: #18181b;">${meetingCode}</strong>:
      </p>

      <!-- Code Box -->
      <div style="background-color: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">${code}</span>
      </div>

      <p style="color: #71717a; margin: 0; font-size: 13px; line-height: 1.5;">
        This code expires in <strong>15 minutes</strong>. If you didn't request this code, you can safely ignore this email.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #fafafa; padding: 16px 24px; border-top: 1px solid #e4e4e7;">
      <p style="color: #a1a1aa; margin: 0; font-size: 12px; text-align: center;">
        &copy; ${new Date().getFullYear()} Robbie. Powered by Robert's Rules of Order.
      </p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Generate plain text email for verification code
 */
function generateEmailText(code: string, meetingCode: string): string {
  return `Your Verification Code for Robbie

Enter this code to join meeting ${meetingCode}:

${code}

This code expires in 15 minutes.

If you didn't request this code, you can safely ignore this email.

---
Robbie - Parliamentary Procedure Made Easy
`;
}

/**
 * Send verification email
 * @param email - Recipient email address
 * @param code - 6-digit verification code
 * @param meetingCode - Meeting code being joined
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  meetingCode: string
): Promise<void> {
  // Always store code for dev testing endpoint
  lastGeneratedCode = code;

  // Development mode - just log to console
  if (emailProvider === 'development') {
    logger.info({ to: email, meetingCode, verificationCode: code }, 'Verification email (development mode)');
    return;
  }

  // Production mode - send actual email
  try {
    const messageId = await deliver({
      to: email,
      subject: `Your verification code for meeting ${meetingCode}`,
      text: generateEmailText(code, meetingCode),
      html: generateEmailHtml(code, meetingCode),
    });

    logger.info({ to: email, messageId }, 'Verification email sent');
  } catch (error) {
    logger.error({ err: error }, 'Failed to send verification email');
    throw new Error('Failed to send verification email. Please try again.', { cause: error });
  }
}

/**
 * Verify email configuration is working
 * Call this on startup to catch configuration errors early
 */
export async function verifyEmailConfiguration(): Promise<boolean> {
  if (emailProvider === 'development') {
    logger.info('Email service running in development mode');
    return true;
  }

  if (emailProvider === 'resend') {
    // Sending-only API keys can't call read endpoints, so a real send (npm run email:test) is the check
    logger.info('Resend API configured; run `npm run email:test` to verify delivery');
    return true;
  }

  if (!transporter) {
    logger.error('Email transporter not available');
    return false;
  }

  try {
    await transporter.verify();
    logger.info('Email configuration verified successfully');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Email configuration verification failed');
    return false;
  }
}

/**
 * Send a test email to confirm the provider, API key, and sender are working
 * @returns Provider message ID
 */
export async function sendTestEmail(to: string): Promise<string | undefined> {
  if (emailProvider === 'development') {
    throw new Error('No email provider configured. Set RESEND_API_KEY (or SMTP_HOST / SENDGRID_API_KEY).');
  }

  return deliver({
    to,
    subject: 'Robbie test email',
    text: 'Congrats on sending your first email from Robbie!',
    html: '<p>Congrats on sending your <strong>first email</strong> from Robbie!</p>',
  });
}

/**
 * Get current email provider for health checks
 */
export function getEmailProvider(): EmailProvider {
  return emailProvider;
}
