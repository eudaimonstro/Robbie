import { describe, it, expect } from 'vitest';
import { signInStartupCheck } from '../auth/signInStartupCheck.js';

describe('signInStartupCheck', () => {
  it('stops production without an email provider', () => {
    const check = signInStartupCheck({ NODE_ENV: 'production' }, 'development');
    expect(check.error).toMatch(/email provider/);
    expect(signInStartupCheck({ NODE_ENV: 'production' }, 'resend').error).toBeUndefined();
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
      signInStartupCheck({ NODE_ENV: 'production', ENABLE_TEST_AUTH: 'true' }, 'resend'),
    ).toEqual({ warnings: ['ENABLE_TEST_AUTH is ignored in production'] });
  });
});
