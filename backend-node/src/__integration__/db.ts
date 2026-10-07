import { prisma } from '../db/prisma.js';

/**
 * Empty the account tables between tests. TRUNCATE ... CASCADE follows every foreign key, so
 * this also empties memberships, invites and amendments (which record their creator).
 */
export async function resetAccounts(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Session", "SignInCode", "User" RESTART IDENTITY CASCADE',
  );
}

/**
 * Empty every Prisma table between tests: organizations (with, by cascade, their documents,
 * meetings, packets and members) and the account tables
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Organization", "Session", "SignInCode", "User" RESTART IDENTITY CASCADE',
  );
}
