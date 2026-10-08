import pg from 'pg';
import { logger } from '../middleware/logger.js';
import { databaseSsl } from './databaseSsl.js';

const { Pool } = pg;

/**
 * The server's one PostgreSQL connection pool, on DATABASE_URL: the live meetings
 * (meetingStorage) and Prisma (prisma.ts) share it. The server doesn't start without one
 * (startupCheck). The pool is lazy: it connects when first used, not at import.
 *
 * Ten connections: the server is one process on one vCPU, and each Postgres backend costs
 * several megabytes on a 1.9 GiB host. A script exits once its queries are done (the pool
 * doesn't hold the process open while idle).
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  allowExitOnIdle: true,
  // A query that hangs (a lock, a database in trouble) fails after 10 seconds rather than
  // holding one of the ten connections and the meeting's queue behind it
  statement_timeout: 10_000,
  query_timeout: 10_000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_URL ? databaseSsl(process.env.DATABASE_URL) : undefined,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database error');
});
