import { z } from 'zod';
import { timeZoneName } from './common.js';

/** The answer when a request sets the quorum both ways */
export const ONE_QUORUM = 'Set the quorum as a percentage or as a count, not both';

/** How many voting members an organization has (for an HOA, the lots or units that vote) */
const eligibleVoters = z.number().int().min(1).max(1_000_000);
const quorumPercent = z.number().int().min(1).max(100);
const quorumCount = z.number().int().min(1).max(1_000_000);

// The voting members and the quorum are asked for when the organization is created (the web
// always sends them); a meeting can't open until they are set
export const createOrganizationBody = z
  .object({
    name: z.string().min(1).max(200),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
    description: z.string().max(2000).optional(),
    // The creator's time zone; America/Chicago without one
    timeZone: timeZoneName.optional(),
    eligibleVoters: eligibleVoters.optional(),
    quorumPercent: quorumPercent.optional(),
    quorumCount: quorumCount.optional(),
  })
  .refine((body) => body.quorumPercent === undefined || body.quorumCount === undefined, {
    message: ONE_QUORUM,
    path: ['quorumCount'],
  })
  .refine(
    (body) =>
      body.quorumCount === undefined ||
      body.eligibleVoters === undefined ||
      body.quorumCount <= body.eligibleVoters,
    { message: "The quorum can't be more people than the voting members", path: ['quorumCount'] },
  );

// The name, the description, the attendance settings and the time zone change here; zod drops
// any other field. Setting the quorum one way clears the other (see PUT /organizations/:id).
export const updateOrganizationBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    // How many voting members the organization has: once set, a number (never unset again)
    eligibleVoters: eligibleVoters.optional(),
    quorumPercent: quorumPercent.optional(),
    quorumCount: quorumCount.optional(),
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
