import { describe, it, expect } from 'vitest';
import { toDecisionDate } from '../bylawyer/decisionDate.js';

describe('toDecisionDate', () => {
  const now = new Date('2026-10-06T05:47:25.000Z');

  it('uses an ISO timestamp as given', () => {
    expect(toDecisionDate('2026-10-05T18:00:00.000Z', now).toISOString()).toBe(
      '2026-10-05T18:00:00.000Z',
    );
  });

  it('falls back to the current time for a display-only time of day', () => {
    expect(toDecisionDate('12:47:25 AM', now)).toBe(now);
  });

  it('falls back to the current time when no timestamp is given', () => {
    expect(toDecisionDate(undefined, now)).toBe(now);
  });
});
