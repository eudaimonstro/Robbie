import { describe, it, expect } from 'vitest';
import { captureEmailsForTests, sendSignInCode } from '../auth/emailService.js';

describe('sendSignInCode', () => {
  it('delivers to the test outbox when capturing', async () => {
    const outbox = captureEmailsForTests();
    await sendSignInCode('ann@example.org', '042137');
    expect(outbox).toEqual([{ to: 'ann@example.org', code: '042137' }]);
  });
});
