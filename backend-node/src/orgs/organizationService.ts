import type { Organization, OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { OrgError } from './orgError.js';

/** A user can own at most this many organizations */
export const MAX_OWNED_ORGANIZATIONS = 3;

export type OrganizationWithRole = Organization & { role: OrgRole };

/** The user's organizations by name, each with the user's role */
export async function userOrganizations(
  userId: number,
  options: { activeOnly?: boolean; skip?: number; take?: number } = {},
): Promise<{ organizations: OrganizationWithRole[]; total: number }> {
  const where: Prisma.OrganizationMemberWhereInput = {
    userId,
    ...(options.activeOnly ? { organization: { isActive: true } } : {}),
  };
  const [memberships, total] = await prisma.$transaction([
    prisma.organizationMember.findMany({
      where,
      include: { organization: true },
      orderBy: { organization: { name: 'asc' } },
      skip: options.skip,
      take: options.take,
    }),
    prisma.organizationMember.count({ where }),
  ]);
  return {
    organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    total,
  };
}

/** Create an organization with the user as its owner */
export async function createOwnedOrganization(
  userId: number,
  data: { name: string; slug: string; description?: string },
): Promise<OrganizationWithRole> {
  return prisma.$transaction(async (tx) => {
    // Hold the user's row so two creations at once can't both pass the limit
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const owned = await tx.organizationMember.count({ where: { userId, role: 'owner' } });
    if (owned >= MAX_OWNED_ORGANIZATIONS) {
      throw new OrgError(429, `You can own at most ${MAX_OWNED_ORGANIZATIONS} organizations`);
    }
    const org = await tx.organization.create({
      data: { ...data, members: { create: { userId, role: 'owner' } } },
    });
    return { ...org, role: 'owner' as const };
  });
}
