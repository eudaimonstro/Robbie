import { describe, it, expect } from 'vitest';
import { formatCalendarDate } from '../dates';

describe('formatCalendarDate', () => {
  it('runs in a non-UTC time zone, so day shifts would show', () => {
    // vitest.config.ts pins TZ to America/Chicago for this suite
    expect(new Date('2026-01-01T00:00:00.000Z').getDate()).toBe(31);
  });

  it('shows the stored calendar day regardless of the local time zone', () => {
    // Effective dates are stored as midnight UTC on the chosen day
    expect(formatCalendarDate('2026-01-01T00:00:00.000Z')).toBe(
      new Date(2026, 0, 1).toLocaleDateString(),
    );
  });

  it('returns an empty string for missing or invalid values', () => {
    expect(formatCalendarDate(null)).toBe('');
    expect(formatCalendarDate(undefined)).toBe('');
    expect(formatCalendarDate('not a date')).toBe('');
  });
});
