import { describe, it, expect } from 'vitest';
import { startupCheck } from '../startupCheck.js';

const APP_URL = 'https://app.example.org';

/** Everything production needs */
const PRODUCTION: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://robbie:secret@db:5432/robbie',
  APP_URL,
  EMAIL_FROM: 'Robbie <noreply@app.example.org>',
  TRUST_PROXY: '1',
  SERVER_SECRET: '0123456789abcdef0123456789abcdef',
};

/** Production with one setting left out */
function without(key: string): NodeJS.ProcessEnv {
  const env = { ...PRODUCTION };
  delete env[key];
  return env;
}

describe('startupCheck', () => {
  it('starts production when everything is set', () => {
    expect(startupCheck(PRODUCTION, 'resend')).toEqual({ warnings: [] });
  });

  it('stops without a database, in development too', () => {
    const noDatabase =
      'DATABASE_URL is not set, and the meetings and documents are kept in Postgres.';
    expect(startupCheck(without('DATABASE_URL'), 'resend').error).toBe(noDatabase);
    expect(startupCheck({ NODE_ENV: 'development' }, 'development').error).toBe(noDatabase);
  });

  it('stops production without an email provider', () => {
    expect(startupCheck(PRODUCTION, 'development').error).toMatch(/email provider/);
  });

  it('stops production without a sender address', () => {
    expect(startupCheck(without('EMAIL_FROM'), 'resend').error).toBe(
      'EMAIL_FROM is not set, so emails would come from an address nobody can send from. ' +
        'Set EMAIL_FROM, such as "Robbie <noreply@robbie.scouch.dev>".',
    );
  });

  it('stops production without an address for email links', () => {
    expect(startupCheck(without('APP_URL'), 'resend').error).toBe(
      "Neither APP_URL nor CLIENT_ORIGIN is set, so emails can't link to the web app. " +
        "Set APP_URL to the web app's address.",
    );
    const origin = { ...without('APP_URL'), CLIENT_ORIGIN: APP_URL };
    expect(startupCheck(origin, 'resend').error).toBeUndefined();
    // Development falls back to the Vite server
    expect(startupCheck({ NODE_ENV: 'development', DATABASE_URL: 'x' }, 'resend').error).toBe(
      undefined,
    );
  });

  it('refuses test sign-in in production', () => {
    expect(startupCheck({ ...PRODUCTION, ENABLE_TEST_AUTH: 'true' }, 'resend').error).toBe(
      'ENABLE_TEST_AUTH=true would let a fixed code sign in any email. Remove it.',
    );
  });

  it('gives every reason production must not start', () => {
    const check = startupCheck({ NODE_ENV: 'production', ENABLE_TEST_AUTH: 'true' }, 'development');
    expect(check.error).toMatch(
      /DATABASE_URL.*email provider.*EMAIL_FROM.*APP_URL.*ENABLE_TEST_AUTH.*SERVER_SECRET.*TRUST_PROXY/,
    );
  });

  it('stops production that trusts no proxy', () => {
    expect(startupCheck(without('TRUST_PROXY'), 'resend').error).toBe(
      'TRUST_PROXY is not set: behind a reverse proxy such as Caddy, every client shares one ' +
        'rate limit. Set TRUST_PROXY=1 behind one proxy.',
    );
  });

  it('stops production without a server secret of 32 characters', () => {
    const message =
      'SERVER_SECRET is not set, or shorter than 32 characters. Set it to a random string: ' +
      'openssl rand -hex 32.';
    expect(startupCheck(without('SERVER_SECRET'), 'resend').error).toBe(message);
    expect(startupCheck({ ...PRODUCTION, SERVER_SECRET: 'short' }, 'resend').error).toBe(message);
  });

  it('allows development and tests to log codes instead of sending them', () => {
    const DATABASE_URL = 'postgresql://localhost/robbie';
    expect(startupCheck({ NODE_ENV: 'development', DATABASE_URL }, 'development')).toEqual({
      warnings: [],
    });
    expect(startupCheck({ DATABASE_URL }, 'development')).toEqual({ warnings: [] });
  });

  it('warns when test sign-in is enabled outside production', () => {
    expect(
      startupCheck({ NODE_ENV: 'development', ENABLE_TEST_AUTH: 'true' }, 'development').warnings,
    ).toEqual(['Test sign-in is enabled: the code 000000 signs in any email']);
    expect(
      startupCheck({ ENABLE_TEST_AUTH: 'true', TEST_VERIFICATION_CODE: '123456' }, 'development')
        .warnings,
    ).toEqual(['Test sign-in is enabled: the code 123456 signs in any email']);
  });

  it('checks the storage limit: refused in production, the default elsewhere', () => {
    const reason =
      'ORG_STORAGE_LIMIT_MB is "lots", not a whole number of megabytes above 0, such as 500.';
    expect(startupCheck({ ...PRODUCTION, ORG_STORAGE_LIMIT_MB: 'lots' }, 'resend').error).toBe(
      reason,
    );
    expect(startupCheck({ ...PRODUCTION, ORG_STORAGE_LIMIT_MB: '250' }, 'resend')).toEqual({
      warnings: [],
    });
    expect(startupCheck({ ORG_STORAGE_LIMIT_MB: 'lots' }, 'development').warnings).toEqual([
      `${reason} Using the default, 500.`,
    ]);
  });
});
