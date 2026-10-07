import { describe, it, expect } from 'vitest';
import {
  formatCalendarDate,
  formatClockTime,
  formatMeetingTime,
  formatScheduledStart,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
} from '../dates';

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

describe('fromLocalDateTimeInput with no usable value', () => {
  it('returns an empty value instead of throwing, so the server can reject it', () => {
    // new Date('').toISOString() throws, which left the meeting form silently stuck open
    expect(fromLocalDateTimeInput('')).toBe('');
  });
});

describe('formatMeetingTime', () => {
  it("shows a meeting's day and time in the viewer's time zone", () => {
    // 7 PM in Chicago, where the tests run, on Tuesday, October 20, 2026
    expect(formatMeetingTime('2026-10-21T00:00:00.000Z')).toMatch(/^Tue, Oct 20, 7:00\sPM$/);
  });

  it('shows nothing for a missing or unreadable date', () => {
    expect(formatMeetingTime('')).toBe('');
    expect(formatMeetingTime('not a date')).toBe('');
  });
});

describe('formatClockTime', () => {
  it("shows a log entry's instant as a time of day in the viewer's time zone", () => {
    // 9:16 AM in Chicago, where the tests run
    expect(formatClockTime('2026-10-07T14:16:10.646Z')).toMatch(/^9:16\sAM$/);
  });

  it('drops the seconds of a clock time, shows anything else as it is, and nothing for none', () => {
    expect(formatClockTime('7:41:00 PM')).toBe('7:41 PM');
    expect(formatClockTime('19:41')).toBe('19:41');
    expect(formatClockTime('')).toBe('');
    expect(formatClockTime(undefined)).toBe('');
  });
});

describe('formatScheduledStart', () => {
  it("spells out the day and gives the time, in the viewer's time zone", () => {
    // 7:00 PM in Chicago, where the suite runs
    expect(formatScheduledStart('2026-10-21T00:00:00.000Z')).toBe('Tuesday, October 20, 7:00 PM');
  });

  it('is empty for no time, or one it cannot read', () => {
    expect(formatScheduledStart(null)).toBe('');
    expect(formatScheduledStart('soon')).toBe('');
  });
});
