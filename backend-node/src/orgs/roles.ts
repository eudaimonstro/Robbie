import type { OrgRole } from '../generated/prisma/client.js';

/** Organization roles, lowest first. Each role can do everything the roles before it can. */
export const ROLES: readonly OrgRole[] = ['viewer', 'member', 'secretary', 'admin', 'owner'];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Whether `role` is `min` or higher */
export function atLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** The role just below `role`, or null for viewer */
export function roleBelow(role: OrgRole): OrgRole | null {
  const index = ROLES.indexOf(role);
  return index > 0 ? ROLES[index - 1] : null;
}

/** The 403 message for a role that is too low */
export function roleNeeded(min: OrgRole): string {
  return `You need the ${min} role for this`;
}

/**
 * Whether a user may edit, add changes to or delete an amendment: a secretary may edit any
 * (the status rules still apply), a member only a draft they created
 */
export function canEditAmendment(
  role: OrgRole,
  userId: number,
  amendment: { status: string; createdById: number | null },
): boolean {
  if (atLeast(role, 'secretary')) return true;
  return (
    atLeast(role, 'member') && amendment.status === 'draft' && amendment.createdById === userId
  );
}
