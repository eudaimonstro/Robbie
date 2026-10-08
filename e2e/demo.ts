import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { DATABASE_URL } from './env';

/**
 * Clear the live meetings and seed the Maple Grove HOA demo again, so a run (or a test that uses
 * the demo's own meeting) starts from the same organization, people and schedule.
 */
export async function resetDemo(): Promise<void> {
  // Live meetings are kept outside Prisma (backend-node/src/db/meetingStorage.ts creates the
  // table at startup): a reseeded organization would otherwise find old meetings under its codes
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM meetings');
    // The scenarios sign in through the sign-in page, which asks for a code: without this, a
    // few runs in an hour would reach the limit on codes per email
    await client.query('DELETE FROM "SignInCode"');
  } finally {
    await client.end();
  }

  execFileSync('npx', ['tsx', 'src/scripts/seedDemo.ts', '--reset'], {
    cwd: path.resolve(__dirname, '../backend-node'),
    env: { ...process.env, DATABASE_URL, DIRECT_URL: DATABASE_URL },
    stdio: 'inherit',
  });
}
