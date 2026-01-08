/**
 * Prisma Client Singleton
 *
 * Provides a singleton instance of the Prisma client for database operations.
 */

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Connect to the database
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
  console.log('Connected to Bylawyer database (Prisma)');
}

/**
 * Disconnect from the database
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  console.log('Disconnected from Bylawyer database');
}
