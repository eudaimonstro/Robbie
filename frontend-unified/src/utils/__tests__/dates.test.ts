import { describe, it, expect } from 'vitest';
import { formatCalendarDate, fromLocalDateTimeInput, toLocalDateTimeInput } from '../dates';

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

describe('meeting date and time inputs', () => {
  // The suite runs in America/Chicago, UTC-5 in October
  it('sends the time picked in the viewer’s time zone as an exact instant', () => {
    expect(fromLocalDateTimeInput('2026-10-06T19:00')).toBe('2026-10-07T00:00:00.000Z');
  });

  it('shows a stored instant as the viewer’s local time in the input', () => {
    expect(toLocalDateTimeInput('2026-10-07T00:00:00.000Z')).toBe('2026-10-06T19:00');
  });

  it('round-trips, so saving an unchanged form keeps the time', () => {
    const stored = '2026-03-15T14:30:00.000Z';
    expect(fromLocalDateTimeInput(toLocalDateTimeInput(stored))).toBe(stored);
  });
});
