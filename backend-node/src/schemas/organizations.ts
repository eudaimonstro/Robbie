import { z } from 'zod';

export const createOrganizationBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional(),
});

export const updateOrganizationBody = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const listOrganizationsQuery = z.object({
  active_only: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
