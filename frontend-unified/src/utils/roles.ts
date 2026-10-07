/**
 * Organization roles, lowest first, as the server ranks them (backend-node/src/orgs/roles.ts).
 * The server decides what each role may do; the app uses these only to hide actions a role
 * can't take.
 */
export const ROLES = ['viewer', 'member', 'secretary', 'admin', 'owner'] as const;

export type OrgRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<OrgRole, string> = {
  viewer: 'Viewer',
  member: 'Member',
  secretary: 'Secretary',
  admin: 'Admin',
  owner: 'Owner',
};

/** Whether `role` is `min` or higher */
export function atLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** The roles someone with `role` may give others: an owner any, an admin up to admin */
export function assignableRoles(role: OrgRole): OrgRole[] {
  if (role === 'owner') return [...ROLES];
  if (role === 'admin') return ROLES.filter((r) => r !== 'owner');
  return [];
}

/**
 * Whether a user may edit, add changes to or delete an amendment: a secretary any, a member
 * only a draft they created (the server's canEditAmendment)
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
