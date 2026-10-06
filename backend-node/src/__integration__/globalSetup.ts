import { execFileSync } from 'child_process';

/** Apply migrations to the integration database once, before any test file runs */
export default function setup() {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set INTEGRATION_DATABASE_URL to a throwaway Postgres to run integration tests',
    );
  }
  // DIRECT_URL too: prisma.config.ts loads .env, which would otherwise supply it
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'inherit',
  });
}
