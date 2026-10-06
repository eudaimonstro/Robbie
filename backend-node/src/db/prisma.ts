/**
 * Prisma Client Singleton
 *
 * Provides a singleton instance of the Prisma client for database operations.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../middleware/logger.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

/**
 * Connect to the database
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
  logger.info('Connected to Bylawyer database (Prisma)');
}

/**
 * Disconnect from the database
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from Bylawyer database');
}
