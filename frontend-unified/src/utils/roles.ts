import { ORG_ROLES, atLeast, canEditAmendment, type OrgRole } from '@robbie-bylawyer/shared/utils';

// The order of the roles (lowest first) and what it allows are the server's, from shared
export { atLeast, canEditAmendment, type OrgRole };

export const ROLE_LABELS: Record<OrgRole, string> = {
  viewer: 'Viewer',
  member: 'Member',
  secretary: 'Secretary',
  admin: 'Admin',
  owner: 'Owner',
};

/** The roles someone with `role` may give others: an owner any, an admin up to admin */
export function assignableRoles(role: OrgRole): OrgRole[] {
  if (role === 'owner') return [...ORG_ROLES];
  if (role === 'admin') return ORG_ROLES.filter((r) => r !== 'owner');
  return [];
}
