import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { isEmailAddress } from '@robbie-bylawyer/shared/utils';

describe('isEmailAddress (shared)', () => {
  it('agrees with zod, which the server checks single additions with', () => {
    for (const text of [
      'carmen@example.com',
      "o'brien+hoa@mail.example.co",
      'a.b@sub.example.org',
      'pat@example',
      'two@@example.com',
      '.dot@example.com',
      'a..b@example.com',
      'no spaces@example.com',
      'x@-bad.example.com',
    ]) {
      expect(isEmailAddress(text), text).toBe(z.email().safeParse(text).success);
    }
  });
});
