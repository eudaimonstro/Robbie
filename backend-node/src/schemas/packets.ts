import { z } from 'zod';

export const createPacketBody = z.object({
  robbieCode: z.string().min(1),
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().optional().nullable(),
});
