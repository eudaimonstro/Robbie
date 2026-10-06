import { z } from 'zod';
import { dateString } from './common.js';

export const createVersionBody = z.object({
  effective_date: dateString.optional().nullable(),
  effectiveDate: dateString.optional().nullable(),
  adopted_at: dateString.optional().nullable(),
  adoptedAt: dateString.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateVersionBody = z.object({
  effective_date: dateString.optional().nullable(),
  effectiveDate: dateString.optional().nullable(),
  adopted_at: dateString.optional().nullable(),
  adoptedAt: dateString.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const diffParams = z.object({
  id: z.string().uuid(),
  otherId: z.string().uuid(),
});
