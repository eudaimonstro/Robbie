import { z } from 'zod';

const orgRole = z.enum(['viewer', 'member', 'secretary', 'admin', 'owner']);

export const organizationMembersParams = z.object({ id: z.string().uuid() });

export const memberParams = z.object({
  id: z.string().uuid(),
  userId: z.string().regex(/^\d{1,9}$/),
});

export const inviteParams = z.object({ id: z.string().uuid(), inviteId: z.string().uuid() });

export const addMemberBody = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  role: orgRole,
});

export const changeRoleBody = z.object({ role: orgRole });
