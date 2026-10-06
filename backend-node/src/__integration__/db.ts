import { prisma } from '../db/prisma.js';

/** Empty the account tables between tests */
export async function resetAccounts(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Session", "SignInCode", "User" RESTART IDENTITY CASCADE',
  );
}
