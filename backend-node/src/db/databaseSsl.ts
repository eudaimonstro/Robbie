import type { ConnectionOptions } from 'tls';

/**
 * TLS settings for the Postgres connection, shared by the meetings pool and Prisma so both
 * connect the same way:
 * - an sslmode in DATABASE_URL is left to the driver, as written;
 * - otherwise DATABASE_SSL chooses: disable, require (TLS without checking the certificate) or
 *   verify (TLS with the certificate checked);
 * - otherwise a database on this machine is reached without TLS, and any other host with TLS
 *   that doesn't check the certificate (as hosted databases such as Supabase need).
 * A database in another container (a Docker Compose service name) has no TLS by default, so
 * set DATABASE_SSL=disable for it.
 */
export function databaseSsl(
  url: string,
  setting: string | undefined = process.env.DATABASE_SSL,
): boolean | ConnectionOptions | undefined {
  if (/[?&]sslmode=/.test(url)) return undefined;

  switch (setting?.trim().toLowerCase()) {
    case 'disable':
    case 'false':
      return false;
    case 'require':
      return { rejectUnauthorized: false };
    case 'verify':
    case 'verify-full':
      return { rejectUnauthorized: true };
  }

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // Not a URL the default can judge; fall through to TLS
  }
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)
    ? false
    : { rejectUnauthorized: false };
}
