import os from 'node:os';
import path from 'node:path';

/**
 * Where the Playwright harness runs the app. The database: E2E_DATABASE_URL, else the throwaway
 * Postgres on port 55432 (never 5432 locally, which belongs to another project); CI sets
 * E2E_DATABASE_URL to its own service.
 */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/robbie';

/**
 * The API, which also serves the built web app as production does, on a port apart from the
 * development servers (3001 and 5173)
 */
export const API_PORT = 3101;
export const BASE_URL = `http://localhost:${API_PORT}`;

/**
 * Where the server writes the plain-text emails it would send (the meeting notice), one JSON file
 * each, for the tests to read: nothing is delivered (EMAIL_OUTBOX_DIR, honored only under
 * NODE_ENV=test without an email provider)
 */
export const EMAIL_OUTBOX = path.join(os.tmpdir(), 'robbie-e2e-outbox');

/**
 * The backend's environment. Variables set here win over backend-node/.env (dotenv doesn't
 * override them): test sign-in with the code 000000, no per-address sign-in limit (NODE_ENV=test),
 * no email provider (emails are logged, and notices written to EMAIL_OUTBOX), and uploads in a
 * temp folder. The web app is on the
 * API's own origin, so no CLIENT_ORIGIN, and APP_URL is that origin, as in production (the
 * Content Security Policy names the socket's address from it).
 */
export function backendEnv(uploadDir: string): Record<string, string> {
  return {
    PORT: String(API_PORT),
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    NODE_ENV: 'test',
    ENABLE_TEST_AUTH: 'true',
    UPLOAD_DIR: uploadDir,
    RESEND_API_KEY: '',
    SENDGRID_API_KEY: '',
    SMTP_HOST: '',
    EMAIL_FROM: '',
    EMAIL_OUTBOX_DIR: EMAIL_OUTBOX,
    APP_URL: BASE_URL,
    LOG_LEVEL: 'warn',
  };
}
