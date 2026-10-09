import { ORG_ROLES, atLeast, canEditAmendment } from '@robbie-bylawyer/shared/utils';
import type { OrgRole } from '../generated/prisma/client.js';

// The order of the roles and what it allows are shared with the web
export { ORG_ROLES, atLeast, canEditAmendment };

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value);
}

/** The role just below `role`, or null for viewer */
export function roleBelow(role: OrgRole): OrgRole | null {
  const index = ORG_ROLES.indexOf(role);
  return index > 0 ? ORG_ROLES[index - 1] : null;
}

/** The 403 message for a role that is too low */
export function roleNeeded(min: OrgRole): string {
  return `You need the ${min} role for this`;
}
