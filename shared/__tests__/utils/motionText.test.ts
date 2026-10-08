import { describe, it, expect } from 'vitest';
import { fitMotionText } from '../../utils/motionText.js';

describe('fitMotionText', () => {
  it('leaves words that fit as they are', () => {
    expect(fitMotionText('Approve: ', 'The budget')).toBe('Approve: The budget');
  });

  it('cuts the quoted text so the motion stays within 500 characters', () => {
    const text = fitMotionText('I move to reconsider the vote on "', 'x'.repeat(600), '"');
    expect(text).toHaveLength(500);
    expect(text.endsWith('…"')).toBe(true);
    expect(text.startsWith('I move to reconsider the vote on "x')).toBe(true);
  });
});
