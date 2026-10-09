/**
 * Organization roles, lowest first: each role can do everything the roles before it can. The
 * server decides what each may do; the web uses the order only to hide what a role can't do.
 */
export const ORG_ROLES = ['viewer', 'member', 'secretary', 'admin', 'owner'] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/** Whether `role` is `min` or higher */
export function atLeast(role: OrgRole, min: OrgRole): boolean {
  return ORG_ROLES.indexOf(role) >= ORG_ROLES.indexOf(min);
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
