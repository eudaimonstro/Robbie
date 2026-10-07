import { z } from 'zod';
import { dateString, meetingCode } from './common.js';

export const robbieCodeParam = z.object({ robbieCode: meetingCode });

/** The presiding officer: a user id, or null for none */
const chairUserId = z.number().int().positive().nullable();

export const createPacketBody = z.object({
  robbieCode: meetingCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: dateString.optional(),
  // Defaults to the person creating the packet
  chairUserId: chairUserId.optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().optional().nullable(),
  chairUserId: chairUserId.optional(),
});
