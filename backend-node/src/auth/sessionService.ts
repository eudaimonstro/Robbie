import { prisma } from '../db/prisma.js';
import { hashSecret, newSessionToken } from './tokens.js';

/** Sessions last this long from their last use */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
// Extend a session at most this often, so busy clients don't write on every request
const EXTEND_AFTER_MS = 60 * 60 * 1000;

export type SessionClient = 'web' | 'mobile';

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

export interface ActiveSession {
  sessionId: string;
  user: SessionUser;
  /** True when this use pushed expiresAt out, so a web cookie should be re-sent to match */
  extended: boolean;
}

/** Start a session; the token is returned once and only its hash is stored */
export async function createSession(
  userId: number,
  client: SessionClient,
  now: Date = new Date(),
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  const session = await prisma.session.create({
    data: {
      tokenHash: hashSecret(token),
      userId,
      client,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
  });
  return { token, sessionId: session.id, expiresAt };
}

/** The session and user for a token, or null if unknown, expired or signed out. Use extends it. */
export async function findSession(
  token: string,
  now: Date = new Date(),
): Promise<ActiveSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= now) return null;

  let extended = false;
  if (now.getTime() - session.lastUsedAt.getTime() >= EXTEND_AFTER_MS) {
    // updateMany, not update: a session signed out since it was read is simply not found
    const updated = await prisma.session.updateMany({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS) },
    });
    if (updated.count === 0) return null;
    extended = true;
  }

  const { id, email, name } = session.user;
  return { sessionId: session.id, user: { id, email, name }, extended };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Delete the session for a token, if any; returns its id so its sockets can be closed */
export async function deleteSessionByToken(token: string): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: { id: true },
  });
  if (!session) return null;
  await deleteSession(session.id);
  return session.id;
}

export async function deleteUserSessions(userId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Remove expired sessions and sign-in codes; returns how many were removed */
export async function deleteExpiredSessionsAndCodes(now: Date = new Date()): Promise<number> {
  const [sessions, codes] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.signInCode.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  return sessions.count + codes.count;
}
