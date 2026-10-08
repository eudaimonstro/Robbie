import crypto from 'crypto';

/**
 * SERVER_SECRET: the key of the server's keyed hashes (the network addresses sign-in codes
 * record). Production refuses to start without one of at least MIN_SERVER_SECRET_LENGTH
 * characters (startupCheck); development and tests use a fixed stand-in.
 */
export const MIN_SERVER_SECRET_LENGTH = 32;
const DEVELOPMENT_SECRET = 'robbie-development-only-server-secret';

export function serverSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.SERVER_SECRET || DEVELOPMENT_SECRET;
}

/** HMAC-SHA256 of a value under the server secret, as hex */
export function keyedHash(value: string): string {
  return crypto.createHmac('sha256', serverSecret()).update(value).digest('hex');
}
