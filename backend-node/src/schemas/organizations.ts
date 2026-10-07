import { z } from 'zod';
import { timeZoneName } from './common.js';

export const createOrganizationBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional(),
  // The creator's time zone; America/Chicago without one
  timeZone: timeZoneName.optional(),
});

/** The answer when a request sets the quorum both ways */
export const ONE_QUORUM = 'Set the quorum as a percentage or as a count, not both';

// The name, the description, the attendance settings and the time zone change here; zod drops
// any other field. Setting the quorum one way clears the other (see PUT /organizations/:id).
export const updateOrganizationBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    // How many voting members the organization has; null counts the roster instead
    eligibleVoters: z.number().int().min(1).max(1_000_000).nullable().optional(),
    quorumPercent: z.number().int().min(1).max(100).optional(),
    quorumCount: z.number().int().min(1).max(1_000_000).optional(),
    timeZone: timeZoneName.optional(),
  })
  .refine((body) => body.quorumPercent === undefined || body.quorumCount === undefined, {
    message: ONE_QUORUM,
    path: ['quorumCount'],
  });

export const listOrganizationsQuery = z.object({
  active_only: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
