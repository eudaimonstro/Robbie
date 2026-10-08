import pg from 'pg';
import { logger } from '../middleware/logger.js';
import { databaseSsl } from './databaseSsl.js';

/** The advisory lock one server holds on its database ("robbie" in ASCII, as a number) */
export const SERVER_LOCK_KEY = 0x726f6262;

/**
 * Hold the database's server lock for as long as this process runs, on a connection of its own.
 *
 * The live meetings are kept in this process's memory and their writes are ordered in it
 * (meetingStorage), so two servers on one database would each confirm actions the other never
 * sees. A second server waits up to `waitMs` (a restart overlapping the old process's exit),
 * then refuses to start.
 *
 * @returns the connection holding the lock (end it to release it), or null if another process
 *   holds it
 */
export async function acquireServerLock(
  connectionString: string,
  waitMs = 20_000,
): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString, ssl: databaseSsl(connectionString) });
  client.on('error', (err) => logger.error({ err }, 'Lost the connection holding the server lock'));
  await client.connect();
  const deadline = Date.now() + waitMs;
  for (;;) {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [SERVER_LOCK_KEY],
    );
    if (result.rows[0]?.locked) return client;
    if (Date.now() >= deadline) {
      await client.end();
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
