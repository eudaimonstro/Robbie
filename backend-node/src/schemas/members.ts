import { z } from 'zod';

const orgRole = z.enum(['viewer', 'member', 'secretary', 'admin', 'owner']);

export const organizationMembersParams = z.object({ id: z.string().uuid() });

export const memberParams = z.object({
  id: z.string().uuid(),
  userId: z.string().regex(/^\d{1,9}$/),
});

export const inviteParams = z.object({ id: z.string().uuid(), inviteId: z.string().uuid() });

const email = z.string().trim().toLowerCase().max(254).email();
/** A person's name, as the meeting takes names (MAX_NAME_LENGTH in shared) */
const personName = z.string().trim().max(100).optional();

export const addMemberBody = z.object({
  email,
  role: orgRole,
  // Shown until they sign in, and where their name step starts
  name: personName,
});

/** At most this many people in one bulk addition (MAX_BULK_PEOPLE in membershipService) */
const BULK_LIMIT = 500;

// Each email is checked on its own (a bad one is answered for its line: addMembersInBulk)
export const addMembersBulkBody = z.object({
  people: z
    .array(z.object({ email: z.string().max(320), name: personName }))
    .min(1)
    .max(BULK_LIMIT),
  role: orgRole,
});

export const changeRoleBody = z.object({ role: orgRole });

export const directorBody = z.object({ isDirector: z.boolean() });
