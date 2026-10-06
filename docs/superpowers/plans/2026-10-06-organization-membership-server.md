# Organization Membership (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give organizations members with roles, put a rule on every API route so a user reaches only their own organizations' data and only at their role, make a meeting packet the one record of which organization a live meeting belongs to, let admins add people by email, and record acceptance of the Terms of Service.

**Architecture:** Prisma gains `OrganizationMember`, `OrganizationInvite`, terms fields on `User`, `Amendment.createdById` and a required `MeetingPacket.organizationId`. In `src/orgs/`, `requireRole(min, resolve)` maps a request to an organization through a per-resource resolver, loads the user's membership, and answers 404 (no such resource, or not a member) or 403 (role too low), else sets `req.org`. Every route chain is `validate(...)`, then a rule, then the handler; an integration test walks Express's router and fails on any `/api` route without a rule. Handlers that take a second resource check it against `req.org`. A membership service adds people by email (pending until that email first signs in), and enforces the last-owner rule and the limits. `requireTerms` after `authenticate`, and a check in `socketAuth`, refuse users who haven't accepted the current `TERMS_VERSION`.

**Tech Stack:** Node 24, Express 5 (router 2.2), Socket.io 4, Prisma 7 (`@prisma/adapter-pg`), zod 4, Vitest 5, supertest.

---

**Design:** `docs/superpowers/specs/2026-10-06-organization-membership-design.md`. The web and mobile clients are a second plan. Until it lands, the web client on this branch can't use most of the API (it doesn't accept the terms yet, and expects packets to be created on first read), so the branch is not merged before both plans are done.

**Conventions:**

- Work in `backend-node/` unless a path says otherwise. Use `&&` between commands, never `;`.
- Never point anything at port 5432 (another project's database). Integration tests and migrations use a throwaway Postgres on port 55432. Start it once, if `docker ps --filter name=robbie-ci-pg` doesn't list it:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  ```

- Integration tests (as CI runs them, from `backend-node/`): `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`. To run one file, append `-- <path>`, for example `... npm run test:integration -- src/__integration__/terms.test.ts`. Unit tests: `npm run test:run` (or `npx vitest run <path>`).
- Every route chain is `validate(...)` (when the route has one), then the rule, then the handler. A malformed request gets 400 before any membership check; resolvers see validated input.
- Before/after snippets show the code as it is when the task starts. Adding a rule to a route written on one line makes prettier split the route head and indent its handler two more spaces; match a snippet by its text, and keep the indentation the file has.
- Before each commit, run `npx prettier --write` on the TypeScript, JSON and Markdown files you changed (from the repository root; Prettier has no parser for `.prisma` or `.env` files); CI checks formatting.
- Commit messages: no `Co-Authored-By` or other attribution lines.
- Task 1 writes a migration file. A project hook asks for confirmation on migration files; confirm with the owner.

---

## File structure

| File                                                             | Responsibility                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                           | `OrgRole`, `OrganizationMember`, `OrganizationInvite`; terms fields on `User`; `Amendment.createdById`; packet org |
| `prisma/migrations/<timestamp>_organization_membership/`         | Generated migration, plus a hand-added `DELETE FROM "MeetingPacket"`                                               |
| `../shared/constants/terms.ts`                                   | `TERMS_VERSION`                                                                                                    |
| `src/auth/terms.ts`                                              | `hasAcceptedTerms`, `requireTerms`, the terms error message and code                                               |
| `src/auth/sessionService.ts`, `authenticate.ts`, `authRoutes.ts` | Carry the user's accepted terms version; `me` reports `termsAccepted`; `POST /accept-terms`                        |
| `src/socket/socketAuth.ts`                                       | Refuse sockets of users who haven't accepted the terms                                                             |
| `src/orgs/roles.ts`                                              | Role order, `atLeast`, `roleBelow`, `roleNeeded`, `canEditAmendment`                                               |
| `src/orgs/resolvers.ts`                                          | One function per resource kind: the resource's organization id, or null                                            |
| `src/orgs/requireRole.ts`                                        | `requireRole`, `signedInOnly`, `fromParam`/`fromBody`/`fromQuery`, the rule marker, `req.org`                      |
| `src/orgs/orgError.ts`                                           | `OrgError`: a refusal with its HTTP status                                                                         |
| `src/orgs/organizationService.ts`                                | The user's organizations with roles; creating an organization as its owner (3-owned limit)                         |
| `src/orgs/membershipService.ts`                                  | Members and pending additions, add by email, change role, remove, leave, last owner, conversion at sign-in         |
| `src/orgs/memberRoutes.ts`                                       | `/organizations/:id/members` and `/organizations/:id/invites/:inviteId`                                            |
| `src/schemas/members.ts`, `src/schemas/bylawyer.ts`              | Request schemas for the member routes and the live-meeting link routes                                             |
| `src/bylawyer/routes/*.ts`, `src/bylawyer/bylawyerRouter.ts`     | A rule on every route; second-resource checks; packet creation under an organization; removed routes               |
| `src/bylawyer/bylawSyncService.ts`                               | Find the meeting's organization from its packet; skip a document from another organization                         |
| `src/db/meetingStorage.ts`                                       | Remove the legacy `bylawyer_org_id` link methods                                                                   |
| `src/auth/emailService.ts`                                       | `sendAddedToOrganization` and its test outbox                                                                      |
| `src/auth/signInService.ts`                                      | Turn pending additions into memberships when the user is found or created                                          |
| `src/scripts/addOrgMember.ts`                                    | `npm run org:add-member`                                                                                           |
| `src/__integration__/helpers.ts`, `fixtures.ts`, `rules.ts`      | Direct sign-in, request helper, the two-organization fixture, the rule matrix runner                               |
| `src/__integration__/routeCoverage.test.ts`                      | Fails on any `/api` route without a rule                                                                           |
| Deleted: `src/bylawyer/decisionDate.ts`, its test                | Only `POST /api/robbie/sync-motion` used it                                                                        |

---

### Task 1: Schema and migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_organization_membership/migration.sql` (generated, plus one hand-added statement)
- Modify: `src/bylawyer/routes/packets.ts` (packets can no longer be created without an organization)

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In `model Organization`, replace:

<!-- prettier-ignore -->
```prisma
  documents   Document[]
  meetings    Meeting[]
}
```

with:

<!-- prettier-ignore -->
```prisma
  documents   Document[]
  meetings    Meeting[]
  members     OrganizationMember[]
  invites     OrganizationInvite[]
  packets     MeetingPacket[]
}
```

In `model Amendment`, replace:

<!-- prettier-ignore -->
```prisma
  robbieVoteData     Json?

  document           Document          @relation(fields: [documentId], references: [id], onDelete: Cascade)
```

with:

<!-- prettier-ignore -->
```prisma
  robbieVoteData     Json?

  // Who created the draft, so members can edit their own drafts. Null for amendments synced
  // from a live meeting or created before this was recorded.
  createdById        Int?
  createdBy          User?             @relation(fields: [createdById], references: [id], onDelete: SetNull)

  document           Document          @relation(fields: [documentId], references: [id], onDelete: Cascade)
```

Replace the whole `model MeetingPacket` with:

```prisma
model MeetingPacket {
  id             String              @id @default(uuid())
  // The organization the meeting belongs to: the only record of which organization a live
  // meeting (robbieCode) belongs to
  organizationId String
  robbieCode     String              @unique // Links to Robbie meeting code
  title          String?
  description    String?
  scheduledFor   DateTime?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  organization   Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  attachments    Attachment[]
  agendaItems    MeetingAgendaItem[]

  @@index([organizationId])
}
```

In `model User`, replace:

<!-- prettier-ignore -->
```prisma
  updatedAt DateTime  @updatedAt
  sessions  Session[]
}
```

with:

<!-- prettier-ignore -->
```prisma
  updatedAt DateTime  @updatedAt
  sessions  Session[]

  // The TERMS_VERSION (shared/constants) the user last accepted, and when
  termsVersion    String?
  termsAcceptedAt DateTime?

  memberships     OrganizationMember[]
  invitesSent     OrganizationInvite[]
  amendments      Amendment[]
}
```

Append at the end of the file:

```prisma
// Roles in an organization, lowest first. Each role can do everything the roles before it can.
enum OrgRole {
  viewer
  member
  secretary
  admin
  owner
}

// A user's role in an organization
model OrganizationMember {
  organizationId String
  userId         Int
  role           OrgRole
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([organizationId, userId])
  @@index([userId])
}

// One row per add-by-email, kept after it is used, so the daily limit can count them
model OrganizationInvite {
  id             String       @id @default(uuid())
  organizationId String
  email          String // lowercased
  role           OrgRole
  invitedById    Int?
  createdAt      DateTime     @default(now())
  acceptedAt     DateTime? // set when it became a membership
  canceledAt     DateTime?
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invitedBy      User?        @relation(fields: [invitedById], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([email])
}
```

Then run `npx prisma format` and expect "Formatted prisma/schema.prisma".

- [ ] **Step 2: Generate the migration without applying it**

`DIRECT_URL` must be set explicitly: `prisma.config.ts` loads `.env`, which would otherwise supply the developer database.

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate dev --create-only --name organization_membership
```

Expected: a warning that adding the required column `organizationId` to `MeetingPacket` is not possible while the table has rows, then `Prisma Migrate created the following migration without applying it <timestamp>_organization_membership`. The timestamp is the current time, so it differs from any shown here.

- [ ] **Step 3: Delete existing packets before the column is added**

This step edits a generated migration file; the controller gets the user's approval first.

Existing packets have no organization and are development data. Their agenda items and attachment records go with them: `MeetingAgendaItem.packetId` and `Attachment.meetingPacketId` are `ON DELETE CASCADE`, and attachments on agenda items cascade through the item. In `prisma/migrations/<timestamp>_organization_membership/migration.sql`, insert the comment and `DELETE` directly above the `MeetingPacket` `ALTER TABLE`, keeping Prisma's `/* Warnings */` header. The start of the file then reads:

```sql
/*
  Warnings:

  - Added the required column `organizationId` to the `MeetingPacket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('viewer', 'member', 'secretary', 'admin', 'owner');

-- AlterTable
ALTER TABLE "Amendment" ADD COLUMN     "createdById" INTEGER;

-- Existing packets have no organization. They are development data: delete them, with their
-- agenda items and attachment records (both cascade), before adding the required column.
-- Their uploaded files stay in the uploads directory.
DELETE FROM "MeetingPacket";

-- AlterTable
ALTER TABLE "MeetingPacket" ADD COLUMN     "organizationId" TEXT NOT NULL;
```

The rest of the file is unchanged: the `User` columns, the two new tables, four indexes and six foreign keys (`MeetingPacket.organizationId` cascades, `Amendment.createdById` and `OrganizationInvite.invitedById` set null).

- [ ] **Step 4: Apply it to the throwaway database**

Run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate deploy
```

Expected: `Applying migration <timestamp>_organization_membership` and `All migrations have been successfully applied.`

- [ ] **Step 5: Regenerate the client and see what no longer compiles**

Run: `npm run db:generate && npx tsc --noEmit -p .`
Expected: two errors in `src/bylawyer/routes/packets.ts`, at the two `prisma.meetingPacket.create` calls: `organizationId` is missing.

- [ ] **Step 6: Stop creating packets without an organization**

`GET /api/packets/:robbieCode` no longer creates a packet, and `POST /api/packets` goes. Task 11 adds `POST /api/organizations/:orgId/packets`.

In `src/bylawyer/routes/packets.ts`:

1. Delete the line `import { Prisma } from '../../generated/prisma/client.js';`, and change `import { createPacketBody, robbieCodeParam, updatePacketBody } from '../../schemas/packets.js';` to `import { robbieCodeParam, updatePacketBody } from '../../schemas/packets.js';`.
2. Replace everything from the comment block `/**\n * GET /api/packets/:robbieCode\n * Get packet for a Robbie meeting (creates one if doesn't exist)\n */` through the end of the `POST /api/packets` route (the line `});` before the `PUT /api/packets/:id` comment) with:

```ts
// What a packet response includes
const packetInclude = {
  attachments: {
    orderBy: { position: 'asc' as const },
    include: { document: { select: { id: true, title: true, docType: true } } },
  },
  agendaItems: {
    orderBy: { position: 'asc' as const },
    include: {
      attachments: {
        orderBy: { position: 'asc' as const },
        include: { document: { select: { id: true, title: true, docType: true } } },
      },
    },
  },
};

/**
 * GET /api/packets/:robbieCode
 * Get the packet for a Robbie meeting. Packets are created in an organization
 * (POST /api/organizations/:orgId/packets) or by linking a live meeting
 * (POST /api/bylawyer/link-meeting), never by reading.
 */
packetsRouter.get(
  '/packets/:robbieCode',
  validate({ params: robbieCodeParam }),
  async (req, res) => {
    try {
      const packet = await prisma.meetingPacket.findUnique({
        where: { robbieCode: req.params.robbieCode },
        include: packetInclude,
      });

      if (!packet) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.json(packet);
    } catch (error) {
      logger.error({ err: error }, 'Error getting packet');
      res.status(500).json({ error: 'Failed to get meeting packet' });
    }
  },
);
```

- [ ] **Step 7: Type-check and run the suites**

Run: `npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all unit and integration tests pass (`routeProtection` still gets a non-401 answer from `GET /api/packets/ABC123`, now 404).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/bylawyer/routes/packets.ts
git commit -m "feat(orgs): add organization members, invites and terms acceptance to the schema

Meeting packets now belong to an organization; the migration deletes the
existing (development) packets first. Reading a packet by code no longer
creates one, and POST /api/packets is gone."
```

---

### Task 2: Terms of Service acceptance, and integration test helpers

Terms come first so every later test signs in through one helper that has accepted them.

**Files:**

- Create: `../shared/constants/terms.ts`, `src/auth/terms.ts`, `src/__integration__/helpers.ts`
- Modify: `../shared/constants/index.ts`, `src/auth/sessionService.ts`, `src/auth/authenticate.ts`, `src/auth/authRoutes.ts`, `src/app.ts`, `src/socket/socketAuth.ts`, `src/__integration__/db.ts`, `src/__integration__/setup.ts`
- Test: `src/__integration__/terms.test.ts` (new), `src/__tests__/socketAuth.test.ts`, `src/__integration__/sessionService.test.ts`, `src/__integration__/authRoutes.test.ts`, `src/__integration__/routeProtection.test.ts`

- [ ] **Step 1: Add `TERMS_VERSION` to shared**

Create `../shared/constants/terms.ts`:

```ts
/**
 * The current Terms of Service and Privacy Policy, named by date. Bump it whenever either
 * document changes: every user then accepts again on their next visit.
 */
export const TERMS_VERSION = '2026-10-06';
```

In `../shared/constants/index.ts`, add after the `logMessages` export:

```ts
export { TERMS_VERSION } from './terms.js';
```

Run (from the repository root): `npm run build:shared`
Expected: no errors; `shared/dist/constants/terms.js` exists.

- [ ] **Step 2: Add the test helpers**

Create `src/__integration__/helpers.ts`:

```ts
import request from 'supertest';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { app } from '../app.js';
import { prisma } from '../db/prisma.js';
import { createSession } from '../auth/sessionService.js';

export interface TestUser {
  id: number;
  email: string;
  /** A Cookie header value for the user's web session */
  cookie: string;
}

/**
 * A signed-in user with a web session, made directly rather than through emailed codes. The
 * user has accepted the current terms unless acceptTerms is false.
 */
export async function signIn(
  email: string,
  options: { name?: string; acceptTerms?: boolean } = {},
): Promise<TestUser> {
  const accepted = options.acceptTerms ?? true;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: options.name ?? null,
      termsVersion: accepted ? TERMS_VERSION : null,
      termsAcceptedAt: accepted ? new Date() : null,
    },
  });
  const { token } = await createSession(user.id, 'web');
  return { id: user.id, email, cookie: `session=${token}` };
}

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Send a request to the app, signed in when a cookie is given */
export function call(
  method: Method,
  path: string,
  options: { cookie?: string; body?: object | Buffer; headers?: Record<string, string> } = {},
): request.Test {
  const agent = request(app) as unknown as Record<Method, (path: string) => request.Test>;
  let test = agent[method](path);
  if (options.cookie) test = test.set('Cookie', options.cookie);
  for (const [name, value] of Object.entries(options.headers ?? {})) test = test.set(name, value);
  if (options.body !== undefined) test = test.send(options.body);
  return test;
}
```

In `src/__integration__/db.ts`, replace the file with:

```ts
import { prisma } from '../db/prisma.js';

/**
 * Empty the account tables between tests. TRUNCATE ... CASCADE follows every foreign key, so
 * this also empties memberships, invites and amendments (which record their creator).
 */
export async function resetAccounts(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Session", "SignInCode", "User" RESTART IDENTITY CASCADE',
  );
}

/**
 * Empty every Prisma table between tests: organizations (with, by cascade, their documents,
 * meetings, packets and members) and the account tables
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Organization", "Session", "SignInCode", "User" RESTART IDENTITY CASCADE',
  );
}
```

In `src/__integration__/setup.ts`, replace the file with:

```ts
import os from 'os';
import path from 'path';

// Runs in each test file before its imports: point the app at the integration database
process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
delete process.env.ENABLE_TEST_AUTH;
// Uploaded files go to a temporary directory, not the working copy
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'robbie-integration-uploads');
```

- [ ] **Step 3: Write the failing test**

Create `src/__integration__/terms.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { call, signIn } from './helpers.js';

describe('terms acceptance', () => {
  beforeEach(resetDatabase);

  it('reports whether the user has accepted the current terms', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const before = await call('get', '/api/auth/me', { cookie: ann.cookie });
    expect(before.body).toMatchObject({
      user: { email: 'ann@example.org' },
      termsAccepted: false,
    });
    expect(before.body.user.termsVersion).toBeUndefined();

    const bo = await signIn('bo@example.org');
    const me = await call('get', '/api/auth/me', { cookie: bo.cookie });
    expect(me.body.termsAccepted).toBe(true);
  });

  it('records acceptance of the current version', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const res = await call('post', '/api/auth/accept-terms', {
      cookie: ann.cookie,
      body: { version: TERMS_VERSION },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ termsAccepted: true });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: ann.id } });
    expect(stored.termsVersion).toBe(TERMS_VERSION);
    expect(stored.termsAcceptedAt).toBeInstanceOf(Date);
    const me = await call('get', '/api/auth/me', { cookie: ann.cookie });
    expect(me.body.termsAccepted).toBe(true);
  });

  it('refuses to accept a version other than the current one', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const res = await call('post', '/api/auth/accept-terms', {
      cookie: ann.cookie,
      body: { version: '2000-01-01' },
    });
    expect(res.status).toBe(409);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: ann.id } });
    expect(stored.termsVersion).toBeNull();
  });

  it('needs a session to accept', async () => {
    const res = await call('post', '/api/auth/accept-terms', { body: { version: TERMS_VERSION } });
    expect(res.status).toBe(401);
  });

  it('refuses the rest of the API until the terms are accepted', async () => {
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const refused = await call('get', '/api/organizations', { cookie: ann.cookie });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({
      error: 'Accept the terms to continue',
      code: 'TERMS_NOT_ACCEPTED',
    });

    // Uploads are refused before the body is read
    const upload = await call('post', '/api/attachments/upload', {
      cookie: ann.cookie,
      headers: { 'Content-Type': 'application/pdf' },
      body: Buffer.from('%PDF-1.4'),
    });
    expect(upload.status).toBe(403);

    await call('post', '/api/auth/accept-terms', {
      cookie: ann.cookie,
      body: { version: TERMS_VERSION },
    }).expect(200);
    expect((await call('get', '/api/organizations', { cookie: ann.cookie })).status).toBe(200);
  });

  it('asks again when the terms change', async () => {
    const ann = await signIn('ann@example.org');
    await prisma.user.update({ where: { id: ann.id }, data: { termsVersion: '2000-01-01' } });
    const me = await call('get', '/api/auth/me', { cookie: ann.cookie });
    expect(me.body.termsAccepted).toBe(false);
    expect((await call('get', '/api/organizations', { cookie: ann.cookie })).status).toBe(403);
  });

  it('keeps sign-in routes and the health check open without acceptance', async () => {
    expect((await call('get', '/api/health')).status).toBe(200);
    const ann = await signIn('ann@example.org', { acceptTerms: false });
    const named = await call('patch', '/api/auth/me', {
      cookie: ann.cookie,
      body: { name: 'Ann' },
    });
    expect(named.status).toBe(200);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/terms.test.ts`
Expected: FAIL. `termsAccepted` is undefined, `/api/auth/accept-terms` answers 404 (falls through to the JSON 404), and `/api/organizations` answers 200 for a user who hasn't accepted.

- [ ] **Step 5: Carry the accepted version with the session**

In `src/auth/sessionService.ts`, replace the `ActiveSession` interface with:

```ts
export interface ActiveSession {
  sessionId: string;
  user: SessionUser;
  /** The terms version the user last accepted (see TERMS_VERSION in shared), or null */
  termsVersion: string | null;
  /** True when this use pushed expiresAt out, so a web cookie should be re-sent to match */
  extended: boolean;
}
```

and at the end of `findSession`, replace:

<!-- prettier-ignore -->
```ts
  const { id, email, name } = session.user;
  return { sessionId: session.id, user: { id, email, name }, extended };
```

with:

<!-- prettier-ignore -->
```ts
  const { id, email, name, termsVersion } = session.user;
  return { sessionId: session.id, user: { id, email, name }, termsVersion, extended };
```

In `src/auth/authenticate.ts`, add to the `Request` interface in the `declare module` block:

<!-- prettier-ignore -->
```ts
    /** The terms version the signed-in user last accepted, set by authenticate */
    termsVersion?: string | null;
```

and in `authenticate`, after `req.sessionId = session.sessionId;`:

<!-- prettier-ignore -->
```ts
    req.termsVersion = session.termsVersion;
```

- [ ] **Step 6: Create `src/auth/terms.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';

/** The code clients look for to show the terms step */
export const TERMS_NOT_ACCEPTED = 'TERMS_NOT_ACCEPTED';
export const ACCEPT_THE_TERMS = 'Accept the terms to continue';

/** Whether a user who last accepted `version` has accepted the current terms */
export function hasAcceptedTerms(version: string | null | undefined): boolean {
  return version === TERMS_VERSION;
}

/** After authenticate: refuse a user who hasn't accepted the current terms */
export function requireTerms(req: Request, res: Response, next: NextFunction) {
  if (hasAcceptedTerms(req.termsVersion)) return next();
  res.status(403).json({ error: ACCEPT_THE_TERMS, code: TERMS_NOT_ACCEPTED });
}
```

- [ ] **Step 7: Report and record acceptance in `src/auth/authRoutes.ts`**

Add the imports:

```ts
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { hasAcceptedTerms } from './terms.js';
```

After `const updateMeBody = ...`, add:

```ts
const acceptTermsBody = z.object({ version: z.string().max(40) });
```

Replace the `GET /me` route with:

```ts
authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user, termsAccepted: hasAcceptedTerms(req.termsVersion) });
});

// Accept the current Terms of Service and Privacy Policy. The client sends the version it
// showed, so a stale page can't accept terms the user never saw.
authRouter.post(
  '/accept-terms',
  authenticate,
  validate({ body: acceptTermsBody }),
  async (req, res) => {
    if (req.body.version !== TERMS_VERSION) {
      return res
        .status(409)
        .json({ error: 'The terms have changed. Reload to see the current terms.' });
    }
    try {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
      });
      res.json({ termsAccepted: true });
    } catch (error) {
      sendError(res, error, 'Failed to record your acceptance');
    }
  },
);
```

- [ ] **Step 8: Require acceptance on the API in `src/app.ts`**

Add the import `import { requireTerms } from './auth/terms.js';`.

In the upload parser, replace:

```ts
app.use(
  '/api/attachments/upload',
  authenticate,
  express.raw({
```

with:

```ts
app.use(
  '/api/attachments/upload',
  authenticate,
  requireTerms,
  express.raw({
```

and update the comment above it to read:

```ts
// Raw body parser for file uploads (before JSON parser). Check the session and the terms
// first, so nobody can make the server read 10 MB without signing in.
```

Replace:

```ts
// Everything else under /api needs a signed-in user
app.use('/api', authenticate);
```

with:

```ts
// Everything else under /api needs a signed-in user who has accepted the current terms
app.use('/api', authenticate, requireTerms);
```

- [ ] **Step 9: Run the terms test to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/terms.test.ts`
Expected: 7 passed.

- [ ] **Step 10: Refuse sockets without acceptance**

In `src/__tests__/socketAuth.test.ts`, add the import `import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';`, change the `session` fixture to:

```ts
const session = {
  sessionId: 's-1',
  user: { id: 7, email: 'ann@example.org', name: 'Ann' },
  termsVersion: TERMS_VERSION,
  extended: false,
};
```

and add this test at the end of the `describe('socketAuth', ...)` block:

<!-- prettier-ignore -->
```ts
  it('refuses a user who has not accepted the current terms', async () => {
    const { next } = await run(
      fakeSocket({ cookie: 'session=abc123' }),
      vi.fn(async () => ({ ...session, termsVersion: null })),
    );
    const error = next.mock.calls[0][0];
    expect(error.message).toBe('Accept the terms to continue');
    expect(error.data).toEqual({ code: 'TERMS_NOT_ACCEPTED' });
  });
```

Run: `npx vitest run src/__tests__/socketAuth.test.ts`
Expected: the new test FAILS (`next` is called with no error).

In `src/socket/socketAuth.ts`, add the import:

```ts
import { ACCEPT_THE_TERMS, TERMS_NOT_ACCEPTED, hasAcceptedTerms } from '../auth/terms.js';
```

and replace:

<!-- prettier-ignore -->
```ts
      if (!session) return next(new Error('Not signed in'));
```

with:

<!-- prettier-ignore -->
```ts
      if (!session) return next(new Error('Not signed in'));
      if (!hasAcceptedTerms(session.termsVersion)) {
        // Clients read data.code to send the user to the terms step
        return next(
          Object.assign(new Error(ACCEPT_THE_TERMS), { data: { code: TERMS_NOT_ACCEPTED } }),
        );
      }
```

Run: `npx vitest run src/__tests__/socketAuth.test.ts`
Expected: all pass.

- [ ] **Step 11: Update the existing tests for the new session shape and the terms gate**

In `src/__integration__/sessionService.test.ts`, in "finds the user for a token, and stores only its hash", change the expectation to:

<!-- prettier-ignore -->
```ts
    expect(found).toEqual({
      sessionId,
      user: { id: userId, email: 'ann@example.org', name: 'Ann' },
      termsVersion: null,
      extended: false,
    });
```

In `src/__integration__/authRoutes.test.ts`, the old endpoints now sit behind the terms check, so the user accepts first. Add the import `import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';` and in "removes the old per-meeting endpoints", after `const cookie = sessionCookie(await signIn('ann@example.org'))!;` add:

<!-- prettier-ignore -->
```ts
    await request(app)
      .post('/api/auth/accept-terms')
      .set('Cookie', cookie)
      .send({ version: TERMS_VERSION })
      .expect(200);
```

In `src/__integration__/routeProtection.test.ts`, sign in through the helper so requests get past the terms check. Replace the imports of `captureEmailsForTests` and `resetAccounts` with:

```ts
import { resetDatabase } from './db.js';
import { signIn } from './helpers.js';
```

and the `beforeAll` with:

<!-- prettier-ignore -->
```ts
  beforeAll(async () => {
    await resetDatabase();
    cookie = (await signIn('ann@example.org')).cookie;
  });
```

- [ ] **Step 12: Run everything**

Run: `npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass.

- [ ] **Step 13: Commit**

```bash
git add ../shared/constants src/auth src/app.ts src/socket/socketAuth.ts src/__tests__/socketAuth.test.ts src/__integration__
git commit -m "feat(auth): require acceptance of the current terms

TERMS_VERSION in shared names the current Terms of Service and Privacy
Policy. /api/auth/me reports termsAccepted, POST /api/auth/accept-terms
records it (409 for a stale version), and every other API route and the
socket refuse a user who hasn't accepted, with code TERMS_NOT_ACCEPTED."
```

---

### Task 3: Roles, resolvers and the test fixture

**Files:**

- Create: `src/orgs/roles.ts`, `src/orgs/resolvers.ts`, `src/__integration__/fixtures.ts`
- Test: `src/__tests__/roles.test.ts`, `src/__integration__/resolvers.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `src/__tests__/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ROLES,
  atLeast,
  canEditAmendment,
  isOrgRole,
  roleBelow,
  roleNeeded,
} from '../orgs/roles.js';

describe('roles', () => {
  it('ranks roles from viewer to owner', () => {
    expect(ROLES).toEqual(['viewer', 'member', 'secretary', 'admin', 'owner']);
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('secretary', 'secretary')).toBe(true);
    expect(atLeast('member', 'secretary')).toBe(false);
    expect(atLeast('viewer', 'member')).toBe(false);
  });

  it('names the role just below', () => {
    expect(roleBelow('member')).toBe('viewer');
    expect(roleBelow('owner')).toBe('admin');
    expect(roleBelow('viewer')).toBeNull();
  });

  it('recognizes role names', () => {
    expect(isOrgRole('admin')).toBe(true);
    expect(isOrgRole('chair')).toBe(false);
    expect(isOrgRole(undefined)).toBe(false);
  });

  it('words the message for a role that is too low', () => {
    expect(roleNeeded('secretary')).toBe('You need the secretary role for this');
  });

  it('lets a member edit only their own drafts, and a secretary any amendment', () => {
    const own = { status: 'draft', createdById: 7 };
    expect(canEditAmendment('member', 7, own)).toBe(true);
    expect(canEditAmendment('member', 8, own)).toBe(false);
    expect(canEditAmendment('member', 7, { ...own, status: 'proposed' })).toBe(false);
    expect(canEditAmendment('member', 7, { ...own, createdById: null })).toBe(false);
    expect(canEditAmendment('viewer', 7, own)).toBe(false);
    expect(canEditAmendment('secretary', 8, { status: 'proposed', createdById: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/__tests__/roles.test.ts`
Expected: FAIL, cannot find module `../orgs/roles.js`.

- [ ] **Step 3: Create `src/orgs/roles.ts`**

```ts
import type { OrgRole } from '../generated/prisma/client.js';

/** Organization roles, lowest first. Each role can do everything the roles before it can. */
export const ROLES: readonly OrgRole[] = ['viewer', 'member', 'secretary', 'admin', 'owner'];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Whether `role` is `min` or higher */
export function atLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** The role just below `role`, or null for viewer */
export function roleBelow(role: OrgRole): OrgRole | null {
  const index = ROLES.indexOf(role);
  return index > 0 ? ROLES[index - 1] : null;
}

/** The 403 message for a role that is too low */
export function roleNeeded(min: OrgRole): string {
  return `You need the ${min} role for this`;
}

/**
 * Whether a user may edit, add changes to or delete an amendment: a secretary may edit any
 * (the status rules still apply), a member only a draft they created
 */
export function canEditAmendment(
  role: OrgRole,
  userId: number,
  amendment: { status: string; createdById: number | null },
): boolean {
  if (atLeast(role, 'secretary')) return true;
  return (
    atLeast(role, 'member') && amendment.status === 'draft' && amendment.createdById === userId
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/__tests__/roles.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Create the fixture, `src/__integration__/fixtures.ts`**

Two organizations: A has a member at every role and one of each resource; B has an owner (the "outsider") and the resources the cross-organization tests need.

```ts
import type { AmendmentStatus, OrgRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { storeFile } from '../bylawyer/services/fileStorage.js';
import { ROLES } from '../orgs/roles.js';
import { signIn, type TestUser } from './helpers.js';

/** Everything the authorization tests act on */
export interface Fixture {
  /** Members of organization A, one per role, named "A <role>" */
  users: Record<OrgRole, TestUser>;
  /** The owner of organization B, and a member of nothing else */
  outsider: TestUser;
  orgA: { id: string; slug: string };
  orgB: { id: string; slug: string };
  /** A's document: shared, with an older version v1 (effective 2020-01-01) and current v2 */
  doc: string;
  shareToken: string;
  v1: string;
  v2: string;
  /** A section of v1 */
  oldSection: string;
  /** In v2: a root section with an annotation, and its child */
  section: string;
  child: string;
  /** Amendments to doc: a draft the member created, with one change, and one per status */
  draft: string;
  change: string;
  proposed: string;
  passed: string;
  tabled: string;
  meeting: string;
  /** A vote at meeting on the passed amendment */
  vote: string;
  /** A's packet (code ORGA01) with two agenda items, an uploaded file and a linked document */
  packet: { id: string; code: string };
  item: string;
  item2: string;
  /** An uploaded file on the packet, stored on disk */
  upload: string;
  /** doc, linked on the packet */
  linked: string;
  /** A's packet with nothing in it (code ORGA02) */
  emptyPacket: { id: string; code: string };
  /** A pending addition by email to A */
  invite: string;
  /** B's resources, for the routes that take two */
  docB: string;
  versionB: string;
  sectionB: string;
  proposedB: string;
  meetingB: string;
  packetB: { id: string; code: string };
  itemB: string;
}

/** Create the fixture in an empty database (see resetDatabase) */
export async function seedFixture(): Promise<Fixture> {
  const users = {} as Record<OrgRole, TestUser>;
  for (const role of ROLES) {
    users[role] = await signIn(`${role}@example.org`, { name: `A ${role}` });
  }
  const outsider = await signIn('outsider@example.org', { name: 'Outsider' });

  const orgA = await prisma.organization.create({
    data: {
      name: 'Org A',
      slug: 'org-a',
      members: { create: ROLES.map((role) => ({ userId: users[role].id, role })) },
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      name: 'Org B',
      slug: 'org-b',
      members: { create: { userId: outsider.id, role: 'owner' } },
    },
  });

  const doc = await prisma.document.create({
    data: {
      organizationId: orgA.id,
      title: 'Bylaws',
      shareToken: 'share-token-a',
      shareEnabled: true,
    },
  });
  const v1 = await prisma.version.create({
    data: { documentId: doc.id, versionNumber: 1, effectiveDate: new Date('2020-01-01') },
  });
  const oldSection = await prisma.section.create({
    data: { versionId: v1.id, numberLabel: '1', title: 'Name', content: 'The name is Old A.' },
  });
  const v2 = await prisma.version.create({ data: { documentId: doc.id, versionNumber: 2 } });
  const section = await prisma.section.create({
    data: {
      versionId: v2.id,
      numberLabel: '1',
      title: 'Name',
      content: 'The name is A.',
      annotation: 'Internal note',
    },
  });
  const child = await prisma.section.create({
    data: {
      versionId: v2.id,
      parentId: section.id,
      numberLabel: '1.1',
      content: 'The short name is A.',
      annotation: 'Another internal note',
    },
  });
  await prisma.document.update({ where: { id: doc.id }, data: { currentVersionId: v2.id } });

  const amendment = (status: AmendmentStatus, createdById: number | null = null) =>
    prisma.amendment.create({
      data: { documentId: doc.id, title: `A ${status} amendment`, status, createdById },
    });
  const draft = await amendment('draft', users.member.id);
  const change = await prisma.amendmentChange.create({
    data: {
      amendmentId: draft.id,
      changeType: 'modify',
      targetSectionId: section.id,
      newContent: 'The name is A2.',
    },
  });
  const proposed = await amendment('proposed');
  const passed = await amendment('passed');
  const tabled = await amendment('tabled');

  const meeting = await prisma.meeting.create({
    data: { organizationId: orgA.id, scheduledDate: new Date('2026-10-01') },
  });
  const vote = await prisma.vote.create({
    data: {
      meetingId: meeting.id,
      amendmentId: passed.id,
      yeaCount: 5,
      nayCount: 1,
      result: 'passed',
    },
  });

  const packet = await prisma.meetingPacket.create({
    data: { organizationId: orgA.id, robbieCode: 'ORGA01', title: 'October meeting' },
  });
  const item = await prisma.meetingAgendaItem.create({
    data: { packetId: packet.id, title: 'Reports', position: 0 },
  });
  const item2 = await prisma.meetingAgendaItem.create({
    data: { packetId: packet.id, title: 'New business', position: 1 },
  });
  const stored = await storeFile(
    packet.robbieCode,
    'minutes.txt',
    'text/plain',
    Buffer.from('Minutes'),
  );
  if (!stored.success) throw new Error(stored.error);
  const upload = await prisma.attachment.create({
    data: {
      type: 'uploaded_file',
      filename: stored.file.filename,
      mimeType: stored.file.mimeType,
      sizeBytes: stored.file.sizeBytes,
      storagePath: stored.file.storagePath,
      displayName: 'Minutes',
      position: 0,
      meetingPacketId: packet.id,
    },
  });
  const linked = await prisma.attachment.create({
    data: {
      type: 'bylawyer_document',
      documentId: doc.id,
      displayName: 'Bylaws',
      position: 1,
      meetingPacketId: packet.id,
    },
  });
  const emptyPacket = await prisma.meetingPacket.create({
    data: { organizationId: orgA.id, robbieCode: 'ORGA02' },
  });
  const invite = await prisma.organizationInvite.create({
    data: {
      organizationId: orgA.id,
      email: 'pending@example.org',
      role: 'member',
      invitedById: users.admin.id,
    },
  });

  const docB = await prisma.document.create({
    data: { organizationId: orgB.id, title: 'B bylaws' },
  });
  const versionB = await prisma.version.create({
    data: { documentId: docB.id, versionNumber: 1 },
  });
  const sectionB = await prisma.section.create({
    data: { versionId: versionB.id, numberLabel: '1', content: 'The name is B.' },
  });
  await prisma.document.update({
    where: { id: docB.id },
    data: { currentVersionId: versionB.id },
  });
  const proposedB = await prisma.amendment.create({
    data: { documentId: docB.id, title: 'A proposed amendment of B', status: 'proposed' },
  });
  const meetingB = await prisma.meeting.create({
    data: { organizationId: orgB.id, scheduledDate: new Date('2026-10-01') },
  });
  const packetB = await prisma.meetingPacket.create({
    data: { organizationId: orgB.id, robbieCode: 'ORGB01' },
  });
  const itemB = await prisma.meetingAgendaItem.create({
    data: { packetId: packetB.id, title: 'B business' },
  });

  return {
    users,
    outsider,
    orgA: { id: orgA.id, slug: orgA.slug },
    orgB: { id: orgB.id, slug: orgB.slug },
    doc: doc.id,
    shareToken: 'share-token-a',
    v1: v1.id,
    v2: v2.id,
    oldSection: oldSection.id,
    section: section.id,
    child: child.id,
    draft: draft.id,
    change: change.id,
    proposed: proposed.id,
    passed: passed.id,
    tabled: tabled.id,
    meeting: meeting.id,
    vote: vote.id,
    packet: { id: packet.id, code: packet.robbieCode },
    item: item.id,
    item2: item2.id,
    upload: upload.id,
    linked: linked.id,
    emptyPacket: { id: emptyPacket.id, code: emptyPacket.robbieCode },
    invite: invite.id,
    docB: docB.id,
    versionB: versionB.id,
    sectionB: sectionB.id,
    proposedB: proposedB.id,
    meetingB: meetingB.id,
    packetB: { id: packetB.id, code: packetB.robbieCode },
    itemB: itemB.id,
  };
}
```

- [ ] **Step 6: Write the failing resolver test**

Create `src/__integration__/resolvers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  orgOfAgendaItem,
  orgOfAmendment,
  orgOfAmendmentChange,
  orgOfAttachment,
  orgOfDocument,
  orgOfMeeting,
  orgOfOrganization,
  orgOfPacket,
  orgOfPacketCode,
  orgOfSection,
  orgOfSlug,
  orgOfVersion,
  orgOfVote,
} from '../orgs/resolvers.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('resolvers', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('find the organization of each kind of resource', async () => {
    const a = f.orgA.id;
    expect(await orgOfOrganization(a)).toBe(a);
    expect(await orgOfSlug('org-a')).toBe(a);
    expect(await orgOfDocument(f.doc)).toBe(a);
    expect(await orgOfVersion(f.v2)).toBe(a);
    expect(await orgOfSection(f.child)).toBe(a);
    expect(await orgOfAmendment(f.draft)).toBe(a);
    expect(await orgOfAmendmentChange(f.change)).toBe(a);
    expect(await orgOfMeeting(f.meeting)).toBe(a);
    expect(await orgOfVote(f.vote)).toBe(a);
    expect(await orgOfPacket(f.packet.id)).toBe(a);
    expect(await orgOfPacketCode('ORGA01')).toBe(a);
    expect(await orgOfAgendaItem(f.item)).toBe(a);
    expect(await orgOfAttachment(f.upload)).toBe(a);
    expect(await orgOfDocument(f.docB)).toBe(f.orgB.id);
    expect(await orgOfPacketCode('ORGB01')).toBe(f.orgB.id);
  });

  it("finds an agenda item attachment's organization through the item's packet", async () => {
    const onItem = await prisma.attachment.create({
      data: {
        type: 'bylawyer_document',
        documentId: f.doc,
        displayName: 'x',
        agendaItemId: f.item,
      },
    });
    expect(await orgOfAttachment(onItem.id)).toBe(f.orgA.id);
  });

  it('return null for a resource that does not exist', async () => {
    const byId = [
      orgOfOrganization,
      orgOfDocument,
      orgOfVersion,
      orgOfSection,
      orgOfAmendment,
      orgOfAmendmentChange,
      orgOfMeeting,
      orgOfVote,
      orgOfPacket,
      orgOfAgendaItem,
      orgOfAttachment,
    ];
    for (const find of byId) expect(await find(MISSING)).toBeNull();
    expect(await orgOfSlug('no-such-org')).toBeNull();
    expect(await orgOfPacketCode('NOPE01')).toBeNull();
    // Ids are text columns, so a malformed one is simply not found
    expect(await orgOfDocument('not-a-uuid')).toBeNull();
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/resolvers.test.ts`
Expected: FAIL, cannot find module `../orgs/resolvers.js`.

- [ ] **Step 8: Create `src/orgs/resolvers.ts`**

```ts
/**
 * Resource resolvers: each finds the organization a resource belongs to, or null when the
 * resource doesn't exist. requireRole uses them to check the user's role there.
 */

import { prisma } from '../db/prisma.js';

export async function orgOfOrganization(id: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  return org?.id ?? null;
}

export async function orgOfSlug(slug: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  return org?.id ?? null;
}

export async function orgOfDocument(id: string): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return doc?.organizationId ?? null;
}

export async function orgOfVersion(id: string): Promise<string | null> {
  const version = await prisma.version.findUnique({
    where: { id },
    select: { document: { select: { organizationId: true } } },
  });
  return version?.document.organizationId ?? null;
}

export async function orgOfSection(id: string): Promise<string | null> {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { version: { select: { document: { select: { organizationId: true } } } } },
  });
  return section?.version.document.organizationId ?? null;
}

export async function orgOfAmendment(id: string): Promise<string | null> {
  const amendment = await prisma.amendment.findUnique({
    where: { id },
    select: { document: { select: { organizationId: true } } },
  });
  return amendment?.document.organizationId ?? null;
}

export async function orgOfAmendmentChange(id: string): Promise<string | null> {
  const change = await prisma.amendmentChange.findUnique({
    where: { id },
    select: { amendment: { select: { document: { select: { organizationId: true } } } } },
  });
  return change?.amendment.document.organizationId ?? null;
}

export async function orgOfMeeting(id: string): Promise<string | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return meeting?.organizationId ?? null;
}

export async function orgOfVote(id: string): Promise<string | null> {
  const vote = await prisma.vote.findUnique({
    where: { id },
    select: { meeting: { select: { organizationId: true } } },
  });
  return vote?.meeting.organizationId ?? null;
}

export async function orgOfPacket(id: string): Promise<string | null> {
  const packet = await prisma.meetingPacket.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return packet?.organizationId ?? null;
}

/** A live meeting's organization: its packet's */
export async function orgOfPacketCode(robbieCode: string): Promise<string | null> {
  const packet = await prisma.meetingPacket.findUnique({
    where: { robbieCode },
    select: { organizationId: true },
  });
  return packet?.organizationId ?? null;
}

export async function orgOfAgendaItem(id: string): Promise<string | null> {
  const item = await prisma.meetingAgendaItem.findUnique({
    where: { id },
    select: { packet: { select: { organizationId: true } } },
  });
  return item?.packet.organizationId ?? null;
}

/** An attachment is on a packet or on an agenda item (and so its packet) */
export async function orgOfAttachment(id: string): Promise<string | null> {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      meetingPacket: { select: { organizationId: true } },
      agendaItem: { select: { packet: { select: { organizationId: true } } } },
    },
  });
  return (
    attachment?.meetingPacket?.organizationId ??
    attachment?.agendaItem?.packet.organizationId ??
    null
  );
}
```

- [ ] **Step 9: Run it to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/resolvers.test.ts`
Expected: 3 passed.

- [ ] **Step 10: Type-check and commit**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

```bash
git add src/orgs src/__tests__/roles.test.ts src/__integration__/fixtures.ts src/__integration__/resolvers.test.ts
git commit -m "feat(orgs): add role order and resource-to-organization resolvers"
```

---

### Task 4: `requireRole`, the route rule test and the rule matrix runner

**Files:**

- Create: `src/orgs/requireRole.ts`, `src/__integration__/rules.ts`
- Test: `src/__integration__/requireRole.test.ts`, `src/__integration__/routeCoverage.test.ts`

How Express 5 exposes routes (verified in `node_modules/express` 5.2.1 and `node_modules/router` 2.2.0): `app.router` is the app's `Router`, and `router.stack` is its list of layers. A layer made by `router.get(path, ...)` has `layer.route`, a `Route` with `path` (the string as written), `methods` (`{ get: true }`) and its own `stack` of layers whose `handle` is each handler in order. A layer made by `app.use(path, otherRouter)` has no `route`; its `handle` is the mounted router (a function with its own `stack`). Layers don't keep their mount path as a string (only a matcher), so the walk identifies routers by identity, not by path.

- [ ] **Step 1: Write the failing middleware test**

Create `src/__integration__/requireRole.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { authenticate } from '../auth/authenticate.js';
import { orgOfOrganization } from '../orgs/resolvers.js';
import {
  accessRuleOf,
  fromBody,
  fromParam,
  fromQuery,
  requireRole,
  signedInOnly,
} from '../orgs/requireRole.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';

// A small app with one rule for each way of finding the organization
const testApp = express();
testApp.use(cookieParser() as unknown as express.RequestHandler, express.json(), authenticate);
// Typed loosely so it fits any route's parameters
const showOrg = (req: { org?: unknown }, res: express.Response) => {
  res.json(req.org);
};
testApp.get(
  '/by-param/:orgId',
  requireRole('secretary', fromParam('orgId', orgOfOrganization)),
  showOrg,
);
testApp.post('/by-body', requireRole('secretary', fromBody('orgId', orgOfOrganization)), showOrg);
testApp.get('/by-query', requireRole('secretary', fromQuery('orgId', orgOfOrganization)), showOrg);
testApp.get(
  '/broken',
  requireRole('viewer', async () => {
    throw new Error('lookup failed');
  }),
  showOrg,
);

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('requireRole', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('lets a member with the role or higher through, and records the role', async () => {
    const secretary = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.users.secretary.cookie);
    expect(secretary.status).toBe(200);
    expect(secretary.body).toEqual({ id: f.orgA.id, role: 'secretary' });

    const owner = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.users.owner.cookie);
    expect(owner.body).toEqual({ id: f.orgA.id, role: 'owner' });
  });

  it('answers 403 naming the role when the role is too low', async () => {
    const res = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.users.member.cookie);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You need the secretary role for this' });
  });

  it('answers 404 to a non-member and for an organization that does not exist', async () => {
    const outsider = await request(testApp)
      .get(`/by-param/${f.orgA.id}`)
      .set('Cookie', f.outsider.cookie);
    expect(outsider.status).toBe(404);
    expect(outsider.body).toEqual({ error: 'Not found' });

    const missing = await request(testApp)
      .get(`/by-param/${MISSING}`)
      .set('Cookie', f.users.owner.cookie);
    expect(missing.status).toBe(404);
  });

  it('finds the organization through the body or the query', async () => {
    const body = await request(testApp)
      .post('/by-body')
      .set('Cookie', f.users.admin.cookie)
      .send({ orgId: f.orgA.id });
    expect(body.body).toEqual({ id: f.orgA.id, role: 'admin' });

    const query = await request(testApp)
      .get(`/by-query?orgId=${f.orgA.id}`)
      .set('Cookie', f.users.admin.cookie);
    expect(query.body).toEqual({ id: f.orgA.id, role: 'admin' });

    // Nothing to resolve from: not found
    const none = await request(testApp).post('/by-body').set('Cookie', f.users.admin.cookie);
    expect(none.status).toBe(404);
  });

  it('answers 500 when the lookup fails', async () => {
    const res = await request(testApp).get('/broken').set('Cookie', f.users.owner.cookie);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to check access' });
  });

  it('marks its handlers so the route test can find them', () => {
    expect(accessRuleOf(requireRole('admin', fromParam('id', orgOfOrganization)))).toEqual({
      kind: 'role',
      min: 'admin',
    });
    expect(accessRuleOf(signedInOnly())).toEqual({ kind: 'signedIn' });
    expect(accessRuleOf(() => undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing route rule test**

Create `src/__integration__/routeCoverage.test.ts`. Until every router has rules, `NOT_YET_RULED` lists the routers still to do; each later task removes its routers from it, and Task 13 removes the list.

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import { app } from '../app.js';
import { authRouter } from '../auth/authRoutes.js';
import { bylawyerRouter } from '../bylawyer/bylawyerRouter.js';
import * as routes from '../bylawyer/routes/index.js';
import { accessRuleOf, requireRole } from '../orgs/requireRole.js';

/** The parts of Express's router layers this test reads (router 2.x) */
interface Route {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ handle: unknown }>;
}
interface Layer {
  route?: Route;
  handle: unknown;
}

// Mounted under /api, but public: sign-in, and read-only share links
const PUBLIC_ROUTERS = new Set<unknown>([authRouter, routes.publicRouter]);
// App-level routes under /api that are public
const PUBLIC_ROUTES = new Set(['/api/health']);

// Routers whose routes don't have rules yet. Each task that adds a router's rules removes it
// here; Task 13 removes the list.
const NOT_YET_RULED = new Set<unknown>([
  routes.organizationsRouter,
  routes.documentsRouter,
  routes.versionsRouter,
  routes.sectionsRouter,
  routes.amendmentsRouter,
  routes.meetingsRouter,
  routes.packetsRouter,
  routes.agendaItemsRouter,
  routes.attachmentsRouter,
  routes.robbieRouter,
  bylawyerRouter,
]);

/** A mounted router's layers, or null if the handle isn't a router */
function stackOf(handle: unknown): Layer[] | null {
  const stack = (handle as { stack?: unknown } | null)?.stack;
  return typeof handle === 'function' && Array.isArray(stack) ? (stack as Layer[]) : null;
}

const name = (route: Route) =>
  `${Object.keys(route.methods).join(',').toUpperCase()} ${route.path}`;

/** Whether a rule runs before the route's final handler */
const hasRule = (route: Route) =>
  route.stack.slice(0, -1).some((layer) => accessRuleOf(layer.handle) !== null);

/**
 * The routes without a rule. At the top level (the app's own stack) only routes under /api
 * count: the web app's catch-all is not an API route.
 */
function unruled(stack: Layer[], top: boolean): string[] {
  const missing: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const { path } = layer.route;
      const counts = !top || (path.startsWith('/api') && !PUBLIC_ROUTES.has(path));
      if (counts && !hasRule(layer.route)) missing.push(name(layer.route));
      continue;
    }
    const inner = stackOf(layer.handle);
    if (inner && !PUBLIC_ROUTERS.has(layer.handle) && !NOT_YET_RULED.has(layer.handle)) {
      missing.push(...unruled(inner, false));
    }
  }
  return missing;
}

const appStack = (app as unknown as { router: { stack: Layer[] } }).router.stack;

describe('route rules', () => {
  it('gives every /api route a rule, apart from sign-in, share links and health', () => {
    expect(unruled(appStack, true)).toEqual([]);
  });

  it('finds the mounted routers', () => {
    // Guards against a walk that silently finds nothing
    expect(appStack.filter((layer) => stackOf(layer.handle)).length).toBeGreaterThanOrEqual(13);
  });

  it('reports a route without a rule', () => {
    const router = express.Router();
    router.get(
      '/ruled',
      requireRole('viewer', async () => null),
      (_req, res) => {
        res.end();
      },
    );
    router.get('/open', (_req, res) => {
      res.end();
    });
    const sample = express();
    sample.use('/api', router);
    sample.get('/api/also-open', (_req, res) => {
      res.end();
    });
    sample.get('/{*splat}', (_req, res) => {
      res.end();
    });
    const stack = (sample as unknown as { router: { stack: Layer[] } }).router.stack;
    expect(unruled(stack, true)).toEqual(['GET /open', 'GET /api/also-open']);
  });

  it('keeps the public share router to share links', () => {
    const paths = (stackOf(routes.publicRouter) ?? []).map((layer) => layer.route?.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path).toMatch(/^\/share\//);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/requireRole.test.ts src/__integration__/routeCoverage.test.ts`
Expected: FAIL, cannot find module `../orgs/requireRole.js`.

- [ ] **Step 4: Create `src/orgs/requireRole.ts`**

```ts
import type { Request, RequestHandler } from 'express';
import type { OrgRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';
import type { RouteParams } from '../middleware/validate.js';
import { atLeast, roleNeeded } from './roles.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** The organization the route acts on, and the user's role in it, set by requireRole */
    org?: { id: string; role: OrgRole };
  }
}

/** Finds the organization a request acts on: its id, or null when the resource doesn't exist */
export type OrgResolver = (req: Request<RouteParams>) => Promise<string | null>;

/** The access rule a route handler enforces, read by the route coverage test */
export type AccessRule = { kind: 'role'; min: OrgRole } | { kind: 'signedIn' };

const ACCESS_RULE = Symbol('accessRule');

function withRule<T extends object>(handler: T, rule: AccessRule): T {
  Object.defineProperty(handler, ACCESS_RULE, { value: rule });
  return handler;
}

/** The rule a handler enforces, or null if it isn't a rule */
export function accessRuleOf(handler: unknown): AccessRule | null {
  if (typeof handler !== 'function') return null;
  return (handler as unknown as Record<symbol, AccessRule | undefined>)[ACCESS_RULE] ?? null;
}

/**
 * Require the signed-in user (see authenticate) to have at least `min` in the organization the
 * request acts on. Answers 404 when the resource doesn't exist or the user isn't a member, so
 * an organization's resources don't exist to outsiders, and 403 when the role is too low.
 * Otherwise sets req.org.
 */
export function requireRole(min: OrgRole, resolve: OrgResolver): RequestHandler<RouteParams> {
  const rule: RequestHandler<RouteParams> = async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    try {
      const organizationId = await resolve(req);
      const membership = organizationId
        ? await prisma.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId: req.user.id } },
            select: { role: true },
          })
        : null;
      if (!organizationId || !membership) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (!atLeast(membership.role, min)) {
        res.status(403).json({ error: roleNeeded(min) });
        return;
      }
      req.org = { id: organizationId, role: membership.role };
      next();
    } catch (error) {
      logger.error({ err: error }, 'Failed to check organization access');
      res.status(500).json({ error: 'Failed to check access' });
    }
  };
  return withRule(rule, { kind: 'role', min });
}

/**
 * The rule for a route that acts on the signed-in user's own organizations rather than on one
 * organization (listing them, creating one). It lets every signed-in user through.
 */
export function signedInOnly(): RequestHandler<RouteParams> {
  const rule: RequestHandler<RouteParams> = (_req, _res, next) => next();
  return withRule(rule, { kind: 'signedIn' });
}

type FindOrg = (key: string) => Promise<string | null>;

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Resolve through a route parameter */
export function fromParam(name: string, find: FindOrg): OrgResolver {
  return async (req) => {
    const key = text(req.params[name]);
    return key ? find(key) : null;
  };
}

/** Resolve through a field of the (validated) body */
export function fromBody(name: string, find: FindOrg): OrgResolver {
  return async (req) => {
    const key = text((req.body as Record<string, unknown> | undefined)?.[name]);
    return key ? find(key) : null;
  };
}

/** Resolve through a query parameter */
export function fromQuery(name: string, find: FindOrg): OrgResolver {
  return async (req) => {
    const key = text(req.query[name]);
    return key ? find(key) : null;
  };
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/requireRole.test.ts src/__integration__/routeCoverage.test.ts`
Expected: 10 passed.

- [ ] **Step 6: Create the rule matrix runner, `src/__integration__/rules.ts`**

The route tasks describe each router's rules as a table of `RuleCase`s.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { OrgRole } from '../generated/prisma/client.js';
import { roleBelow, roleNeeded } from '../orgs/roles.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, type Method } from './helpers.js';

/** One route's rule: who may call it, and what a successful call answers */
export interface RuleCase {
  method: Method;
  /** The route as written in its router, for the test name */
  route: string;
  path: (f: Fixture) => string;
  body?: (f: Fixture) => object | Buffer;
  headers?: (f: Fixture) => Record<string, string>;
  /** The lowest role that may call it */
  min: OrgRole;
  /** The status a member with that role gets */
  ok: number;
}

/**
 * For each route: 401 without a session, 404 for a member of another organization, 403 with
 * the role named for the role just below the minimum, and success at the minimum. Each route
 * gets a fresh fixture, since a successful call may change or delete it. The refusals change
 * nothing, so they run before the success on the same fixture.
 */
export function describeRules(title: string, cases: RuleCase[]): void {
  describe(title, () => {
    let f: Fixture;
    beforeEach(async () => {
      await resetDatabase();
      f = await seedFixture();
    });

    it.each(cases)('$method $route needs $min', async (c) => {
      const send = (cookie?: string) =>
        call(c.method, c.path(f), { cookie, body: c.body?.(f), headers: c.headers?.(f) });

      expect((await send()).status, 'without a session').toBe(401);

      const outsider = await send(f.outsider.cookie);
      expect(outsider.status, 'as a member of another organization').toBe(404);
      expect(outsider.body).toEqual({ error: 'Not found' });

      const below = roleBelow(c.min);
      if (below) {
        const refused = await send(f.users[below].cookie);
        expect(refused.status, `as ${below}`).toBe(403);
        expect(refused.body).toEqual({ error: roleNeeded(c.min) });
      }

      const allowed = await send(f.users[c.min].cookie);
      expect(allowed.status, `as ${c.min}: ${JSON.stringify(allowed.body)}`).toBe(c.ok);
    });
  });
}
```

- [ ] **Step 7: Type-check and run everything**

Run: `npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass.

- [ ] **Step 8: Commit**

```bash
git add src/orgs/requireRole.ts src/__integration__/requireRole.test.ts src/__integration__/routeCoverage.test.ts src/__integration__/rules.ts
git commit -m "feat(orgs): add requireRole and a test that every API route has a rule

requireRole(min, resolve) finds the organization a request acts on and
answers 404 to non-members and 403 to roles too low. The route test walks
Express's router; routers without rules yet are listed until converted."
```

---

### Task 5: Organizations

**Rules (`src/bylawyer/routes/organizations.ts`, mounted at `/api`):**

| Route                              | Rule                                         | Notes                                                         |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `GET /organizations`               | `signedInOnly()`                             | Only the user's organizations, each with the user's `role`    |
| `POST /organizations`              | `signedInOnly()`                             | The creator becomes owner, in one transaction; 429 at 3 owned |
| `GET /organizations/by-slug/:slug` | viewer, `fromParam('slug', orgOfSlug)`       |                                                               |
| `GET /organizations/:id`           | viewer, `fromParam('id', orgOfOrganization)` |                                                               |
| `PUT /organizations/:id`           | admin, same                                  | Copies only `name` and `description`                          |
| `DELETE /organizations/:id`        | owner, same                                  |                                                               |

**Files:**

- Create: `src/orgs/orgError.ts`, `src/orgs/organizationService.ts`
- Modify: `src/bylawyer/routes/organizations.ts`, `src/schemas/organizations.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/organizations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/organizations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, signIn } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('organization rules', [
  {
    method: 'get',
    route: '/organizations/by-slug/:slug',
    path: (f) => `/api/organizations/by-slug/${f.orgA.slug}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/organizations/:id',
    path: (f) => `/api/organizations/${f.orgA.id}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/organizations/:id',
    path: (f) => `/api/organizations/${f.orgA.id}`,
    body: () => ({ name: 'Renamed' }),
    min: 'admin',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/organizations/:id',
    path: (f) => `/api/organizations/${f.orgA.id}`,
    min: 'owner',
    ok: 204,
  },
]);

describe('organizations', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("lists only the user's organizations, each with the user's role", async () => {
    const member = await call('get', '/api/organizations', { cookie: f.users.member.cookie });
    expect(member.status).toBe(200);
    expect(member.body).toEqual([
      expect.objectContaining({ id: f.orgA.id, name: 'Org A', role: 'member' }),
    ]);

    const outsider = await call('get', '/api/organizations', { cookie: f.outsider.cookie });
    expect(outsider.body).toEqual([
      expect.objectContaining({ id: f.orgB.id, name: 'Org B', role: 'owner' }),
    ]);

    const nobody = await signIn('nobody@example.org');
    expect((await call('get', '/api/organizations', { cookie: nobody.cookie })).body).toEqual([]);
  });

  it('leaves out inactive organizations unless asked, and pages', async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { isActive: false } });
    const cookie = f.users.viewer.cookie;
    expect((await call('get', '/api/organizations', { cookie })).body).toEqual([]);
    const all = await call('get', '/api/organizations?active_only=false', { cookie });
    expect(all.body).toHaveLength(1);

    const page = await call('get', '/api/organizations?active_only=false&page=1&limit=1', {
      cookie,
    });
    expect(page.body).toEqual({
      data: [expect.objectContaining({ id: f.orgA.id, role: 'viewer' })],
      pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
  });

  it('makes the creator the owner', async () => {
    const ann = await signIn('ann@example.org');
    const res = await call('post', '/api/organizations', {
      cookie: ann.cookie,
      body: { name: 'Garden Club' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Garden Club', slug: 'garden-club', role: 'owner' });

    const membership = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: res.body.id, userId: ann.id } },
    });
    expect(membership.role).toBe('owner');
    const list = await call('get', '/api/organizations', { cookie: ann.cookie });
    expect(list.body).toEqual([expect.objectContaining({ id: res.body.id, role: 'owner' })]);
  });

  it('lets a user own at most 3 organizations', async () => {
    // The fixture's owner already owns Org A
    const cookie = f.users.owner.cookie;
    for (const name of ['Second', 'Third']) {
      expect((await call('post', '/api/organizations', { cookie, body: { name } })).status).toBe(
        201,
      );
    }
    const fourth = await call('post', '/api/organizations', { cookie, body: { name: 'Fourth' } });
    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({ error: 'You can own at most 3 organizations' });
    expect(await prisma.organization.count({ where: { name: 'Fourth' } })).toBe(0);
  });

  it('holds the limit when creations arrive together', async () => {
    const cookie = f.users.owner.cookie;
    const results = await Promise.all(
      ['One', 'Two', 'Three'].map((name) =>
        call('post', '/api/organizations', { cookie, body: { name } }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 429]);
  });

  it('changes only the name and description', async () => {
    const res = await call('put', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.admin.cookie,
      body: { name: 'New name', description: 'About us', slug: 'taken-over', isActive: false },
    });
    expect(res.status).toBe(200);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: f.orgA.id } });
    expect(org).toMatchObject({
      name: 'New name',
      description: 'About us',
      slug: 'org-a',
      isActive: true,
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/organizations.test.ts`
Expected: FAIL. The rule cases get 200 instead of 404 for the outsider; the list returns every organization without `role`; the fourth organization is created.

- [ ] **Step 3: Create `src/orgs/orgError.ts`**

```ts
/** A refused organization or membership change, with the HTTP status to answer with */
export class OrgError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OrgError';
  }
}
```

- [ ] **Step 4: Create `src/orgs/organizationService.ts`**

```ts
import type { Organization, OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { OrgError } from './orgError.js';

/** A user can own at most this many organizations */
export const MAX_OWNED_ORGANIZATIONS = 3;

export type OrganizationWithRole = Organization & { role: OrgRole };

/** The user's organizations by name, each with the user's role */
export async function userOrganizations(
  userId: number,
  options: { activeOnly?: boolean; skip?: number; take?: number } = {},
): Promise<{ organizations: OrganizationWithRole[]; total: number }> {
  const where: Prisma.OrganizationMemberWhereInput = {
    userId,
    ...(options.activeOnly ? { organization: { isActive: true } } : {}),
  };
  const [memberships, total] = await prisma.$transaction([
    prisma.organizationMember.findMany({
      where,
      include: { organization: true },
      orderBy: { organization: { name: 'asc' } },
      skip: options.skip,
      take: options.take,
    }),
    prisma.organizationMember.count({ where }),
  ]);
  return {
    organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    total,
  };
}

/** Create an organization with the user as its owner */
export async function createOwnedOrganization(
  userId: number,
  data: { name: string; slug: string; description?: string },
): Promise<OrganizationWithRole> {
  return prisma.$transaction(async (tx) => {
    // Hold the user's row so two creations at once can't both pass the limit
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const owned = await tx.organizationMember.count({ where: { userId, role: 'owner' } });
    if (owned >= MAX_OWNED_ORGANIZATIONS) {
      throw new OrgError(429, `You can own at most ${MAX_OWNED_ORGANIZATIONS} organizations`);
    }
    const org = await tx.organization.create({
      data: { ...data, members: { create: { userId, role: 'owner' } } },
    });
    return { ...org, role: 'owner' as const };
  });
}
```

- [ ] **Step 5: Edit only name and description**

In `src/schemas/organizations.ts`, replace `updateOrganizationBody` with:

```ts
// Only the name and description change here; zod drops any other field
export const updateOrganizationBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});
```

- [ ] **Step 6: Put the rules on the routes**

Replace `src/bylawyer/routes/organizations.ts` with:

```ts
import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam } from '../../schemas/common.js';
import {
  createOrganizationBody,
  updateOrganizationBody,
  listOrganizationsQuery,
} from '../../schemas/organizations.js';
import { getPagination, paginatedResponse } from '../../middleware/pagination.js';
import { logger } from '../../middleware/logger.js';
import { OrgError } from '../../orgs/orgError.js';
import { createOwnedOrganization, userOrganizations } from '../../orgs/organizationService.js';
import { fromParam, requireRole, signedInOnly } from '../../orgs/requireRole.js';
import { orgOfOrganization, orgOfSlug } from '../../orgs/resolvers.js';

export const organizationsRouter: RouterType = Router();

const byOrganization = fromParam('id', orgOfOrganization);

// Generate URL-friendly slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// List the signed-in user's organizations, each with the user's role
organizationsRouter.get(
  '/organizations',
  validate({ query: listOrganizationsQuery }),
  signedInOnly(),
  async (req, res) => {
    try {
      const activeOnly = req.query.active_only !== 'false';

      if (req.query.page) {
        const pagination = getPagination(req);
        const { organizations, total } = await userOrganizations(req.user!.id, {
          activeOnly,
          skip: pagination.skip,
          take: pagination.limit,
        });
        return res.json(paginatedResponse(organizations, total, pagination));
      }

      const { organizations } = await userOrganizations(req.user!.id, { activeOnly });
      res.json(organizations);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list organizations');
      res.status(500).json({ error: 'Failed to list organizations' });
    }
  },
);

// Create an organization; the creator becomes its owner
organizationsRouter.post(
  '/organizations',
  validate({ body: createOrganizationBody }),
  signedInOnly(),
  async (req, res) => {
    try {
      const { name, slug: providedSlug, description } = req.body;
      const slug = providedSlug || generateSlug(name);

      // Check for existing slug
      const existing = await prisma.organization.findUnique({ where: { slug } });
      if (existing) {
        return res.status(400).json({ error: `Organization with slug '${slug}' already exists` });
      }

      const org = await createOwnedOrganization(req.user!.id, { name, slug, description });
      res.status(201).json(org);
    } catch (error) {
      if (error instanceof OrgError) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error({ err: error }, 'Failed to create organization');
      res.status(500).json({ error: 'Failed to create organization' });
    }
  },
);

// Get organization by slug
organizationsRouter.get(
  '/organizations/by-slug/:slug',
  requireRole('viewer', fromParam('slug', orgOfSlug)),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { slug: req.params.slug },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(org);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get organization');
      res.status(500).json({ error: 'Failed to get organization' });
    }
  },
);

// Get organization by ID
organizationsRouter.get(
  '/organizations/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(org);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get organization');
      res.status(500).json({ error: 'Failed to get organization' });
    }
  },
);

// Update the organization's name and description
organizationsRouter.put(
  '/organizations/:id',
  validate({ params: uuidParam, body: updateOrganizationBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const updated = await prisma.organization.update({
        where: { id: req.params.id },
        data: { name: req.body.name, description: req.body.description },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update organization');
      res.status(500).json({ error: 'Failed to update organization' });
    }
  },
);

// Delete organization
organizationsRouter.delete(
  '/organizations/:id',
  validate({ params: uuidParam }),
  requireRole('owner', byOrganization),
  async (req, res) => {
    try {
      await prisma.organization.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete organization');
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  },
);
```

(The PUT and DELETE handlers drop their "not found" lookups: the rule has already found the organization.)

- [ ] **Step 7: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.organizationsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 8: Run it to see it pass**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 10 in `organizations.test.ts` and the route test.

- [ ] **Step 9: Commit**

```bash
git add src/orgs src/schemas/organizations.ts src/bylawyer/routes/organizations.ts src/__integration__/organizations.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): limit organizations to their members

Listing shows only the user's organizations, with their role; creating
one makes the creator its owner (at most 3 owned); reading needs viewer,
renaming admin (name and description only) and deleting owner."
```

---

### Task 6: Documents and share links

**Rules (`src/bylawyer/routes/documents.ts`, mounted at `/api`):**

| Route                                  | Rule                                            |
| -------------------------------------- | ----------------------------------------------- |
| `GET /organizations/:orgId/documents`  | viewer, `fromParam('orgId', orgOfOrganization)` |
| `POST /organizations/:orgId/documents` | secretary, same                                 |
| `GET /documents/:id`                   | viewer, `fromParam('id', orgOfDocument)`        |
| `PUT /documents/:id`                   | secretary, same                                 |
| `DELETE /documents/:id`                | secretary, same                                 |
| `GET /documents/:id/at-date`           | viewer, same                                    |
| `GET /documents/:id/share`             | admin, same                                     |
| `POST /documents/:id/share`            | admin, same                                     |
| `DELETE /documents/:id/share`          | admin, same                                     |
| `POST /documents/:id/share/regenerate` | admin, same                                     |

The public `/api/share` routes (`src/bylawyer/routes/public.ts`) stay open and stop sending `Section.annotation`, which holds internal commentary.

**Files:**

- Modify: `src/bylawyer/routes/documents.ts`, `src/bylawyer/routes/public.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/documents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/documents.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('document rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/documents',
    path: (f) => `/api/organizations/${f.orgA.id}/documents`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:orgId/documents',
    path: (f) => `/api/organizations/${f.orgA.id}/documents`,
    body: () => ({ title: 'Standing rules', docType: 'standing_rules' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/documents/:id',
    path: (f) => `/api/documents/${f.doc}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/documents/:id',
    path: (f) => `/api/documents/${f.doc}`,
    body: () => ({ title: 'Amended bylaws' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/documents/:id',
    path: (f) => `/api/documents/${f.doc}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/documents/:id/at-date',
    path: (f) => `/api/documents/${f.doc}/at-date?date=2026-01-01`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/documents/:id/share',
    path: (f) => `/api/documents/${f.doc}/share`,
    min: 'admin',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:id/share',
    path: (f) => `/api/documents/${f.doc}/share`,
    min: 'admin',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/documents/:id/share',
    path: (f) => `/api/documents/${f.doc}/share`,
    min: 'admin',
    ok: 204,
  },
  {
    method: 'post',
    route: '/documents/:id/share/regenerate',
    path: (f) => `/api/documents/${f.doc}/share/regenerate`,
    min: 'admin',
    ok: 200,
  },
]);

describe('share links', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('leave out annotations', async () => {
    const shared = await call('get', `/api/share/${f.shareToken}`);
    expect(shared.status).toBe(200);
    const [root] = shared.body.currentVersion.sections;
    expect(root.content).toBe('The name is A.');
    expect(root).not.toHaveProperty('annotation');
    expect(root.children[0]).not.toHaveProperty('annotation');

    const version = await call('get', `/api/share/${f.shareToken}/versions/${f.v2}`);
    expect(version.status).toBe(200);
    expect(version.body.sections[0]).not.toHaveProperty('annotation');
    expect(version.body.sections[0].children[0]).not.toHaveProperty('annotation');
  });

  it('still show annotations to members', async () => {
    const tree = await call('get', `/api/versions/${f.v2}/tree`, {
      cookie: f.users.viewer.cookie,
    });
    expect(tree.body[0].annotation).toBe('Internal note');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/documents.test.ts`
Expected: FAIL. Every rule case answers the outsider with 200 or 201 instead of 404, and share links include `annotation`.

- [ ] **Step 3: Put the rules on the routes**

In `src/bylawyer/routes/documents.ts`, add the imports:

```ts
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfDocument, orgOfOrganization } from '../../orgs/resolvers.js';
```

and after `export const documentsRouter: RouterType = Router();`:

```ts
const byOrganization = fromParam('orgId', orgOfOrganization);
const byDocument = fromParam('id', orgOfDocument);
```

Then add each rule as a new argument directly after the route's `validate(...)` argument. The handlers don't change. The route heads become:

```ts
documentsRouter.get(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
  async (req, res) => {

documentsRouter.post(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam, body: createDocumentBody }),
  requireRole('secretary', byOrganization),
  async (req, res) => {

documentsRouter.get(
  '/documents/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byDocument),
  async (req, res) => {

documentsRouter.put(
  '/documents/:id',
  validate({ params: uuidParam, body: updateDocumentBody }),
  requireRole('secretary', byDocument),
  async (req, res) => {

documentsRouter.delete(
  '/documents/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byDocument),
  async (req, res) => {

documentsRouter.get(
  '/documents/:id/at-date',
  validate({ params: uuidParam, query: atDateQuery }),
  requireRole('viewer', byDocument),
  async (req, res) => {

documentsRouter.post(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
  async (req, res) => {

documentsRouter.delete(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
  async (req, res) => {

documentsRouter.post(
  '/documents/:id/share/regenerate',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
  async (req, res) => {

documentsRouter.get(
  '/documents/:id/share',
  validate({ params: uuidParam }),
  requireRole('admin', byDocument),
  async (req, res) => {
```

(The routes written on one line, such as `documentsRouter.get('/documents/:id', validate({ params: uuidParam }), async (req, res) => {`, get the same extra argument; prettier then splits them as shown. Their closing `});` becomes `},\n);`.)

- [ ] **Step 4: Leave annotations out of share links**

In `src/bylawyer/routes/public.ts`, in `buildSectionTree`, delete the line `annotation: section.annotation,` and replace the comment above the function with:

```ts
// Build nested section tree from flat list. Annotations are internal commentary, so share
// links leave them out.
```

- [ ] **Step 5: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.documentsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 12 in `documents.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/bylawyer/routes/documents.ts src/bylawyer/routes/public.ts src/__integration__/documents.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): limit documents to their organization's members

Reading needs viewer, editing secretary, and the share link settings
admin. Public share links no longer include section annotations."
```

---

### Task 7: Versions

**Rules (`src/bylawyer/routes/versions.ts`, mounted at `/api`):**

| Route                               | Rule                                        | Notes                                                      |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `GET /documents/:docId/versions`    | viewer, `fromParam('docId', orgOfDocument)` |                                                            |
| `POST /documents/:docId/versions`   | secretary, same                             |                                                            |
| `GET /versions/:id`                 | viewer, `fromParam('id', orgOfVersion)`     |                                                            |
| `GET /versions/:id/tree`            | viewer, same                                |                                                            |
| `GET /versions/:id/text`            | viewer, same                                |                                                            |
| `GET /versions/:id/diff/:otherId`   | viewer, same                                | `otherId` must be a version of the same document, else 404 |
| `PUT /versions/:id`                 | secretary, same                             |                                                            |
| `DELETE /versions/:id`              | secretary, same                             |                                                            |
| `GET /versions/:id/export/markdown` | viewer, same                                |                                                            |

**Files:**

- Modify: `src/bylawyer/routes/versions.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/versions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/versions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('version rules', [
  {
    method: 'get',
    route: '/documents/:docId/versions',
    path: (f) => `/api/documents/${f.doc}/versions`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/versions',
    path: (f) => `/api/documents/${f.doc}/versions`,
    body: () => ({ notes: 'Annual review' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v2}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/tree',
    path: (f) => `/api/versions/${f.v2}/tree`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/text',
    path: (f) => `/api/versions/${f.v2}/text`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/diff/:otherId',
    path: (f) => `/api/versions/${f.v1}/diff/${f.v2}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v2}`,
    body: () => ({ notes: 'Checked' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v1}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/versions/:id/export/markdown',
    path: (f) => `/api/versions/${f.v2}/export/markdown`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('version diffs', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("refuse another organization's version", async () => {
    const res = await call('get', `/api/versions/${f.v2}/diff/${f.versionB}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Version not found' });
  });

  it('refuse a version of another document in the same organization', async () => {
    const other = await prisma.document.create({
      data: { organizationId: f.orgA.id, title: 'Policies' },
    });
    const otherVersion = await prisma.version.create({
      data: { documentId: other.id, versionNumber: 1 },
    });
    const res = await call('get', `/api/versions/${f.v2}/diff/${otherVersion.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/versions.test.ts`
Expected: FAIL. The rule cases answer the outsider with 200 or 201, and both diffs answer 200.

- [ ] **Step 3: Put the rules on the routes**

In `src/bylawyer/routes/versions.ts`, add the imports:

```ts
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfDocument, orgOfVersion } from '../../orgs/resolvers.js';
```

and after `export const versionsRouter: RouterType = Router();`:

```ts
const byDocument = fromParam('docId', orgOfDocument);
const byVersion = fromParam('id', orgOfVersion);
```

Add each rule directly after the route's `validate(...)` argument; the route heads become:

```ts
versionsRouter.get(
  '/documents/:docId/versions',
  validate({ params: docIdParam }),
  requireRole('viewer', byDocument),
  async (req, res) => {

versionsRouter.post(
  '/documents/:docId/versions',
  validate({ params: docIdParam, body: createVersionBody }),
  requireRole('secretary', byDocument),
  async (req, res) => {

versionsRouter.get(
  '/versions/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {

versionsRouter.get(
  '/versions/:id/tree',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {

versionsRouter.get(
  '/versions/:id/text',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {

versionsRouter.get(
  '/versions/:id/diff/:otherId',
  validate({ params: diffParams }),
  requireRole('viewer', byVersion),
  async (req, res) => {

versionsRouter.put(
  '/versions/:id',
  validate({ params: uuidParam, body: updateVersionBody }),
  requireRole('secretary', byVersion),
  async (req, res) => {

versionsRouter.delete(
  '/versions/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byVersion),
  async (req, res) => {

versionsRouter.get(
  '/versions/:id/export/markdown',
  validate({ params: uuidParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {
```

- [ ] **Step 4: Diff only versions of the same document**

In the diff handler, replace:

<!-- prettier-ignore -->
```ts
      if (!version1 || !version2) {
        return res.status(404).json({ error: 'Version not found' });
      }
```

with:

<!-- prettier-ignore -->
```ts
      // The other version must be of the same document (so in the same organization); any
      // other version is treated as not found
      if (!version1 || !version2 || version2.documentId !== version1.documentId) {
        return res.status(404).json({ error: 'Version not found' });
      }
```

- [ ] **Step 5: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.versionsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 11 in `versions.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/bylawyer/routes/versions.ts src/__integration__/versions.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): limit versions to their organization's members

Reading needs viewer and editing secretary. A diff compares only two
versions of the same document."
```

---

### Task 8: Sections

**Rules (`src/bylawyer/routes/sections.ts`, mounted at `/api`):**

| Route                                       | Rule                                           | Notes                                                         |
| ------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `GET /versions/:versionId/sections`         | viewer, `fromParam('versionId', orgOfVersion)` |                                                               |
| `PUT /versions/:versionId/sections/reorder` | secretary, same                                | Already answers 400 for a section not in this version         |
| `POST /versions/:versionId/sections`        | secretary, same                                | Already answers 400 for a parent not in this version          |
| `GET /sections/:id`                         | viewer, `fromParam('id', orgOfSection)`        |                                                               |
| `PUT /sections/:id`                         | secretary, same                                | Already answers 400 for a parent not in the section's version |
| `DELETE /sections/:id`                      | secretary, same                                |                                                               |
| `POST /sections/:id/children`               | secretary, same                                |                                                               |
| `GET /sections/:id/path`                    | viewer, same                                   | Walks parents, which are always in the same version           |

The section routes that take a second section already require it to be in the same version, so another organization's section is refused there; the tests below pin that down.

**Files:**

- Modify: `src/bylawyer/routes/sections.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/sections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/sections.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('section rules', [
  {
    method: 'get',
    route: '/versions/:versionId/sections',
    path: (f) => `/api/versions/${f.v2}/sections`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/versions/:versionId/sections/reorder',
    path: (f) => `/api/versions/${f.v2}/sections/reorder`,
    body: (f) => [{ id: f.section, position: 0 }],
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/versions/:versionId/sections',
    path: (f) => `/api/versions/${f.v2}/sections`,
    body: () => ({ numberLabel: '2', title: 'Purpose' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/sections/:id',
    path: (f) => `/api/sections/${f.section}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/sections/:id',
    path: (f) => `/api/sections/${f.section}`,
    body: () => ({ title: 'Name and seal' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/sections/:id',
    path: (f) => `/api/sections/${f.child}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'post',
    route: '/sections/:id/children',
    path: (f) => `/api/sections/${f.section}/children`,
    body: () => ({ numberLabel: '1.2', content: 'The seal is round.' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/sections/:id/path',
    path: (f) => `/api/sections/${f.child}/path`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('sections from another organization', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('cannot be reordered through this version', async () => {
    const res = await call('put', `/api/versions/${f.v2}/sections/reorder`, {
      cookie: f.users.secretary.cookie,
      body: [
        { id: f.section, position: 1 },
        { id: f.sectionB, position: 5 },
      ],
    });
    expect(res.status).toBe(400);
    const sectionB = await prisma.section.findUniqueOrThrow({ where: { id: f.sectionB } });
    expect(sectionB.position).toBe(0);
  });

  it('cannot become a parent here', async () => {
    const created = await call('post', `/api/versions/${f.v2}/sections`, {
      cookie: f.users.secretary.cookie,
      body: { title: 'Stray', parentId: f.sectionB },
    });
    expect(created.status).toBe(400);
    const moved = await call('put', `/api/sections/${f.child}`, {
      cookie: f.users.secretary.cookie,
      body: { parentId: f.sectionB },
    });
    expect(moved.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/sections.test.ts`
Expected: the rule cases FAIL (the outsider gets 200, 201 or 204); the two cross-organization tests already pass.

- [ ] **Step 3: Put the rules on the routes**

In `src/bylawyer/routes/sections.ts`, add the imports:

```ts
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfSection, orgOfVersion } from '../../orgs/resolvers.js';
```

and after `export const sectionsRouter: RouterType = Router();`:

```ts
const byVersion = fromParam('versionId', orgOfVersion);
const bySection = fromParam('id', orgOfSection);
```

Add each rule directly after the route's `validate(...)` argument; the route heads become:

```ts
sectionsRouter.get(
  '/versions/:versionId/sections',
  validate({ params: versionIdParam }),
  requireRole('viewer', byVersion),
  async (req, res) => {

sectionsRouter.put(
  '/versions/:versionId/sections/reorder',
  validate({ params: versionIdParam, body: reorderSectionsBody }),
  requireRole('secretary', byVersion),
  async (req, res) => {

sectionsRouter.post(
  '/versions/:versionId/sections',
  validate({ params: versionIdParam, body: createSectionBody }),
  requireRole('secretary', byVersion),
  async (req, res) => {

sectionsRouter.get(
  '/sections/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', bySection),
  async (req, res) => {

sectionsRouter.put(
  '/sections/:id',
  validate({ params: uuidParam, body: updateSectionBody }),
  requireRole('secretary', bySection),
  async (req, res) => {

sectionsRouter.delete(
  '/sections/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', bySection),
  async (req, res) => {

sectionsRouter.post(
  '/sections/:id/children',
  validate({ params: uuidParam, body: createSectionBody }),
  requireRole('secretary', bySection),
  async (req, res) => {

sectionsRouter.get(
  '/sections/:id/path',
  validate({ params: uuidParam }),
  requireRole('viewer', bySection),
  async (req, res) => {
```

The handlers don't change.

- [ ] **Step 4: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.sectionsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 10 in `sections.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/bylawyer/routes/sections.ts src/__integration__/sections.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): limit sections to their organization's members"
```

---

### Task 9: Amendments

**Rules (`src/bylawyer/routes/amendments.ts`, mounted at `/api`):**

| Route                               | Rule                                            | Notes                                                                                                                    |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /documents/:docId/amendments`  | viewer, `fromParam('docId', orgOfDocument)`     |                                                                                                                          |
| `POST /documents/:docId/amendments` | member, same                                    | Records `createdById`                                                                                                    |
| `GET /amendments/:id`               | viewer, `fromParam('id', orgOfAmendment)`       |                                                                                                                          |
| `PUT /amendments/:id`               | member, same                                    | Then `canEditAmendment`: a member's own draft, or secretary; else 403 secretary                                          |
| `DELETE /amendments/:id`            | member, same                                    | Same                                                                                                                     |
| `POST /amendments/:id/propose`      | secretary, same                                 |                                                                                                                          |
| `POST /amendments/:id/withdraw`     | secretary, same                                 |                                                                                                                          |
| `POST /amendments/:id/pass`         | secretary, same                                 |                                                                                                                          |
| `POST /amendments/:id/fail`         | secretary, same                                 |                                                                                                                          |
| `POST /amendments/:id/table`        | secretary, same                                 |                                                                                                                          |
| `POST /amendments/:id/untable`      | secretary, same                                 |                                                                                                                          |
| `GET /amendments/:id/changes`       | viewer, same                                    |                                                                                                                          |
| `POST /amendments/:id/changes`      | member, same                                    | `canEditAmendment`; `targetSectionId` and `parentSectionId` must be sections of the document's current version, else 404 |
| `DELETE /changes/:id`               | member, `fromParam('id', orgOfAmendmentChange)` | `canEditAmendment` on the change's amendment                                                                             |
| `DELETE /amendment-changes/:id`     | member, same                                    | Same                                                                                                                     |
| `POST /amendments/:id/apply`        | secretary, `fromParam('id', orgOfAmendment)`    |                                                                                                                          |
| `GET /amendments/:id/preview`       | viewer, same                                    |                                                                                                                          |

`GET /amendments/:id/votes` is in the meetings router (Task 10). The ownership check runs before the existing status checks, so a member gets 403 for anything but their own draft, and a secretary still gets the existing 400 for an amendment that is no longer a draft. `parentSectionId` is accepted by the change schema but has never been stored; it is checked anyway, as the design asks, and still not stored.

**Files:**

- Modify: `src/bylawyer/routes/amendments.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/amendments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/amendments.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('amendment rules', [
  {
    method: 'get',
    route: '/documents/:docId/amendments',
    path: (f) => `/api/documents/${f.doc}/amendments`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/amendments',
    path: (f) => `/api/documents/${f.doc}/amendments`,
    body: () => ({ title: 'Raise dues' }),
    min: 'member',
    ok: 201,
  },
  {
    method: 'get',
    route: '/amendments/:id',
    path: (f) => `/api/amendments/${f.draft}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/amendments/:id',
    path: (f) => `/api/amendments/${f.draft}`,
    body: () => ({ title: 'Lower dues' }),
    min: 'member',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/amendments/:id',
    path: (f) => `/api/amendments/${f.draft}`,
    min: 'member',
    ok: 204,
  },
  {
    method: 'post',
    route: '/amendments/:id/propose',
    path: (f) => `/api/amendments/${f.draft}/propose`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/withdraw',
    path: (f) => `/api/amendments/${f.proposed}/withdraw`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/pass',
    path: (f) => `/api/amendments/${f.proposed}/pass`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/fail',
    path: (f) => `/api/amendments/${f.proposed}/fail`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/table',
    path: (f) => `/api/amendments/${f.proposed}/table`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/untable',
    path: (f) => `/api/amendments/${f.tabled}/untable`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'get',
    route: '/amendments/:id/changes',
    path: (f) => `/api/amendments/${f.draft}/changes`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/changes',
    path: (f) => `/api/amendments/${f.draft}/changes`,
    body: (f) => ({
      changeType: 'modify',
      targetSectionId: f.child,
      newContent: 'The short name is A2.',
    }),
    min: 'member',
    ok: 201,
  },
  {
    method: 'delete',
    route: '/changes/:id',
    path: (f) => `/api/changes/${f.change}`,
    min: 'member',
    ok: 204,
  },
  {
    method: 'delete',
    route: '/amendment-changes/:id',
    path: (f) => `/api/amendment-changes/${f.change}`,
    min: 'member',
    ok: 204,
  },
  {
    method: 'post',
    route: '/amendments/:id/apply',
    path: (f) => `/api/amendments/${f.passed}/apply`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'get',
    route: '/amendments/:id/preview',
    path: (f) => `/api/amendments/${f.draft}/preview`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('amendment drafts', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const draftBy = (createdById: number | null) =>
    prisma.amendment.create({
      data: { documentId: f.doc, title: 'Another draft', createdById },
    });

  it('record who created them', async () => {
    const res = await call('post', `/api/documents/${f.doc}/amendments`, {
      cookie: f.users.member.cookie,
      body: { title: 'Raise dues' },
    });
    expect(res.status).toBe(201);
    expect(res.body.createdById).toBe(f.users.member.id);
  });

  it("can't be changed by a member who didn't create them", async () => {
    const other = await draftBy(f.users.secretary.id);
    const change = await prisma.amendmentChange.create({
      data: { amendmentId: other.id, changeType: 'delete', targetSectionId: f.child },
    });
    const cookie = f.users.member.cookie;
    const refusals = [
      await call('put', `/api/amendments/${other.id}`, { cookie, body: { title: 'Mine now' } }),
      await call('delete', `/api/amendments/${other.id}`, { cookie }),
      await call('post', `/api/amendments/${other.id}/changes`, {
        cookie,
        body: { changeType: 'delete', targetSectionId: f.section },
      }),
      await call('delete', `/api/changes/${change.id}`, { cookie }),
      await call('delete', `/api/amendment-changes/${change.id}`, { cookie }),
    ];
    for (const res of refusals) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'You need the secretary role for this' });
    }
    expect(await prisma.amendment.count({ where: { id: other.id } })).toBe(1);
  });

  it("can't be changed by their creator once proposed", async () => {
    await prisma.amendment.update({ where: { id: f.draft }, data: { status: 'proposed' } });
    const res = await call('put', `/api/amendments/${f.draft}`, {
      cookie: f.users.member.cookie,
      body: { title: 'Too late' },
    });
    expect(res.status).toBe(403);
  });

  it('without a recorded creator can be changed only by a secretary', async () => {
    const old = await draftBy(null);
    const member = await call('put', `/api/amendments/${old.id}`, {
      cookie: f.users.member.cookie,
      body: { title: 'x' },
    });
    expect(member.status).toBe(403);
    const secretary = await call('put', `/api/amendments/${old.id}`, {
      cookie: f.users.secretary.cookie,
      body: { title: 'x' },
    });
    expect(secretary.status).toBe(200);
  });

  it('can be edited by a secretary, whoever created them', async () => {
    const res = await call('put', `/api/amendments/${f.draft}`, {
      cookie: f.users.secretary.cookie,
      body: { title: 'Edited by the secretary' },
    });
    expect(res.status).toBe(200);
  });
});

describe('amendment changes', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const addChange = (body: object) =>
    call('post', `/api/amendments/${f.draft}/changes`, {
      cookie: f.users.member.cookie,
      body: { changeType: 'add', newContent: 'New text', ...body },
    });

  it("must name sections of the document's current version", async () => {
    for (const body of [
      { targetSectionId: f.sectionB },
      { targetSectionId: f.oldSection },
      { parentSectionId: f.sectionB },
    ]) {
      const res = await addChange(body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Section not found' });
    }
    expect(await prisma.amendmentChange.count({ where: { amendmentId: f.draft } })).toBe(1);
  });

  it('may name no section, or sections of the current version', async () => {
    expect((await addChange({})).status).toBe(201);
    expect(
      (await addChange({ targetSectionId: f.section, parentSectionId: f.section })).status,
    ).toBe(201);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/amendments.test.ts`
Expected: FAIL. The rule cases answer the outsider; `createdById` is null; members change others' drafts; the cross-version sections are accepted.

- [ ] **Step 3: Put the rules on the routes**

In `src/bylawyer/routes/amendments.ts`, add the imports:

```ts
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfAmendment, orgOfAmendmentChange, orgOfDocument } from '../../orgs/resolvers.js';
import { canEditAmendment, roleNeeded } from '../../orgs/roles.js';
```

and after `export const amendmentsRouter: RouterType = Router();`:

```ts
const byDocument = fromParam('docId', orgOfDocument);
const byAmendment = fromParam('id', orgOfAmendment);
const byChange = fromParam('id', orgOfAmendmentChange);
const NEEDS_SECRETARY = roleNeeded('secretary');
```

Add each rule directly after the route's `validate(...)` argument; the route heads become:

```ts
amendmentsRouter.get(
  '/documents/:docId/amendments',
  validate({ params: docIdParam }),
  requireRole('viewer', byDocument),
  async (req, res) => {

amendmentsRouter.post(
  '/documents/:docId/amendments',
  validate({ params: docIdParam, body: createAmendmentBody }),
  requireRole('member', byDocument),
  async (req, res) => {

amendmentsRouter.get(
  '/amendments/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byAmendment),
  async (req, res) => {

amendmentsRouter.put(
  '/amendments/:id',
  validate({ params: uuidParam, body: updateAmendmentBody }),
  requireRole('member', byAmendment),
  async (req, res) => {

amendmentsRouter.delete(
  '/amendments/:id',
  validate({ params: uuidParam }),
  requireRole('member', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/propose',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/withdraw',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/pass',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/fail',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/table',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/untable',
  validate({ params: uuidParam }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.get(
  '/amendments/:id/changes',
  validate({ params: uuidParam }),
  requireRole('viewer', byAmendment),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/changes',
  validate({ params: uuidParam, body: createAmendmentChangeBody }),
  requireRole('member', byAmendment),
  async (req, res) => {

amendmentsRouter.delete(
  '/changes/:id',
  validate({ params: uuidParam }),
  requireRole('member', byChange),
  async (req, res) => {

amendmentsRouter.delete(
  '/amendment-changes/:id',
  validate({ params: uuidParam }),
  requireRole('member', byChange),
  async (req, res) => {

amendmentsRouter.post(
  '/amendments/:id/apply',
  validate({ params: uuidParam, query: applyAmendmentQuery }),
  requireRole('secretary', byAmendment),
  async (req, res) => {

amendmentsRouter.get(
  '/amendments/:id/preview',
  validate({ params: uuidParam }),
  requireRole('viewer', byAmendment),
  async (req, res) => {
```

- [ ] **Step 4: Record the creator**

In `POST /documents/:docId/amendments`, replace:

<!-- prettier-ignore -->
```ts
        data: {
          documentId: req.params.docId,
          title: req.body.title,
          description: req.body.description,
        },
```

with:

<!-- prettier-ignore -->
```ts
        data: {
          documentId: req.params.docId,
          title: req.body.title,
          description: req.body.description,
          createdById: req.user!.id,
        },
```

- [ ] **Step 5: Let members change only their own drafts**

In `PUT /amendments/:id`, replace:

<!-- prettier-ignore -->
```ts
      if (amendment.status !== 'draft') {
        return res.status(400).json({ error: 'Can only update draft amendments' });
      }
```

with:

<!-- prettier-ignore -->
```ts
      if (!canEditAmendment(req.org!.role, req.user!.id, amendment)) {
        return res.status(403).json({ error: NEEDS_SECRETARY });
      }

      if (amendment.status !== 'draft') {
        return res.status(400).json({ error: 'Can only update draft amendments' });
      }
```

In `DELETE /amendments/:id`, replace:

<!-- prettier-ignore -->
```ts
    if (amendment.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft amendments' });
    }
```

with:

<!-- prettier-ignore -->
```ts
    if (!canEditAmendment(req.org!.role, req.user!.id, amendment)) {
      return res.status(403).json({ error: NEEDS_SECRETARY });
    }

    if (amendment.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft amendments' });
    }
```

In both `DELETE /changes/:id` and `DELETE /amendment-changes/:id`, replace:

<!-- prettier-ignore -->
```ts
    if (amendment?.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft amendments' });
    }
```

with:

<!-- prettier-ignore -->
```ts
    if (amendment && !canEditAmendment(req.org!.role, req.user!.id, amendment)) {
      return res.status(403).json({ error: NEEDS_SECRETARY });
    }

    if (amendment?.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft amendments' });
    }
```

(the second route is indented two spaces more; keep its indentation).

- [ ] **Step 6: Check a new change's sections**

In `POST /amendments/:id/changes`, replace:

<!-- prettier-ignore -->
```ts
      if (amendment.status !== 'draft') {
        return res.status(400).json({ error: 'Can only add changes to draft amendments' });
      }
```

with:

<!-- prettier-ignore -->
```ts
      if (!canEditAmendment(req.org!.role, req.user!.id, amendment)) {
        return res.status(403).json({ error: NEEDS_SECRETARY });
      }

      if (amendment.status !== 'draft') {
        return res.status(400).json({ error: 'Can only add changes to draft amendments' });
      }

      // The sections a change names must be in the document's current version, so in this
      // organization. parentSectionId is checked too, though only targetSectionId is stored.
      const sectionIds = [
        req.body.target_section_id || req.body.targetSectionId,
        req.body.parent_section_id || req.body.parentSectionId,
      ].filter((id): id is string => Boolean(id));
      if (sectionIds.length > 0) {
        const document = await prisma.document.findUnique({
          where: { id: amendment.documentId },
          select: { currentVersionId: true },
        });
        const found = document?.currentVersionId
          ? await prisma.section.count({
              where: { id: { in: sectionIds }, versionId: document.currentVersionId },
            })
          : 0;
        if (found !== new Set(sectionIds).size) {
          return res.status(404).json({ error: 'Section not found' });
        }
      }
```

- [ ] **Step 7: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.amendmentsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 8: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 24 in `amendments.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/bylawyer/routes/amendments.ts src/__integration__/amendments.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): let members draft amendments, and secretaries decide them

Amendments record who created them. A member can create drafts and edit,
add changes to or delete their own; everything else needs secretary. A
change can only name sections of the document's current version."
```

---

### Task 10: Meetings and votes

**Rules (`src/bylawyer/routes/meetings.ts`, mounted at `/api`):**

| Route                                 | Rule                                            | Notes                                                         |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `GET /organizations/:orgId/meetings`  | viewer, `fromParam('orgId', orgOfOrganization)` |                                                               |
| `POST /organizations/:orgId/meetings` | secretary, same                                 |                                                               |
| `GET /meetings/:id`                   | viewer, `fromParam('id', orgOfMeeting)`         |                                                               |
| `PUT /meetings/:id`                   | secretary, same                                 |                                                               |
| `DELETE /meetings/:id`                | secretary, same                                 |                                                               |
| `POST /meetings/:id/votes`            | secretary, same                                 | The amendment must be in the meeting's organization, else 404 |
| `GET /meetings/:id/votes`             | viewer, same                                    |                                                               |
| `GET /votes/:id`                      | viewer, `fromParam('id', orgOfVote)`            |                                                               |
| `DELETE /votes/:id`                   | secretary, same                                 |                                                               |
| `GET /amendments/:id/votes`           | viewer, `fromParam('id', orgOfAmendment)`       |                                                               |

**Files:**

- Modify: `src/bylawyer/routes/meetings.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/meetings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/meetings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('meeting rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/meetings',
    path: (f) => `/api/organizations/${f.orgA.id}/meetings`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:orgId/meetings',
    path: (f) => `/api/organizations/${f.orgA.id}/meetings`,
    body: () => ({ title: 'Annual meeting', scheduledDate: '2026-11-01' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/meetings/:id',
    path: (f) => `/api/meetings/${f.meeting}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/meetings/:id',
    path: (f) => `/api/meetings/${f.meeting}`,
    body: () => ({ location: 'Library' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/meetings/:id',
    path: (f) => `/api/meetings/${f.meeting}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'post',
    route: '/meetings/:id/votes',
    path: (f) => `/api/meetings/${f.meeting}/votes`,
    body: (f) => ({ amendmentId: f.proposed, yeaCount: 4, nayCount: 1 }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/meetings/:id/votes',
    path: (f) => `/api/meetings/${f.meeting}/votes`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/votes/:id',
    path: (f) => `/api/votes/${f.vote}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/votes/:id',
    path: (f) => `/api/votes/${f.vote}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/amendments/:id/votes',
    path: (f) => `/api/amendments/${f.passed}/votes`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('recording a vote', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('refuses an amendment from another organization', async () => {
    const res = await call('post', `/api/meetings/${f.meeting}/votes`, {
      cookie: f.users.secretary.cookie,
      body: { amendmentId: f.proposedB, yeaCount: 9, nayCount: 0 },
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Amendment not found' });
    const amendment = await prisma.amendment.findUniqueOrThrow({ where: { id: f.proposedB } });
    expect(amendment.status).toBe('proposed');
    expect(await prisma.vote.count({ where: { amendmentId: f.proposedB } })).toBe(0);
  });

  it('refuses a vote without an amendment', async () => {
    const res = await call('post', `/api/meetings/${f.meeting}/votes`, {
      cookie: f.users.secretary.cookie,
      body: { yeaCount: 1 },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/meetings.test.ts`
Expected: FAIL. The rule cases answer the outsider; the vote on B's amendment is recorded (201); the vote without an amendment is a 500.

- [ ] **Step 3: Put the rules on the routes**

In `src/bylawyer/routes/meetings.ts`, add the imports:

```ts
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import {
  orgOfAmendment,
  orgOfMeeting,
  orgOfOrganization,
  orgOfVote,
} from '../../orgs/resolvers.js';
```

and after `export const meetingsRouter: RouterType = Router();`:

```ts
const byOrganization = fromParam('orgId', orgOfOrganization);
const byMeeting = fromParam('id', orgOfMeeting);
const byVote = fromParam('id', orgOfVote);
const byAmendment = fromParam('id', orgOfAmendment);
```

Add each rule directly after the route's `validate(...)` argument; the route heads become:

```ts
meetingsRouter.get(
  '/organizations/:orgId/meetings',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
  async (req, res) => {

meetingsRouter.post(
  '/organizations/:orgId/meetings',
  validate({ params: orgIdParam, body: createMeetingBody }),
  requireRole('secretary', byOrganization),
  async (req, res) => {

meetingsRouter.get(
  '/meetings/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byMeeting),
  async (req, res) => {

meetingsRouter.put(
  '/meetings/:id',
  validate({ params: uuidParam, body: updateMeetingBody }),
  requireRole('secretary', byMeeting),
  async (req, res) => {

meetingsRouter.delete(
  '/meetings/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byMeeting),
  async (req, res) => {

meetingsRouter.post(
  '/meetings/:id/votes',
  validate({ params: uuidParam, body: createVoteBody }),
  requireRole('secretary', byMeeting),
  async (req, res) => {

meetingsRouter.get(
  '/votes/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byVote),
  async (req, res) => {

meetingsRouter.delete(
  '/votes/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byVote),
  async (req, res) => {

meetingsRouter.get(
  '/meetings/:id/votes',
  validate({ params: uuidParam }),
  requireRole('viewer', byMeeting),
  async (req, res) => {

meetingsRouter.get(
  '/amendments/:id/votes',
  validate({ params: uuidParam }),
  requireRole('viewer', byAmendment),
  async (req, res) => {
```

- [ ] **Step 4: Vote only on the meeting's organization's amendments**

In `POST /meetings/:id/votes`, replace:

<!-- prettier-ignore -->
```ts
      const amendmentId = req.body.amendment_id || req.body.amendmentId;
      const amendment = await prisma.amendment.findUnique({
        where: { id: amendmentId },
      });
```

with:

<!-- prettier-ignore -->
```ts
      const amendmentId = req.body.amendment_id || req.body.amendmentId;
      // The amendment must be in the meeting's organization; another organization's is not found
      const amendment = amendmentId
        ? await prisma.amendment.findFirst({
            where: { id: amendmentId, document: { organizationId: req.org!.id } },
          })
        : null;
```

- [ ] **Step 5: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.meetingsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 6: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 12 in `meetings.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/bylawyer/routes/meetings.ts src/__integration__/meetings.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): limit meeting records and votes to their organization

Reading needs viewer and recording secretary. A vote can only be on an
amendment of the meeting's organization."
```

---

### Task 11: Meeting packets

**Rules (`src/bylawyer/routes/packets.ts`, mounted at `/api`):**

| Route                                | Rule                                               | Notes                                          |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------- |
| `POST /organizations/:orgId/packets` | secretary, `fromParam('orgId', orgOfOrganization)` | New. 409 "That meeting code is already in use" |
| `GET /packets/:robbieCode`           | viewer, `fromParam('robbieCode', orgOfPacketCode)` | 404 when there is no packet (Task 1)           |
| `PUT /packets/:id`                   | secretary, `fromParam('id', orgOfPacket)`          |                                                |
| `DELETE /packets/:id`                | secretary, same                                    |                                                |
| `GET /packets/:id/summary`           | viewer, same                                       |                                                |

`POST /packets` was removed in Task 1.

**Files:**

- Modify: `src/bylawyer/routes/packets.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/packets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/packets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('packet rules', [
  {
    method: 'post',
    route: '/organizations/:orgId/packets',
    path: (f) => `/api/organizations/${f.orgA.id}/packets`,
    body: () => ({ robbieCode: 'NEW001', title: 'November meeting' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/packets/:robbieCode',
    path: (f) => `/api/packets/${f.packet.code}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/packets/:id',
    path: (f) => `/api/packets/${f.packet.id}`,
    body: () => ({ title: 'Annual meeting' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/packets/:id',
    path: (f) => `/api/packets/${f.packet.id}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'get',
    route: '/packets/:id/summary',
    path: (f) => `/api/packets/${f.packet.id}/summary`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('packets', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('are created in an organization', async () => {
    const res = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie: f.users.secretary.cookie,
      body: { robbieCode: 'NEW001', scheduledFor: '2026-11-05' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      robbieCode: 'NEW001',
      organizationId: f.orgA.id,
      agendaItems: [],
      attachments: [],
    });
  });

  it('need an unused meeting code', async () => {
    for (const robbieCode of [f.packet.code, f.packetB.code]) {
      const res = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
        cookie: f.users.secretary.cookie,
        body: { robbieCode },
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'That meeting code is already in use' });
    }
    const packetB = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packetB.id } });
    expect(packetB.organizationId).toBe(f.orgB.id);
  });

  it('are not created by reading a code', async () => {
    const res = await call('get', '/api/packets/NOPE01', { cookie: f.users.owner.cookie });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
    expect(await prisma.meetingPacket.count({ where: { robbieCode: 'NOPE01' } })).toBe(0);
  });

  it('are no longer created without an organization', async () => {
    const res = await call('post', '/api/packets', {
      cookie: f.users.owner.cookie,
      body: { robbieCode: 'NEW002' },
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/packets.test.ts`
Expected: FAIL. `POST /api/organizations/:orgId/packets` answers 404 (no such route) and the other rule cases answer the outsider.

- [ ] **Step 3: Add the route and the rules**

In `src/bylawyer/routes/packets.ts`, replace the imports with:

```ts
import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { createPacketBody, robbieCodeParam, updatePacketBody } from '../../schemas/packets.js';
import { orgIdParam, uuidParam } from '../../schemas/common.js';
import { logger } from '../../middleware/logger.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfOrganization, orgOfPacket, orgOfPacketCode } from '../../orgs/resolvers.js';
```

After `export const packetsRouter: RouterType = Router();`, add:

```ts
/** The answer when a meeting code already has a packet, in any organization */
export const CODE_IN_USE = 'That meeting code is already in use';

const byPacket = fromParam('id', orgOfPacket);
```

After the `GET /packets/:robbieCode` route, add:

```ts
/**
 * POST /api/organizations/:orgId/packets
 * Create the packet for a meeting code in an organization. Codes are unique across all
 * organizations.
 * Body: { robbieCode, title?, description?, scheduledFor? }
 */
packetsRouter.post(
  '/organizations/:orgId/packets',
  validate({ params: orgIdParam, body: createPacketBody }),
  requireRole('secretary', fromParam('orgId', orgOfOrganization)),
  async (req, res) => {
    try {
      const { robbieCode, title, description, scheduledFor } = req.body;

      const packet = await prisma.meetingPacket.create({
        data: {
          organizationId: req.org!.id,
          robbieCode,
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        },
        include: packetInclude,
      });

      res.status(201).json(packet);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: CODE_IN_USE });
      }
      logger.error({ err: error }, 'Error creating packet');
      res.status(500).json({ error: 'Failed to create meeting packet' });
    }
  },
);
```

Add each rule directly after the route's `validate(...)` argument; the existing route heads become:

```ts
packetsRouter.get(
  '/packets/:robbieCode',
  validate({ params: robbieCodeParam }),
  requireRole('viewer', fromParam('robbieCode', orgOfPacketCode)),
  async (req, res) => {

packetsRouter.put(
  '/packets/:id',
  validate({ params: uuidParam, body: updatePacketBody }),
  requireRole('secretary', byPacket),
  async (req, res) => {

packetsRouter.delete(
  '/packets/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byPacket),
  async (req, res) => {

packetsRouter.get(
  '/packets/:id/summary',
  validate({ params: uuidParam }),
  requireRole('viewer', byPacket),
  async (req, res) => {
```

- [ ] **Step 4: Check this router in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the line `routes.packetsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 9 in `packets.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/bylawyer/routes/packets.ts src/__integration__/packets.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): create meeting packets under an organization

POST /api/organizations/:orgId/packets (secretary) claims an unused
meeting code; reading a packet needs viewer in its organization."
```

---

### Task 12: Agenda items and attachments

**Rules (`src/bylawyer/routes/agenda-items.ts`, mounted at `/api`):**

| Route                            | Rule                                           | Notes                                              |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `GET /packets/:packetId/agenda`  | viewer, `fromParam('packetId', orgOfPacket)`   |                                                    |
| `POST /packets/:packetId/agenda` | secretary, same                                |                                                    |
| `GET /agenda-items/:id`          | viewer, `fromParam('id', orgOfAgendaItem)`     |                                                    |
| `PUT /agenda-items/reorder`      | secretary, through the first of `itemIds`      | Every item must be in that item's packet, else 400 |
| `PUT /agenda-items/:id`          | secretary, `fromParam('id', orgOfAgendaItem)`  |                                                    |
| `DELETE /agenda-items/:id`       | secretary, same                                |                                                    |
| `POST /agenda-items/bulk`        | secretary, `fromBody('packetId', orgOfPacket)` |                                                    |

**Rules (`src/bylawyer/routes/attachments.ts`, mounted at `/api`):**

| Route                             | Rule                                                                   | Notes                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /attachments/upload`        | secretary, through the `packetId` query parameter, else `agendaItemId` | No `validate`: the body is the raw file                                |
| `POST /attachments/link-document` | secretary, through body `packetId`, else `agendaItemId`                | The document must be in the packet's organization, else 404            |
| `GET /attachments/:id`            | viewer, `fromParam('id', orgOfAttachment)`                             |                                                                        |
| `GET /attachments/:id/download`   | viewer, same                                                           |                                                                        |
| `PUT /attachments/reorder`        | secretary, through the first of `attachmentIds`                        | Every attachment must share that one's packet or agenda item, else 400 |
| `PUT /attachments/:id`            | secretary, `fromParam('id', orgOfAttachment)`                          |                                                                        |
| `DELETE /attachments/:id`         | secretary, same                                                        |                                                                        |

An upload or link names a packet, or without one an agenda item; the resolver uses the same order as the handler, so the rule always checks the resource the handler writes to. An upload with neither now gets 404 from the rule (it got 400 before).

**Files:**

- Modify: `src/bylawyer/routes/agenda-items.ts`, `src/bylawyer/routes/attachments.ts`, `src/__integration__/routeCoverage.test.ts`
- Test: `src/__integration__/agenda.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__integration__/agenda.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('agenda item rules', [
  {
    method: 'get',
    route: '/packets/:packetId/agenda',
    path: (f) => `/api/packets/${f.packet.id}/agenda`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/packets/:packetId/agenda',
    path: (f) => `/api/packets/${f.packet.id}/agenda`,
    body: () => ({ title: 'Budget' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/agenda-items/:id',
    path: (f) => `/api/agenda-items/${f.item}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/agenda-items/reorder',
    path: () => '/api/agenda-items/reorder',
    body: (f) => ({ itemIds: [f.item2, f.item] }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'put',
    route: '/agenda-items/:id',
    path: (f) => `/api/agenda-items/${f.item}`,
    body: () => ({ title: 'Reports and budget' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/agenda-items/:id',
    path: (f) => `/api/agenda-items/${f.item}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'post',
    route: '/agenda-items/bulk',
    path: () => '/api/agenda-items/bulk',
    body: (f) => ({ packetId: f.packet.id, items: [{ title: 'Elections' }] }),
    min: 'secretary',
    ok: 201,
  },
]);

describeRules('attachment rules', [
  {
    method: 'post',
    route: '/attachments/upload',
    path: (f) => `/api/attachments/upload?packetId=${f.packet.id}`,
    headers: (f) => ({
      'Content-Type': 'text/plain',
      'X-Filename': 'notes.txt',
      'X-Robbie-Code': f.packet.code,
    }),
    body: () => Buffer.from('Notes'),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'post',
    route: '/attachments/link-document',
    path: () => '/api/attachments/link-document',
    body: (f) => ({ documentId: f.doc, packetId: f.packet.id }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/attachments/:id',
    path: (f) => `/api/attachments/${f.upload}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/attachments/:id/download',
    path: (f) => `/api/attachments/${f.upload}/download`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/attachments/reorder',
    path: () => '/api/attachments/reorder',
    body: (f) => ({ attachmentIds: [f.linked, f.upload] }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'put',
    route: '/attachments/:id',
    path: (f) => `/api/attachments/${f.upload}`,
    body: () => ({ displayName: 'Approved minutes' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/attachments/:id',
    path: (f) => `/api/attachments/${f.upload}`,
    min: 'secretary',
    ok: 204,
  },
]);

describe('agenda items and attachments across packets', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const reorderItems = (itemIds: string[]) =>
    call('put', '/api/agenda-items/reorder', {
      cookie: f.users.secretary.cookie,
      body: { itemIds },
    });

  it('reorder agenda items only within one packet', async () => {
    const elsewhere = await prisma.meetingAgendaItem.create({
      data: { packetId: f.emptyPacket.id, title: 'Elsewhere', position: 4 },
    });
    expect((await reorderItems([f.item, elsewhere.id])).status).toBe(400);

    const crossOrg = await reorderItems([f.item, f.itemB]);
    expect(crossOrg.status).toBe(400);
    expect(crossOrg.body).toEqual({ error: 'Every item must be in the same packet' });
    const itemB = await prisma.meetingAgendaItem.findUniqueOrThrow({ where: { id: f.itemB } });
    expect(itemB.position).toBe(0);

    // Led by another organization's item, the rule refuses it outright
    expect((await reorderItems([f.itemB, f.item])).status).toBe(404);
  });

  it("don't add items to another organization's packet", async () => {
    const res = await call('post', '/api/agenda-items/bulk', {
      cookie: f.users.secretary.cookie,
      body: { packetId: f.packetB.id, items: [{ title: 'Sneaky' }] },
    });
    expect(res.status).toBe(404);
    expect(await prisma.meetingAgendaItem.count({ where: { packetId: f.packetB.id } })).toBe(1);
  });

  it("don't link another organization's document", async () => {
    const res = await call('post', '/api/attachments/link-document', {
      cookie: f.users.secretary.cookie,
      body: { documentId: f.docB, packetId: f.packet.id },
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Document not found' });
    expect(await prisma.attachment.count({ where: { documentId: f.docB } })).toBe(0);
  });

  it("don't upload to another organization's agenda item", async () => {
    const res = await call('post', `/api/attachments/upload?agendaItemId=${f.itemB}`, {
      cookie: f.users.secretary.cookie,
      headers: {
        'Content-Type': 'text/plain',
        'X-Filename': 'x.txt',
        'X-Robbie-Code': f.packetB.code,
      },
      body: Buffer.from('x'),
    });
    expect(res.status).toBe(404);
  });

  it('reorder attachments only within one packet or agenda item', async () => {
    const onItem = await prisma.attachment.create({
      data: {
        type: 'bylawyer_document',
        documentId: f.doc,
        displayName: 'On the item',
        agendaItemId: f.item,
      },
    });
    const res = await call('put', '/api/attachments/reorder', {
      cookie: f.users.secretary.cookie,
      body: { attachmentIds: [f.upload, onItem.id] },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Every attachment must be in the same packet or agenda item',
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/agenda.test.ts`
Expected: FAIL. The rule cases answer the outsider, and the cross-packet and cross-organization calls succeed.

- [ ] **Step 3: Put the rules on the agenda item routes**

In `src/bylawyer/routes/agenda-items.ts`, add the imports:

```ts
import { fromBody, fromParam, requireRole, type OrgResolver } from '../../orgs/requireRole.js';
import { orgOfAgendaItem, orgOfPacket } from '../../orgs/resolvers.js';
```

and after `export const agendaItemsRouter: RouterType = Router();`:

```ts
const byPacket = fromParam('packetId', orgOfPacket);
const byItem = fromParam('id', orgOfAgendaItem);

// A reorder is checked through its first item; the handler checks the rest share its packet
const byFirstItem: OrgResolver = async (req) => {
  const first = (req.body as { itemIds?: unknown[] } | undefined)?.itemIds?.[0];
  return typeof first === 'string' ? orgOfAgendaItem(first) : null;
};
```

Add each rule directly after the route's `validate(...)` argument; the route heads become:

```ts
agendaItemsRouter.get(
  '/packets/:packetId/agenda',
  validate({ params: z.object({ packetId: z.string().uuid() }) }),
  requireRole('viewer', byPacket),
  async (req, res) => {

agendaItemsRouter.post(
  '/packets/:packetId/agenda',
  validate({ params: z.object({ packetId: z.string().uuid() }), body: createAgendaItemBody }),
  requireRole('secretary', byPacket),
  async (req, res) => {

agendaItemsRouter.get(
  '/agenda-items/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byItem),
  async (req, res) => {

agendaItemsRouter.put(
  '/agenda-items/reorder',
  validate({ body: reorderAgendaItemsBody }),
  requireRole('secretary', byFirstItem),
  async (req, res) => {

agendaItemsRouter.put(
  '/agenda-items/:id',
  validate({ params: uuidParam, body: updateAgendaItemBody }),
  requireRole('secretary', byItem),
  async (req, res) => {

agendaItemsRouter.delete(
  '/agenda-items/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byItem),
  async (req, res) => {

agendaItemsRouter.post(
  '/agenda-items/bulk',
  validate({ body: bulkCreateAgendaItemsBody }),
  requireRole('secretary', fromBody('packetId', orgOfPacket)),
  async (req, res) => {
```

- [ ] **Step 4: Reorder agenda items within one packet**

In `PUT /agenda-items/reorder`, replace:

<!-- prettier-ignore -->
```ts
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'itemIds array required' });
      }
```

with:

<!-- prettier-ignore -->
```ts
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'itemIds array required' });
      }

      // Every item must be in one packet: the first item's, which the rule checked
      const items = await prisma.meetingAgendaItem.findMany({
        where: { id: { in: itemIds } },
        select: { packetId: true },
      });
      const packets = new Set(items.map((item) => item.packetId));
      if (items.length !== new Set(itemIds).size || packets.size !== 1) {
        return res.status(400).json({ error: 'Every item must be in the same packet' });
      }
```

- [ ] **Step 5: Put the rules on the attachment routes**

In `src/bylawyer/routes/attachments.ts`, change the first import to `import { Router, type Request, type Router as RouterType } from 'express';`, change `import { validate } from '../../middleware/validate.js';` to `import { validate, type RouteParams } from '../../middleware/validate.js';`, and add:

```ts
import { fromParam, requireRole, type OrgResolver } from '../../orgs/requireRole.js';
import { orgOfAgendaItem, orgOfAttachment, orgOfPacket } from '../../orgs/resolvers.js';
```

After `export const attachmentsRouter: RouterType = Router();`, add:

```ts
const byAttachment = fromParam('id', orgOfAttachment);

// An attachment goes on a packet or, without one, an agenda item: the handlers check them in
// the same order, so the rule checks the resource that is written to
function packetOrAgendaItem(read: (req: Request<RouteParams>) => unknown): OrgResolver {
  return async (req) => {
    const input = read(req) as { packetId?: unknown; agendaItemId?: unknown } | undefined;
    if (typeof input?.packetId === 'string' && input.packetId) {
      return orgOfPacket(input.packetId);
    }
    if (typeof input?.agendaItemId === 'string' && input.agendaItemId) {
      return orgOfAgendaItem(input.agendaItemId);
    }
    return null;
  };
}

// A reorder is checked through its first attachment; the handler checks the rest
const byFirstAttachment: OrgResolver = async (req) => {
  const first = (req.body as { attachmentIds?: unknown[] } | undefined)?.attachmentIds?.[0];
  return typeof first === 'string' ? orgOfAttachment(first) : null;
};
```

The route heads become:

```ts
attachmentsRouter.post(
  '/attachments/upload',
  requireRole('secretary', packetOrAgendaItem((req) => req.query)),
  async (req, res) => {

attachmentsRouter.post(
  '/attachments/link-document',
  validate({ body: linkDocumentBody }),
  requireRole('secretary', packetOrAgendaItem((req) => req.body)),
  async (req, res) => {

attachmentsRouter.get(
  '/attachments/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byAttachment),
  async (req, res) => {

attachmentsRouter.get(
  '/attachments/:id/download',
  validate({ params: uuidParam }),
  requireRole('viewer', byAttachment),
  async (req, res) => {

attachmentsRouter.put(
  '/attachments/reorder',
  validate({ body: reorderAttachmentsBody }),
  requireRole('secretary', byFirstAttachment),
  async (req, res) => {

attachmentsRouter.put(
  '/attachments/:id',
  validate({ params: uuidParam, body: updateAttachmentBody }),
  requireRole('secretary', byAttachment),
  async (req, res) => {

attachmentsRouter.delete(
  '/attachments/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byAttachment),
  async (req, res) => {
```

- [ ] **Step 6: Link only the organization's documents**

In `POST /attachments/link-document`, replace:

<!-- prettier-ignore -->
```ts
      // Verify document exists
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, title: true, docType: true },
      });
```

with:

<!-- prettier-ignore -->
```ts
      // The document must be in the packet's organization; another organization's is not found
      const document = await prisma.document.findFirst({
        where: { id: documentId, organizationId: req.org!.id },
        select: { id: true, title: true, docType: true },
      });
```

- [ ] **Step 7: Reorder attachments within one packet or agenda item**

In `PUT /attachments/reorder`, replace:

<!-- prettier-ignore -->
```ts
      if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
        return res.status(400).json({ error: 'attachmentIds array required' });
      }
```

with:

<!-- prettier-ignore -->
```ts
      if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
        return res.status(400).json({ error: 'attachmentIds array required' });
      }

      // Every attachment must share one parent: the first one's packet or agenda item, which
      // the rule checked
      const attachments = await prisma.attachment.findMany({
        where: { id: { in: attachmentIds } },
        select: { meetingPacketId: true, agendaItemId: true },
      });
      const parents = new Set(
        attachments.map((a) => `${a.meetingPacketId ?? ''}/${a.agendaItemId ?? ''}`),
      );
      if (attachments.length !== new Set(attachmentIds).size || parents.size !== 1) {
        return res
          .status(400)
          .json({ error: 'Every attachment must be in the same packet or agenda item' });
      }
```

- [ ] **Step 8: Check these routers in the route test**

In `src/__integration__/routeCoverage.test.ts`, delete the lines `routes.agendaItemsRouter,` and `routes.attachmentsRouter,` from `NOT_YET_RULED`.

- [ ] **Step 9: Run everything**

Run: `npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 19 in `agenda.test.ts`.

- [ ] **Step 10: Commit**

```bash
git add src/bylawyer/routes/agenda-items.ts src/bylawyer/routes/attachments.ts src/__integration__/agenda.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): limit agenda items and attachments to their organization

Reading needs viewer and editing secretary. Reorders stay within one
packet (or agenda item), and only the organization's documents can be
linked into its packets."
```

---

### Task 13: Live meetings: linking, the Bylawyer and Robbie routers, and the sync

A live meeting's organization is now its packet's. Linking creates the packet; the legacy `meetings.bylawyer_org_id` column is no longer written or read (M5 drops it). `POST /robbie/sync-motion` (unused; the socket layer syncs directly) and `GET /robbie/amendments` (every organization's data, no client) go.

**Rules (`src/bylawyer/bylawyerRouter.ts`, mounted at `/api/bylawyer`):**

| Route                                    | Rule                                                       | Notes                                                                            |
| ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /organizations`                     | `signedInOnly()`                                           | Only the user's organizations, each with `role`                                  |
| `GET /organizations/:orgId`              | viewer, `fromParam('orgId', orgOfOrganization)`            |                                                                                  |
| `GET /organizations/:orgId/documents`    | viewer, same                                               |                                                                                  |
| `POST /link-meeting`                     | secretary, `fromBody('organizationId', orgOfOrganization)` | Creates the packet if none; 200 if already this organization's; 409 if another's |
| `DELETE /link-meeting/:meetingCode`      | secretary, `fromParam('meetingCode', orgOfPacketCode)`     | Deletes the packet only if it has no agenda items or attachments, else 409       |
| `GET /meeting/:meetingCode/organization` | viewer, `fromParam('meetingCode', orgOfPacketCode)`        | An unlinked code is now 404 (was `{ linked: false }`)                            |
| `GET /documents/:docId/sections`         | viewer, `fromParam('docId', orgOfDocument)`                |                                                                                  |

**Rules (`src/bylawyer/routes/robbie.ts`, mounted at `/api/robbie`):**

| Route                                     | Rule                                                | Notes                                                                                           |
| ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /sync-motion`                       | Removed                                             |                                                                                                 |
| `GET /amendments`                         | Removed                                             |                                                                                                 |
| `GET /meetings/:amendmentId`              | viewer, `fromParam('amendmentId', orgOfAmendment)`  |                                                                                                 |
| `GET /sync-status/:meetingCode/:motionId` | viewer, `fromParam('meetingCode', orgOfPacketCode)` | Finds only the organization's amendments; an unlinked code is now 404 (was `{ synced: false }`) |

**Files:**

- Create: `src/schemas/bylawyer.ts`
- Modify: `src/bylawyer/bylawyerRouter.ts`, `src/bylawyer/routes/robbie.ts`, `src/schemas/robbie.ts`, `src/schemas/index.ts`, `src/bylawyer/bylawSyncService.ts`, `src/db/meetingStorage.ts`, `src/__integration__/routeCoverage.test.ts`
- Delete: `src/bylawyer/decisionDate.ts`, `src/__tests__/decisionDate.test.ts`
- Test: `src/__integration__/liveMeetings.test.ts`, `src/__integration__/bylawSync.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `src/__integration__/liveMeetings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('Bylawyer router rules', [
  {
    method: 'get',
    route: '/bylawyer/organizations/:orgId',
    path: (f) => `/api/bylawyer/organizations/${f.orgA.id}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/bylawyer/organizations/:orgId/documents',
    path: (f) => `/api/bylawyer/organizations/${f.orgA.id}/documents`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/bylawyer/link-meeting',
    path: () => '/api/bylawyer/link-meeting',
    body: (f) => ({ meetingCode: 'LIVE01', organizationId: f.orgA.id }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/bylawyer/link-meeting/:meetingCode',
    path: (f) => `/api/bylawyer/link-meeting/${f.emptyPacket.code}`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'get',
    route: '/bylawyer/meeting/:meetingCode/organization',
    path: (f) => `/api/bylawyer/meeting/${f.packet.code}/organization`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/bylawyer/documents/:docId/sections',
    path: (f) => `/api/bylawyer/documents/${f.doc}/sections`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/robbie/meetings/:amendmentId',
    path: (f) => `/api/robbie/meetings/${f.draft}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/robbie/sync-status/:meetingCode/:motionId',
    path: (f) => `/api/robbie/sync-status/${f.packet.code}/41`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('live meetings', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const link = (meetingCode: string, organizationId: string) =>
    call('post', '/api/bylawyer/link-meeting', {
      cookie: f.users.secretary.cookie,
      body: { meetingCode, organizationId },
    });

  it('are linked by giving the code a packet in the organization', async () => {
    const res = await link('LIVE01', f.orgA.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      meetingCode: 'LIVE01',
      organization: { id: f.orgA.id, name: 'Org A', slug: 'org-a' },
    });
    const packet = await prisma.meetingPacket.findUniqueOrThrow({
      where: { robbieCode: 'LIVE01' },
    });
    expect(packet.organizationId).toBe(f.orgA.id);

    // Linking again to the same organization is fine
    expect((await link('LIVE01', f.orgA.id)).status).toBe(200);
    const found = await call('get', '/api/bylawyer/meeting/LIVE01/organization', {
      cookie: f.users.viewer.cookie,
    });
    expect(found.body).toMatchObject({ linked: true, organization: { id: f.orgA.id } });
  });

  it("can't take a code that belongs to another organization", async () => {
    const res = await link(f.packetB.code, f.orgA.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'That meeting code is already in use' });
    const packetB = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packetB.id } });
    expect(packetB.organizationId).toBe(f.orgB.id);
  });

  it('keep a packet with an agenda or attachments when unlinked', async () => {
    const res = await call('delete', `/api/bylawyer/link-meeting/${f.packet.code}`, {
      cookie: f.users.secretary.cookie,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Remove the agenda and attachments first' });
    expect(await prisma.meetingPacket.count({ where: { id: f.packet.id } })).toBe(1);
  });

  it('that are not linked are not found', async () => {
    const res = await call('get', '/api/bylawyer/meeting/NOPE01/organization', {
      cookie: f.users.owner.cookie,
    });
    expect(res.status).toBe(404);
  });

  it("report the sync status of their own organization's amendments only", async () => {
    await prisma.amendment.create({
      data: {
        documentId: f.docB,
        title: 'Synced into B',
        status: 'passed',
        robbieMeetingCode: f.packet.code,
        robbieMotionId: 41,
      },
    });
    const path = `/api/robbie/sync-status/${f.packet.code}/41`;
    const cookie = f.users.viewer.cookie;
    expect((await call('get', path, { cookie })).body).toEqual({ synced: false });

    const own = await prisma.amendment.create({
      data: {
        documentId: f.doc,
        title: 'Synced into A',
        status: 'passed',
        robbieMeetingCode: f.packet.code,
        robbieMotionId: 42,
      },
    });
    const synced = await call('get', `/api/robbie/sync-status/${f.packet.code}/42`, { cookie });
    expect(synced.body).toEqual({
      synced: true,
      amendmentId: own.id,
      status: 'passed',
      applied: false,
    });
  });

  it("list only the user's organizations for the meeting screens", async () => {
    const res = await call('get', '/api/bylawyer/organizations', {
      cookie: f.users.secretary.cookie,
    });
    expect(res.body).toEqual([expect.objectContaining({ id: f.orgA.id, role: 'secretary' })]);
  });

  it('no longer sync motions or list synced amendments over HTTP', async () => {
    const cookie = f.users.owner.cookie;
    const sync = await call('post', '/api/robbie/sync-motion', {
      cookie,
      body: {
        meetingCode: f.packet.code,
        motionId: 1,
        passed: true,
        bylawAmendment: { documentId: f.doc, changeType: 'delete', targetSectionId: f.child },
      },
    });
    expect(sync.status).toBe(404);
    expect((await call('get', '/api/robbie/amendments', { cookie })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Write the failing sync test**

Create `src/__integration__/bylawSync.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { prisma } from '../db/prisma.js';
import { checkAndSyncBylawAmendment } from '../bylawyer/bylawSyncService.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';

const closeVoting = { type: 'CLOSE_VOTING' } as unknown as MeetingAction;

/** The meeting states before and after a passing vote on a bylaw amendment to a document */
function votedStates(documentId: string, targetSectionId: string) {
  const motion = {
    id: 41,
    type: 'bylawAmendment',
    text: 'Rename the organization',
    vote: 'majority',
    bylawAmendment: {
      documentId,
      changeType: 'modify',
      targetSectionId,
      newContent: 'The name is A Prime.',
    },
  };
  const before = {
    ...initialState,
    currentMotion: motion,
    votes: { yea: 5, nay: 1, abstain: 0 },
  } as unknown as MeetingState;
  const after = {
    ...initialState,
    completedMotions: [{ id: 41, passed: true, voterChoices: {} }],
  } as unknown as MeetingState;
  return { before, after };
}

describe('bylaw sync', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("applies a passed motion to a document of the meeting's organization", async () => {
    const { before, after } = votedStates(f.doc, f.section);
    const result = await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    expect(result).toMatchObject({ success: true, applied: true });
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment).toMatchObject({ documentId: f.doc, status: 'passed' });
  });

  it('skips a motion whose document is in another organization', async () => {
    const { before, after } = votedStates(f.docB, f.sectionB);
    expect(await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after)).toBeNull();
    expect(await prisma.amendment.count({ where: { robbieMeetingCode: f.packet.code } })).toBe(0);
    const sectionB = await prisma.section.findUniqueOrThrow({ where: { id: f.sectionB } });
    expect(sectionB.content).toBe('The name is B.');
  });

  it('skips a meeting without a packet', async () => {
    const { before, after } = votedStates(f.doc, f.section);
    expect(await checkAndSyncBylawAmendment('NOPACK', closeVoting, before, after)).toBeNull();
    expect(await prisma.amendment.count({ where: { robbieMeetingCode: 'NOPACK' } })).toBe(0);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveMeetings.test.ts src/__integration__/bylawSync.test.ts`
Expected: FAIL. The rule cases answer the outsider; linking answers 500 (it calls the meeting storage, which isn't initialized in tests); the sync skips every motion, because it reads the legacy column; the removed routes still answer.

- [ ] **Step 4: Add the schemas**

Create `src/schemas/bylawyer.ts`:

```ts
import { z } from 'zod';
import { robbieCode } from './packets.js';

export const meetingCodeParam = z.object({ meetingCode: robbieCode });

export const linkMeetingBody = z.object({
  meetingCode: robbieCode,
  organizationId: z.string().uuid(),
});
```

In `src/schemas/index.ts`, add `export * from './bylawyer.js';` after the `attachments` export.

Replace `src/schemas/robbie.ts` with:

```ts
import { z } from 'zod';

export const amendmentIdParam = z.object({
  amendmentId: z.string().uuid(),
});

export const syncStatusParams = z.object({
  meetingCode: z.string().min(1),
  motionId: z.coerce.number().int(),
});
```

- [ ] **Step 5: Replace `src/bylawyer/bylawyerRouter.ts`**

```ts
/**
 * Bylawyer Router for Robbie Integration
 *
 * Organizations, documents and section trees for the live meeting screens, and linking a live
 * meeting to an organization. A meeting's packet records its organization; linking creates it.
 */

import { Router, type Router as RouterType, type RequestHandler } from 'express';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../middleware/logger.js';
import { validate, type RouteParams } from '../middleware/validate.js';
import { docIdParam, orgIdParam } from '../schemas/common.js';
import { linkMeetingBody, meetingCodeParam } from '../schemas/bylawyer.js';
import { userOrganizations } from '../orgs/organizationService.js';
import { fromBody, fromParam, requireRole, signedInOnly } from '../orgs/requireRole.js';
import { orgOfDocument, orgOfOrganization, orgOfPacketCode } from '../orgs/resolvers.js';
import { CODE_IN_USE } from './routes/packets.js';

export const bylawyerRouter: RouterType = Router();

const byOrganization = fromParam('orgId', orgOfOrganization);
const byMeetingCode = fromParam('meetingCode', orgOfPacketCode);

/**
 * GET /api/bylawyer/organizations
 * The signed-in user's organizations, each with the user's role
 */
const listOrganizations: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { organizations } = await userOrganizations(req.user!.id);
    res.json(organizations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching organizations');
    res.status(500).json({
      error: 'Failed to fetch organizations',
    });
  }
};

bylawyerRouter.get('/organizations', signedInOnly(), listOrganizations);

/**
 * GET /api/bylawyer/organizations/:orgId
 * Get a specific organization
 */
const getOrganization: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { orgId } = req.params;
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(organization);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching organization');
    res.status(500).json({
      error: 'Failed to fetch organization',
    });
  }
};

bylawyerRouter.get(
  '/organizations/:orgId',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
  getOrganization,
);

/**
 * GET /api/bylawyer/organizations/:orgId/documents
 * Get documents for an organization
 */
const getOrganizationDocuments: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: { organizationId: req.params.orgId },
      orderBy: { title: 'asc' },
    });

    res.json(documents);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching documents');
    res.status(500).json({
      error: 'Failed to fetch documents',
    });
  }
};

bylawyerRouter.get(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
  getOrganizationDocuments,
);

/**
 * POST /api/bylawyer/link-meeting
 * Link a live meeting to an organization by giving its code a packet there. Linking a code
 * that is already the organization's succeeds; another organization's code is 409.
 * Body: { meetingCode: string, organizationId: string }
 */
const linkMeeting: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { meetingCode } = req.body as { meetingCode: string };
    const organizationId = req.org!.id;

    const find = () =>
      prisma.meetingPacket.findUnique({
        where: { robbieCode: meetingCode },
        select: { organizationId: true },
      });
    let packet = await find();
    if (!packet) {
      try {
        packet = await prisma.meetingPacket.create({
          data: { robbieCode: meetingCode, organizationId },
          select: { organizationId: true },
        });
      } catch (error) {
        // Two links at once: the one that loses reads the packet the other made
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        packet = await find();
      }
    }

    if (packet?.organizationId !== organizationId) {
      return res.status(409).json({ error: CODE_IN_USE });
    }

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    res.json({
      success: true,
      meetingCode,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error linking meeting to organization');
    res.status(500).json({
      error: 'Failed to link meeting to organization',
    });
  }
};

bylawyerRouter.post(
  '/link-meeting',
  validate({ body: linkMeetingBody }),
  requireRole('secretary', fromBody('organizationId', orgOfOrganization)),
  linkMeeting,
);

/**
 * DELETE /api/bylawyer/link-meeting/:meetingCode
 * Unlink a live meeting by deleting its packet, which must have no agenda or attachments
 */
const unlinkMeeting: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { meetingCode } = req.params;

    // One statement, so an item added meanwhile can't be deleted with the packet
    const deleted = await prisma.meetingPacket.deleteMany({
      where: { robbieCode: meetingCode, agendaItems: { none: {} }, attachments: { none: {} } },
    });
    if (deleted.count === 0) {
      return res.status(409).json({ error: 'Remove the agenda and attachments first' });
    }

    res.json({ success: true, meetingCode });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking meeting from organization');
    res.status(500).json({
      error: 'Failed to unlink meeting from organization',
    });
  }
};

bylawyerRouter.delete(
  '/link-meeting/:meetingCode',
  validate({ params: meetingCodeParam }),
  requireRole('secretary', byMeetingCode),
  unlinkMeeting,
);

/**
 * GET /api/bylawyer/meeting/:meetingCode/organization
 * The organization a live meeting is linked to, through its packet. An unlinked code is 404.
 */
const getMeetingOrganization: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.org!.id },
    });

    res.json({
      linked: true,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting meeting organization');
    res.status(500).json({
      error: 'Failed to get meeting organization',
    });
  }
};

bylawyerRouter.get(
  '/meeting/:meetingCode/organization',
  validate({ params: meetingCodeParam }),
  requireRole('viewer', byMeetingCode),
  getMeetingOrganization,
);

/**
 * GET /api/bylawyer/documents/:docId/sections
 * Get sections for a document's latest version
 */
const getDocumentSections: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { docId } = req.params;

    // Get the document with current version
    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.currentVersionId) {
      return res.json([]); // No versions yet
    }

    // Fetch sections for the current version
    const sections = await prisma.section.findMany({
      where: { versionId: document.currentVersionId },
      orderBy: { position: 'asc' },
    });

    // Build section tree
    const buildTree = (parentId: string | null = null): any[] => {
      return sections
        .filter((s) => s.parentId === parentId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          versionId: s.versionId,
          parentId: s.parentId,
          position: s.position,
          numberLabel: s.numberLabel,
          title: s.title,
          content: s.content,
          annotation: s.annotation,
          children: buildTree(s.id),
        }));
    };

    res.json(buildTree());
  } catch (error) {
    logger.error({ err: error }, 'Error fetching document sections');
    res.status(500).json({
      error: 'Failed to fetch sections',
    });
  }
};

bylawyerRouter.get(
  '/documents/:docId/sections',
  validate({ params: docIdParam }),
  requireRole('viewer', fromParam('docId', orgOfDocument)),
  getDocumentSections,
);
```

- [ ] **Step 6: Replace `src/bylawyer/routes/robbie.ts`**

```ts
/**
 * Robbie Integration Router
 *
 * Read-only views of amendments synced from live meetings. The sync itself runs in the socket
 * layer (bylawSyncService) when a vote closes; no HTTP route syncs.
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { amendmentIdParam, syncStatusParams } from '../../schemas/robbie.js';
import { logger } from '../../middleware/logger.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfAmendment, orgOfPacketCode } from '../../orgs/resolvers.js';

export const robbieRouter: RouterType = Router();

/**
 * GET /api/robbie/meetings/:amendmentId
 *
 * Get linked Robbie meeting details for an amendment.
 * Returns the meeting code and vote data if the amendment was synced from Robbie.
 */
robbieRouter.get(
  '/meetings/:amendmentId',
  validate({ params: amendmentIdParam }),
  requireRole('viewer', fromParam('amendmentId', orgOfAmendment)),
  async (req, res) => {
    try {
      const amendment = await prisma.amendment.findUnique({
        where: { id: req.params.amendmentId },
        select: {
          id: true,
          robbieMeetingCode: true,
          robbieMotionId: true,
          robbieVoteData: true,
          status: true,
          decidedAt: true,
        },
      });

      if (!amendment) {
        return res.status(404).json({ error: 'Amendment not found' });
      }

      if (!amendment.robbieMeetingCode) {
        return res.json({
          linked: false,
          message: 'This amendment was not synced from a Robbie meeting',
        });
      }

      const voteData = amendment.robbieVoteData as any;

      res.json({
        linked: true,
        meetingCode: amendment.robbieMeetingCode,
        motionId: amendment.robbieMotionId,
        voteResult: amendment.status,
        votedAt: amendment.decidedAt,
        vote: voteData
          ? {
              yeaCount: voteData.yeaCount,
              nayCount: voteData.nayCount,
              abstainCount: voteData.abstainCount,
              voteRequirement: voteData.voteRequirement,
              voterChoices: voteData.voterChoices,
            }
          : null,
        robbieUrl: `http://localhost:5173/meeting/${amendment.robbieMeetingCode}`,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting Robbie meeting details');
      res.status(500).json({
        error: 'Failed to get meeting details',
      });
    }
  },
);

/**
 * GET /api/robbie/sync-status/:meetingCode/:motionId
 *
 * Check if a specific motion has been synced into the meeting's organization.
 */
robbieRouter.get(
  '/sync-status/:meetingCode/:motionId',
  validate({ params: syncStatusParams }),
  requireRole('viewer', fromParam('meetingCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const { meetingCode, motionId } = req.params;

      const amendment = await prisma.amendment.findFirst({
        where: {
          robbieMeetingCode: meetingCode,
          robbieMotionId: parseInt(motionId, 10),
          // Only the meeting's organization's amendments
          document: { organizationId: req.org!.id },
        },
        select: {
          id: true,
          status: true,
          resultingVersionId: true,
        },
      });

      if (!amendment) {
        return res.json({
          synced: false,
        });
      }

      res.json({
        synced: true,
        amendmentId: amendment.id,
        status: amendment.status,
        applied: !!amendment.resultingVersionId,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking sync status');
      res.status(500).json({
        error: 'Failed to check sync status',
      });
    }
  },
);
```

Then delete the files only `POST /sync-motion` used: `git rm src/bylawyer/decisionDate.ts src/__tests__/decisionDate.test.ts`.

- [ ] **Step 7: Find the meeting's organization from its packet in the sync**

In `src/bylawyer/bylawSyncService.ts`:

1. Delete the line `import { getStorage } from '../db/meetingStorage.js';`.
2. Replace:

<!-- prettier-ignore -->
```ts
  // Check if meeting is linked to a Bylawyer organization
  const storage = getStorage();
  const orgId = await storage.getBylawyerOrgId(meetingCode);

  if (!orgId) {
    logger.info({ meetingCode }, 'Meeting not linked to Bylawyer org, skipping sync');
    return null;
  }
```

with:

<!-- prettier-ignore -->
```ts
  // The meeting's packet records its organization (see POST /api/bylawyer/link-meeting)
  const packet = await prisma.meetingPacket.findUnique({
    where: { robbieCode: meetingCode },
    select: { organizationId: true },
  });

  if (!packet) {
    logger.info({ meetingCode }, 'Meeting not linked to an organization, skipping sync');
    return null;
  }

  // Only a document of the meeting's organization can be amended from it
  const document = await prisma.document.findUnique({
    where: { id: votedMotion.bylawAmendment.documentId },
    select: { organizationId: true },
  });

  if (document?.organizationId !== packet.organizationId) {
    logger.warn(
      { meetingCode, documentId: votedMotion.bylawAmendment.documentId },
      "Motion's document is not in the meeting's organization, skipping sync",
    );
    return null;
  }
```

3. Delete the unused `checkSyncStatus` function at the end of the file (from its `/**\n * Check if a motion has been synced to Bylawyer.\n */` comment to the end).

- [ ] **Step 8: Remove the legacy link from the meeting storage**

In `src/db/meetingStorage.ts`:

1. In `interface MeetingRecord`, delete the line `bylawyerOrgId?: string; // UUID of linked Bylawyer organization`.
2. In `interface StorageProvider`, delete the three methods and their comments: `linkToBylawyerOrg`, `unlinkFromBylawyerOrg` and `getBylawyerOrgId`.
3. In `class InMemoryStorage`, delete the methods `linkToBylawyerOrg`, `unlinkFromBylawyerOrg` and `getBylawyerOrgId`.
4. In `class PostgresStorage`, delete the same three methods, and in `getMeeting` change the query to `SELECT id, code, current_state, state_version FROM meetings WHERE code = $1` and delete the line `bylawyerOrgId: result.rows[0].bylawyer_org_id || undefined,`.

Keep the `bylawyer_org_id` column and its index in `SCHEMA_SQL`: M5 drops them.

Check: `grep -rn "BylawyerOrg\|bylawyerOrgId\|bylawyer_org_id" src` prints only the two `SCHEMA_SQL` lines in `src/db/meetingStorage.ts` (the column and its index).

- [ ] **Step 9: Every router now has rules**

In `src/__integration__/routeCoverage.test.ts`:

1. Delete the whole `NOT_YET_RULED` constant and the comment above it.
2. Delete the line `import { bylawyerRouter } from '../bylawyer/bylawyerRouter.js';`.
3. In `unruled`, change `if (inner && !PUBLIC_ROUTERS.has(layer.handle) && !NOT_YET_RULED.has(layer.handle)) {` to `if (inner && !PUBLIC_ROUTERS.has(layer.handle)) {`.

- [ ] **Step 10: Run everything**

Run: `npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 15 in `liveMeetings.test.ts`, 3 in `bylawSync.test.ts`, and the route test with no routers excused.

- [ ] **Step 11: Commit**

```bash
git add -A src/bylawyer src/schemas src/db/meetingStorage.ts src/__tests__/decisionDate.test.ts src/__integration__/liveMeetings.test.ts src/__integration__/bylawSync.test.ts src/__integration__/routeCoverage.test.ts
git commit -m "feat(orgs): tie live meetings to an organization through their packet

Linking a meeting (secretary) gives its code a packet in the
organization; a code another organization holds is 409, and unlinking
needs an empty packet. The live sync reads the packet and skips a
document from another organization. POST /api/robbie/sync-motion and
GET /api/robbie/amendments are gone, and the legacy meetings link column
is no longer read or written. Every API route now has a rule."
```

---

### Task 14: Members, adding people by email, and the last-owner rule

**Rules (`src/orgs/memberRoutes.ts`, mounted at `/api`):**

| Route                                         | Rule                                         | Notes                                                                                        |
| --------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /organizations/:id/members`              | viewer, `fromParam('id', orgOfOrganization)` | Members; pending additions only for admins                                                   |
| `POST /organizations/:id/members`             | admin, same                                  | Only an owner adds an owner; 409 already a member; 429 past 20 a day                         |
| `PUT /organizations/:id/members/:userId`      | admin, same                                  | Admins can't change owners or make owners; the last owner can't be demoted (409)             |
| `DELETE /organizations/:id/members/:userId`   | viewer, same                                 | Removing someone else needs admin (403 otherwise); leaving is anyone's; owner rules as above |
| `DELETE /organizations/:id/invites/:inviteId` | admin, same                                  | 404 unless a pending addition of this organization                                           |

How adding by email works (the design's "Adding people by email"):

- Every add that makes a membership or a pending addition records one `OrganizationInvite` row. An email with an account becomes a member at once (the row gets `acceptedAt`); an email without one waits.
- Adding an email that already has a pending addition updates that row's role and sends no email; it creates no row, so it doesn't count toward the limit.
- The limit counts the organization's rows created in the last 24 hours: at 20, the answer is 429.
- A pending addition is one not accepted, not canceled, and less than 30 days old. `verifySignInCode` turns every pending addition for the email into a membership in the transaction that finds or creates the user.
- Checks and changes for one organization run one at a time: each takes a row lock on the organization (`SELECT ... FOR UPDATE`).

**Files:**

- Create: `src/orgs/membershipService.ts`, `src/orgs/memberRoutes.ts`, `src/schemas/members.ts`
- Modify: `src/auth/emailService.ts`, `src/auth/signInService.ts`, `src/app.ts`, `src/schemas/index.ts`, `.env.example`
- Test: `src/__integration__/members.test.ts`, `src/__tests__/emailService.test.ts`

- [ ] **Step 1: Write the failing email test**

Add to `src/__tests__/emailService.test.ts` (and add `addedToOrganizationEmail`, `captureMemberEmailsForTests` and `sendAddedToOrganization` to its import from `../auth/emailService.js`):

```ts
describe('sendAddedToOrganization', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('delivers to the test outbox when capturing', async () => {
    const outbox = captureMemberEmailsForTests();
    await sendAddedToOrganization({ to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' });
    expect(outbox).toEqual([{ to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' }]);
  });

  it('refuses to pretend to send in production without an email provider', async () => {
    captureMemberEmailsForTests();
    process.env.NODE_ENV = 'production';
    await expect(
      sendAddedToOrganization({ to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' }),
    ).rejects.toThrow(/provider/);
  });
});

describe('addedToOrganizationEmail', () => {
  it('says who added them, to what, and links to the app', () => {
    const email = addedToOrganizationEmail(
      { to: 'bo@example.org', organization: 'Org A', addedBy: 'Ann' },
      'https://robbie.example',
    );
    expect(email.subject).toBe('You were added to Org A on Robbie');
    expect(email.text).toContain('Ann added you to Org A on Robbie.');
    expect(email.text).toContain('https://robbie.example');
    expect(email.html).toContain('href="https://robbie.example"');
  });

  it('escapes names in the HTML and keeps the subject to one line', () => {
    const email = addedToOrganizationEmail(
      { to: 'bo@example.org', organization: 'A & B\nClub', addedBy: '<script>x</script>' },
      'https://robbie.example',
    );
    expect(email.subject).toBe('You were added to A & B Club on Robbie');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(email.html).toContain('A &amp; B Club');
  });
});
```

Run: `npx vitest run src/__tests__/emailService.test.ts`
Expected: FAIL, the three functions are not exported.

- [ ] **Step 2: Add the email to `src/auth/emailService.ts`**

After the `sendSignInCode` function, add:

```ts
export interface AddedToOrganizationEmail {
  to: string;
  organization: string;
  /** The name (or email) of whoever added them */
  addedBy: string;
}

// Tests: when set, added-to-organization emails are collected here instead of being sent
let memberOutbox: AddedToOrganizationEmail[] | null = null;

/** Collect added-to-organization emails in memory instead of sending them (tests only) */
export function captureMemberEmailsForTests(): AddedToOrganizationEmail[] {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('captureMemberEmailsForTests is for tests only (NODE_ENV=test)');
  }
  memberOutbox = [];
  return memberOutbox;
}

/** The web app's address, for links in emails: APP_URL, else CLIENT_ORIGIN */
export function appUrl(): string {
  return process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The added-to-organization email. Names come from users, so they are escaped in the HTML and
 * kept to one line in the subject.
 */
export function addedToOrganizationEmail(
  email: AddedToOrganizationEmail,
  url: string,
): { subject: string; text: string; html: string } {
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
  const organization = oneLine(email.organization);
  const addedBy = oneLine(email.addedBy);
  return {
    subject: `You were added to ${organization} on Robbie`,
    text: `${addedBy} added you to ${organization} on Robbie.

Sign in with this email address to see it:

${url}

---
Robbie - Parliamentary Procedure Made Easy
`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Added to ${escapeHtml(organization)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Robbie</h1>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #18181b; margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">
        ${escapeHtml(addedBy)} added you to <strong>${escapeHtml(organization)}</strong> on Robbie.
      </p>
      <p style="color: #52525b; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
        Sign in with this email address to see it.
      </p>
      <a href="${escapeHtml(url)}" style="display: inline-block; background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Open Robbie</a>
    </div>
  </div>
</body>
</html>
`,
  };
}

/**
 * Tell someone they were added to an organization. Without an email provider (development
 * only; production requires one), it is logged at debug level instead.
 */
export async function sendAddedToOrganization(email: AddedToOrganizationEmail): Promise<void> {
  if (emailProvider === 'development' && process.env.NODE_ENV === 'production') {
    throw new Error('No email provider configured; production cannot send email');
  }

  if (memberOutbox) {
    memberOutbox.push(email);
    return;
  }

  if (emailProvider === 'development') {
    logger.debug(
      { to: email.to, organization: email.organization },
      'Added-to-organization email (no email provider configured)',
    );
    return;
  }

  const messageId = await deliver({ to: email.to, ...addedToOrganizationEmail(email, appUrl()) });
  logger.info({ to: email.to, messageId }, 'Added-to-organization email sent');
}
```

Run: `npx vitest run src/__tests__/emailService.test.ts`
Expected: all pass.

- [ ] **Step 3: Write the failing membership test**

Create `src/__integration__/members.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  captureEmailsForTests,
  captureMemberEmailsForTests,
  type AddedToOrganizationEmail,
} from '../auth/emailService.js';
import { requestSignInCode, verifySignInCode } from '../auth/signInService.js';
import { MAX_ADDS_PER_DAY } from '../orgs/membershipService.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, signIn } from './helpers.js';
import { describeRules } from './rules.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describeRules('member rules', [
  {
    method: 'get',
    route: '/organizations/:id/members',
    path: (f) => `/api/organizations/${f.orgA.id}/members`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:id/members',
    path: (f) => `/api/organizations/${f.orgA.id}/members`,
    body: () => ({ email: 'new@example.org', role: 'member' }),
    min: 'admin',
    ok: 201,
  },
  {
    method: 'put',
    route: '/organizations/:id/members/:userId',
    path: (f) => `/api/organizations/${f.orgA.id}/members/${f.users.member.id}`,
    body: () => ({ role: 'secretary' }),
    min: 'admin',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/organizations/:id/members/:userId',
    path: (f) => `/api/organizations/${f.orgA.id}/members/${f.users.viewer.id}`,
    min: 'admin',
    ok: 204,
  },
  {
    method: 'delete',
    route: '/organizations/:id/invites/:inviteId',
    path: (f) => `/api/organizations/${f.orgA.id}/invites/${f.invite}`,
    min: 'admin',
    ok: 204,
  },
]);

describe('members', () => {
  let f: Fixture;
  let mail: AddedToOrganizationEmail[];
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
    mail = captureMemberEmailsForTests();
  });
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  const members = () => `/api/organizations/${f.orgA.id}/members`;
  const member = (userId: number) => `${members()}/${userId}`;
  const add = (cookie: string, email: string, role: string) =>
    call('post', members(), { cookie, body: { email, role } });
  const roleOf = async (userId: number) =>
    (
      await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: f.orgA.id, userId } },
      })
    )?.role ?? null;

  describe('adding by email', () => {
    it('adds an existing account at once and emails them', async () => {
      const bo = await signIn('bo@example.org', { name: 'Bo' });
      const res = await add(f.users.admin.cookie, ' Bo@Example.org ', 'secretary');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        status: 'added',
        member: { userId: bo.id, name: 'Bo', email: 'bo@example.org', role: 'secretary' },
        emailSent: true,
      });
      expect(mail).toEqual([{ to: 'bo@example.org', organization: 'Org A', addedBy: 'A admin' }]);
      const invite = await prisma.organizationInvite.findFirstOrThrow({
        where: { email: 'bo@example.org' },
      });
      expect(invite.acceptedAt).toBeInstanceOf(Date);

      const list = await call('get', '/api/organizations', { cookie: bo.cookie });
      expect(list.body).toEqual([expect.objectContaining({ id: f.orgA.id, role: 'secretary' })]);
    });

    it('keeps an unknown email waiting until it signs in', async () => {
      const res = await add(f.users.admin.cookie, 'cy@example.org', 'member');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'invited',
        invite: { email: 'cy@example.org', role: 'member' },
        emailSent: true,
      });
      expect(mail).toHaveLength(1);

      const codes = captureEmailsForTests();
      await requestSignInCode('cy@example.org');
      const cy = await verifySignInCode('cy@example.org', codes[0].code);
      expect(await roleOf(cy.id)).toBe('member');
      const invite = await prisma.organizationInvite.findFirstOrThrow({
        where: { email: 'cy@example.org' },
      });
      expect(invite.acceptedAt).toBeInstanceOf(Date);
    });

    it('updates the role of a pending addition without a second email', async () => {
      await add(f.users.admin.cookie, 'cy@example.org', 'member');
      const again = await add(f.users.admin.cookie, 'cy@example.org', 'secretary');
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({
        status: 'updated',
        invite: { email: 'cy@example.org', role: 'secretary' },
        emailSent: false,
      });
      expect(mail).toHaveLength(1);
      expect(await prisma.organizationInvite.count({ where: { email: 'cy@example.org' } })).toBe(1);
    });

    it('refuses someone who is already a member', async () => {
      const res = await add(f.users.admin.cookie, 'member@example.org', 'viewer');
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'That person is already a member' });
    });

    it('allows 20 additions in 24 hours', async () => {
      // The fixture's pending addition counts as one
      await prisma.organizationInvite.createMany({
        data: Array.from({ length: MAX_ADDS_PER_DAY - 1 }, (_, i) => ({
          organizationId: f.orgA.id,
          email: `person${i}@example.org`,
          role: 'member' as const,
        })),
      });
      const refused = await add(f.users.admin.cookie, 'one-more@example.org', 'member');
      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({
        error: 'This organization has added 20 people today. Try again tomorrow.',
      });

      await prisma.organizationInvite.updateMany({
        where: { organizationId: f.orgA.id },
        data: { createdAt: new Date(Date.now() - 25 * HOUR) },
      });
      expect((await add(f.users.admin.cookie, 'one-more@example.org', 'member')).status).toBe(201);
    });

    it('turns only pending additions into memberships at sign-in', async () => {
      await prisma.organizationInvite.createMany({
        data: [
          {
            organizationId: f.orgA.id,
            email: 'dee@example.org',
            role: 'member',
            createdAt: new Date(Date.now() - 31 * DAY),
          },
          {
            organizationId: f.orgB.id,
            email: 'dee@example.org',
            role: 'viewer',
            canceledAt: new Date(),
          },
        ],
      });
      const codes = captureEmailsForTests();
      await requestSignInCode('dee@example.org');
      const dee = await verifySignInCode('dee@example.org', codes[0].code);
      expect(await prisma.organizationMember.count({ where: { userId: dee.id } })).toBe(0);
    });

    it('keeps the addition when the email fails to send', async () => {
      // Production without an email provider can't send
      process.env.NODE_ENV = 'production';
      const res = await add(f.users.admin.cookie, 'cy@example.org', 'member');
      process.env.NODE_ENV = 'test';
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'invited', emailSent: false });
      expect(await prisma.organizationInvite.count({ where: { email: 'cy@example.org' } })).toBe(1);
    });
  });

  describe('owners', () => {
    it('are added only by an owner', async () => {
      const byAdmin = await add(f.users.admin.cookie, 'cy@example.org', 'owner');
      expect(byAdmin.status).toBe(403);
      expect(byAdmin.body).toEqual({ error: 'You need the owner role for this' });
      expect((await add(f.users.owner.cookie, 'cy@example.org', 'owner')).status).toBe(201);
    });

    it("can't be changed, made or removed by an admin", async () => {
      const cookie = f.users.admin.cookie;
      const demote = await call('put', member(f.users.owner.id), {
        cookie,
        body: { role: 'admin' },
      });
      expect(demote.status).toBe(403);
      const promote = await call('put', member(f.users.member.id), {
        cookie,
        body: { role: 'owner' },
      });
      expect(promote.status).toBe(403);
      const remove = await call('delete', member(f.users.owner.id), { cookie });
      expect(remove.status).toBe(403);
      expect(await roleOf(f.users.owner.id)).toBe('owner');
      expect(await roleOf(f.users.member.id)).toBe('member');
    });

    it('must leave one behind', async () => {
      const cookie = f.users.owner.cookie;
      const demote = await call('put', member(f.users.owner.id), {
        cookie,
        body: { role: 'admin' },
      });
      expect(demote.status).toBe(409);
      expect(demote.body).toEqual({ error: 'An organization needs at least one owner' });
      const leave = await call('delete', member(f.users.owner.id), { cookie });
      expect(leave.status).toBe(409);
      expect(await roleOf(f.users.owner.id)).toBe('owner');
    });

    it('can step down once there is another', async () => {
      const cookie = f.users.owner.cookie;
      const promote = await call('put', member(f.users.admin.id), {
        cookie,
        body: { role: 'owner' },
      });
      expect(promote.status).toBe(200);
      expect(promote.body).toEqual({
        member: {
          userId: f.users.admin.id,
          name: 'A admin',
          email: 'admin@example.org',
          role: 'owner',
        },
      });
      const stepDown = await call('put', member(f.users.owner.id), {
        cookie,
        body: { role: 'admin' },
      });
      expect(stepDown.status).toBe(200);
      expect(await roleOf(f.users.owner.id)).toBe('admin');
    });
  });

  describe('the member list', () => {
    it('shows members to everyone, and pending additions to admins', async () => {
      const asViewer = await call('get', members(), { cookie: f.users.viewer.cookie });
      expect(asViewer.status).toBe(200);
      expect(asViewer.body.members).toHaveLength(5);
      expect(asViewer.body.members[0]).toEqual({
        userId: f.users.viewer.id,
        name: 'A viewer',
        email: 'viewer@example.org',
        role: 'viewer',
      });
      expect(asViewer.body).not.toHaveProperty('invites');

      const asAdmin = await call('get', members(), { cookie: f.users.admin.cookie });
      expect(asAdmin.body.invites).toEqual([
        expect.objectContaining({ id: f.invite, email: 'pending@example.org', role: 'member' }),
      ]);
    });
  });

  describe('leaving and removing', () => {
    it('lets anyone leave', async () => {
      const res = await call('delete', member(f.users.viewer.id), {
        cookie: f.users.viewer.cookie,
      });
      expect(res.status).toBe(204);
      expect(await roleOf(f.users.viewer.id)).toBeNull();
    });

    it("answers 404 for someone who isn't a member", async () => {
      const res = await call('put', member(f.outsider.id), {
        cookie: f.users.owner.cookie,
        body: { role: 'viewer' },
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });
  });

  describe('canceling a pending addition', () => {
    it('works once, and only on this organization', async () => {
      const cookie = f.users.admin.cookie;
      const path = `/api/organizations/${f.orgA.id}/invites/${f.invite}`;
      expect((await call('delete', path, { cookie })).status).toBe(204);
      expect((await call('delete', path, { cookie })).status).toBe(404);

      const inviteB = await prisma.organizationInvite.create({
        data: { organizationId: f.orgB.id, email: 'x@example.org', role: 'member' },
      });
      const other = await call('delete', `/api/organizations/${f.orgA.id}/invites/${inviteB.id}`, {
        cookie,
      });
      expect(other.status).toBe(404);
    });
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/members.test.ts`
Expected: FAIL, cannot find module `../orgs/membershipService.js`.

- [ ] **Step 5: Create `src/orgs/membershipService.ts`**

```ts
import type { OrganizationInvite, OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { sendAddedToOrganization } from '../auth/emailService.js';
import { logger } from '../middleware/logger.js';
import { OrgError } from './orgError.js';
import { atLeast, roleNeeded } from './roles.js';

/** An organization may add this many people by email in 24 hours */
export const MAX_ADDS_PER_DAY = 20;
/** A pending addition lapses if the email doesn't sign in within this long */
export const INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const LAST_OWNER = 'An organization needs at least one owner';

export interface MemberView {
  userId: number;
  name: string | null;
  email: string;
  role: OrgRole;
}

export interface InviteView {
  id: string;
  email: string;
  role: OrgRole;
  createdAt: Date;
}

/** Who is acting: the signed-in user, with their role in the organization */
export interface Actor {
  id: number;
  name: string | null;
  email: string;
  role: OrgRole;
}

export type AddResult =
  | { status: 'added'; member: MemberView; emailSent: boolean }
  | { status: 'invited'; invite: InviteView; emailSent: boolean }
  | { status: 'updated'; invite: InviteView; emailSent: false };

type Outcome =
  | { status: 'added'; member: MemberView }
  | { status: 'invited'; invite: InviteView }
  | { status: 'updated'; invite: InviteView };

type Tx = Prisma.TransactionClient;

const inviteView = (invite: OrganizationInvite): InviteView => ({
  id: invite.id,
  email: invite.email,
  role: invite.role,
  createdAt: invite.createdAt,
});

/** Additions that can still become memberships: not accepted, not canceled, not lapsed */
function pending(now: Date): Prisma.OrganizationInviteWhereInput {
  return {
    acceptedAt: null,
    canceledAt: null,
    createdAt: { gt: new Date(now.getTime() - INVITE_LIFETIME_MS) },
  };
}

/**
 * Hold the organization's row until the transaction ends, so checks and changes to one
 * organization's members run one at a time
 */
async function lockOrganization(tx: Tx, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
}

/** Only an owner may give the owner role, or change or remove an owner */
function checkOwnerRule(actor: Actor, ...roles: OrgRole[]): void {
  if (roles.includes('owner') && actor.role !== 'owner') {
    throw new OrgError(403, roleNeeded('owner'));
  }
}

/** Refuse to take away the organization's last owner */
async function checkAnotherOwner(tx: Tx, organizationId: string): Promise<void> {
  const owners = await tx.organizationMember.count({ where: { organizationId, role: 'owner' } });
  if (owners <= 1) throw new OrgError(409, LAST_OWNER);
}

/** The members, and for admins the pending additions */
export async function listMembers(
  organizationId: string,
  withInvites: boolean,
  now: Date = new Date(),
): Promise<{ members: MemberView[]; invites?: InviteView[] }> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
  });
  const members = rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    role: row.role,
  }));
  if (!withInvites) return { members };

  const invites = await prisma.organizationInvite.findMany({
    where: { organizationId, ...pending(now) },
    orderBy: { createdAt: 'asc' },
  });
  return { members, invites: invites.map(inviteView) };
}

/**
 * Add someone to an organization by email. An email with an account becomes a member at once;
 * one without waits until it first signs in. Adding a pending email again changes its role.
 * The person is emailed, except when only the role of a pending addition changes; a failed
 * email doesn't undo the addition.
 */
export async function addMemberByEmail(
  organizationId: string,
  actor: Actor,
  rawEmail: string,
  role: OrgRole,
  now: Date = new Date(),
): Promise<AddResult> {
  const email = rawEmail.trim().toLowerCase();
  checkOwnerRule(actor, role);

  const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
    await lockOrganization(tx, organizationId);

    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (existing) throw new OrgError(409, 'That person is already a member');
    } else {
      const waiting = await tx.organizationInvite.findFirst({
        where: { organizationId, email, ...pending(now) },
        orderBy: { createdAt: 'desc' },
      });
      if (waiting) {
        checkOwnerRule(actor, waiting.role);
        const invite = await tx.organizationInvite.update({
          where: { id: waiting.id },
          data: { role },
        });
        return { status: 'updated', invite: inviteView(invite) };
      }
    }

    const today = await tx.organizationInvite.count({
      where: { organizationId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    });
    if (today >= MAX_ADDS_PER_DAY) {
      throw new OrgError(
        429,
        `This organization has added ${MAX_ADDS_PER_DAY} people today. Try again tomorrow.`,
      );
    }

    const invite = await tx.organizationInvite.create({
      data: {
        organizationId,
        email,
        role,
        invitedById: actor.id,
        createdAt: now,
        acceptedAt: user ? now : null,
      },
    });
    if (!user) return { status: 'invited', invite: inviteView(invite) };

    await tx.organizationMember.create({
      data: { organizationId, userId: user.id, role, createdAt: now },
    });
    return {
      status: 'added',
      member: { userId: user.id, name: user.name, email: user.email, role },
    };
  });

  if (outcome.status === 'updated') return { ...outcome, emailSent: false };

  let emailSent = true;
  try {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    await sendAddedToOrganization({
      to: email,
      organization: organization.name,
      addedBy: actor.name ?? actor.email,
    });
  } catch (error) {
    logger.warn({ err: error, organizationId }, 'Failed to send the added-to-organization email');
    emailSent = false;
  }
  return { ...outcome, emailSent };
}

/** Change a member's role, keeping the owner rules */
export async function changeRole(
  organizationId: string,
  actor: Actor,
  userId: number,
  role: OrgRole,
): Promise<MemberView> {
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!target) throw new OrgError(404, 'Not found');
    checkOwnerRule(actor, target.role, role);
    if (target.role === 'owner' && role !== 'owner') await checkAnotherOwner(tx, organizationId);

    await tx.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role },
    });
    return { userId, name: target.user.name, email: target.user.email, role };
  });
}

/** Remove a member (needs admin), or leave (the actor removes themselves) */
export async function removeMember(
  organizationId: string,
  actor: Actor,
  userId: number,
): Promise<void> {
  const leaving = actor.id === userId;
  if (!leaving && !atLeast(actor.role, 'admin')) throw new OrgError(403, roleNeeded('admin'));

  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!target) throw new OrgError(404, 'Not found');
    if (!leaving) checkOwnerRule(actor, target.role);
    if (target.role === 'owner') await checkAnotherOwner(tx, organizationId);

    await tx.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  });
}

/** Cancel a pending addition of this organization */
export async function cancelInvite(
  organizationId: string,
  inviteId: string,
  now: Date = new Date(),
): Promise<void> {
  const canceled = await prisma.organizationInvite.updateMany({
    where: { id: inviteId, organizationId, ...pending(now) },
    data: { canceledAt: now },
  });
  if (canceled.count === 0) throw new OrgError(404, 'Not found');
}

/**
 * Turn the pending additions for a user's email into memberships. Runs in the sign-in
 * transaction that finds or creates the user.
 */
export async function acceptPendingInvites(
  tx: Tx,
  user: { id: number; email: string },
  now: Date,
): Promise<number> {
  const invites = await tx.organizationInvite.findMany({
    where: { email: user.email, ...pending(now) },
  });
  if (invites.length === 0) return 0;

  await tx.organizationMember.createMany({
    data: invites.map((invite) => ({
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
      createdAt: now,
    })),
    skipDuplicates: true,
  });
  await tx.organizationInvite.updateMany({
    where: { id: { in: invites.map((invite) => invite.id) } },
    data: { acceptedAt: now },
  });
  return invites.length;
}
```

- [ ] **Step 6: Create the schemas and routes**

Create `src/schemas/members.ts`:

```ts
import { z } from 'zod';

const orgRole = z.enum(['viewer', 'member', 'secretary', 'admin', 'owner']);

export const organizationMembersParams = z.object({ id: z.string().uuid() });

export const memberParams = z.object({
  id: z.string().uuid(),
  userId: z.string().regex(/^\d{1,9}$/),
});

export const inviteParams = z.object({ id: z.string().uuid(), inviteId: z.string().uuid() });

export const addMemberBody = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  role: orgRole,
});

export const changeRoleBody = z.object({ role: orgRole });
```

In `src/schemas/index.ts`, add `export * from './members.js';` after the `bylawyer` export.

Create `src/orgs/memberRoutes.ts`:

```ts
/**
 * Member routes: list, add by email, change role, remove or leave, and cancel a pending
 * addition. Mounted at /api.
 */

import { Router, type Response, type Router as RouterType } from 'express';
import type { OrgRole } from '../generated/prisma/client.js';
import type { SessionUser } from '../auth/sessionService.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../middleware/logger.js';
import {
  addMemberBody,
  changeRoleBody,
  inviteParams,
  memberParams,
  organizationMembersParams,
} from '../schemas/members.js';
import {
  addMemberByEmail,
  cancelInvite,
  changeRole,
  listMembers,
  removeMember,
  type Actor,
} from './membershipService.js';
import { OrgError } from './orgError.js';
import { fromParam, requireRole } from './requireRole.js';
import { orgOfOrganization } from './resolvers.js';
import { atLeast } from './roles.js';

export const membersRouter: RouterType = Router();

const byOrganization = fromParam('id', orgOfOrganization);

/** The signed-in user, with their role in the organization the rule found */
const actorOf = (user: SessionUser, org: { role: OrgRole }): Actor => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: org.role,
});

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof OrgError) {
    return res.status(error.status).json({ error: error.message });
  }
  logger.error({ err: error }, fallback);
  res.status(500).json({ error: fallback });
}

// GET /api/organizations/:id/members: the members, and for admins the pending additions
membersRouter.get(
  '/organizations/:id/members',
  validate({ params: organizationMembersParams }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      res.json(await listMembers(req.params.id, atLeast(req.org!.role, 'admin')));
    } catch (error) {
      sendError(res, error, 'Failed to list members');
    }
  },
);

// POST /api/organizations/:id/members { email, role }: add someone by email
membersRouter.post(
  '/organizations/:id/members',
  validate({ params: organizationMembersParams, body: addMemberBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const result = await addMemberByEmail(
        req.params.id,
        actorOf(req.user!, req.org!),
        req.body.email,
        req.body.role,
      );
      res.status(result.status === 'updated' ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error, 'Failed to add the member');
    }
  },
);

// PUT /api/organizations/:id/members/:userId { role }: change a member's role
membersRouter.put(
  '/organizations/:id/members/:userId',
  validate({ params: memberParams, body: changeRoleBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const member = await changeRole(
        req.params.id,
        actorOf(req.user!, req.org!),
        Number(req.params.userId),
        req.body.role,
      );
      res.json({ member });
    } catch (error) {
      sendError(res, error, 'Failed to change the role');
    }
  },
);

// DELETE /api/organizations/:id/members/:userId: remove a member (admin), or leave (anyone)
membersRouter.delete(
  '/organizations/:id/members/:userId',
  validate({ params: memberParams }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      await removeMember(req.params.id, actorOf(req.user!, req.org!), Number(req.params.userId));
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'Failed to remove the member');
    }
  },
);

// DELETE /api/organizations/:id/invites/:inviteId: cancel a pending addition
membersRouter.delete(
  '/organizations/:id/invites/:inviteId',
  validate({ params: inviteParams }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      await cancelInvite(req.params.id, req.params.inviteId);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'Failed to cancel the addition');
    }
  },
);
```

In `src/app.ts`, add the import `import { membersRouter } from './orgs/memberRoutes.js';` and, after `app.use('/api', agendaItemsRouter);`:

```ts
app.use('/api', membersRouter);
```

- [ ] **Step 7: Turn pending additions into memberships at sign-in**

In `src/auth/signInService.ts`, add the import `import { acceptPendingInvites } from '../orgs/membershipService.js';` and replace the end of `verifySignInCode`:

<!-- prettier-ignore -->
```ts
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
    select: { id: true, email: true, name: true },
  });
}
```

with:

<!-- prettier-ignore -->
```ts
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email },
      select: { id: true, email: true, name: true },
    });
    // Additions by email that were waiting for this address become memberships
    await acceptPendingInvites(tx, user, now);
    return user;
  });
}
```

- [ ] **Step 8: Document the email link setting**

In `.env.example`, after the `EMAIL_FROM` line, add:

```
# The web app's address, for links in emails (added-to-organization). Defaults to CLIENT_ORIGIN.
# APP_URL=https://robbie.scouch.dev
```

- [ ] **Step 9: Run everything**

Run: `npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass, including 20 in `members.test.ts` and the route test (which now also checks `membersRouter`).

- [ ] **Step 10: Commit**

```bash
git add src/orgs src/schemas src/auth/emailService.ts src/auth/signInService.ts src/app.ts .env.example src/__tests__/emailService.test.ts src/__integration__/members.test.ts
git commit -m "feat(orgs): add people to organizations by email

Admins add an email with a role: an account becomes a member at once,
and an unknown email waits until it first signs in (30 days). Both get
an email. At most 20 additions a day per organization. Only owners
manage owners, and an organization keeps at least one owner. Anyone can
leave."
```

---

### Task 15: `npm run org:add-member`

Existing organizations have no members after the migration, so nobody can see them. This script adds a member, for development data and for support:

```
npm run org:add-member -w backend-node -- --org <slug> --email <email> --role owner
```

It creates the user if the email has no account (they accept the terms when they first sign in), sends no email, and isn't limited like additions through the API. It keeps the last-owner rule.

**Files:**

- Create: `src/scripts/addOrgMember.ts`
- Modify: `src/orgs/membershipService.ts`, `package.json`
- Test: `src/__integration__/members.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__integration__/members.test.ts`, change the import from `../orgs/membershipService.js` to `import { MAX_ADDS_PER_DAY, addMemberBySlug } from '../orgs/membershipService.js';`, and add inside `describe('members', ...)`:

<!-- prettier-ignore -->
```ts
  describe('adding a member for support', () => {
    it('creates the account if needed and sets the role', async () => {
      const result = await addMemberBySlug('org-a', ' Eve@Example.org ', 'owner');
      expect(result).toEqual({ organization: 'Org A', email: 'eve@example.org', role: 'owner' });
      const eve = await prisma.user.findUniqueOrThrow({ where: { email: 'eve@example.org' } });
      expect(await roleOf(eve.id)).toBe('owner');
      expect(mail).toEqual([]);

      // Running it again changes the role
      await addMemberBySlug('org-a', 'eve@example.org', 'admin');
      expect(await roleOf(eve.id)).toBe('admin');
    });

    it('keeps the last owner and needs a real organization', async () => {
      await expect(addMemberBySlug('org-a', 'owner@example.org', 'admin')).rejects.toMatchObject({
        status: 409,
      });
      await expect(addMemberBySlug('no-such-org', 'eve@example.org', 'owner')).rejects.toMatchObject(
        { status: 404 },
      );
    });
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/members.test.ts`
Expected: FAIL, `addMemberBySlug` is not a function.

- [ ] **Step 3: Add `addMemberBySlug` to `src/orgs/membershipService.ts`**

After `cancelInvite`, add:

```ts
/**
 * Make someone a member of an organization with a role (development data and support).
 * Creates the user if the email has no account, and sends no email. The last-owner rule
 * still holds.
 */
export async function addMemberBySlug(
  slug: string,
  rawEmail: string,
  role: OrgRole,
): Promise<{ organization: string; email: string; role: OrgRole }> {
  const email = rawEmail.trim().toLowerCase();
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!organization) throw new OrgError(404, `No organization has the slug "${slug}"`);

  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organization.id);
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email },
      select: { id: true },
    });
    const key = { organizationId: organization.id, userId: user.id };
    const current = await tx.organizationMember.findUnique({
      where: { organizationId_userId: key },
    });
    if (current?.role === 'owner' && role !== 'owner') {
      await checkAnotherOwner(tx, organization.id);
    }
    await tx.organizationMember.upsert({
      where: { organizationId_userId: key },
      update: { role },
      create: { ...key, role },
    });
  });
  return { organization: organization.name, email, role };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/members.test.ts`
Expected: 22 passed.

- [ ] **Step 5: Create the script, `src/scripts/addOrgMember.ts`**

```ts
/**
 * Make someone a member of an organization (development data and support)
 *
 * Usage: npm run org:add-member -w backend-node -- --org <slug> --email <email> --role <role>
 */

/* eslint-disable no-console -- CLI output */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '../db/prisma.js';
import { addMemberBySlug } from '../orgs/membershipService.js';
import { ROLES, isOrgRole } from '../orgs/roles.js';

const usage = `Usage: npm run org:add-member -w backend-node -- --org <slug> --email <email> --role <${ROLES.join('|')}>`;

const { values } = parseArgs({
  options: {
    org: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string' },
  },
});
const { org, email, role } = values;

if (!org || !email || !isOrgRole(role)) {
  console.error(usage);
  process.exit(1);
}

try {
  const result = await addMemberBySlug(org, email, role);
  console.log(`${result.email} is now ${result.role} of ${result.organization}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
```

In `package.json`, in `"scripts"`, after `"email:test"`, add:

```json
"org:add-member": "tsx src/scripts/addOrgMember.ts"
```

(add a comma after the `"email:test"` line).

- [ ] **Step 6: Try it against the throwaway database**

`dotenv` doesn't override variables already set, so `DATABASE_URL` on the command line wins over `.env`. Run (from `backend-node/`):

```bash
docker exec robbie-ci-pg psql -U postgres -d robbie -c "INSERT INTO \"Organization\" (id, name, slug, \"updatedAt\") VALUES (gen_random_uuid()::text, 'Script Check', 'script-check', now()) ON CONFLICT (slug) DO NOTHING"
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run org:add-member -- --org script-check --email ann@example.org --role owner
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run org:add-member -- --org script-check --email ann@example.org
```

Expected: `INSERT 0 1`, then `ann@example.org is now owner of Script Check`, then the usage line and exit code 1 (no role).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

```bash
git add src/scripts/addOrgMember.ts src/orgs/membershipService.ts src/__integration__/members.test.ts package.json
git commit -m "feat(orgs): add a script that makes someone a member of an organization

npm run org:add-member -- --org <slug> --email <email> --role <role>, for
development data (existing organizations have no members after the
migration) and for support."
```

---

### Task 16: Documentation and the full check

**Files:**

- Modify: `../spec.md`, `../CLAUDE.md`

- [ ] **Step 1: Record the milestone in `../spec.md`**

Under `### M3. Organization authorization (REST and socket)`, after the paragraph that starts "`requireAuth` (`auth/authMiddleware.ts:16`) is never mounted", add as the first bullet:

```markdown
- **Done 2026-10-06 (server):** organizations have members with roles (viewer, member, secretary, admin, owner); every API route has a rule, and a test fails on any `/api` route without one; outsiders get 404 and roles too low get 403; members draft amendments and secretaries decide them; people are added by email (an unknown email waits until it first signs in, at most 20 additions a day per organization); a user can own at most 3 organizations and an organization keeps at least one owner; a meeting packet belongs to one organization and is the only link from a live meeting to it; `POST /api/robbie/sync-motion` and `GET /api/robbie/amendments` are gone, and the live sync skips a document from another organization; share links omit annotations; users accept the Terms of Service and Privacy Policy (`TERMS_VERSION`) before using the API or the socket. The web and mobile clients follow.
```

- [ ] **Step 2: Update `../CLAUDE.md`**

In "Robbie Features", after the line about email-code sign-in, add:

```markdown
- Organization membership with roles (viewer, member, secretary, admin, owner); acceptance of the current Terms of Service (`TERMS_VERSION` in shared) before using the API or socket
```

Replace the "API Endpoints (all on port 3001)" list with:

```markdown
**API Endpoints (all on port 3001):**

- `GET /api/health` - Health check
- `GET/POST /api/organizations` - The user's organizations (each with their `role`) / create one (creator is owner)
- `GET/POST/PUT/DELETE /api/organizations/{id}/members[/{userId}]` - Members; add by email; change role; remove or leave
- `DELETE /api/organizations/{id}/invites/{inviteId}` - Cancel a pending addition
- `GET/POST /api/organizations/{id}/documents` - Documents for org
- `GET/POST /api/documents/{id}/versions` - Versions of document
- `GET /api/versions/{id}/tree` - Section tree structure
- `GET /api/versions/{id}/diff/{other_id}` - Diff between versions of one document
- `GET/POST /api/documents/{id}/amendments` - Amendments for document
- `POST /api/amendments/{id}/propose` - Move to proposed status
- `POST /api/meetings/{id}/votes` - Record a vote
- `POST /api/organizations/{id}/packets` - Create a meeting packet (claims a meeting code)
- `POST /api/auth/accept-terms` - Accept the current terms
- `GET /api/robbie/sync-status/:meetingCode/:motionId` - Check sync status
```

Replace the "Linking Flow" list with:

```markdown
**Linking Flow:**

1. Link a Robbie meeting to a Bylawyer organization via `POST /api/bylawyer/link-meeting` (secretary). This gives the meeting code a packet in the organization, the only record of the link.
2. When creating a bylawAmendment motion in Robbie, select the document and section
3. After the motion passes, it's automatically synced to Bylawyer, if the document is in the meeting's organization
```

Under "Environment Variables > Backend", add after `CLIENT_ORIGIN=http://localhost:5173`:

```
APP_URL=http://localhost:5173   # links in emails; defaults to CLIENT_ORIGIN
```

Under "Key Conventions", add:

```markdown
10. **Organization rules:** every `/api` route outside `/api/auth`, `/api/share` and `/api/health` runs `requireRole(minRole, resolver)` (or `signedInOnly()` for the user's own organizations) after `validate(...)`. `src/__integration__/routeCoverage.test.ts` fails on a route without one. A handler that takes a second resource checks it against `req.org.id` and answers 404 if it is elsewhere. For development data, `npm run org:add-member -w backend-node -- --org <slug> --email <email> --role owner`.
```

- [ ] **Step 3: Full check**

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -w backend-node
```

Expected: all pass. (The frontend and mobile tests don't change in this plan; their type-checks run because `shared` changed.)

- [ ] **Step 4: Live check**

Start the server against the throwaway database with test sign-in, on a spare port (from `backend-node/`, in the background):

```bash
PORT=3101 DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie ENABLE_TEST_AUTH=true npm run dev
```

Then:

```bash
curl -s -c /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"email":"ann@example.org","code":"000000"}' localhost:3101/api/auth/verify
curl -s -b /tmp/robbie-cookies localhost:3101/api/auth/me
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/robbie-cookies localhost:3101/api/organizations
curl -s -b /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"version":"2026-10-06"}' localhost:3101/api/auth/accept-terms
curl -s -b /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"name":"Live Check"}' localhost:3101/api/organizations
curl -s -b /tmp/robbie-cookies localhost:3101/api/organizations
```

Expected, in order: the user JSON; `me` with `"termsAccepted":false`; `403`; `{"termsAccepted":true}`; the new organization with `"role":"owner"` (or `{"error":"Organization with slug 'live-check' already exists"}` on a second run); a list of only Ann's organizations, each with `"role"`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add ../spec.md ../CLAUDE.md
git commit -m "docs: record organization membership on the server"
```

---

## Self-review notes

- **Spec coverage (design section to task):**
  - Data model (`OrgRole`, `OrganizationMember`, `OrganizationInvite`, terms fields, `Amendment.createdById`, required `MeetingPacket.organizationId`, deleting existing packets): Task 1.
  - The script for existing organizations: Task 15.
  - `roles.ts`, `resolvers.ts`: Task 3. `requireRole` with its 404/403 answers and `req.org`, and the marker the route test finds: Task 4. `membershipService.ts`: Task 14 (organization listing and creation live in `organizationService.ts`, Task 5).
  - Route rules: organizations Task 5; documents and share admin Task 6; versions Task 7; sections Task 8; amendments (member drafts, `createdById`, status changes and apply at secretary) Task 9; meeting records and votes Task 10; packets Task 11; agenda items and attachments Task 12; the Bylawyer and Robbie routers Task 13; members Task 14.
  - `PUT /organizations/:id` copies only name and description; listing returns only the user's organizations with `role`; creation makes the owner with the 3-owned limit; by-slug follows the 404 rule: Task 5. `GET /bylawyer/organizations` likewise: Task 13.
  - Public share responses omit `Section.annotation`: Task 6.
  - Routes that take two resources: diff (Task 7), change sections (Task 9), vote's amendment (Task 10), reorders (Task 12; section reorder already checked, pinned in Task 8), link-document (Task 12), bulk and upload resolved through the body or query packet (Task 12).
  - Live meetings and packets: `POST /organizations/:orgId/packets` and 409 (Task 11); `GET /packets/:robbieCode` no longer creates and `POST /packets` removed (Task 1); link, unlink, meeting organization, live sync, legacy column no longer read or written, removed Robbie routes, viewer rules on the remaining two (Task 13).
  - Adding people by email: existing account, pending, already a member, pending update without email, 20 a day, email with `emailSent`, conversion inside `verifySignInCode`'s transaction with the 30-day lapse; other member routes and the owner rules: Task 14.
  - Terms: `TERMS_VERSION`, `me.termsAccepted`, `accept-terms` with 409, `requireTerms`, the socket: Task 2.
  - Error handling (404 "Not found", 403 "You need the <role> role for this", 403 `TERMS_NOT_ACCEPTED`, 409 last owner, 429 limits): Tasks 2, 4, 5, 14.
  - Testing: route coverage test (Task 4, complete in Task 13); the matrix for every route (Tasks 5 to 14, through `describeRules`); cross-organization tests per two-resource route; membership, terms and live sync tests as listed.
  - Clients (web, mobile) and the out-of-scope items are not in this plan.
- **Response changes the client plan must handle:** `GET /api/packets/:code` answers 404 when there is no packet; `GET /api/bylawyer/meeting/:code/organization` and `GET /api/robbie/sync-status/:code/:motionId` answer 404 for an unlinked code (they answered `{ linked: false }` and `{ synced: false }`); a refused request can be 403 `{ error, code: 'TERMS_NOT_ACCEPTED' }`; organization lists carry `role`; packets carry `organizationId`; amendments carry `createdById`; `/api/bylawyer/link-meeting` validates its body, so a bad one gets the `{ error: { code, message, details } }` shape.
- **Names used across tasks:** `signIn`, `call`, `TestUser`, `Method` (helpers); `seedFixture`, `Fixture` (fixtures); `describeRules`, `RuleCase` (rules); `resetDatabase`; `requireRole`, `signedInOnly`, `fromParam`, `fromBody`, `fromQuery`, `OrgResolver`, `accessRuleOf`; `atLeast`, `roleBelow`, `roleNeeded`, `canEditAmendment`, `isOrgRole`, `ROLES`; `orgOf*` resolvers; `OrgError`; `userOrganizations`, `createOwnedOrganization`, `MAX_OWNED_ORGANIZATIONS`; `listMembers`, `addMemberByEmail`, `changeRole`, `removeMember`, `cancelInvite`, `acceptPendingInvites`, `addMemberBySlug`, `MAX_ADDS_PER_DAY`, `LAST_OWNER`; `CODE_IN_USE`; `hasAcceptedTerms`, `requireTerms`, `TERMS_NOT_ACCEPTED`, `ACCEPT_THE_TERMS`; `sendAddedToOrganization`, `captureMemberEmailsForTests`, `addedToOrganizationEmail`, `appUrl`.
