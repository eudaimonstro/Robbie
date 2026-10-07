import { describe, it, expect } from 'vitest';
import { signInStartupCheck } from '../auth/signInStartupCheck.js';

const APP_URL = 'https://app.example.org';

describe('signInStartupCheck', () => {
  it('stops production without an email provider', () => {
    const check = signInStartupCheck({ NODE_ENV: 'production', APP_URL }, 'development');
    expect(check.error).toMatch(/email provider/);
    expect(signInStartupCheck({ NODE_ENV: 'production', APP_URL }, 'resend').error).toBeUndefined();
  });

  it('stops production without an address for email links', () => {
    const check = signInStartupCheck({ NODE_ENV: 'production' }, 'resend');
    expect(check.error).toBe(
      "Neither APP_URL nor CLIENT_ORIGIN is set, so emails can't link to the web app. " +
        "Set APP_URL to the web app's address.",
    );
    const origin = { NODE_ENV: 'production', CLIENT_ORIGIN: APP_URL };
    expect(signInStartupCheck(origin, 'resend').error).toBeUndefined();
    // Development falls back to the Vite server
    expect(signInStartupCheck({ NODE_ENV: 'development' }, 'resend').error).toBeUndefined();
  });

  it('gives every reason production must not start', () => {
    const check = signInStartupCheck({ NODE_ENV: 'production' }, 'development');
    expect(check.error).toMatch(/email provider.*APP_URL/);
  });

  it('allows development and tests to log codes instead of sending them', () => {
    expect(signInStartupCheck({ NODE_ENV: 'development' }, 'development')).toEqual({
      warnings: [],
    });
    expect(signInStartupCheck({}, 'development')).toEqual({ warnings: [] });
  });

  it('warns when test sign-in is enabled', () => {
    expect(
      signInStartupCheck({ NODE_ENV: 'development', ENABLE_TEST_AUTH: 'true' }, 'development')
        .warnings,
    ).toEqual(['Test sign-in is enabled: the code 000000 signs in any email']);
    expect(
      signInStartupCheck(
        { ENABLE_TEST_AUTH: 'true', TEST_VERIFICATION_CODE: '123456' },
        'development',
      ).warnings,
    ).toEqual(['Test sign-in is enabled: the code 123456 signs in any email']);
  });

  it('warns that test sign-in is ignored in production', () => {
    expect(
      signInStartupCheck({ NODE_ENV: 'production', APP_URL, ENABLE_TEST_AUTH: 'true' }, 'resend'),
    ).toEqual({ warnings: ['ENABLE_TEST_AUTH is ignored in production'] });
  });
});
