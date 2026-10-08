import { z } from 'zod';

/** A share link's token: base64url, as documents.ts makes them */
const shareToken = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'Not a share link');

export const shareParams = z.object({ token: shareToken });

export const shareVersionParams = z.object({ token: shareToken, versionId: z.string().uuid() });

/** A search of a shared document; empty finds nothing */
export const shareSearchQuery = z.object({ q: z.string().max(200).optional() });
