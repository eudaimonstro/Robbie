import { z } from 'zod';
import { dateString, meetingCode } from './common.js';

export const robbieCodeParam = z.object({ robbieCode: meetingCode });

/** The presiding officer: a user id, or null for none */
const chairUserId = z.number().int().positive().nullable();

/** Where the meeting is held */
const location = z.string().max(500);

/** Who votes: the members (the default), or the board's directors */
const kind = z.enum(['members', 'board']);

export const createPacketBody = z.object({
  // Generated (random) when left out
  robbieCode: meetingCode.optional(),
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  location: location.optional(),
  scheduledFor: dateString.optional(),
  // Defaults to the person creating the packet
  chairUserId: chairUserId.optional(),
  kind: kind.optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  // null clears the description, the place or the date
  description: z.string().max(2000).nullable().optional(),
  location: location.nullable().optional(),
  scheduledFor: dateString.nullable().optional(),
  chairUserId: chairUserId.optional(),
  // Until the meeting is called to order
  kind: kind.optional(),
});
