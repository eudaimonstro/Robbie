# Accounts and Sessions (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-meeting JWT sign-in with persistent users, email-code sign-in for the whole app, and server-side sessions, and require a session on every API route and socket.

**Architecture:** Users, sessions and sign-in codes become Prisma models. A random session token (only its SHA-256 hash is stored) travels in an httpOnly `session` cookie for web or as a bearer token for mobile. An Express `authenticate` middleware guards every `/api` router except auth, health and public share; a Socket.io `io.use` middleware authenticates each connection the same way. The Express app moves to `app.ts` so integration tests can drive it with supertest against an opt-in database.

**Tech Stack:** Node 24, Express 5, Socket.io 4, Prisma 7 (`@prisma/adapter-pg`), zod, Vitest 5, supertest.

**Design:** `docs/superpowers/specs/2026-10-06-accounts-and-sessions-design.md`. The web and mobile clients are a second plan; until it lands, the clients on this branch can't sign in, so the branch is not merged before both plans are done.

**Conventions:**

- Work in `backend-node/` unless a path says otherwise. Use `&&` between commands, never `;`.
- Never point tests at port 5432. Integration tests use `INTEGRATION_DATABASE_URL`, for example the throwaway container on 55432: `postgresql://postgres:postgres@localhost:55432/robbie`.
- Commit messages: no `Co-Authored-By` lines.
- Steps that add packages change `package-lock.json`, and the migration step writes a migration file. A project hook asks for confirmation on those files; confirm with the owner.

---

## File structure

| File                                                                | Responsibility                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                              | Add `User`, `Session`, `SignInCode`                                                          |
| `prisma/migrations/<timestamp>_accounts_and_sessions/`              | Generated migration                                                                          |
| `src/auth/tokens.ts`                                                | Random session tokens, sign-in codes, SHA-256 hashing                                        |
| `src/auth/sessionService.ts`                                        | Create, find (with sliding expiry), delete and expire sessions                               |
| `src/auth/signInService.ts`                                         | Request and verify sign-in codes, find or create users                                       |
| `src/auth/emailService.ts`                                          | `sendSignInCode`, memory capture for tests (replaces `sendVerificationEmail`, `getLastCode`) |
| `src/auth/authenticate.ts`                                          | Express middleware, cookie options, `req.user` typing                                        |
| `src/auth/authRoutes.ts`                                            | `/api/auth/*` routes (replaces `authController.ts`)                                          |
| `src/socket/socketAuth.ts`                                          | Socket.io connection middleware                                                              |
| `src/socket/sessionSockets.ts`                                      | Disconnect sockets after sign-out                                                            |
| `src/app.ts`                                                        | Express app (no listening)                                                                   |
| `src/index.ts`                                                      | HTTP server, Socket.io, start-up, cleanup job                                                |
| `vitest.integration.config.ts`, `src/__integration__/*`             | Integration test harness and tests                                                           |
| Deleted: `src/auth/authController.ts`, `src/auth/authMiddleware.ts` |                                                                                              |

---

### Task 1: Prisma models and migration

**Files:**

- Modify: `prisma/schema.prisma` (append)
- Create: `prisma/migrations/<timestamp>_accounts_and_sessions/migration.sql` (generated)

- [ ] **Step 1: Append the models to `prisma/schema.prisma`**

```prisma
// People who sign in. The ID is an integer because live meeting state identifies members by
// number (Member.id, voterId, moverId).
model User {
  id        Int       @id @default(autoincrement())
  email     String    @unique // lowercased
  name      String? // null until set after the first sign-in
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  sessions  Session[]
}

// A signed-in device. Only the SHA-256 hash of the session token is stored.
model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  client     String // "web" or "mobile"
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())
  expiresAt  DateTime

  @@index([userId])
}

// An emailed 6-digit code. Only its SHA-256 hash is stored.
model SignInCode {
  id         String    @id @default(uuid())
  email      String
  codeHash   String
  expiresAt  DateTime
  attempts   Int       @default(0)
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([email, createdAt])
}
```

- [ ] **Step 2: Generate the migration against the throwaway database**

`DIRECT_URL` must be set explicitly: `prisma.config.ts` loads `.env`, which would otherwise supply the developer database.

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate dev --name accounts_and_sessions
```

Expected: `Applying migration ..._accounts_and_sessions` and a new folder under `prisma/migrations/`. The SQL creates `"User"`, `"Session"` and `"SignInCode"` (quoted, distinct from the legacy lowercase `users` table).

- [ ] **Step 3: Regenerate the client and type-check**

Run: `npm run db:generate && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(auth): add users, sessions and sign-in codes to the schema"
```

---

### Task 2: Tokens and hashing

**Files:**

- Create: `src/auth/tokens.ts`
- Test: `src/__tests__/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { hashSecret, newSessionToken, newSignInCode } from '../auth/tokens.js';

describe('tokens', () => {
  it('makes long, unique session tokens', () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(a).not.toBe(b);
  });

  it('makes 6-digit sign-in codes, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(newSignInCode()).toMatch(/^\d{6}$/);
  });

  it('hashes with SHA-256 so only hashes are stored', () => {
    expect(hashSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/__tests__/tokens.test.ts`
Expected: FAIL, cannot find module `../auth/tokens.js`.

- [ ] **Step 3: Implement `src/auth/tokens.ts`**

```ts
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/__tests__/tokens.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/tokens.ts src/__tests__/tokens.test.ts
git commit -m "feat(auth): add session token and sign-in code helpers"
```

---

### Task 3: Split the app from the server, and add the integration harness

**Files:**

- Create: `src/app.ts`, `vitest.integration.config.ts`, `src/__integration__/globalSetup.ts`, `src/__integration__/setup.ts`, `src/__integration__/db.ts`, `src/__integration__/health.test.ts`
- Modify: `src/index.ts`, `package.json`, `../.github/workflows/ci.yml`

- [ ] **Step 1: Add supertest**

Run: `npm install -D supertest @types/supertest -w backend-node` (from the repo root).
Expected: added to `backend-node/package.json` devDependencies.

- [ ] **Step 2: Create `src/app.ts`**

Move into it everything in `src/index.ts` from `const app = express();` through the static file catch-all (`app.get('/{*splat}', ...)`), with these exceptions, which stay in `index.ts`:

- `const httpServer = createServer(app);`
- the `io` construction and `setIoInstance(io)`.

Export what `index.ts` needs:

```ts
export const app = express();
// ... (moved code, unchanged, including helmet, logging, CORS, body parsers, routers,
// the JSON 404, the error handler and the static frontend)

/** Origins allowed to make cross-origin requests (Socket.io uses the same list) */
export { allowedOrigins };
```

`app.ts` must not import `dotenv`: tests set the environment themselves. Its imports are the moved ones (`express`, `helmet`, `cors`, `path`, `url`, `cookie-parser`, the routers, `logger`/`httpLogger`, `errorHandler`, `getStorage` for the health route).

- [ ] **Step 3: Reduce `src/index.ts` to the server**

```ts
import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { app, allowedOrigins } from './app.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { initializeStorage, getStorage, shutdownStorage } from './db/meetingStorage.js';
import { setIoInstance } from './socket/ioInstance.js';
import { connectPrisma, disconnectPrisma } from './db/prisma.js';
import { initializeStorage as initializeFileStorage } from './bylawyer/services/fileStorage.js';
import { logger } from './middleware/logger.js';

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
});
setIoInstance(io);

// start() and shutdown() unchanged from before the split
```

Keep the existing `start()`, `shutdown()` and the `process.on` lines exactly as they were.

- [ ] **Step 4: Check nothing changed for the running server**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: type-check clean; all unit tests pass (same count as before).

- [ ] **Step 5: Create `vitest.integration.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// Integration tests talk to a real Postgres named by INTEGRATION_DATABASE_URL (never
// DATABASE_URL, which points at a developer database). Run: npm run test:integration
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__integration__/**/*.test.ts'],
    globalSetup: ['src/__integration__/globalSetup.ts'],
    setupFiles: ['src/__integration__/setup.ts'],
    // One database: run test files one at a time
    fileParallelism: false,
  },
});
```

- [ ] **Step 6: Create `src/__integration__/globalSetup.ts`**

```ts
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
```

- [ ] **Step 7: Create `src/__integration__/setup.ts`**

```ts
// Runs in each test file before its imports: point the app at the integration database
process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.ENABLE_TEST_AUTH;
```

- [ ] **Step 8: Create `src/__integration__/db.ts`**

```ts
import { prisma } from '../db/prisma.js';

/** Empty the account tables between tests */
export async function resetAccounts(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Session", "SignInCode", "User" RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 9: Write the first integration test, `src/__integration__/health.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('app', () => {
  it('answers the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
```

- [ ] **Step 10: Add the script to `package.json`**

In `"scripts"`, after `"test:coverage"`:

```json
"test:integration": "vitest run --config vitest.integration.config.ts",
```

- [ ] **Step 11: Run it**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: migrations applied (or "No pending migrations"), 1 passed.

Run without the variable: `npm run test:integration`
Expected: fails with "Set INTEGRATION_DATABASE_URL ...".

- [ ] **Step 12: Run integration tests in CI**

In `.github/workflows/ci.yml`, add to the job's `env:` (next to `DATABASE_URL`):

```yaml
INTEGRATION_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/robbie
```

and a step after "Test backend-node":

```yaml
- name: Integration tests backend-node
  run: npm run test:integration -w backend-node
```

- [ ] **Step 13: Commit**

```bash
git add src/app.ts src/index.ts vitest.integration.config.ts src/__integration__ package.json ../package-lock.json ../.github/workflows/ci.yml
git commit -m "test: split the Express app from the server and add integration tests"
```

---

### Task 4: Email the sign-in code

**Files:**

- Modify: `src/auth/emailService.ts`
- Test: `src/__tests__/emailService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { captureEmailsForTests, sendSignInCode } from '../auth/emailService.js';

describe('sendSignInCode', () => {
  it('delivers to the test outbox when capturing', async () => {
    const outbox = captureEmailsForTests();
    await sendSignInCode('ann@example.org', '042137');
    expect(outbox).toEqual([{ to: 'ann@example.org', code: '042137' }]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/__tests__/emailService.test.ts`
Expected: FAIL, `captureEmailsForTests` is not exported.

- [ ] **Step 3: Change `src/auth/emailService.ts`**

1. Delete `lastGeneratedCode` and `getLastCode`.
2. Make the templates meeting-free: change `generateEmailHtml(code: string, meetingCode: string)` and `generateEmailText(code, meetingCode)` to take only `code`, and replace the sentence `Enter this code to join meeting ${meetingCode}:` (and the HTML version with `<strong>`) with `Enter this code to sign in to Robbie:`.
3. Replace `sendVerificationEmail` with:

```ts
// Tests: when set, codes are collected here instead of being sent
let testOutbox: Array<{ to: string; code: string }> | null = null;

/** Collect sign-in emails in memory instead of sending them (tests only) */
export function captureEmailsForTests(): Array<{ to: string; code: string }> {
  testOutbox = [];
  return testOutbox;
}

/**
 * Email a sign-in code. Without an email provider (development only; production requires
 * one), the code is logged at debug level, which production never logs.
 */
export async function sendSignInCode(email: string, code: string): Promise<void> {
  if (testOutbox) {
    testOutbox.push({ to: email, code });
    return;
  }

  if (emailProvider === 'development') {
    logger.debug({ to: email, code }, 'Sign-in code (no email provider configured)');
    return;
  }

  try {
    const messageId = await deliver({
      to: email,
      subject: 'Your Robbie sign-in code',
      text: generateEmailText(code),
      html: generateEmailHtml(code),
    });
    logger.info({ to: email, messageId }, 'Sign-in email sent');
  } catch (error) {
    logger.error({ err: error }, 'Failed to send sign-in email');
    throw new Error('Failed to send sign-in email', { cause: error });
  }
}
```

4. If `sendTestEmail` calls the templates, pass only the code.

- [ ] **Step 4: Run it to see it pass, and type-check**

Run: `npx vitest run src/__tests__/emailService.test.ts && npx tsc --noEmit -p .`
Expected: 1 passed. Type errors remain only in `src/auth/authController.ts` (it still imports the removed functions); Task 7 deletes that file.

- [ ] **Step 5: Commit**

```bash
git add src/auth/emailService.ts src/__tests__/emailService.test.ts
git commit -m "feat(auth): email sign-in codes for the whole app"
```

---

### Task 5: Session service

**Files:**

- Create: `src/auth/sessionService.ts`
- Test: `src/__integration__/sessionService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  SESSION_LIFETIME_MS,
  createSession,
  deleteExpiredSessionsAndCodes,
  deleteSession,
  deleteUserSessions,
  findSession,
} from '../auth/sessionService.js';
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
    });
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.tokenHash).not.toContain(token);
  });

  it('returns null for an unknown or expired token', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { token } = await createSession(userId, 'web', start);
    expect(await findSession('not-a-token')).toBeNull();
    expect(await findSession(token, new Date(start.getTime() + SESSION_LIFETIME_MS))).toBeNull();
  });

  it('extends a session that is used, at most once an hour', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { token, sessionId } = await createSession(userId, 'web', start);

    await findSession(token, new Date(start.getTime() + 30 * 60 * 1000));
    let stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.expiresAt.getTime()).toBe(start.getTime() + SESSION_LIFETIME_MS);

    const later = new Date(start.getTime() + 2 * HOUR);
    await findSession(token, later);
    stored = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(stored.expiresAt.getTime()).toBe(later.getTime() + SESSION_LIFETIME_MS);
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

  it('removes expired sessions and codes', async () => {
    const past = new Date(Date.now() - SESSION_LIFETIME_MS - HOUR);
    await createSession(userId, 'web', past);
    await prisma.signInCode.create({
      data: { email: 'ann@example.org', codeHash: 'x', expiresAt: past },
    });
    expect(await deleteExpiredSessionsAndCodes()).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: FAIL, cannot find module `../auth/sessionService.js`.

- [ ] **Step 3: Implement `src/auth/sessionService.ts`**

```ts
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

/** The session and user for a token, or null if unknown or expired. Use extends it. */
export async function findSession(
  token: string,
  now: Date = new Date(),
): Promise<ActiveSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= now) return null;

  if (now.getTime() - session.lastUsedAt.getTime() >= EXTEND_AFTER_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS) },
    });
  }

  const { id, email, name } = session.user;
  return { sessionId: session.id, user: { id, email, name } };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: 6 passed (health plus 5).

- [ ] **Step 5: Commit**

```bash
git add src/auth/sessionService.ts src/__integration__/sessionService.test.ts
git commit -m "feat(auth): add server-side sessions with sliding expiry"
```

---

### Task 6: Sign-in service

**Files:**

- Create: `src/auth/signInService.ts`
- Test: `src/__integration__/signInService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import {
  MAX_ATTEMPTS,
  MAX_CODES_PER_HOUR,
  SignInError,
  requestSignInCode,
  verifySignInCode,
} from '../auth/signInService.js';
import { resetAccounts } from './db.js';

let outbox: Array<{ to: string; code: string }>;
const lastCode = () => outbox[outbox.length - 1].code;
const wrong = (code: string) => (code === '000001' ? '000002' : '000001');

describe('signInService', () => {
  beforeEach(async () => {
    await resetAccounts();
    outbox = captureEmailsForTests();
  });
  afterEach(() => {
    delete process.env.ENABLE_TEST_AUTH;
  });

  it('emails a code that signs in a new user, without a name yet', async () => {
    await requestSignInCode('  Ann@Example.org ');
    expect(outbox[0].to).toBe('ann@example.org');
    const user = await verifySignInCode('ann@example.org', lastCode());
    expect(user).toMatchObject({ email: 'ann@example.org', name: null });
  });

  it('signs an existing user in to the same account', async () => {
    await requestSignInCode('ann@example.org');
    const first = await verifySignInCode('ann@example.org', lastCode());
    await requestSignInCode('ann@example.org');
    const second = await verifySignInCode('ann@example.org', lastCode());
    expect(second.id).toBe(first.id);
  });

  it('accepts a code once', async () => {
    await requestSignInCode('ann@example.org');
    const code = lastCode();
    await verifySignInCode('ann@example.org', code);
    await expect(verifySignInCode('ann@example.org', code)).rejects.toMatchObject({ status: 401 });
  });

  it('replaces an earlier code with a new one', async () => {
    await requestSignInCode('ann@example.org');
    const first = lastCode();
    await requestSignInCode('ann@example.org');
    await expect(verifySignInCode('ann@example.org', first)).rejects.toBeInstanceOf(SignInError);
    await expect(verifySignInCode('ann@example.org', lastCode())).resolves.toBeTruthy();
  });

  it('rejects an expired code', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    await requestSignInCode('ann@example.org', start);
    const later = new Date(start.getTime() + 16 * 60 * 1000);
    await expect(verifySignInCode('ann@example.org', lastCode(), later)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('gives up on a code after too many wrong guesses', async () => {
    await requestSignInCode('ann@example.org');
    const code = lastCode();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await expect(verifySignInCode('ann@example.org', wrong(code))).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(verifySignInCode('ann@example.org', wrong(code))).rejects.toMatchObject({
      status: 429,
    });
    // Even the right code no longer works
    await expect(verifySignInCode('ann@example.org', code)).rejects.toMatchObject({ status: 401 });
  });

  it('limits how many codes an email can request in an hour', async () => {
    for (let i = 0; i < MAX_CODES_PER_HOUR; i++) await requestSignInCode('ann@example.org');
    await expect(requestSignInCode('ann@example.org')).rejects.toMatchObject({ status: 429 });
  });

  it('rejects a malformed email or code', async () => {
    await expect(requestSignInCode('not-an-email')).rejects.toMatchObject({ status: 400 });
    await expect(verifySignInCode('ann@example.org', '12ab56')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('accepts the test code only when test sign-in is enabled', async () => {
    await expect(verifySignInCode('bo@example.org', '000000')).rejects.toBeInstanceOf(SignInError);
    process.env.ENABLE_TEST_AUTH = 'true';
    await expect(verifySignInCode('bo@example.org', '000000')).resolves.toMatchObject({
      email: 'bo@example.org',
    });
  });

  it('stores codes only as hashes', async () => {
    await requestSignInCode('ann@example.org');
    const stored = await prisma.signInCode.findFirstOrThrow();
    expect(stored.codeHash).not.toBe(lastCode());
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: FAIL, cannot find module `../auth/signInService.js`.

- [ ] **Step 3: Implement `src/auth/signInService.ts`**

```ts
import { prisma } from '../db/prisma.js';
import { sendSignInCode } from './emailService.js';
import { hashSecret, newSignInCode } from './tokens.js';
import type { SessionUser } from './sessionService.js';

export const CODE_LIFETIME_MS = 15 * 60 * 1000;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const WRONG_CODE = 'That code is wrong or has expired';

/** A sign-in failure with the HTTP status to answer with */
export class SignInError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Test sign-in: outside production, ENABLE_TEST_AUTH=true makes a fixed code sign in any email
function isTestCode(code: string): boolean {
  return (
    process.env.ENABLE_TEST_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production' &&
    code === (process.env.TEST_VERIFICATION_CODE || '000000')
  );
}

/** Email a new sign-in code. The answer is the same whether or not the email has an account. */
export async function requestSignInCode(rawEmail: string, now: Date = new Date()): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SignInError(400, 'Enter a valid email address');
  }

  const recent = await prisma.signInCode.count({
    where: { email, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
  });
  if (recent >= MAX_CODES_PER_HOUR) {
    throw new SignInError(429, 'Too many codes requested. Try again in an hour.');
  }

  // A new code replaces any earlier one
  await prisma.signInCode.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = newSignInCode();
  const record = await prisma.signInCode.create({
    data: {
      email,
      codeHash: hashSecret(code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
    },
  });

  try {
    await sendSignInCode(email, code);
  } catch {
    await prisma.signInCode.delete({ where: { id: record.id } });
    throw new SignInError(502, "We couldn't send the email. Try again.");
  }
}

/** Check a code and return the user, created on first sign-in */
export async function verifySignInCode(
  rawEmail: string,
  rawCode: string,
  now: Date = new Date(),
): Promise<SessionUser> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.trim();
  if (!CODE_PATTERN.test(code)) throw new SignInError(400, 'The code is 6 digits');

  if (!isTestCode(code)) {
    const record = await prisma.signInCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new SignInError(401, WRONG_CODE);

    if (record.codeHash !== hashSecret(code)) {
      // Increment in the database so concurrent guesses all count
      const updated = await prisma.signInCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= MAX_ATTEMPTS) {
        await prisma.signInCode.update({ where: { id: record.id }, data: { consumedAt: now } });
        throw new SignInError(429, 'Too many attempts. Request a new code.');
      }
      throw new SignInError(401, WRONG_CODE);
    }

    // Consume only if still unconsumed, so two simultaneous uses can't both succeed
    const consumed = await prisma.signInCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) throw new SignInError(401, WRONG_CODE);
  }

  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
    select: { id: true, email: true, name: true },
  });
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth/signInService.ts src/__integration__/signInService.test.ts
git commit -m "feat(auth): sign in with an emailed code"
```

---

### Task 7: Authentication middleware and auth routes

**Files:**

- Create: `src/auth/authenticate.ts`, `src/auth/authRoutes.ts`, `src/socket/sessionSockets.ts`
- Delete: `src/auth/authController.ts`, `src/auth/authMiddleware.ts`
- Modify: `src/app.ts` (auth router import), `src/socket/joinHandler.ts` (temporary: see Step 6)
- Test: `src/__integration__/authRoutes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import { resetAccounts } from './db.js';

let outbox: Array<{ to: string; code: string }>;

async function signIn(email: string, client?: 'web' | 'mobile') {
  await request(app).post('/api/auth/request-code').send({ email }).expect(200);
  const code = outbox[outbox.length - 1].code;
  return request(app).post('/api/auth/verify').send({ email, code, client });
}

const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('session='));

describe('auth routes', () => {
  beforeEach(async () => {
    await resetAccounts();
    outbox = captureEmailsForTests();
  });

  it('signs a web client in with an httpOnly cookie, not a token in the body', async () => {
    const res = await signIn('ann@example.org');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ann@example.org', name: null });
    expect(res.body.token).toBeUndefined();
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('gives a mobile client its token in the body, and no cookie', async () => {
    const res = await signIn('ann@example.org', 'mobile');
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('knows who is signed in, by cookie or bearer token', async () => {
    const web = await signIn('ann@example.org');
    const me = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(web)!);
    expect(me.body.user.email).toBe('ann@example.org');

    const mobile = await signIn('bo@example.org', 'mobile');
    const meToo = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${mobile.body.token}`);
    expect(meToo.body.user.email).toBe('bo@example.org');

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('sets the display name', async () => {
    const cookie = sessionCookie(await signIn('ann@example.org'))!;
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ name: '  Ann Chair ' });
    expect(res.body.user.name).toBe('Ann Chair');
    expect(
      (await request(app).patch('/api/auth/me').set('Cookie', cookie).send({ name: 'A' })).status,
    ).toBe(400);
  });

  it('ends the session on sign-out', async () => {
    const cookie = sessionCookie(await signIn('ann@example.org'))!;
    await request(app).post('/api/auth/sign-out').set('Cookie', cookie).expect(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('ends every session on sign-out everywhere', async () => {
    const web = sessionCookie(await signIn('ann@example.org'))!;
    const phone = (await signIn('ann@example.org', 'mobile')).body.token;
    await request(app).post('/api/auth/sign-out-everywhere').set('Cookie', web).expect(200);
    expect(
      (await request(app).get('/api/auth/me').set('Authorization', `Bearer ${phone}`)).status,
    ).toBe(401);
  });

  it('answers a wrong code with 401 and the message', async () => {
    await request(app).post('/api/auth/request-code').send({ email: 'ann@example.org' });
    const code = outbox[0].code === '000001' ? '000002' : '000001';
    const res = await request(app)
      .post('/api/auth/verify')
      .send({ email: 'ann@example.org', code });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('That code is wrong or has expired');
  });

  it('removes the old per-meeting endpoints', async () => {
    expect((await request(app).post('/api/auth/request-verification').send({})).status).toBe(404);
    expect((await request(app).get('/api/auth/dev-code')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: FAIL (the old router answers `/request-code` with 404).

- [ ] **Step 3: Create `src/auth/authenticate.ts`**

```ts
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { findSession, type SessionUser } from './sessionService.js';
import { logger } from '../middleware/logger.js';

export const SESSION_COOKIE = 'session';

declare module 'express-serve-static-core' {
  interface Request {
    /** The signed-in user, set by authenticate */
    user?: SessionUser;
    /** The session in use, set by authenticate */
    sessionId?: string;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

/** The session token a request carries: a bearer token (mobile), else the cookie (web) */
export function sessionTokenFrom(
  cookie: string | undefined,
  authorization: string | undefined,
): string | null {
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim() || null;
  return cookie || null;
}

/** Require a signed-in user: 401 without a valid session, 503 if it can't be checked */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = sessionTokenFrom(req.cookies?.[SESSION_COOKIE], req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const session = await findSession(token);
    if (!session) return res.status(401).json({ error: 'Not signed in' });
    req.user = session.user;
    req.sessionId = session.sessionId;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Failed to check the session');
    res.status(503).json({ error: 'Sign-in is unavailable. Try again.' });
  }
}
```

- [ ] **Step 4: Create `src/socket/sessionSockets.ts`**

```ts
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { getIoInstance } from './ioInstance.js';

async function disconnectWhere(match: (data: SocketData) => boolean): Promise<void> {
  const io = getIoInstance();
  if (!io) return;
  for (const socket of await io.fetchSockets()) {
    if (match(socket.data)) socket.disconnect(true);
  }
}

/** Close the sockets of a session that has just been signed out */
export function disconnectSessionSockets(sessionId: string): Promise<void> {
  return disconnectWhere((data) => data.sessionId === sessionId);
}

/** Close every socket of a user (sign out everywhere) */
export function disconnectUserSockets(userId: number): Promise<void> {
  return disconnectWhere((data) => data.userId === userId);
}
```

Add `sessionId` to `SocketData` in `../shared/types/socket.ts`:

```ts
export interface SocketData {
  userId: number;
  email: string;
  name: string;
  /** The session this socket signed in with */
  sessionId: string;
  meetingCode: string | null;
  role: 'member' | 'chair' | 'admin';
}
```

Then rebuild shared: `npm run build:shared` (from the repo root).

- [ ] **Step 5: Create `src/auth/authRoutes.ts`**

```ts
import { Router, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../middleware/logger.js';
import { SignInError, requestSignInCode, verifySignInCode } from './signInService.js';
import {
  SESSION_LIFETIME_MS,
  createSession,
  deleteSession,
  deleteUserSessions,
} from './sessionService.js';
import { SESSION_COOKIE, authenticate, sessionCookieOptions } from './authenticate.js';
import { disconnectSessionSockets, disconnectUserSockets } from '../socket/sessionSockets.js';

export const authRouter = Router();

// Per-IP limits on top of the per-email limits in signInService. Tests sign in many times from
// one address, so the per-IP limits are off under test.
const skipInTests = () => process.env.NODE_ENV === 'test';

const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipInTests,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: skipInTests,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

const requestCodeBody = z.object({ email: z.string().max(254) });
const verifyBody = z.object({
  email: z.string().max(254),
  code: z.string().max(10),
  client: z.enum(['web', 'mobile']).default('web'),
});
const updateMeBody = z.object({ name: z.string().trim().min(2).max(100) });

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof SignInError) {
    return res.status(error.status).json({ error: error.message });
  }
  logger.error({ err: error }, fallback);
  res.status(500).json({ error: fallback });
}

authRouter.post(
  '/request-code',
  requestCodeLimiter,
  validate({ body: requestCodeBody }),
  async (req, res) => {
    try {
      await requestSignInCode(req.body.email);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, 'Failed to send a sign-in code');
    }
  },
);

authRouter.post('/verify', verifyLimiter, validate({ body: verifyBody }), async (req, res) => {
  try {
    const user = await verifySignInCode(req.body.email, req.body.code);
    const session = await createSession(user.id, req.body.client);
    // Mobile keeps the token in its secure store; web gets it only as an httpOnly cookie
    if (req.body.client === 'mobile') {
      return res.json({ user, token: session.token });
    }
    res.cookie(SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_LIFETIME_MS,
    });
    res.json({ user });
  } catch (error) {
    sendError(res, error, 'Failed to sign in');
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

authRouter.patch('/me', authenticate, validate({ body: updateMeBody }), async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name: req.body.name },
      select: { id: true, email: true, name: true },
    });
    res.json({ user });
  } catch (error) {
    sendError(res, error, 'Failed to update your name');
  }
});

authRouter.post('/sign-out', authenticate, async (req, res) => {
  try {
    await deleteSession(req.sessionId!);
    await disconnectSessionSockets(req.sessionId!);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Failed to sign out');
  }
});

authRouter.post('/sign-out-everywhere', authenticate, async (req, res) => {
  try {
    await deleteUserSessions(req.user!.id);
    await disconnectUserSockets(req.user!.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'Failed to sign out');
  }
});
```

- [ ] **Step 6: Swap the router and delete the old auth files**

In `src/app.ts`, replace `import { authRouter } from './auth/authController.js';` with `import { authRouter } from './auth/authRoutes.js';`.

Delete the old files: `git rm src/auth/authController.ts src/auth/authMiddleware.ts`.

`src/socket/joinHandler.ts` imports `verifyToken` from the deleted file; Task 9 replaces that code. So the build stays green in between, make this temporary change now: delete the `verifyToken` import, and replace the token-reading block (from `// Try provided token first` through the `if (!decoded) { ... }` block, and the `getTokenFromCookie` function) with:

```ts
// Replaced in Task 9 by connection-level authentication
const decoded = socket.data.userId
  ? {
      userId: socket.data.userId,
      email: socket.data.email,
      name: socket.data.name,
      meetingCode: data.meetingCode,
    }
  : null;
if (!decoded) {
  callback({ success: false, error: 'Not signed in' });
  return;
}
```

In `src/__tests__/joinHandler.test.ts`, delete the `vi.mock('../auth/authController.js', ...)` block. Its fake socket already carries `userId: 7`, `email` and `name` in `data`, which the temporary block reads.

- [ ] **Step 7: Run the tests**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration && npx vitest run`
Expected: type-check clean; integration 24 passed; all unit tests pass.

- [ ] **Step 8: Remove the JWT dependency**

Run (from the repo root): `npm uninstall jsonwebtoken @types/jsonwebtoken -w backend-node`
Then: `grep -rn "jsonwebtoken\|JWT_SECRET" backend-node/src` should print nothing.

- [ ] **Step 9: Commit**

```bash
git add -A src/auth src/socket/sessionSockets.ts src/socket/joinHandler.ts src/app.ts src/__integration__/authRoutes.test.ts src/__tests__/joinHandler.test.ts ../shared/types/socket.ts package.json ../package-lock.json
git commit -m "feat(auth): sessions for the whole app replace per-meeting tokens

Sign in once with an emailed code; the web gets an httpOnly session
cookie and mobile a bearer token. Adds me, rename, sign-out and sign-out
everywhere. Removes the per-meeting verification endpoints, the code-
revealing dev endpoint, the test-role endpoint and the JWT."
```

---

### Task 8: Require a session on every API route

**Files:**

- Modify: `src/app.ts`
- Test: `src/__integration__/routeProtection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { captureEmailsForTests } from '../auth/emailService.js';
import { resetAccounts } from './db.js';

const ID = '00000000-0000-4000-8000-000000000000';

// One route from every router behind authentication
const protectedRoutes: Array<[string, string]> = [
  ['get', '/api/organizations'],
  ['post', '/api/organizations'],
  ['get', `/api/organizations/${ID}/documents`],
  ['get', `/api/documents/${ID}`],
  ['get', `/api/versions/${ID}/tree`],
  ['get', `/api/sections/${ID}`],
  ['get', `/api/amendments/${ID}`],
  ['get', `/api/organizations/${ID}/meetings`],
  ['get', '/api/packets/ABC123'],
  ['get', `/api/agenda-items/${ID}`],
  ['get', `/api/attachments/${ID}`],
  ['get', '/api/robbie/sync-status/ABC123/1'],
  ['get', `/api/bylawyer/organizations`],
  ['get', '/api/no-such-route'],
];

describe('route protection', () => {
  let cookie: string;
  beforeAll(async () => {
    await resetAccounts();
    const outbox = captureEmailsForTests();
    await request(app).post('/api/auth/request-code').send({ email: 'ann@example.org' });
    const res = await request(app)
      .post('/api/auth/verify')
      .send({ email: 'ann@example.org', code: outbox[0].code });
    cookie = ([] as string[])
      .concat(res.headers['set-cookie'])
      .find((c) => c.startsWith('session='))!;
  });

  it.each(protectedRoutes)('%s %s needs a session', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[
      method
    ](path);
    expect(res.status).toBe(401);
  });

  it.each(protectedRoutes)('%s %s is reached with a session', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)
      [method](path)
      .set('Cookie', cookie);
    expect(res.status).not.toBe(401);
  });

  it('keeps health and public share links open', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/share/not-a-real-token')).status).not.toBe(401);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: the "needs a session" cases FAIL (routes answer without a session).

- [ ] **Step 3: Mount `authenticate` in `src/app.ts`**

Reorder the route mounting so the public routes come first and everything after `authenticate` needs a session. The health route stays where it is (before this block). Replace the block from `// Routes - Robbie` through `app.use('/api', agendaItemsRouter);` with:

```ts
// Public: sign-in, and read-only share links
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);

// Everything else under /api needs a signed-in user
app.use('/api', authenticate);

app.use('/api/bylawyer', bylawyerRouter);
app.use('/api', organizationsRouter);
app.use('/api', documentsRouter);
app.use('/api', versionsRouter);
app.use('/api', sectionsRouter);
app.use('/api', amendmentsRouter);
app.use('/api', bylawyerMeetingsRouter);
app.use('/api/robbie', robbieRouter);
app.use('/api', packetsRouter);
app.use('/api', attachmentsRouter);
app.use('/api', agendaItemsRouter);
```

Add the import: `import { authenticate } from './auth/authenticate.js';`

- [ ] **Step 4: Run it to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: all pass (24 earlier plus 29).

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/__integration__/routeProtection.test.ts
git commit -m "feat(auth): require a session on every API route

Only sign-in, the health check and public share links stay open. Before,
every route was open to anyone, including deleting an organization."
```

---

### Task 9: Authenticate sockets at connection

**Files:**

- Create: `src/socket/socketAuth.ts`
- Modify: `src/socket/socketHandler.ts`, `src/socket/joinHandler.ts`, `src/socket/disconnectHandler.ts`, `../shared/types/socket.ts`
- Test: `src/__tests__/socketAuth.test.ts`, `src/__tests__/joinHandler.test.ts`, `src/__tests__/disconnectHandler.test.ts`

- [ ] **Step 1: Write the failing test `src/__tests__/socketAuth.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { socketAuth } from '../socket/socketAuth.js';

const session = {
  sessionId: 's-1',
  user: { id: 7, email: 'ann@example.org', name: 'Ann' },
};

function fakeSocket(handshake: { auth?: Record<string, unknown>; cookie?: string }) {
  return {
    handshake: { auth: handshake.auth ?? {}, headers: { cookie: handshake.cookie } },
    data: {} as Record<string, unknown>,
  };
}

async function run(
  socket: ReturnType<typeof fakeSocket>,
  find: Parameters<typeof socketAuth>[0] = vi.fn(async () => session),
) {
  const next = vi.fn();
  await socketAuth(find)(socket as never, next);
  return { next, find };
}

describe('socketAuth', () => {
  it('accepts the web session cookie', async () => {
    const socket = fakeSocket({ cookie: 'theme=dark; session=abc123' });
    const { next, find } = await run(socket);
    expect(find).toHaveBeenCalledWith('abc123');
    expect(next).toHaveBeenCalledWith();
    expect(socket.data).toMatchObject({
      userId: 7,
      email: 'ann@example.org',
      name: 'Ann',
      sessionId: 's-1',
      meetingCode: null,
    });
  });

  it('accepts a mobile token from the handshake', async () => {
    const { find, next } = await run(fakeSocket({ auth: { token: 'tok' } }));
    expect(find).toHaveBeenCalledWith('tok');
    expect(next).toHaveBeenCalledWith();
  });

  it('refuses a connection with no session or an unknown one', async () => {
    expect((await run(fakeSocket({}))).next).toHaveBeenCalledWith(expect.any(Error));
    const unknown = await run(
      fakeSocket({ cookie: 'session=zzz' }),
      vi.fn(async () => null),
    );
    expect(unknown.next).toHaveBeenCalledWith(expect.any(Error));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/__tests__/socketAuth.test.ts`
Expected: FAIL, cannot find module `../socket/socketAuth.js`.

- [ ] **Step 3: Implement `src/socket/socketAuth.ts`**

```ts
import type { Socket } from 'socket.io';
import { findSession } from '../auth/sessionService.js';
import { SESSION_COOKIE } from '../auth/authenticate.js';
import { logger } from '../middleware/logger.js';

/** One cookie's value from a Cookie header */
function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Socket.io middleware: accept a connection only with a valid session, from the web cookie or
 * a mobile token in the handshake, and record who it is on socket.data
 */
export function socketAuth(find: typeof findSession = findSession) {
  return async (socket: Socket, next: (error?: Error) => void) => {
    const fromHandshake = socket.handshake.auth?.token;
    const token =
      typeof fromHandshake === 'string' && fromHandshake
        ? fromHandshake
        : readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    if (!token) return next(new Error('Not signed in'));

    try {
      const session = await find(token);
      if (!session) return next(new Error('Not signed in'));
      socket.data.userId = session.user.id;
      socket.data.email = session.user.email;
      // Clients ask for a name after the first sign-in; until then show the email
      socket.data.name = session.user.name ?? session.user.email;
      socket.data.sessionId = session.sessionId;
      socket.data.meetingCode = null;
      next();
    } catch (error) {
      logger.error({ err: error }, 'Failed to check a socket session');
      next(new Error('Sign-in is unavailable'));
    }
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/__tests__/socketAuth.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Use it, and join with only a meeting code**

In `src/socket/socketHandler.ts`, at the top of `setupSocketHandlers` before `io.on('connection', ...)`:

```ts
// Every connection must be signed in (see socketAuth)
io.use(socketAuth());
```

and import it: `import { socketAuth } from './socketAuth.js';`

In `../shared/types/socket.ts`, the payload no longer carries a token:

```ts
export interface JoinMeetingPayload {
  meetingCode: string;
}
```

In `src/socket/joinHandler.ts`, replace the temporary block from Task 7 and the "Verify meeting code matches token" block with:

```ts
// The socket was authenticated at connection (socketAuth)
const decoded = {
  userId: socket.data.userId,
  email: socket.data.email,
  name: socket.data.name,
};

const meetingCode = data.meetingCode?.trim().toUpperCase() ?? '';
if (!/^[A-Z0-9]{4,8}$/.test(meetingCode)) {
  callback({ success: false, error: 'Meeting code must be 4-8 letters or digits' });
  return;
}
data = { ...data, meetingCode };
```

Keep the rest of the handler as is; it reads `decoded.userId`, `decoded.email`, `decoded.name` and `data.meetingCode`. Rebuild shared: `npm run build:shared` (from the repo root).

- [ ] **Step 6: Keep the signed-in identity when leaving a meeting**

In `src/socket/disconnectHandler.ts`, a socket now stays signed in after leaving a meeting (it can join another). Replace the final block:

```ts
// Clear all socket.data fields to prevent data leakage on socket reuse
socket.data.meetingCode = null;
socket.data.userId = null as unknown as number;
socket.data.email = null as unknown as string;
socket.data.name = null as unknown as string;
socket.data.role = null as unknown as 'member' | 'chair' | 'admin';
```

with:

```ts
// The socket leaves the meeting but stays signed in (its identity came from its session)
socket.data.meetingCode = null;
socket.data.role = null as unknown as 'member' | 'chair' | 'admin';
```

- [ ] **Step 7: Update the handler tests**

In `src/__tests__/joinHandler.test.ts`, add `sessionId: 's-1'` to the fake socket's `data`, and call `handleJoinMeeting` with `{ meetingCode: 'NEW1' }` (no token).

In `src/__tests__/disconnectHandler.test.ts`, add at the end of the existing test:

```ts
// Leaving a meeting doesn't sign the socket out
expect(socket.data.userId).toBe(1);
expect(socket.data.meetingCode).toBeNull();
```

- [ ] **Step 8: Run everything**

Run: `npx tsc --noEmit -p . && npx vitest run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/socket ../shared/types/socket.ts src/__tests__/socketAuth.test.ts src/__tests__/joinHandler.test.ts src/__tests__/disconnectHandler.test.ts
git commit -m "feat(auth): authenticate sockets at connection

A connection needs a session (the web cookie or a mobile token in the
handshake); JOIN_MEETING carries only the meeting code. Leaving a meeting
keeps the socket signed in, so it can join another."
```

---

### Task 10: Expire old sessions and codes, and tidy configuration

**Files:**

- Modify: `src/index.ts`, `.env.example`, `../CLAUDE.md`, `../spec.md`

- [ ] **Step 1: Run the cleanup hourly in `src/index.ts`**

In `start()`, after `setupSocketHandlers(io);`:

```ts
// Remove expired sessions and sign-in codes every hour
const cleanup = setInterval(
  () => {
    deleteExpiredSessionsAndCodes()
      .then((removed) => removed && logger.info({ removed }, 'Removed expired sessions'))
      .catch((err) => logger.error({ err }, 'Failed to remove expired sessions'));
  },
  60 * 60 * 1000,
);
cleanup.unref();
```

and import it: `import { deleteExpiredSessionsAndCodes } from './auth/sessionService.js';`

- [ ] **Step 2: Update `.env.example`**

Remove the `JWT_SECRET=...` line (sessions need no signing secret), and add after the database lines:

```
# Test sign-in (development only, refused in production): the code 000000 signs in any email
# ENABLE_TEST_AUTH=true
```

- [ ] **Step 3: Update docs**

In `../CLAUDE.md`, under "Environment Variables > Backend", remove `JWT_SECRET=dev-secret-change-in-prod`. Under "Robbie Features", replace "Email-based authentication with verification codes" with "Email-code sign-in for the whole app, with server-side sessions (`session` cookie for web, bearer token for mobile)".

In `../spec.md`, under M2, add as the first bullet:

```markdown
- **Done 2026-10-06 (server):** users, sessions and sign-in codes are in Postgres; sign-in is once for the whole app by emailed code; sessions are server-side (httpOnly cookie for web, bearer token for mobile) and last 30 days from last use; every API route and socket requires a session; the code-revealing dev endpoint, test-role endpoint and JWT are gone. The web and mobile sign-in screens follow.
```

- [ ] **Step 4: Full check**

Run (from the repo root): `npm run format:check && npm run lint && npx tsc --noEmit -p backend-node/tsconfig.json && npm run test:run -w backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -w backend-node`
Expected: all pass.

- [ ] **Step 5: Live check**

Start the server against the throwaway database with `ENABLE_TEST_AUTH=true`, then:

```bash
curl -s -c /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"email":"ann@example.org","code":"000000"}' localhost:3001/api/auth/verify
curl -s -b /tmp/robbie-cookies localhost:3001/api/auth/me
curl -s -o /dev/null -w '%{http_code}\n' localhost:3001/api/organizations
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/robbie-cookies localhost:3001/api/organizations
```

Expected: the user JSON twice, then `401`, then `200`. Restart the server and repeat the `me` call: still signed in.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts .env.example ../CLAUDE.md ../spec.md
git commit -m "chore(auth): expire old sessions hourly and document the new sign-in"
```

---

## Self-review notes

- **Spec coverage:**
  - data model: Task 1;
  - sign-in flow and limits: Tasks 4 and 6;
  - sessions and sliding expiry: Task 5;
  - routes and cookie/token split: Task 7;
  - route protection and public exceptions: Task 8;
  - sockets and sign-out disconnect: Tasks 7 and 9;
  - cleanup: Task 10;
  - test harness: Task 3;
  - test sign-in: Task 6;
  - codes logged at debug: Task 4;
  - removed endpoints and JWT: Task 7.
- **Clients** are the second plan (web sign-in page, session provider, route guard, meetings join by code; mobile secure store and sign-in screens).
