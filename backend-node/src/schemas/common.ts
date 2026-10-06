import { z } from 'zod';

/** A date string that parses (ISO date or date-time); routes pass it to new Date() */
export const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' });

export const uuidParam = z.object({
  id: z.string().uuid(),
});

export const orgIdParam = z.object({
  orgId: z.string().uuid(),
});

export const docIdParam = z.object({
  docId: z.string().uuid(),
});

export const versionIdParam = z.object({
  versionId: z.string().uuid(),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
