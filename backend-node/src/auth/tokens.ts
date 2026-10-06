import crypto from 'crypto';

/** A new session token: 32 random bytes as base64url */
export function newSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** A new 6-digit sign-in code */
export function newSignInCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** SHA-256 of a session token or sign-in code, as hex. Only these hashes are stored. */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
