import type { ConnectionOptions } from 'tls';

/**
 * TLS settings for the Postgres connection, shared by the meetings pool and Prisma so both
 * connect the same way:
 * - an sslmode in DATABASE_URL is left to the driver, as written;
 * - otherwise DATABASE_SSL chooses: disable, require (TLS without checking the certificate) or
 *   verify (TLS with the certificate checked);
 * - otherwise a database on this machine or in another container (a Docker Compose service
 *   name, which has no dot) is reached without TLS, and any other host with TLS that doesn't
 *   check the certificate (as hosted databases such as Supabase need).
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
  // This machine, or another container on the same Docker network (a service name such as
  // "postgres" has no dot); a stock Postgres container has no TLS
  const local =
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || /^[a-z0-9_-]+$/i.test(host);
  return local ? false : { rejectUnauthorized: false };
}
