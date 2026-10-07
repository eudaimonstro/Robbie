import type { EmailProvider } from './emailService.js';

/** Problems with the sign-in configuration, checked once when the server starts */
export interface SignInStartupCheck {
  /** Set when the server must not start */
  error?: string;
  warnings: string[];
}

export function signInStartupCheck(
  env: NodeJS.ProcessEnv,
  emailProvider: EmailProvider,
): SignInStartupCheck {
  const production = env.NODE_ENV === 'production';
  const check: SignInStartupCheck = { warnings: [] };
  const errors: string[] = [];

  if (production && emailProvider === 'development') {
    errors.push(
      "No email provider is configured, and production can't send sign-in codes without one. " +
        'Set RESEND_API_KEY, SMTP_HOST or SENDGRID_API_KEY.',
    );
  }

  // Emails link to the web app (see appUrl), which in production may be served from this
  // server's own origin, so no setting names it by default
  if (production && !env.APP_URL && !env.CLIENT_ORIGIN) {
    errors.push(
      "Neither APP_URL nor CLIENT_ORIGIN is set, so emails can't link to the web app. " +
        "Set APP_URL to the web app's address.",
    );
  }
  if (errors.length > 0) check.error = errors.join(' ');

  if (env.ENABLE_TEST_AUTH === 'true') {
    const code = env.TEST_VERIFICATION_CODE || '000000';
    check.warnings.push(
      production
        ? 'ENABLE_TEST_AUTH is ignored in production'
        : `Test sign-in is enabled: the code ${code} signs in any email`,
    );
  }

  return check;
}
