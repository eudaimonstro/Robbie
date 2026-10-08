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
import { emailForLog, logger } from '../middleware/logger.js';

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'Robbie <noreply@robbie.app>';

// Determine email provider based on environment variables
export type EmailProvider = 'smtp' | 'sendgrid' | 'resend' | 'development';

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
  /** Left out for a plain-text email */
  html?: string;
}

/**
 * Deliver an email through the configured provider
 * @returns Provider message ID
 */
async function deliver(message: OutgoingEmail): Promise<string | undefined> {
  if (resendClient) {
    // The Resend SDK returns errors instead of throwing them
    const { data, error } = await resendClient.emails.send(
      message.html === undefined
        ? { from: EMAIL_FROM, to: message.to, subject: message.subject, text: message.text }
        : { from: EMAIL_FROM, ...message, html: message.html },
    );
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

// Log provider on startup. Production without a provider is refused by the server's start-up
// check (startupCheck), which logs that error.
logger.info({ emailProvider }, 'Email service initialized');

/**
 * Generate HTML email template for verification code
 */
function generateEmailHtml(code: string): string {
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
        Enter this code to sign in to Robbie:
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
function generateEmailText(code: string): string {
  return `Your Verification Code for Robbie

Enter this code to sign in to Robbie:

${code}

This code expires in 15 minutes.

If you didn't request this code, you can safely ignore this email.

---
Robbie - Parliamentary Procedure Made Easy
`;
}

// Tests: when set, codes are collected here instead of being sent
let testOutbox: Array<{ to: string; code: string }> | null = null;

/** Collect sign-in emails in memory instead of sending them (tests only) */
export function captureEmailsForTests(): Array<{ to: string; code: string }> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('captureEmailsForTests is for tests only (NODE_ENV=test)');
  }
  testOutbox = [];
  return testOutbox;
}

/**
 * Whether emails can be sent at all: not in production without a provider. Reads NODE_ENV now,
 * not at load: production must never report a code as sent when it wasn't.
 */
export function canSendEmail(): boolean {
  return !(emailProvider === 'development' && process.env.NODE_ENV === 'production');
}

/**
 * Email a sign-in code. Without an email provider (development only; production requires
 * one), the code is logged at debug level, which production never logs.
 */
export async function sendSignInCode(email: string, code: string): Promise<void> {
  if (!canSendEmail()) {
    throw new Error('No email provider configured; production cannot send sign-in codes');
  }

  if (testOutbox) {
    testOutbox.push({ to: email, code });
    return;
  }

  if (emailProvider === 'development') {
    logger.debug({ to: email, code }, 'Sign-in code (no email provider configured)');
    return;
  }

  try {
    const messageId = await deliver({
      to: email,
      subject: 'Your Robbie sign-in code',
      text: generateEmailText(code),
      html: generateEmailHtml(code),
    });
    logger.info({ to: emailForLog(email), messageId }, 'Sign-in email sent');
  } catch (error) {
    logger.error({ err: error }, 'Failed to send sign-in email');
    throw new Error('Failed to send sign-in email', { cause: error });
  }
}

export interface AddedToOrganizationEmail {
  to: string;
  organization: string;
  /** The name of whoever added them, if they set one */
  addedBy: string | null;
  /** Their email address, which they signed in with */
  addedByEmail: string;
}

// Tests: when set, added-to-organization emails are collected here instead of being sent
let memberOutbox: AddedToOrganizationEmail[] | null = null;

/** Collect added-to-organization emails in memory instead of sending them (tests only) */
export function captureMemberEmailsForTests(): AddedToOrganizationEmail[] {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('captureMemberEmailsForTests is for tests only (NODE_ENV=test)');
  }
  memberOutbox = [];
  return memberOutbox;
}

/** The web app's address, for links in emails: APP_URL, else CLIENT_ORIGIN */
export function appUrl(): string {
  return process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
}

/** The longest organization or person's name an email quotes, in characters */
export const MAX_QUOTED_NAME = 60;

/**
 * A name someone chose, as an email quotes it: one line, at most MAX_QUOTED_NAME characters,
 * in double quotes, so it reads as a name and not as Robbie's own words
 */
export function quotedName(name: string): string {
  const line = name.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  const chars = [...line];
  const capped =
    chars.length > MAX_QUOTED_NAME ? `${chars.slice(0, MAX_QUOTED_NAME - 1).join('')}…` : line;
  return `"${capped}"`;
}

/**
 * The added-to-organization email, in plain text only. The organization's and the adder's names
 * come from users (anyone can make an organization and add an email), so they are quoted and
 * capped (quotedName), and the adder is named by the email address they signed in with too.
 */
export function addedToOrganizationEmail(
  email: AddedToOrganizationEmail,
  url: string,
): { subject: string; text: string } {
  const organization = quotedName(email.organization);
  const addedBy = email.addedBy?.trim()
    ? `${quotedName(email.addedBy)} (${email.addedByEmail})`
    : email.addedByEmail;
  return {
    subject: `You were added to the organization ${organization} on Robbie`,
    text: `${addedBy} added you to the organization ${organization} on Robbie.

Sign in with this email address to see it:

${url}

If you don't know this organization, you can leave it in Robbie's Settings, or ignore this
email.

---
Robbie - Parliamentary Procedure Made Easy
`,
  };
}

/**
 * Tell someone they were added to an organization. Without an email provider (development
 * only; production requires one), it is logged at debug level instead.
 */
export async function sendAddedToOrganization(email: AddedToOrganizationEmail): Promise<void> {
  if (emailProvider === 'development' && process.env.NODE_ENV === 'production') {
    throw new Error('No email provider configured; production cannot send email');
  }

  if (memberOutbox) {
    memberOutbox.push(email);
    return;
  }

  if (emailProvider === 'development') {
    logger.debug(
      { to: emailForLog(email.to), organization: email.organization },
      'Added-to-organization email (no email provider configured)',
    );
    return;
  }

  const messageId = await deliver({ to: email.to, ...addedToOrganizationEmail(email, appUrl()) });
  logger.info({ to: emailForLog(email.to), messageId }, 'Added-to-organization email sent');
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
    throw new Error(
      'No email provider configured. Set RESEND_API_KEY (or SMTP_HOST / SENDGRID_API_KEY).',
    );
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
