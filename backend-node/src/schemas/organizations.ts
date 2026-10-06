import { z } from 'zod';

export const createOrganizationBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional(),
});

// Only the name and description change here; zod drops any other field
export const updateOrganizationBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export const listOrganizationsQuery = z.object({
  active_only: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
