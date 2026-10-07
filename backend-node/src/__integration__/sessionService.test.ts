import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  SESSION_LIFETIME_MS,
  createSession,
  deleteExpiredSessionsAndCodes,
  deleteSession,
  deleteUserSessions,
  findSession,
  findSessionById,
} from '../auth/sessionService.js';
import { hashSecret } from '../auth/tokens.js';
import { resetAccounts } from './db.js';

const HOUR = 60 * 60 * 1000;

describe('sessionService', () => {
  let userId: number;
  beforeEach(async () => {
    await resetAccounts();
    userId = (await prisma.user.create({ data: { email: 'ann@example.org', name: 'Ann' } })).id;
  });

  it('finds the user for a token, and stores only its hash', async () => {
    const { token, sessionId } = await createSession(userId, 'web');
    const found = await findSession(token);
    expect(found).toEqual({
      sessionId,
      user: { id: userId, email: 'ann@example.org', name: 'Ann' },
      termsVersion: null,
      extended: false,
    });
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.tokenHash).toBe(hashSecret(token));
  });

  it('returns null for an unknown or expired token', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { token } = await createSession(userId, 'web', start);
    expect(await findSession('not-a-token')).toBeNull();
    expect(await findSession(token, new Date(start.getTime() + SESSION_LIFETIME_MS))).toBeNull();
  });

  it('finds a session by its id without extending it, until it is signed out or expires', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { sessionId } = await createSession(userId, 'web', start);
    const later = new Date(start.getTime() + 2 * HOUR);
    expect(await findSessionById(sessionId, later)).toEqual({
      sessionId,
      user: { id: userId, email: 'ann@example.org', name: 'Ann' },
      termsVersion: null,
    });
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.expiresAt.getTime()).toBe(start.getTime() + SESSION_LIFETIME_MS);

    const expired = new Date(start.getTime() + SESSION_LIFETIME_MS);
    expect(await findSessionById(sessionId, expired)).toBeNull();
    await deleteSession(sessionId);
    expect(await findSessionById(sessionId, later)).toBeNull();
  });

  it('extends a session that is used, at most once an hour', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { token, sessionId } = await createSession(userId, 'web', start);

    const soon = await findSession(token, new Date(start.getTime() + 30 * 60 * 1000));
    expect(soon?.extended).toBe(false);
    let stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.expiresAt.getTime()).toBe(start.getTime() + SESSION_LIFETIME_MS);

    const later = new Date(start.getTime() + 2 * HOUR);
    expect((await findSession(token, later))?.extended).toBe(true);
    stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.expiresAt.getTime()).toBe(later.getTime() + SESSION_LIFETIME_MS);
  });

  it('treats a session signed out while it is being extended as unknown, not an error', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { token, sessionId } = await createSession(userId, 'web', start);
    // Read the session as findSession will, then sign it out before the extension is written
    const stale = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { user: true },
    });
    await deleteSession(sessionId);
    const read = vi.spyOn(prisma.session, 'findUnique').mockResolvedValueOnce(stale as never);
    try {
      await expect(findSession(token, new Date(start.getTime() + 2 * HOUR))).resolves.toBeNull();
    } finally {
      read.mockRestore();
    }
  });

  it('deletes one session, or all of a user', async () => {
    const a = await createSession(userId, 'web');
    const b = await createSession(userId, 'mobile');
    await deleteSession(a.sessionId);
    expect(await findSession(a.token)).toBeNull();
    expect(await findSession(b.token)).not.toBeNull();
    await deleteUserSessions(userId);
    expect(await findSession(b.token)).toBeNull();
  });

  it('removes expired sessions and codes, and keeps live ones', async () => {
    const past = new Date(Date.now() - SESSION_LIFETIME_MS - HOUR);
    await createSession(userId, 'web', past);
    await prisma.signInCode.create({
      data: { email: 'ann@example.org', codeHash: 'x', expiresAt: past },
    });
    const live = await createSession(userId, 'mobile');
    const liveCode = await prisma.signInCode.create({
      data: { email: 'ann@example.org', codeHash: 'y', expiresAt: new Date(Date.now() + HOUR) },
    });

    expect(await deleteExpiredSessionsAndCodes()).toBe(2);
    expect(await findSession(live.token)).not.toBeNull();
    expect(await prisma.signInCode.findUnique({ where: { id: liveCode.id } })).not.toBeNull();
  });
});
