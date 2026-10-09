/**
 * Prisma Client Singleton
 *
 * Provides a singleton instance of the Prisma client for database operations.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../middleware/logger.js';
import { pool } from './client.js';

// The server's one pool (client.ts), shared with the live meetings. Prisma never ends a pool it
// was given: the server closes it once, after both are done with it (index.ts).
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

/**
 * Connect to the database
 */
export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
  logger.info('Connected to the database (Prisma)');
}

/**
 * Disconnect from the database
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from the database');
}
