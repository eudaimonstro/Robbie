import { z } from 'zod';

export const createVersionBody = z.object({
  effective_date: z.string().optional().nullable(),
  adopted_at: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateVersionBody = z.object({
  effective_date: z.string().optional().nullable(),
  adopted_at: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const diffParams = z.object({
  id: z.string().uuid(),
  otherId: z.string().uuid(),
});
