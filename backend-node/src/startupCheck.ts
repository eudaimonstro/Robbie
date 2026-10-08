import type { EmailProvider } from './auth/emailService.js';
import { isValidOrgStorageLimit } from './bylawyer/services/storageQuota.js';

/** Problems with the server's configuration, checked once when it starts */
export interface StartupCheck {
  /** Set when the server must not start: every reason, in one message */
  error?: string;
  warnings: string[];
}

export function startupCheck(env: NodeJS.ProcessEnv, emailProvider: EmailProvider): StartupCheck {
  const check: StartupCheck = { warnings: [] };
  const badStorageLimit = !isValidOrgStorageLimit(env.ORG_STORAGE_LIMIT_MB)
    ? `ORG_STORAGE_LIMIT_MB is "${env.ORG_STORAGE_LIMIT_MB}", not a whole number of megabytes ` +
      'above 0, such as 500.'
    : null;

  if (env.NODE_ENV !== 'production') {
    if (badStorageLimit) check.warnings.push(`${badStorageLimit} Using the default, 500.`);
    if (env.ENABLE_TEST_AUTH === 'true') {
      const code = env.TEST_VERIFICATION_CODE || '000000';
      check.warnings.push(`Test sign-in is enabled: the code ${code} signs in any email`);
    }
    return check;
  }

  const errors: string[] = [];
  // Without it the live meetings would fall back to memory (meetingStorage.ts) and Prisma
  // would fail on the first query
  if (!env.DATABASE_URL) {
    errors.push(
      'DATABASE_URL is not set, and production keeps its meetings and documents in Postgres.',
    );
  }
  if (emailProvider === 'development') {
    errors.push(
      "No email provider is configured, and production can't send sign-in codes without one. " +
        'Set RESEND_API_KEY, SMTP_HOST or SENDGRID_API_KEY.',
    );
  }
  // The fallback sender in emailService.ts is a domain nobody here owns
  if (!env.EMAIL_FROM) {
    errors.push(
      'EMAIL_FROM is not set, so emails would come from an address nobody can send from. ' +
        'Set EMAIL_FROM, such as "Robbie <noreply@robbie.scouch.dev>".',
    );
  }
  // Emails link to the web app (see appUrl), which in production may be served from this
  // server's own origin, so no setting names it by default
  if (!env.APP_URL && !env.CLIENT_ORIGIN) {
    errors.push(
      "Neither APP_URL nor CLIENT_ORIGIN is set, so emails can't link to the web app. " +
        "Set APP_URL to the web app's address.",
    );
  }
  if (env.ENABLE_TEST_AUTH === 'true') {
    errors.push('ENABLE_TEST_AUTH=true would let a fixed code sign in any email. Remove it.');
  }
  if (badStorageLimit) errors.push(badStorageLimit);
  if (errors.length > 0) check.error = errors.join(' ');

  // Behind Caddy without it, req.ip is Caddy's address for everyone (trustProxy.ts)
  if (!env.TRUST_PROXY) {
    check.warnings.push(
      'TRUST_PROXY is not set: behind a reverse proxy such as Caddy, every client shares one ' +
        'rate limit. Set TRUST_PROXY=1 behind one proxy.',
    );
  }

  return check;
}
