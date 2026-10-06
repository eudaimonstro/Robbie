import pg from 'pg';
import { logger } from '../middleware/logger.js';
import { databaseSsl } from './databaseSsl.js';

const { Pool } = pg;

/**
 * PostgreSQL connection pool
 *
 * Only creates actual connections when DATABASE_URL is configured.
 * The pool is lazy - connections are created when first used, not at import time.
 */
export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: databaseSsl(process.env.DATABASE_URL),
      }
    : {
        // Dummy config for in-memory mode - pool won't be used
        connectionString: 'postgresql://dummy:dummy@localhost:5432/dummy',
        max: 1,
      },
);

// Log connection errors (only relevant when DATABASE_URL is set)
if (process.env.DATABASE_URL) {
  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected database error');
  });

  pool.on('connect', () => {
    logger.info('PostgreSQL client connected');
  });
}
