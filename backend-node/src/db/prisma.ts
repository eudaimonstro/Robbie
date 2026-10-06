/**
 * Prisma Client Singleton
 *
 * Provides a singleton instance of the Prisma client for database operations.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

export const prisma = new PrismaClient();

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
