import { z } from 'zod';
import { dateString, meetingCode } from './common.js';

export const robbieCodeParam = z.object({ robbieCode: meetingCode });

export const createPacketBody = z.object({
  robbieCode: meetingCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: dateString.optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().optional().nullable(),
});
