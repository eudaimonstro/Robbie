import { describe, it, expect, afterEach } from 'vitest';
import { captureEmailsForTests, sendSignInCode } from '../auth/emailService.js';

describe('sendSignInCode', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  // Before any capture: in production the provider check comes first anyway
  it('refuses to pretend to send in production without an email provider', async () => {
    process.env.NODE_ENV = 'production';
    await expect(sendSignInCode('ann@example.org', '042137')).rejects.toThrow(/provider/);
  });

  it('delivers to the test outbox when capturing', async () => {
    const outbox = captureEmailsForTests();
    await sendSignInCode('ann@example.org', '042137');
    expect(outbox).toEqual([{ to: 'ann@example.org', code: '042137' }]);
  });

  it('still refuses in production while capturing', async () => {
    captureEmailsForTests();
    process.env.NODE_ENV = 'production';
    await expect(sendSignInCode('ann@example.org', '042137')).rejects.toThrow(/provider/);
  });
});

describe('captureEmailsForTests', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('works only under test', () => {
    process.env.NODE_ENV = 'development';
    expect(() => captureEmailsForTests()).toThrow();
    process.env.NODE_ENV = 'production';
    expect(() => captureEmailsForTests()).toThrow();
  });
});
