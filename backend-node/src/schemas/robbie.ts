import { z } from 'zod';

export const amendmentIdParam = z.object({
  amendmentId: z.string().uuid(),
});

export const syncStatusParams = z.object({
  meetingCode: z.string().min(1),
  motionId: z.coerce.number().int(),
});
