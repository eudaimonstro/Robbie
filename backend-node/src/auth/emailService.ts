/**
 * Email service: the sign-in code, the email to someone added to an organization, and the
 * meeting notice (plain-text emails in a batch: sendPlainEmails)
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

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

/** The brand's day palette (docs/design-brief.md), for the one email with a page */
const PAPER = '#F7F3EC';
const SURFACE = '#FFFDF9';
const INK = '#1C1A17';
const INK_MUTED = '#5B564E';
const RULE = '#E4DDD1';
const GAVEL = '#8B2E25';

/**
 * The sign-in code email. The code leads the subject, so a phone shows it in the notification
 * (and offers it as the one-time code) without opening the mail. The page is the app's paper,
 * ink and gavel; the text says the same for mail that shows no pages.
 */
export function signInCodeEmail(code: string): { subject: string; text: string; html: string } {
  const text = `${code} is your Robbie code.

Type it on the sign-in page to sign in to Robbie. It works for 15 minutes.

If you didn't ask for a code, you can ignore this email: nobody can sign in without it.

Robbie
`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${code} is your Robbie code</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: ${PAPER}; color: ${INK}; font-family: 'Public Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <div style="max-width: 440px; margin: 0 auto; background-color: ${SURFACE}; border: 1px solid ${RULE}; border-radius: 12px; padding: 28px 24px;">
    <p style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 600; color: ${INK};">Robbie</p>
    <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5;">Type this code on the sign-in page to sign in to Robbie:</p>
    <p style="margin: 0 0 16px 0; padding: 16px 0; border-top: 2px solid ${GAVEL}; border-bottom: 1px solid ${RULE}; text-align: center; font-size: 36px; font-weight: 600; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; color: ${INK};">${code}</p>
    <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.5;">It works for 15 minutes.</p>
    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: ${INK_MUTED};">If you didn't ask for a code, you can ignore this email: nobody can sign in without it.</p>
  </div>
</body>
</html>
`;
  return { subject: `${code} is your Robbie code`, text, html };
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
    const messageId = await deliver({ to: email, ...signInCodeEmail(code) });
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
 * The added-to-organization email, in plain text only: who added them, what Robbie is for the
 * organization, what to do (nothing yet, or sign in with this address), whom to ask, and what to
 * do about a stranger's addition, so it reads as no phishing does. The organization's and the
 * adder's names come from users (anyone can make an organization and add an email), so they are
 * quoted and capped (quotedName), and the adder is named by their email address too.
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

Robbie is where ${organization} keeps its bylaws and minutes and runs its meetings. You can read
them there, and at a meeting you can follow along and vote on your phone. There is nothing to
install.

You don't need to do anything now. To look around, or to be ready before the next meeting,
sign in with this email address (${email.to}) at:

${url}

Robbie emails you a 6-digit code each time you sign in: there is no password.

Questions? Write to ${email.addedByEmail}.

If you don't know ${organization}, you can ignore this email, or leave the organization in
Robbie's Settings after signing in.

Robbie
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

/** A plain-text email to one person: no HTML, so nothing a user typed can be markup */
export interface PlainEmail {
  to: string;
  subject: string;
  text: string;
}

/** Tests: when set, plain-text emails are collected here instead of being sent */
let plainOutbox: PlainEmail[] | null = null;
/** Tests: the addresses whose plain-text email fails, as a provider's refusal would */
let failingFor: ((to: string) => boolean) | null = null;

/**
 * Collect plain-text emails (the meeting notice) in memory instead of sending them, those to the
 * addresses `fail` picks failing as a refused delivery does (tests only)
 */
export function capturePlainEmailsForTests(fail?: (to: string) => boolean): PlainEmail[] {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('capturePlainEmailsForTests is for tests only (NODE_ENV=test)');
  }
  plainOutbox = [];
  failingFor = fail ?? null;
  return plainOutbox;
}

/**
 * Where the browser tests' server writes the plain-text emails it would send, one JSON file
 * each, so a test in another process can read them: EMAIL_OUTBOX_DIR, only under NODE_ENV=test
 * and without an email provider (nothing is delivered either way)
 */
function outboxDir(): string | null {
  const dir = process.env.EMAIL_OUTBOX_DIR;
  return dir && process.env.NODE_ENV === 'test' && emailProvider === 'development' ? dir : null;
}

/**
 * Send plain-text emails (`what` names them in the log), as one batch: Resend's batch API takes
 * them in one request (at most 100), so a notice to a whole organization stays within its rate;
 * SMTP sends them one after another. Without an email provider (development only; production
 * requires one) they are logged at debug level instead, or written to the test outbox.
 * @returns for each email, whether it went
 */
export async function sendPlainEmails(messages: PlainEmail[], what: string): Promise<boolean[]> {
  if (emailProvider === 'development' && process.env.NODE_ENV === 'production') {
    throw new Error('No email provider configured; production cannot send email');
  }
  if (messages.length === 0) return [];

  if (plainOutbox) {
    return messages.map((message) => {
      if (failingFor?.(message.to)) return false;
      plainOutbox!.push(message);
      return true;
    });
  }

  const dir = outboxDir();
  if (dir) {
    await mkdir(dir, { recursive: true });
    for (const message of messages) {
      await writeFile(
        path.join(dir, `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify(message, null, 2),
      );
    }
    return messages.map(() => true);
  }

  if (emailProvider === 'development') {
    for (const message of messages) {
      logger.debug(
        { to: emailForLog(message.to), subject: message.subject },
        `${what} (no email provider configured)`,
      );
    }
    return messages.map(() => true);
  }

  if (resendClient) {
    const { data, error } = await resendClient.batch.send(
      messages.map((message) => ({ from: EMAIL_FROM, ...message })),
      { batchValidation: 'permissive' },
    );
    if (error) {
      logger.error(
        { err: new Error(`Resend error (${error.name}): ${error.message}`) },
        `${what} not sent`,
      );
      return messages.map(() => false);
    }
    const failed = new Set((data?.errors ?? []).map((failure) => failure.index));
    for (const failure of data?.errors ?? []) {
      logger.warn(
        { to: emailForLog(messages[failure.index]?.to ?? ''), reason: failure.message },
        `${what} refused`,
      );
    }
    logger.info({ sent: messages.length - failed.size, failed: failed.size }, `${what} sent`);
    return messages.map((_, index) => !failed.has(index));
  }

  const results: boolean[] = [];
  for (const message of messages) {
    try {
      const messageId = await deliver(message);
      logger.info({ to: emailForLog(message.to), messageId }, `${what} sent`);
      results.push(true);
    } catch (error) {
      logger.warn({ err: error, to: emailForLog(message.to) }, `${what} not sent`);
      results.push(false);
    }
  }
  return results;
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
