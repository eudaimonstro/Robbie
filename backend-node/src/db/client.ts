import pg from 'pg';
import { logger } from '../middleware/logger.js';
import { databaseSsl } from './databaseSsl.js';

const { Pool } = pg;

/**
 * The PostgreSQL connection pool for the live meetings (meetingStorage), on DATABASE_URL. The
 * server doesn't start without one (startupCheck). The pool is lazy: it connects when first
 * used, not at import.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_URL ? databaseSsl(process.env.DATABASE_URL) : undefined,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database error');
});
