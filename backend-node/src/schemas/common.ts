import { z } from 'zod';

/** A date string that parses (ISO date or date-time); routes pass it to new Date() */
export const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' });

/** Whether the runtime knows this IANA time zone name (America/Chicago, Europe/Paris) */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone name the server can format times in */
export const timeZoneName = z
  .string()
  .min(1)
  .max(64)
  .refine(isTimeZone, { message: 'Unknown time zone' });

/**
 * A live meeting's code, as the meeting screens and packets use it: 4-8 letters or digits,
 * compared in upper case. It also names the meeting's upload directory.
 */
const MEETING_CODE_FORMAT = 'Meeting code must be 4-8 letters or digits';
export const meetingCode = z
  .string({ error: MEETING_CODE_FORMAT })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/, MEETING_CODE_FORMAT);

export const uuidParam = z.object({
  id: z.string().uuid(),
});

export const orgIdParam = z.object({
  orgId: z.string().uuid(),
});

export const docIdParam = z.object({
  docId: z.string().uuid(),
});

export const versionIdParam = z.object({
  versionId: z.string().uuid(),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
