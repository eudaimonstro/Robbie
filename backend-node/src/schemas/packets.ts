import { z } from 'zod';
import { dateString } from './common.js';

/** A meeting code, which also names the meeting's upload directory: letters, digits, - and _ */
export const robbieCode = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid meeting code');

export const robbieCodeParam = z.object({ robbieCode });

export const createPacketBody = z.object({
  robbieCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: dateString.optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().optional().nullable(),
});
