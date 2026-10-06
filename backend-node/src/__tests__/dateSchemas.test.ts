import { describe, it, expect } from 'vitest';
import { createMeetingBody, updateMeetingBody } from '../schemas/meetings.js';
import { createVersionBody, updateVersionBody } from '../schemas/versions.js';
import { atDateQuery } from '../schemas/documents.js';
import { applyAmendmentQuery } from '../schemas/amendments.js';

// Each of these used to reach new Date() unchecked, so a bad or missing date became an
// Invalid Date and Prisma's error a 500, instead of a 400 from validation
describe('date fields', () => {
  it('require a date to create a meeting', () => {
    expect(createMeetingBody.safeParse({ title: 'Annual' }).success).toBe(false);
    expect(createMeetingBody.safeParse({ scheduledDate: '2026-10-07T00:00:00.000Z' }).success).toBe(
      true,
    );
    expect(createMeetingBody.safeParse({ scheduled_date: '2026-10-07' }).success).toBe(true);
  });

  it('reject a date that does not parse', () => {
    expect(createMeetingBody.safeParse({ scheduledDate: 'next Tuesday' }).success).toBe(false);
    expect(updateMeetingBody.safeParse({ scheduledDate: 'soon' }).success).toBe(false);
    expect(createVersionBody.safeParse({ effectiveDate: 'garbage' }).success).toBe(false);
    expect(updateVersionBody.safeParse({ adoptedAt: 'garbage' }).success).toBe(false);
    expect(atDateQuery.safeParse({ date: 'garbage' }).success).toBe(false);
    expect(applyAmendmentQuery.safeParse({ effective_date: 'garbage' }).success).toBe(false);
  });

  it('still allow a date to be left out or cleared where it is optional', () => {
    expect(createVersionBody.safeParse({}).success).toBe(true);
    expect(updateVersionBody.safeParse({ effectiveDate: null }).success).toBe(true);
    expect(updateMeetingBody.safeParse({ title: 'Renamed' }).success).toBe(true);
  });
});

describe('amendment change body', () => {
  it('requires a change type (it used to fail in the database with a 500)', async () => {
    const { createAmendmentChangeBody } = await import('../schemas/amendments.js');
    expect(createAmendmentChangeBody.safeParse({ newContent: 'x' }).success).toBe(false);
    expect(createAmendmentChangeBody.safeParse({ changeType: 'modify' }).success).toBe(true);
    expect(createAmendmentChangeBody.safeParse({ change_type: 'add' }).success).toBe(true);
  });
});
