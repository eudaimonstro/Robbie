/**
 * Where the Playwright harness runs the app. The database: E2E_DATABASE_URL, else the throwaway
 * Postgres on port 55432 (never 5432 locally, which belongs to another project); CI sets
 * E2E_DATABASE_URL to its own service.
 */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/robbie';

/** The API and the web app, on ports apart from the development servers (3001 and 5173) */
export const API_PORT = 3101;
export const WEB_PORT = 4173;

/**
 * The backend's environment. Variables set here win over backend-node/.env (dotenv doesn't
 * override them): test sign-in with the code 000000, no per-address sign-in limit (NODE_ENV=test),
 * no email provider (emails are logged), and uploads in a temp folder.
 */
export function backendEnv(uploadDir: string): Record<string, string> {
  return {
    PORT: String(API_PORT),
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    NODE_ENV: 'test',
    ENABLE_TEST_AUTH: 'true',
    CLIENT_ORIGIN: `http://localhost:${WEB_PORT}`,
    UPLOAD_DIR: uploadDir,
    RESEND_API_KEY: '',
    SENDGRID_API_KEY: '',
    SMTP_HOST: '',
    EMAIL_FROM: '',
    LOG_LEVEL: 'warn',
  };
}
