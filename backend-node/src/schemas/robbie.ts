import { z } from 'zod';
import { meetingCode } from './common.js';

export const amendmentIdParam = z.object({
  amendmentId: z.string().uuid(),
});

export const syncStatusParams = z.object({
  meetingCode,
  motionId: z.coerce.number().int(),
});
