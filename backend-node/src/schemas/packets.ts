import { z } from 'zod';
import { dateString, meetingCode } from './common.js';

export const robbieCodeParam = z.object({ robbieCode: meetingCode });

/** The presiding officer: a user id, or null for none */
const chairUserId = z.number().int().positive().nullable();

/** Where the meeting is held */
const location = z.string().max(500);

export const createPacketBody = z.object({
  robbieCode: meetingCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  location: location.optional(),
  scheduledFor: dateString.optional(),
  // Defaults to the person creating the packet
  chairUserId: chairUserId.optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  // null clears either
  description: z.string().max(2000).nullable().optional(),
  location: location.nullable().optional(),
  scheduledFor: z.string().optional().nullable(),
  chairUserId: chairUserId.optional(),
});
