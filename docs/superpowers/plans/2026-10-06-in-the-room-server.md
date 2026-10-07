# In the Room (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live meeting fit a room: a meeting code is a scheduled meeting (its packet), meeting roles come from the organization at every join (chair, admin, member, guest), attendance counts people on a device, people the chair marks present and a headcount of people without an account, votes add a floor tally the chair enters to the device votes, a secret ballot stays secret on the wire, a locked phone keeps its owner present for 90 seconds, and a display can follow the meeting without being in it.

**Architecture:** Prisma gains the organization's attendance settings (`eligibleVoters`, `quorumPercent`, `quorumCount`) and the packet's presiding officer and meeting times. In `shared/`, `Member` gains the `guest` role and `presentBy`, the state gains `headcount`, `floorVotes` and the packet's identity, and new actions (`MARK_PRESENT`, `SET_HEADCOUNT`, `SET_FLOOR_TALLY`, `SET_FLOOR_BALLOTS`, and the server-only `REFRESH_MEMBERS` and `RELOAD_AGENDA`) go through the reducer, the validator, the permission guard and the enricher like every other action; `attendanceSummary` is the one count of attendance. On the server, the join handler builds the live state from the packet (`meetingPacket.ts`) and derives each role (`meetingRoles.ts`), the enricher overwrites every actor field from a table that covers the whole action union, `statePublisher.ts` strips ballot choices from everything sent, the room manager keeps one grace timer per disconnected member, and two REST routes serve the roster and reload the agenda.

**Tech Stack:** Node 24, Express 5, Socket.io 4.8 (connection state recovery), Prisma 7 (`@prisma/adapter-pg`), zod 4, Vitest 5 (fake timers), supertest.

---

**Design:** `docs/superpowers/specs/2026-10-06-in-the-room-design.md` (Phase B of `docs/mvp-roadmap.md`). This plan is the server and shared half. A client plan follows for the chair console, phone view, display view, QR codes, the deep link and the Playwright harness; until it lands, the web screens keep working against these changes but don't use them (see "Response changes the client plan must handle" at the end).

**Conventions:**

- Paths are from the repository root. Run commands from the repository root; commands for backend-node's own scripts start with `cd backend-node &&`. Use `&&` between commands, never `;`.
- Use Node 24. The system `node` is 22; put Node 24 first on the PATH in each shell, and check that `node --version` prints `v24.21.0`:

  ```bash
  export PATH=/tmp/claude-1000/-home-steve-workspace-robbie/943dc342-9d15-4cdf-b298-60456f7372f0/scratchpad/node24/node-v24.21.0-linux-x64/bin:$PATH
  ```

- Never point anything at port 5432 (another project's database). Integration tests and migrations use a throwaway Postgres on port 55432. Start it once, if `docker ps --filter name=robbie-ci-pg` doesn't list it:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  ```

- Integration tests: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`; one file: append `-- <path>`. Unit tests: `npm run test:run -w backend-node` and `npm run test:run -w shared`; one file: `cd backend-node && npx vitest run src/__tests__/<name>.test.ts` or `cd shared && npx vitest run __tests__/<dir>/<name>.test.ts`.
- After any change under `shared/`, run `npm run build:shared` before type-checking or testing backend-node, frontend-unified or mobile: they read shared's `dist`.
- The action union is exhaustive in four places: the reducer's switch, `PERMISSIONS` in `permissionGuard.ts`, the validator's switch, and (from Task 4) `ACTOR_FIELDS` in `actionEnricher.ts`. A new action type doesn't compile until all of them have it, so each task adds every new action to all of them.
- Before/after snippets show the code as it is when the task starts. Match a snippet by its text and keep the file's indentation.
- Before each commit, run `npx prettier --write` on the TypeScript, JSON and Markdown files you changed (Prettier has no parser for `.prisma` files); CI checks formatting.
- Another agent may be committing client files on this branch. `git add` only the paths each commit step lists, and never run `git checkout`, `git stash` or `git reset`.
- Commit messages: no `Co-Authored-By` or other attribution lines.
- Task 1 writes a migration file. A project hook asks for confirmation on migration files; confirm with the owner. The migration is used exactly as Prisma generates it: no hand edits.
- Generate migrations against a fresh database made for the purpose, never the throwaway `robbie` database: `prisma migrate dev` refuses a database with tables its migrations don't know, and `robbie` has the live meetings tables that `SCHEMA_SQL` creates (every dev server start and, from Task 5, every integration run creates them; spec M5 describes the drift). Apply migrations to `robbie` with `prisma migrate deploy`, which doesn't check for drift.
- The socket handlers are tested two ways: unit tests with mocked storage under `backend-node/src/__tests__`, and integration tests that run the real handlers against the database and the live meetings table with fake sockets (`backend-node/src/__integration__/liveSockets.ts`, Task 5).

---

## File structure

| File                                                                                  | Responsibility                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `backend-node/prisma/schema.prisma`, `prisma/migrations/<timestamp>_in_the_room/`     | `Organization.eligibleVoters`, `quorumPercent`, `quorumCount` (default 3); `MeetingPacket.chairUserId`, `startedAt`, `endedAt` |
| `backend-node/src/schemas/organizations.ts`, `schemas/packets.ts`                     | The attendance settings and the presiding officer in request bodies                                                            |
| `backend-node/src/bylawyer/routes/organizations.ts`                                   | `PUT /organizations/:id` takes the attendance settings                                                                         |
| `backend-node/src/bylawyer/routes/packets.ts`                                         | Presiding officer on create and update, `GET /organizations/:orgId/packets`, the roster, reload-agenda, live chair sync        |
| `shared/types/index.ts`, `shared/types/socket.ts`                                     | `MeetingRole` with `guest`, `presentBy`, headcount, floor votes, the packet's identity, the new actions and error codes        |
| `shared/reducer/initialState.ts`, `meetingReducer.ts`, `handlers/index.ts`            | Initial values and routing for the new actions                                                                                 |
| `shared/reducer/handlers/memberHandlers.ts`                                           | `withPresence`, presence reasons, `REFRESH_MEMBERS`                                                                            |
| `shared/reducer/handlers/attendanceHandlers.ts` (new)                                 | `MARK_PRESENT`, `SET_HEADCOUNT`                                                                                                |
| `shared/reducer/handlers/agendaHandlers.ts`, `rollCallHandlers.ts`                    | `RELOAD_AGENDA`; guests off the roll; presence reasons kept straight                                                           |
| `shared/reducer/handlers/votingHandlers.ts`, `electionHandlers.ts`                    | Floor tally and floor ballots; results on both parts; every decided motion recorded; ballots keep no choices                   |
| `shared/utils/attendance.ts` (new)                                                    | `attendanceSummary`, `quorumFromSettings`                                                                                      |
| `shared/utils/voteCalculator.ts`                                                      | `addVotes`, `completedMotionVotes`, `NO_VOTES`                                                                                 |
| `shared/utils/minutesGenerator.ts`, `motionHistoryHelper.ts`, `motionHelpers.ts`      | Headcount, guests and both parts of each vote in the minutes; reconsider offered only where it applies                         |
| `shared/constants/logMessages.ts`                                                     | `logMemberMarkedPresent`, `logHeadcountSet`                                                                                    |
| `backend-node/src/socket/permissionGuard.ts`                                          | The matrix with `guest`; server-only actions; `ACTION_TYPES`                                                                   |
| `backend-node/src/socket/actionValidator.ts`                                          | The new actions; voice votes; the deciding vote on both parts; guests; who may yield or answer a proxy request                 |
| `backend-node/src/socket/actionEnricher.ts`                                           | `ACTOR_FIELDS`: who acts, for every action type                                                                                |
| `backend-node/src/socket/statePublisher.ts` (new)                                     | `publicState`, `emitState`: no ballot choices on the wire                                                                      |
| `backend-node/src/socket/meetingPacket.ts` (new)                                      | Packet and roster lookups, `stateFromPacket`, `savePresidingOfficer`, `recordMeetingTimes`                                     |
| `backend-node/src/socket/meetingRoles.ts` (new)                                       | `deriveMeetingRole`, `roleChanges`, `updateSocketRoles`, `syncMeetingRoles`                                                    |
| `backend-node/src/socket/attendanceActions.ts` (new)                                  | `MARK_PRESENT` from the roster; `MARK_ABSENT` only once a device is gone                                                       |
| `backend-node/src/socket/joinHandler.ts`                                              | Join from the packet; displays; names; roles; recovered sockets                                                                |
| `backend-node/src/socket/roleChangeHandler.ts`                                        | Only the chair is handed over; recorded on the packet                                                                          |
| `backend-node/src/socket/actionHandler.ts`                                            | Displays refused, quorum from `attendanceSummary`, attendance preparation, role sync, meeting times, `emitState`               |
| `backend-node/src/socket/roomManager.ts`                                              | `PRESENCE_GRACE_MS` and one grace timer per member                                                                             |
| `backend-node/src/socket/disconnectHandler.ts`, `presenceReconciler.ts`               | Grace period on a dropped connection; only device presence cleared; reconcile after the grace period                           |
| `backend-node/src/socket/socketHandler.ts`, `stateRequestHandler.ts`, `socketAuth.ts` | Recovered sockets; public state; no email for a name                                                                           |
| `backend-node/src/db/meetingStorage.ts`                                               | `getOrCreateMeeting(code, initial)`, `withDefaults`; participant roles removed                                                 |
| `backend-node/src/index.ts`                                                           | `connectionStateRecovery` (2 minutes)                                                                                          |
| `backend-node/src/bylawyer/bylawSyncService.ts`                                       | The synced vote records both parts                                                                                             |
| `frontend-unified/src/modules/meetings/views/AdminView.tsx`                           | One line, so it compiles with the `guest` role                                                                                 |
| `backend-node/src/__integration__/db.ts`, `liveSockets.ts` (new)                      | `resetLiveMeetings`; fake sockets for the real socket handlers                                                                 |
| `spec.md`, `CLAUDE.md`                                                                | Milestones and project guidance (Task 8)                                                                                       |

---

### Task 1: Attendance settings, the presiding officer, and the schedule list

**Files:**

- Modify: `backend-node/prisma/schema.prisma`
- Create: `backend-node/prisma/migrations/<timestamp>_in_the_room/migration.sql` (generated, unedited)
- Modify: `backend-node/src/schemas/organizations.ts`, `backend-node/src/schemas/packets.ts`, `backend-node/src/bylawyer/routes/organizations.ts`, `backend-node/src/bylawyer/routes/packets.ts`
- Test: `backend-node/src/__integration__/organizations.test.ts`, `backend-node/src/__integration__/packets.test.ts`

The presiding officer must be a member of the packet's organization with the member role or above (a homeowner can preside; a viewer can't), and defaults to the person creating the packet. `null` means no presiding officer: the admins run the meeting. The schedule lists meetings not yet adjourned first, soonest first with undated ones after them, then adjourned ones, most recent first.

- [ ] **Step 1: Edit `backend-node/prisma/schema.prisma`**

In `model Organization`, replace:

<!-- prettier-ignore -->
```prisma
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  documents Document[]
```

with:

<!-- prettier-ignore -->
```prisma
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // How many voting members the organization has (for an HOA, lots or units): the quorum
  // denominator. Null means the roster's members with the member role or above.
  eligibleVoters Int?
  // Quorum: a percentage of eligibleVoters, or a fixed count. One of the two is set.
  quorumPercent  Int?
  quorumCount    Int? @default(3)

  documents Document[]
```

In `model MeetingPacket`, replace:

<!-- prettier-ignore -->
```prisma
  scheduledFor   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
```

with:

<!-- prettier-ignore -->
```prisma
  scheduledFor   DateTime?
  // The presiding officer: chairs the live meeting
  chairUserId    Int?
  // When the live meeting was called to order and adjourned
  startedAt      DateTime?
  endedAt        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  chair        User?               @relation(fields: [chairUserId], references: [id], onDelete: SetNull)
```

In `model User`, replace:

<!-- prettier-ignore -->
```prisma
  memberships OrganizationMember[]
  invitesSent OrganizationInvite[]
  amendments  Amendment[]
}
```

with:

<!-- prettier-ignore -->
```prisma
  memberships OrganizationMember[]
  invitesSent OrganizationInvite[]
  amendments  Amendment[]
  chairing    MeetingPacket[]
}
```

Then run `cd backend-node && npx prisma format` and expect "Formatted prisma/schema.prisma". The snippets above are already as `prisma format` leaves them.

- [ ] **Step 2: Generate the migration without applying it**

Generate it against a fresh database (see Conventions: `migrate dev` refuses the throwaway `robbie` database for its live meetings tables), then drop that database. `DIRECT_URL` must be set explicitly: `prisma.config.ts` loads `.env`, which would otherwise supply the developer database.

Run:

```bash
docker exec robbie-ci-pg createdb -U postgres robbie_migrate
cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate npx prisma migrate deploy && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate npx prisma migrate dev --create-only --name in_the_room
docker exec robbie-ci-pg dropdb -U postgres robbie_migrate
```

Expected: `All migrations have been successfully applied.` (the existing four, to the fresh database), then `Prisma Migrate created the following migration without applying it <timestamp>_in_the_room`. The file is the whole change and needs no edit. Existing organizations get a quorum count of 3 from the column default, matching today's meeting default:

```sql
-- AlterTable
ALTER TABLE "MeetingPacket" ADD COLUMN     "chairUserId" INTEGER,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "eligibleVoters" INTEGER,
ADD COLUMN     "quorumCount" INTEGER DEFAULT 3,
ADD COLUMN     "quorumPercent" INTEGER;

-- AddForeignKey
ALTER TABLE "MeetingPacket" ADD CONSTRAINT "MeetingPacket_chairUserId_fkey" FOREIGN KEY ("chairUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply it to the throwaway database and regenerate the client**

Run:

```bash
cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate deploy && npm run db:generate && npx tsc --noEmit -p .
```

Expected: `Applying migration <timestamp>_in_the_room`, `All migrations have been successfully applied.`, `Generated Prisma Client`, and a clean type-check.

- [ ] **Step 4: Write the failing tests**

In `backend-node/src/__integration__/organizations.test.ts`, insert before `it('changes only the name and description', async () => {`:

<!-- prettier-ignore -->
```ts
  it('start with a quorum of 3', async () => {
    const res = await call('get', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.body).toMatchObject({ eligibleVoters: null, quorumPercent: null, quorumCount: 3 });
  });

  it('set the voting members and the quorum, as a percentage or a count', async () => {
    const put = (body: object) =>
      call('put', `/api/organizations/${f.orgA.id}`, { cookie: f.users.admin.cookie, body });

    const percent = await put({ eligibleVoters: 142, quorumPercent: 20 });
    expect(percent.status).toBe(200);
    expect(percent.body).toMatchObject({
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
    });

    const count = await put({ quorumCount: 25 });
    expect(count.body).toMatchObject({ eligibleVoters: 142, quorumPercent: null, quorumCount: 25 });

    const roster = await put({ eligibleVoters: null });
    expect(roster.body).toMatchObject({ eligibleVoters: null, quorumCount: 25 });

    const read = await call('get', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(read.body).toMatchObject({ eligibleVoters: null, quorumPercent: null, quorumCount: 25 });
  });

  it('refuse attendance settings out of range, or the quorum set both ways', async () => {
    for (const body of [
      { quorumPercent: 0 },
      { quorumPercent: 101 },
      { quorumPercent: 12.5 },
      { quorumCount: 0 },
      { quorumCount: null },
      { eligibleVoters: 0 },
      { quorumPercent: 20, quorumCount: 5 },
    ]) {
      const res = await call('put', `/api/organizations/${f.orgA.id}`, {
        cookie: f.users.admin.cookie,
        body,
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: f.orgA.id } });
    expect(org).toMatchObject({ eligibleVoters: null, quorumPercent: null, quorumCount: 3 });
  });


```

In `backend-node/src/__integration__/packets.test.ts`, change the import of the packets router to:

```ts
import { CHAIR_NOT_MEMBER, packetsRouter } from '../bylawyer/routes/packets.js';
```

add this case first in the `describeRules('packet rules', [` list:

<!-- prettier-ignore -->
```ts
  {
    method: 'get',
    route: '/organizations/:orgId/packets',
    path: (f) => `/api/organizations/${f.orgA.id}/packets`,
    min: 'viewer',
    ok: 200,
  },
```

and insert before `it('are no longer created without an organization', async () => {`:

<!-- prettier-ignore -->
```ts
  it('are presided over by their creator unless another member is named', async () => {
    const path = `/api/organizations/${f.orgA.id}/packets`;
    const cookie = f.users.secretary.cookie;
    const byCreator = await call('post', path, { cookie, body: { robbieCode: 'NEW001' } });
    expect(byCreator.body.chairUserId).toBe(f.users.secretary.id);

    const named = await call('post', path, {
      cookie,
      body: { robbieCode: 'NEW002', chairUserId: f.users.member.id },
    });
    expect(named.status).toBe(201);
    expect(named.body.chairUserId).toBe(f.users.member.id);

    const none = await call('post', path, {
      cookie,
      body: { robbieCode: 'NEW003', chairUserId: null },
    });
    expect(none.body.chairUserId).toBeNull();
  });

  it('refuse a presiding officer who is a viewer or outside the organization', async () => {
    for (const chairUserId of [f.users.viewer.id, f.outsider.id, 99999]) {
      const created = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
        cookie: f.users.secretary.cookie,
        body: { robbieCode: 'NEW001', chairUserId },
      });
      expect(created.status, `create with ${chairUserId}`).toBe(400);
      expect(created.body).toEqual({ error: CHAIR_NOT_MEMBER });

      const updated = await call('put', `/api/packets/${f.packet.id}`, {
        cookie: f.users.secretary.cookie,
        body: { chairUserId },
      });
      expect(updated.status, `update to ${chairUserId}`).toBe(400);
    }
    expect(await prisma.meetingPacket.count({ where: { robbieCode: 'NEW001' } })).toBe(0);
  });

  it('change their presiding officer, or have none', async () => {
    const put = (chairUserId: number | null) =>
      call('put', `/api/packets/${f.packet.id}`, {
        cookie: f.users.secretary.cookie,
        body: { chairUserId },
      });
    expect((await put(f.users.admin.id)).body.chairUserId).toBe(f.users.admin.id);
    expect((await put(null)).body.chairUserId).toBeNull();
  });

  it('lose their presiding officer when the user is deleted', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    await prisma.user.delete({ where: { id: f.users.member.id } });
    const packet = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(packet.chairUserId).toBeNull();
  });

  it('are listed for the organization, meetings not yet adjourned first', async () => {
    const org = f.orgA.id;
    const create = (robbieCode: string, data: object) =>
      prisma.meetingPacket.create({ data: { organizationId: org, robbieCode, ...data } });
    await create('SOON01', { scheduledFor: new Date('2026-11-01') });
    await create('LATER1', { scheduledFor: new Date('2026-12-01') });
    await create('DONE01', {
      scheduledFor: new Date('2026-09-01'),
      startedAt: new Date('2026-09-01T19:00:00Z'),
      endedAt: new Date('2026-09-01T20:00:00Z'),
    });
    await create('DONE02', {
      scheduledFor: new Date('2026-10-01'),
      startedAt: new Date('2026-10-01T19:00:00Z'),
      endedAt: new Date('2026-10-01T20:00:00Z'),
    });

    const res = await call('get', `/api/organizations/${org}/packets`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(200);
    // The fixture's two packets have no date, so they follow the dated upcoming ones
    expect(res.body.map((p: { robbieCode: string }) => p.robbieCode)).toEqual([
      'SOON01',
      'LATER1',
      'ORGA01',
      'ORGA02',
      'DONE02',
      'DONE01',
    ]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      robbieCode: 'SOON01',
      title: null,
      description: null,
      scheduledFor: '2026-11-01T00:00:00.000Z',
      chairUserId: null,
      startedAt: null,
      endedAt: null,
      chair: null,
    });
  });


```

- [ ] **Step 5: Run them to see them fail**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/organizations.test.ts src/__integration__/packets.test.ts`
Expected: FAIL. Packet responses have no `chairUserId`, a viewer as presiding officer is accepted, and `GET /api/organizations/:orgId/packets` answers 404 (no such route, so the rule case fails too); the settings test fails because zod drops the attendance fields (`eligibleVoters` stays null), and the out-of-range values are accepted.

- [ ] **Step 6: Take the attendance settings in `backend-node/src/schemas/organizations.ts`**

Replace:

```ts
// Only the name and description change here; zod drops any other field
export const updateOrganizationBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});
```

with:

```ts
/** The answer when a request sets the quorum both ways */
export const ONE_QUORUM = 'Set the quorum as a percentage or as a count, not both';

// The name, the description and the attendance settings change here; zod drops any other
// field. Setting the quorum one way clears the other (see PUT /organizations/:id).
export const updateOrganizationBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    // How many voting members the organization has; null counts the roster instead
    eligibleVoters: z.number().int().min(1).max(1_000_000).nullable().optional(),
    quorumPercent: z.number().int().min(1).max(100).optional(),
    quorumCount: z.number().int().min(1).max(1_000_000).optional(),
  })
  .refine((body) => body.quorumPercent === undefined || body.quorumCount === undefined, {
    message: ONE_QUORUM,
    path: ['quorumCount'],
  });
```

In `backend-node/src/bylawyer/routes/organizations.ts`, add after `import { Router, type Router as RouterType } from 'express';`:

```ts
import type { Prisma } from '../../generated/prisma/client.js';
```

and replace:

<!-- prettier-ignore -->
```ts
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
```

with:

<!-- prettier-ignore -->
```ts
// Update the organization's name, description and attendance settings. The quorum is a
// percentage or a count: setting one clears the other.
organizationsRouter.put(
  '/organizations/:id',
  validate({ params: uuidParam, body: updateOrganizationBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const { name, description, eligibleVoters, quorumPercent, quorumCount } = req.body;
      const data: Prisma.OrganizationUpdateInput = { name, description, eligibleVoters };
      if (quorumPercent !== undefined) {
        data.quorumPercent = quorumPercent;
        data.quorumCount = null;
      } else if (quorumCount !== undefined) {
        data.quorumCount = quorumCount;
        data.quorumPercent = null;
      }
      const updated = await prisma.organization.update({ where: { id: req.params.id }, data });
```

`GET /organizations/:id` and the organization list return every column, so they carry the three settings with no change.

- [ ] **Step 7: Take the presiding officer in `backend-node/src/schemas/packets.ts`**

Replace the two body schemas with:

```ts
/** The presiding officer: a user id, or null for none */
const chairUserId = z.number().int().positive().nullable();

export const createPacketBody = z.object({
  robbieCode: meetingCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: dateString.optional(),
  // Defaults to the person creating the packet
  chairUserId: chairUserId.optional(),
});

export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  scheduledFor: z.string().optional().nullable(),
  chairUserId: chairUserId.optional(),
});
```

- [ ] **Step 8: Check and store the presiding officer, and list the schedule, in `backend-node/src/bylawyer/routes/packets.ts`**

Add after `import { orgOfOrganization, orgOfPacket, orgOfPacketCode } from '../../orgs/resolvers.js';`:

```ts
import { atLeast } from '../../orgs/roles.js';
```

After the `CODE_IN_USE` constant, add:

```ts
/** The answer when the presiding officer named isn't a voting member of the organization */
export const CHAIR_NOT_MEMBER =
  'The presiding officer must be a member of the organization with the member role or above';

/** Whether a user may preside over the organization's meetings: member role or above */
async function canPreside(organizationId: string, userId: number): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return !!membership && atLeast(membership.role, 'member');
}
```

Before the `POST /api/organizations/:orgId/packets` comment block, add:

```ts
/**
 * GET /api/organizations/:orgId/packets
 * The organization's scheduled meetings: those not yet adjourned first, soonest first (those
 * without a date after them), then the adjourned ones, most recent first
 */
packetsRouter.get(
  '/organizations/:orgId/packets',
  validate({ params: orgIdParam }),
  requireRole('viewer', fromParam('orgId', orgOfOrganization)),
  async (req, res) => {
    try {
      const organizationId = req.org!.id;
      const select = {
        id: true,
        robbieCode: true,
        title: true,
        description: true,
        scheduledFor: true,
        chairUserId: true,
        startedAt: true,
        endedAt: true,
        chair: { select: { name: true } },
      } as const;
      const [upcoming, past] = await Promise.all([
        prisma.meetingPacket.findMany({
          where: { organizationId, endedAt: null },
          select,
          orderBy: [{ scheduledFor: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        }),
        prisma.meetingPacket.findMany({
          where: { organizationId, endedAt: { not: null } },
          select,
          orderBy: { endedAt: 'desc' },
        }),
      ]);
      res.json([...upcoming, ...past]);
    } catch (error) {
      logger.error({ err: error }, 'Error listing packets');
      res.status(500).json({ error: 'Failed to list meeting packets' });
    }
  },
);
```

In the `POST /api/organizations/:orgId/packets` comment, replace the last two lines (`organizations.` and the `Body:` line) with:

```ts
 * organizations. The presiding officer defaults to the person creating it.
 * Body: { robbieCode, title?, description?, scheduledFor?, chairUserId? }
```

In its handler, replace:

<!-- prettier-ignore -->
```ts
      const { robbieCode, title, description, scheduledFor } = req.body;

      const packet = await prisma.meetingPacket.create({
        data: {
          organizationId: req.org!.id,
          robbieCode,
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        },
```

with:

<!-- prettier-ignore -->
```ts
      const { robbieCode, title, description, scheduledFor } = req.body;
      const chairUserId: number | null =
        req.body.chairUserId === undefined ? req.user!.id : req.body.chairUserId;
      if (chairUserId !== null && !(await canPreside(req.org!.id, chairUserId))) {
        return res.status(400).json({ error: CHAIR_NOT_MEMBER });
      }

      const packet = await prisma.meetingPacket.create({
        data: {
          organizationId: req.org!.id,
          robbieCode,
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
```

In the `PUT /api/packets/:id` comment, change the `Body:` line to ` * Body: { title?, description?, scheduledFor?, chairUserId? }`. In its handler, replace:

<!-- prettier-ignore -->
```ts
      const { title, description, scheduledFor } = req.body;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      const updated = await prisma.meetingPacket.update({
        where: { id },
        data: {
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        },
```

with:

<!-- prettier-ignore -->
```ts
      const { title, description, scheduledFor, chairUserId } = req.body;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }
      if (
        typeof chairUserId === 'number' &&
        !(await canPreside(packet.organizationId, chairUserId))
      ) {
        return res.status(400).json({ error: CHAIR_NOT_MEMBER });
      }

      const updated = await prisma.meetingPacket.update({
        where: { id },
        data: {
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
```

- [ ] **Step 9: Run them to see them pass**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/organizations.test.ts src/__integration__/packets.test.ts`
Expected: 33 passed (15 in `organizations.test.ts`, 18 in `packets.test.ts`).

- [ ] **Step 10: Type-check and run everything**

Run: `cd backend-node && npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass (the route coverage test finds a rule on the new route).

- [ ] **Step 11: Commit**

```bash
npx prettier --write backend-node/src/schemas/organizations.ts backend-node/src/schemas/packets.ts backend-node/src/bylawyer/routes/organizations.ts backend-node/src/bylawyer/routes/packets.ts backend-node/src/__integration__/organizations.test.ts backend-node/src/__integration__/packets.test.ts
git add backend-node/prisma/schema.prisma backend-node/prisma/migrations backend-node/src/schemas/organizations.ts backend-node/src/schemas/packets.ts backend-node/src/bylawyer/routes/organizations.ts backend-node/src/bylawyer/routes/packets.ts backend-node/src/__integration__/organizations.test.ts backend-node/src/__integration__/packets.test.ts
git commit -m "feat(room): organization attendance settings and the presiding officer

Organizations record how many voting members they have and a quorum as a
percentage or a count (3 by default). A packet names its presiding officer
(the person scheduling it, unless another member is named) and records when
the meeting started and ended. GET /api/organizations/:orgId/packets lists
the schedule, meetings not yet adjourned first."
```

---

### Task 2: Meeting roles and attendance in the shared state

Shared gains the `guest` role, why each member is present, the headcount, the packet's identity on the state, and five actions: `MARK_PRESENT` and `SET_HEADCOUNT` (chair and admins), and the server-only `REFRESH_MEMBERS` (names and roles from the organization), `RELOAD_AGENDA` (the packet's agenda) and, already there, `ADD_MEMBER` and `SET_MEMBER_PRESENCE`. `attendanceSummary` is the one count of attendance. The permission guard gets the `guest` role and its matrix in this task, since `SocketData.role` becomes `MeetingRole` and the guard must accept it.

`MARK_PRESENT` is one reducer action rather than `ADD_MEMBER` plus `SET_MEMBER_PRESENCE`: the server fills in `member` from the organization's roster (Task 6), and the reducer adds the person if needed and marks them present by the chair in one write and one log line. Until Task 6 the enricher drops any `member` a client sends, so the validator refuses every `MARK_PRESENT` as not in the roster.

**Files:**

- Create: `shared/utils/attendance.ts`, `shared/reducer/handlers/attendanceHandlers.ts`
- Modify: `shared/types/index.ts`, `shared/types/socket.ts`, `shared/reducer/initialState.ts`, `shared/reducer/meetingReducer.ts`, `shared/reducer/handlers/index.ts`, `shared/reducer/handlers/memberHandlers.ts`, `shared/reducer/handlers/agendaHandlers.ts`, `shared/reducer/handlers/rollCallHandlers.ts`, `shared/constants/logMessages.ts`, `shared/utils/index.ts`, `shared/utils/minutesGenerator.ts`
- Modify: `backend-node/src/socket/permissionGuard.ts`, `backend-node/src/socket/actionValidator.ts`, `backend-node/src/socket/actionEnricher.ts`, `frontend-unified/src/modules/meetings/views/AdminView.tsx`
- Test: `shared/__tests__/reducer/attendance.test.ts`, `shared/__tests__/utils/attendance.test.ts` (new), `shared/__tests__/utils/minutesGenerator.test.ts`, `backend-node/src/__tests__/permissionGuard.test.ts`, `backend-node/src/__tests__/attendanceValidation.test.ts` (new), `backend-node/src/__tests__/actionEnricher.test.ts`

- [ ] **Step 1: Write the failing reducer test**

Create `shared/__tests__/reducer/attendance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import type { MeetingState, Member } from '../../types/index.js';

const ann: Member = { id: 1, name: 'Ann', role: 'member', present: true, presentBy: 'device' };
const bo: Member = { id: 2, name: 'Bo', role: 'member', present: false };
const state: MeetingState = { ...initialState, members: [ann, bo] };

describe('attendance actions', () => {
  describe('SET_MEMBER_PRESENCE', () => {
    it('marks a connecting device present, and clears the reason when it leaves', () => {
      const joined = meetingReducer(state, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 2,
        present: true,
        timestamp: '10:00',
      });
      expect(joined.members[1]).toEqual({ ...bo, present: true, presentBy: 'device' });
      expect(joined.meetingLog.at(-1)?.message).toBe('Bo is now present.');

      const left = meetingReducer(joined, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 2,
        present: false,
        timestamp: '10:05',
      });
      expect(left.members[1]).toEqual(bo);
      expect(left.members[1]).not.toHaveProperty('presentBy');
    });

    it('changes nothing, and logs nothing, when a present device reconnects', () => {
      const again = meetingReducer(state, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 1,
        present: true,
        timestamp: '10:00',
      });
      expect(again).toBe(state);
    });

    it('keeps a member marked present by the chair marked when their device connects', () => {
      const marked: MeetingState = {
        ...state,
        members: [ann, { ...bo, present: true, presentBy: 'chair' }],
      };
      const connected = meetingReducer(marked, {
        type: 'SET_MEMBER_PRESENCE',
        memberId: 2,
        present: true,
        presentBy: 'device',
        timestamp: '10:00',
      });
      expect(connected).toBe(marked);
    });
  });

  describe('MARK_PRESENT', () => {
    const fromRoster: Member = { id: 3, name: 'Cy', role: 'member', present: true };

    it('adds a person from the roster, marked present by the chair', () => {
      const next = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 3,
        member: fromRoster,
        timestamp: '10:00',
      });
      expect(next.members[2]).toEqual({ ...fromRoster, present: true, presentBy: 'chair' });
      expect(next.meetingLog.at(-1)?.message).toBe('Cy marked present.');
    });

    it('marks an absent member present, and a device-present one as marked', () => {
      const bob = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 2,
        member: { ...bo, present: true },
        timestamp: '10:00',
      });
      expect(bob.members[1]).toEqual({ ...bo, present: true, presentBy: 'chair' });

      const annMarked = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 1,
        member: ann,
        timestamp: '10:00',
      });
      expect(annMarked.members[0].presentBy).toBe('chair');
    });

    it('does nothing without the roster entry the server fills in', () => {
      const next = meetingReducer(state, { type: 'MARK_PRESENT', userId: 3, timestamp: '10:00' });
      expect(next).toBe(state);
      const wrong = meetingReducer(state, {
        type: 'MARK_PRESENT',
        userId: 4,
        member: fromRoster,
        timestamp: '10:00',
      });
      expect(wrong).toBe(state);
    });
  });

  describe('MARK_ABSENT', () => {
    it('clears the reason a member was present', () => {
      const marked: MeetingState = {
        ...state,
        members: [{ ...ann, presentBy: 'chair' }, bo],
      };
      const next = meetingReducer(marked, {
        type: 'MARK_ABSENT',
        memberId: 1,
        excused: false,
        timestamp: '10:00',
      });
      expect(next.members[0]).toEqual({ id: 1, name: 'Ann', role: 'member', present: false });
    });
  });

  describe('SET_HEADCOUNT', () => {
    it('replaces the count and the names, which are trimmed', () => {
      const first = meetingReducer(state, {
        type: 'SET_HEADCOUNT',
        count: 3,
        names: [' Dee ', '', 'Eli'],
        timestamp: '10:00',
      });
      expect(first.headcount).toBe(3);
      expect(first.headcountNames).toEqual(['Dee', 'Eli']);
      expect(first.meetingLog.at(-1)?.message).toBe('3 people present without an account.');

      const corrected = meetingReducer(first, {
        type: 'SET_HEADCOUNT',
        count: 1,
        names: [],
        timestamp: '10:05',
      });
      expect(corrected.headcount).toBe(1);
      expect(corrected.headcountNames).toEqual([]);
      expect(corrected.meetingLog.at(-1)?.message).toBe('1 person present without an account.');
    });

    it('logs nothing when nothing changes', () => {
      const same = { ...state, headcount: 2, headcountNames: ['Dee'] };
      const next = meetingReducer(same, {
        type: 'SET_HEADCOUNT',
        count: 2,
        names: ['Dee'],
        timestamp: '10:00',
      });
      expect(next).toBe(same);
    });
  });

  describe('REFRESH_MEMBERS', () => {
    it('updates names and roles, keeping one chair, and logs nothing', () => {
      const withChair: MeetingState = {
        ...state,
        members: [{ ...ann, role: 'chair' }, bo],
      };
      const next = meetingReducer(withChair, {
        type: 'REFRESH_MEMBERS',
        members: [{ id: 2, name: 'Bo Brown', role: 'chair' }],
        timestamp: '10:00',
      });
      expect(next.members).toEqual([
        { ...ann, role: 'member' },
        { ...bo, name: 'Bo Brown', role: 'chair' },
      ]);
      expect(next.meetingLog).toEqual([]);
    });
  });

  describe('RELOAD_AGENDA', () => {
    it('replaces the agenda, not yet adopted', () => {
      const adopted: MeetingState = {
        ...state,
        agenda: [{ id: 1, title: 'Old', status: 'pending' }],
        agendaAdopted: true,
      };
      const agenda = [
        { id: 7, title: 'Call to order', status: 'pending' as const, packetItemId: 'item-1' },
      ];
      const next = meetingReducer(adopted, { type: 'RELOAD_AGENDA', agenda, timestamp: '9:00' });
      expect(next.agenda).toEqual(agenda);
      expect(next.agendaAdopted).toBe(false);
      expect(next.currentAgendaItem).toBeNull();
    });
  });

  describe('START_ROLL_CALL', () => {
    it('leaves guests out of the roll', () => {
      const withGuest: MeetingState = {
        ...state,
        members: [ann, { id: 9, name: 'Guest', role: 'guest', present: true }],
      };
      const next = meetingReducer(withGuest, { type: 'START_ROLL_CALL', timestamp: '10:00' });
      expect(next.rollCall?.responses.map((r) => r.memberId)).toEqual([1]);
    });
  });
});
```

- [ ] **Step 2: Write the failing attendance test**

Create `shared/__tests__/utils/attendance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '../../reducer/index.js';
import { attendanceSummary, quorumFromSettings } from '../../utils/index.js';
import type { MeetingState, Member } from '../../types/index.js';

const member = (id: number, present: boolean, extra: Partial<Member> = {}): Member => ({
  id,
  name: `Member ${id}`,
  role: 'member',
  present,
  ...(present ? { presentBy: 'device' as const } : {}),
  ...extra,
});

describe('attendanceSummary', () => {
  it('counts devices, members marked present and the headcount, never guests', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 5,
      headcount: 2,
      members: [
        member(1, true),
        member(2, true, { role: 'chair' }),
        member(3, true, { presentBy: 'chair' }),
        member(4, false),
        member(5, true, { role: 'guest' }),
        member(6, false, { role: 'guest' }),
      ],
    };
    expect(attendanceSummary(state)).toEqual({
      devicePresent: 2,
      markedPresent: 1,
      headcount: 2,
      proxies: 0,
      present: 5,
      quorum: 5,
      hasQuorum: true,
      guests: 1,
    });
  });

  it('counts a present member saved without a reason as on a device', () => {
    const state = {
      ...initialState,
      members: [{ id: 1, name: 'A', role: 'member' as const, present: true }],
    };
    expect(attendanceSummary(state).devicePresent).toBe(1);
  });

  it('counts absent members represented by a present proxy holder, when proxies count', () => {
    const proxy = {
      id: 1,
      grantedBy: 2,
      grantedTo: 1,
      grantedByName: 'Member 2',
      grantedToName: 'Member 1',
      grantedAt: '10:00',
      scope: 'all' as const,
    };
    const state: MeetingState = {
      ...initialState,
      quorum: 2,
      members: [member(1, true), member(2, false)],
      proxies: [proxy],
    };
    expect(attendanceSummary(state)).toMatchObject({ proxies: 0, present: 1, hasQuorum: false });
    const counting = { ...state, proxiesCountForQuorum: true };
    expect(attendanceSummary(counting)).toMatchObject({ proxies: 1, present: 2, hasQuorum: true });
  });

  it('reads a state saved before the headcount existed', () => {
    const { headcount: _h, headcountNames: _n, ...old } = initialState;
    expect(attendanceSummary(old as MeetingState).headcount).toBe(0);
  });
});

describe('quorumFromSettings', () => {
  it('takes a percentage of the eligible voters, rounded up', () => {
    expect(
      quorumFromSettings({ eligibleVoters: 142, quorumPercent: 20, quorumCount: null }, 9),
    ).toBe(29);
  });

  it('takes a percentage of the roster when the organization has no count', () => {
    expect(
      quorumFromSettings({ eligibleVoters: null, quorumPercent: 50, quorumCount: null }, 9),
    ).toBe(5);
    expect(
      quorumFromSettings({ eligibleVoters: null, quorumPercent: 50, quorumCount: null }, 0),
    ).toBe(1);
  });

  it('takes a fixed count, 3 when nothing is set', () => {
    expect(
      quorumFromSettings({ eligibleVoters: 142, quorumPercent: null, quorumCount: 25 }, 9),
    ).toBe(25);
    expect(
      quorumFromSettings({ eligibleVoters: null, quorumPercent: null, quorumCount: null }, 9),
    ).toBe(3);
  });
});
```

In `shared/__tests__/utils/minutesGenerator.test.ts`, insert before `it('should calculate quorum status', () => {`:

<!-- prettier-ignore -->
```ts
  it('should record the headcount and members marked present', () => {
    const state = createMockState({
      headcount: 2,
      headcountNames: ['Dee'],
      members: [
        { id: 1, name: 'Alice', role: 'chair', present: true },
        { id: 2, name: 'Bob', role: 'member', present: true, presentBy: 'chair' },
        { id: 4, name: 'Gus', role: 'guest', present: true },
      ],
      meetingLog: [
        { time: '10:00:00', message: 'Meeting called to order.' },
        { time: '10:05:00', message: 'Bob marked present.' },
        { time: '10:30:00', message: 'Meeting adjourned.' },
      ],
    });
    const minutes = generateMeetingMinutes(state);

    expect(minutes.headcount).toBe(2);
    expect(minutes.headcountNames).toEqual(['Dee']);
    expect(minutes.attendance.find((a) => a.name === 'Bob')).toMatchObject({
      status: 'late',
      arrivedAt: '10:05:00',
    });

    const markdown = formatMinutesAsMarkdown(minutes);
    expect(markdown).toContain('**Also present without an account:** 2: Dee');
    expect(markdown).toContain('**Guests:**\n- Gus');
    expect(markdown).not.toContain('- Gus (');
  });

  it('should count the headcount toward quorum', () => {
    const state = createMockState({ quorum: 4, headcount: 2 });
    expect(generateMeetingMinutes(state).quorumPresent).toBe(true); // 2 members and 2 more
  });


```

- [ ] **Step 3: Run them to see them fail**

Run: `npm run test:run -w shared`
Expected: FAIL. `attendanceSummary is not a function`; the reducer's default case leaves the state alone for `MARK_PRESENT`, `SET_HEADCOUNT`, `REFRESH_MEMBERS` and `RELOAD_AGENDA`; `SET_MEMBER_PRESENCE` sets no `presentBy`; the minutes have no `headcount`.

- [ ] **Step 4: Add the types**

In `shared/types/index.ts`, replace:

```ts
// Member and Meeting types
export interface Member {
  id: number;
  name: string;
  role: 'member' | 'chair' | 'admin';
  present: boolean;
  selfRenameUsed?: boolean; // Members can only rename themselves once
}
```

with:

```ts
// Member and Meeting types

/**
 * A person's role in a live meeting, derived from the organization at every join: the
 * presiding officer is the chair, secretaries and above are admins, members are members, and
 * everyone else (viewers, people outside the organization) is a guest
 */
export type MeetingRole = 'chair' | 'admin' | 'member' | 'guest';

export interface Member {
  id: number;
  name: string;
  role: MeetingRole;
  present: boolean;
  /**
   * Why a present member is present: their device is connected, or the chair or secretary
   * marked them present. Only device presence ends when the device disconnects. Absent on a
   * member who isn't present (and on states saved before it existed, where it means device).
   */
  presentBy?: 'device' | 'chair';
  selfRenameUsed?: boolean; // Members can only rename themselves once
}
```

Replace the `AgendaItem` interface with:

```ts
export interface AgendaItem {
  id: number;
  title: string;
  status: 'pending' | 'active' | 'completed';
  /** The scheduled agenda item (MeetingAgendaItem) this came from, for its attachments */
  packetItemId?: string;
}
```

In `MeetingState`, replace:

<!-- prettier-ignore -->
```ts
  meetingCode: string;
  members: Member[];
  quorum: number;
```

with:

<!-- prettier-ignore -->
```ts
  meetingCode: string;
  /** The meeting's organization, title and date, from its packet */
  organizationId: string | null;
  title: string;
  scheduledFor: string | null;
  members: Member[];
  quorum: number;
  /** People in the room without an account, counted by the chair, and the names given */
  headcount: number;
  headcountNames: string[];
```

In `MeetingAction`, replace:

<!-- prettier-ignore -->
```ts
  | { type: 'ADD_MEMBER'; member: Member; timestamp: string }
  | { type: 'SET_MEMBER_PRESENCE'; memberId: number; present: boolean; timestamp: string }
```

with:

<!-- prettier-ignore -->
```ts
  // Server-only: a member joins (see the join handler)
  | { type: 'ADD_MEMBER'; member: Member; timestamp: string }
  // Server-only: a device connects or disconnects. presentBy defaults to 'device'.
  | {
      type: 'SET_MEMBER_PRESENCE';
      memberId: number;
      present: boolean;
      presentBy?: 'device' | 'chair';
      timestamp: string;
    }
  // Server-only: names and roles as the organization has them now, refreshed at each join
  | {
      type: 'REFRESH_MEMBERS';
      members: Array<{ id: number; name: string; role: MeetingRole }>;
      timestamp: string;
    }
  // The chair marks a person from the organization's roster present. The server fills in
  // member from the roster; a client's member is replaced.
  | { type: 'MARK_PRESENT'; userId: number; member?: Member; timestamp: string }
  // People in the room without an account: replaces the count and the names
  | { type: 'SET_HEADCOUNT'; count: number; names: string[]; timestamp: string }
  // Server-only: the agenda from the packet, before the meeting starts
  | { type: 'RELOAD_AGENDA'; agenda: AgendaItem[]; timestamp: string }
```

In `AttendanceRecord`, change `role: 'member' | 'chair' | 'admin';` to `role: MeetingRole;`. In `MeetingMinutes`, replace:

<!-- prettier-ignore -->
```ts
  attendance: AttendanceRecord[];
  quorumPresent: boolean;
```

with:

<!-- prettier-ignore -->
```ts
  attendance: AttendanceRecord[];
  /** People present without an account, and the names given for them */
  headcount: number;
  headcountNames: string[];
  quorumPresent: boolean;
```

In `shared/types/socket.ts`, change the import to `import type { MeetingAction, MeetingRole, MeetingState, Member } from './index.js';`, and replace:

```ts
export interface JoinMeetingPayload {
  meetingCode: string;
}

export interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
}
```

with:

```ts
export interface JoinMeetingPayload {
  meetingCode: string;
  /** A display (TV or projector): receives the state without becoming a member */
  display?: boolean;
}

export interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
  errorCode?: ActionErrorCode;
}
```

In `ActionErrorCode`, after `| 'MEMBER_EXISTS'` add `| 'MEMBER_CONNECTED'`. At the end of `SocketData`, replace:

<!-- prettier-ignore -->
```ts
  meetingCode: string | null;
  role: 'member' | 'chair' | 'admin';
}
```

with:

<!-- prettier-ignore -->
```ts
  meetingCode: string | null;
  role: MeetingRole;
  /** Joined as a display: in the room, not a member */
  display?: boolean;
}
```

- [ ] **Step 5: Initial values and log messages**

In `shared/reducer/initialState.ts`, replace the comment and the first fields:

```ts
/**
 * Clean initial state for new meetings.
 * All data is populated dynamically:
 * - Members: Added when users join via socket (first user becomes chair)
 * - Agenda: Chair adds items before/during meeting
 * - Committee Reports: Chair adds as needed
 * - Previous Minutes: Can be set via admin interface
 */
export const initialState: MeetingState = {
  meetingStage: 'not-started' as const,
  meetingActive: false,
  meetingCode: '',
  members: [], // Members are added dynamically when users join
  quorum: 3,
```

with:

```ts
/**
 * Clean initial state for new meetings. The server creates each live meeting's state from
 * its packet (code, organization, title, date, quorum, agenda); the rest starts here.
 * - Members: added when people join, with the role their organization gives them
 * - Committee Reports: Chair adds as needed
 * - Previous Minutes: Can be set via admin interface
 */
export const initialState: MeetingState = {
  meetingStage: 'not-started' as const,
  meetingActive: false,
  meetingCode: '',
  organizationId: null,
  title: '',
  scheduledFor: null,
  members: [], // Members are added dynamically when users join
  quorum: 3,
  headcount: 0,
  headcountNames: [],
```

In `shared/constants/logMessages.ts`, add after `logMemberPresenceChanged`:

```ts
export function logMemberMarkedPresent(name: string): string {
  return `${name} marked present.`;
}

export function logHeadcountSet(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'} present without an account.`;
}
```

- [ ] **Step 6: Create `shared/utils/attendance.ts`**

```ts
import type { MeetingState } from '../types/index.js';

/** Who is present, and whether that makes a quorum */
export interface AttendanceSummary {
  /** Members present because their device is connected */
  devicePresent: number;
  /** Members the chair or secretary marked present */
  markedPresent: number;
  /** People in the room without an account */
  headcount: number;
  /** Absent members represented by a present proxy holder, when proxies count for quorum */
  proxies: number;
  /** Everyone who counts toward quorum: the four above */
  present: number;
  quorum: number;
  hasQuorum: boolean;
  /** Guests present: they never count toward quorum */
  guests: number;
}

/**
 * The one count of attendance: the server's quorum check, the meeting screens, the display
 * and the minutes all use it. Guests never count. Missing fields (a state saved before they
 * existed) count as none.
 */
export function attendanceSummary(state: MeetingState): AttendanceSummary {
  const voting = state.members.filter((m) => m.role !== 'guest');
  const present = voting.filter((m) => m.present);
  const markedPresent = present.filter((m) => m.presentBy === 'chair').length;
  const devicePresent = present.length - markedPresent;
  const headcount = state.headcount ?? 0;

  let proxies = 0;
  if (state.proxiesCountForQuorum) {
    const presentIds = new Set(present.map((m) => m.id));
    const absentIds = new Set(voting.filter((m) => !m.present).map((m) => m.id));
    proxies = (state.proxies ?? []).filter(
      (p) => presentIds.has(p.grantedTo) && absentIds.has(p.grantedBy),
    ).length;
  }

  const total = devicePresent + markedPresent + headcount + proxies;
  return {
    devicePresent,
    markedPresent,
    headcount,
    proxies,
    present: total,
    quorum: state.quorum,
    hasQuorum: total >= state.quorum,
    guests: state.members.filter((m) => m.role === 'guest' && m.present).length,
  };
}

/** An organization's attendance settings (see Organization in the Prisma schema) */
export interface QuorumSettings {
  eligibleVoters: number | null;
  quorumPercent: number | null;
  quorumCount: number | null;
}

/**
 * The quorum a meeting starts with: a percentage of the eligible voting members (the
 * organization's count, or else `rosterVoters`, its members with the member role or above),
 * rounded up, or a fixed count. At least 1; 3 when nothing is set.
 */
export function quorumFromSettings(settings: QuorumSettings, rosterVoters: number): number {
  if (settings.quorumPercent !== null) {
    const eligible = settings.eligibleVoters ?? rosterVoters;
    return Math.max(1, Math.ceil((eligible * settings.quorumPercent) / 100));
  }
  return Math.max(1, settings.quorumCount ?? 3);
}
```

In `shared/utils/index.ts`, add before the `generateMeetingMinutes` export:

```ts
export {
  attendanceSummary,
  quorumFromSettings,
  type AttendanceSummary,
  type QuorumSettings,
} from './attendance.js';
```

- [ ] **Step 7: The reducer**

In `shared/reducer/handlers/memberHandlers.ts`, change the first import to `import type { MeetingAction, Member } from '../../types/index.js';` and add after `import type { ActionHandler } from './types.js';`:

```ts
/** A member with a new presence; presentBy only on a present member */
export function withPresence(
  member: Member,
  present: boolean,
  presentBy?: 'device' | 'chair',
): Member {
  const { presentBy: _previous, ...rest } = member;
  return present ? { ...rest, present, presentBy: presentBy ?? 'device' } : { ...rest, present };
}
```

Replace the `SET_MEMBER_PRESENCE` case with:

<!-- prettier-ignore -->
```ts
    case 'SET_MEMBER_PRESENCE': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_MEMBER_PRESENCE' }>;
      const member = state.members.find((m) => m.id === typedAction.memberId);
      if (!member) return state;

      // A member the chair marked present stays marked when their device connects
      const current = member.present ? (member.presentBy ?? 'device') : undefined;
      const presentBy = typedAction.present
        ? current === 'chair'
          ? 'chair'
          : (typedAction.presentBy ?? 'device')
        : undefined;
      // Nothing changes (a device reconnecting, say): no state change and no log line
      if (member.present === typedAction.present && current === presentBy) return state;

      return {
        ...state,
        members: state.members.map((m) =>
          m.id === typedAction.memberId ? withPresence(m, typedAction.present, presentBy) : m,
        ),
        meetingLog: log(
          typedAction.timestamp,
          logMemberPresenceChanged(member.name, typedAction.present),
        ),
      };
    }

    case 'REFRESH_MEMBERS': {
      const typedAction = action as Extract<MeetingAction, { type: 'REFRESH_MEMBERS' }>;
      const updates = new Map(typedAction.members.map((m) => [m.id, m]));
      const newChair = typedAction.members.some((m) => m.role === 'chair');
      return {
        ...state,
        members: state.members.map((m) => {
          const update = updates.get(m.id);
          if (update) return { ...m, name: update.name, role: update.role };
          // There is one chair
          return newChair && m.role === 'chair' ? { ...m, role: 'member' as const } : m;
        }),
      };
    }
```

Create `shared/reducer/handlers/attendanceHandlers.ts`:

```ts
import type { MeetingAction } from '../../types/index.js';
import { logHeadcountSet, logMemberMarkedPresent } from '../../constants/logMessages.js';
import { withPresence } from './memberHandlers.js';
import type { ActionHandler } from './types.js';

export const attendanceHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'MARK_PRESENT': {
      const typedAction = action as Extract<MeetingAction, { type: 'MARK_PRESENT' }>;
      // The server fills in the member from the organization's roster
      const fromRoster = typedAction.member;
      if (!fromRoster || fromRoster.id !== typedAction.userId) return state;

      const existing = state.members.find((m) => m.id === typedAction.userId);
      if (existing?.present && existing.presentBy === 'chair') return state;
      const marked = withPresence(existing ?? fromRoster, true, 'chair');

      return {
        ...state,
        members: existing
          ? state.members.map((m) => (m.id === marked.id ? marked : m))
          : [...state.members, marked],
        meetingLog: log(typedAction.timestamp, logMemberMarkedPresent(marked.name)),
      };
    }

    case 'SET_HEADCOUNT': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_HEADCOUNT' }>;
      const names = typedAction.names.map((n) => n.trim()).filter((n) => n.length > 0);
      if (
        typedAction.count === state.headcount &&
        names.length === state.headcountNames.length &&
        names.every((n, i) => n === state.headcountNames[i])
      ) {
        return state;
      }
      return {
        ...state,
        headcount: typedAction.count,
        headcountNames: names,
        meetingLog: log(typedAction.timestamp, logHeadcountSet(typedAction.count)),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
```

In `shared/reducer/handlers/index.ts`, add after the `memberHandler` export:

```ts
export { attendanceHandler } from './attendanceHandlers.js';
```

In `shared/reducer/handlers/agendaHandlers.ts`, add before `case 'COMPLETE_AGENDA_ITEM': {`:

<!-- prettier-ignore -->
```ts
    case 'RELOAD_AGENDA': {
      const typedAction = action as Extract<MeetingAction, { type: 'RELOAD_AGENDA' }>;
      // Before the meeting starts: the agenda as scheduled, not yet adopted
      return {
        ...state,
        agenda: typedAction.agenda,
        agendaAdopted: false,
        agendaObjection: false,
        currentAgendaItem: null,
      };
    }

```

In `shared/reducer/handlers/rollCallHandlers.ts`, add after the log message import:

```ts
import { withPresence } from './memberHandlers.js';
```

In `START_ROLL_CALL`, replace:

<!-- prettier-ignore -->
```ts
      const responses: RollCallRecord[] = state.members.map((member) => ({
        memberId: member.id,
        memberName: member.name,
        status: 'not-responded' as const,
      }));
```

with:

<!-- prettier-ignore -->
```ts
      // Guests don't answer the roll
      const responses: RollCallRecord[] = state.members
        .filter((member) => member.role !== 'guest')
        .map((member) => ({
          memberId: member.id,
          memberName: member.name,
          status: 'not-responded' as const,
        }));
```

In `RESPOND_ROLL_CALL`, change `m.id === typedAction.memberId ? { ...m, present: isPresent } : m,` to `m.id === typedAction.memberId ? withPresence(m, isPresent, m.presentBy) : m,`. In `MARK_ABSENT`, change `m.id === typedAction.memberId ? { ...m, present: false } : m,` to `m.id === typedAction.memberId ? withPresence(m, false) : m,`.

In `shared/reducer/meetingReducer.ts`, add `attendanceHandler,` after `memberHandler,` in the handler import; add `case 'RELOAD_AGENDA':` after `case 'COMPLETE_AGENDA_ITEM':` (the agenda group); and replace:

<!-- prettier-ignore -->
```ts
    case 'SET_MEMBER_PRESENCE':
    case 'RENAME_MEMBER':
      return memberHandler(state, action, log);
```

with:

<!-- prettier-ignore -->
```ts
    case 'SET_MEMBER_PRESENCE':
    case 'REFRESH_MEMBERS':
    case 'RENAME_MEMBER':
      return memberHandler(state, action, log);

    // Attendance
    case 'MARK_PRESENT':
    case 'SET_HEADCOUNT':
      return attendanceHandler(state, action, log);
```

- [ ] **Step 8: The minutes**

In `shared/utils/minutesGenerator.ts`, add after the type import:

```ts
import { attendanceSummary } from './attendance.js';
```

In the arrival lookup, replace:

<!-- prettier-ignore -->
```ts
        log.message.includes(`${member.name} is now present`),
```

with:

<!-- prettier-ignore -->
```ts
        log.message.includes(`${member.name} is now present`) ||
        log.message.includes(`${member.name} marked present`),
```

Replace:

<!-- prettier-ignore -->
```ts
  // Check quorum
  const presentCount = state.members.filter((m) => m.present).length;
  const quorumPresent = presentCount >= state.quorum;
```

with:

<!-- prettier-ignore -->
```ts
  // Quorum as the meeting counts it: members on a device or marked present, the headcount,
  // and proxies when they count
  const quorumPresent = attendanceSummary(state).hasQuorum;
```

In the returned object, after `attendance,` add:

<!-- prettier-ignore -->
```ts
    headcount: state.headcount ?? 0,
    headcountNames: state.headcountNames ?? [],
```

In `formatMinutesAsMarkdown`, replace:

<!-- prettier-ignore -->
```ts
  const present = minutes.attendance.filter((a) => a.status === 'present' || a.status === 'late');
  const absent = minutes.attendance.filter((a) => a.status === 'absent' || a.status === 'excused');
```

with:

<!-- prettier-ignore -->
```ts
  const voting = minutes.attendance.filter((a) => a.role !== 'guest');
  const present = voting.filter((a) => a.status === 'present' || a.status === 'late');
  const absent = voting.filter((a) => a.status === 'absent' || a.status === 'excused');
  const guests = minutes.attendance.filter((a) => a.role === 'guest');
```

Add before `if (absent.length > 0) {`:

<!-- prettier-ignore -->
```ts
  if (minutes.headcount > 0) {
    const names = minutes.headcountNames.length > 0 ? `: ${minutes.headcountNames.join(', ')}` : '';
    lines.push(`**Also present without an account:** ${minutes.headcount}${names}`);
    lines.push('');
  }

```

and before `// Agenda`:

<!-- prettier-ignore -->
```ts
  if (guests.length > 0) {
    lines.push('**Guests:**');
    guests.forEach((a) => lines.push(`- ${a.name}`));
    lines.push('');
  }

```

- [ ] **Step 9: Run the shared tests to see them pass, and build shared**

Run: `npx tsc --noEmit -p shared/tsconfig.json && npm run test:run -w shared && npm run build:shared`
Expected: type-check clean; all pass, including 12 in `reducer/attendance.test.ts`, 7 in `utils/attendance.test.ts` and 14 in `utils/minutesGenerator.test.ts`.

- [ ] **Step 10: See what no longer compiles**

Run: `npx tsc --noEmit -p backend-node/tsconfig.json`
Expected: three errors. `src/socket/actionHandler.ts`: `checkPermission(socket.data.role, ...)`, type `'guest'` is not assignable to `Role`; `src/socket/actionValidator.ts`: the new actions are not assignable to `never` in the default case; `src/socket/permissionGuard.ts`: `PERMISSIONS` is missing `REFRESH_MEMBERS`, `MARK_PRESENT`, `SET_HEADCOUNT` and `RELOAD_AGENDA`.

Run: `npx tsc --noEmit -p frontend-unified/tsconfig.json`
Expected: one error, `src/modules/meetings/views/AdminView.tsx`: `setSelectedRole(member.role)`, type `'guest'` is not assignable. (`npx tsc --noEmit -p mobile/tsconfig.json` stays clean.)

- [ ] **Step 11: Write the failing permission and validation tests**

Replace `backend-node/src/__tests__/permissionGuard.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  getPermittedActions,
  getPermissionDeniedReason,
} from '../socket/permissionGuard.js';

describe('permissionGuard', () => {
  describe('checkPermission', () => {
    describe('chair-only actions', () => {
      const chairOnlyActions = [
        'START_MEETING',
        'END_MEETING',
        'OPEN_VOTING',
        'CLOSE_VOTING',
        'RECOGNIZE_SPEAKER',
        'CHAIR_RULING',
        'ADOPT_AGENDA',
        'CALL_AGENDA_ITEM',
        'COMPLETE_AGENDA_ITEM',
        'REQUEST_UNANIMOUS_CONSENT',
        'UNANIMOUS_CONSENT_PASSED',
        'ADVANCE_MEETING_STAGE',
        'APPROVE_MINUTES',
        'OPEN_NOMINATIONS',
        'CLOSE_NOMINATIONS',
        'START_ELECTION',
        'CLOSE_ELECTION',
        'DECLARE_ELECTED',
        'SUSPEND_RULE_APPROVED',
        'RESTORE_RULE',
        'ANSWER_INQUIRY',
        'PRESENT_COMMITTEE_REPORT',
        'START_ROLL_CALL',
        'COMPLETE_ROLL_CALL',
        'MARK_ABSENT',
        'SET_AUTO_YIELD',
        'MARK_PRESENT',
        'SET_HEADCOUNT',
      ] as const;

      it.each(chairOnlyActions)('should allow chair to perform %s', (action) => {
        expect(checkPermission('chair', action)).toBe(true);
      });

      it.each(chairOnlyActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });

      it.each(chairOnlyActions)('should deny member from performing %s', (action) => {
        expect(checkPermission('member', action)).toBe(false);
      });

      it.each(chairOnlyActions)('should deny guest from performing %s', (action) => {
        expect(checkPermission('guest', action)).toBe(false);
      });
    });

    describe('admin-only actions', () => {
      const adminOnlyActions = [
        'SET_SPEAKER_TIME_LIMIT',
        'SET_VOTE_TIME_LIMIT',
        'SET_PREVIOUS_MINUTES',
      ] as const;

      it.each(adminOnlyActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });

      it.each(adminOnlyActions)('should deny chair from performing %s', (action) => {
        expect(checkPermission('chair', action)).toBe(false);
      });

      it.each(adminOnlyActions)('should deny member from performing %s', (action) => {
        expect(checkPermission('member', action)).toBe(false);
      });
    });

    describe('admin or chair actions', () => {
      const adminOrChairActions = [
        'ADD_AGENDA_ITEM',
        'REMOVE_AGENDA_ITEM',
        'REORDER_AGENDA',
        'ADD_COMMITTEE_REPORT',
        'SET_VOTING_METHOD',
        'SET_MEMBER_ROLE',
      ] as const;

      it.each(adminOrChairActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });

      it.each(adminOrChairActions)('should allow chair to perform %s', (action) => {
        expect(checkPermission('chair', action)).toBe(true);
      });

      it.each(adminOrChairActions)('should deny member from performing %s', (action) => {
        expect(checkPermission('member', action)).toBe(false);
      });
    });

    describe('server-only actions', () => {
      const serverOnlyActions = [
        'ADD_MEMBER',
        'SET_MEMBER_PRESENCE',
        'REFRESH_MEMBERS',
        'RELOAD_AGENDA',
      ] as const;

      it.each(serverOnlyActions)('should deny every role %s', (action) => {
        for (const role of ['admin', 'chair', 'member', 'guest'] as const) {
          expect(checkPermission(role, action), role).toBe(false);
        }
      });
    });

    describe('member actions (members, the chair and admins, not guests)', () => {
      const memberActions = [
        'MAKE_MOTION',
        'SECOND_MOTION',
        'DECLINE_SECOND',
        'CAST_VOTE',
        'OBJECT_TO_CONSENT',
        'AGENDA_OBJECTION',
        'NOMINATE',
        'DECLINE_NOMINATION',
        'CAST_BALLOT',
        'WITHDRAW_MOTION',
        'MODIFY_MOTION',
        'RESPOND_ROLL_CALL',
        'CAST_PROXY_VOTE',
        'REQUEST_PROXY',
        'ACCEPT_PROXY',
        'DECLINE_PROXY',
        'CANCEL_PROXY_REQUEST',
      ] as const;

      it.each(memberActions)('should deny guest from performing %s', (action) => {
        expect(checkPermission('guest', action)).toBe(false);
      });

      it.each(memberActions)('should allow member to perform %s', (action) => {
        expect(checkPermission('member', action)).toBe(true);
      });

      it.each(memberActions)('should allow chair to perform %s', (action) => {
        expect(checkPermission('chair', action)).toBe(true);
      });

      it.each(memberActions)('should allow admin to perform %s', (action) => {
        expect(checkPermission('admin', action)).toBe(true);
      });
    });

    describe('actions guests may take', () => {
      const guestActions = [
        'RAISE_HAND',
        'LOWER_HAND',
        'YIELD_FLOOR',
        'ASK_INQUIRY',
        'RENAME_MEMBER',
      ] as const;

      it.each(guestActions)('should allow every role to perform %s', (action) => {
        for (const role of ['admin', 'chair', 'member', 'guest'] as const) {
          expect(checkPermission(role, action), role).toBe(true);
        }
      });
    });

    it('should return false for unknown action types', () => {
      // @ts-expect-error - Testing invalid action type
      expect(checkPermission('admin', 'INVALID_ACTION')).toBe(false);
    });
  });

  describe('getPermittedActions', () => {
    it('should return all member-level actions for member role', () => {
      const permitted = getPermittedActions('member');

      expect(permitted).toContain('MAKE_MOTION');
      expect(permitted).toContain('CAST_VOTE');
      expect(permitted).toContain('RAISE_HAND');
      expect(permitted).not.toContain('START_MEETING');
      expect(permitted).not.toContain('SET_SPEAKER_TIME_LIMIT');
    });

    it('should return member + chair actions for chair role', () => {
      const permitted = getPermittedActions('chair');

      // Chair actions
      expect(permitted).toContain('START_MEETING');
      expect(permitted).toContain('END_MEETING');
      expect(permitted).toContain('RECOGNIZE_SPEAKER');

      // Member actions
      expect(permitted).toContain('MAKE_MOTION');
      expect(permitted).toContain('CAST_VOTE');

      // Not admin-only
      expect(permitted).not.toContain('SET_SPEAKER_TIME_LIMIT');
    });

    it('should return all actions for admin role', () => {
      const permitted = getPermittedActions('admin');

      // Admin actions
      expect(permitted).toContain('SET_SPEAKER_TIME_LIMIT');
      // Server-only actions are nobody's
      expect(permitted).not.toContain('ADD_MEMBER');

      // Chair actions
      expect(permitted).toContain('START_MEETING');

      // Member actions
      expect(permitted).toContain('MAKE_MOTION');
    });

    it('should give guests only following, asking to speak and asking questions', () => {
      expect(getPermittedActions('guest').sort()).toEqual(
        ['ASK_INQUIRY', 'LOWER_HAND', 'RAISE_HAND', 'RENAME_MEMBER', 'YIELD_FLOOR'].sort(),
      );
    });

    it('should return more actions for higher privilege levels', () => {
      const memberActions = getPermittedActions('member');
      const chairActions = getPermittedActions('chair');
      const adminActions = getPermittedActions('admin');

      expect(chairActions.length).toBeGreaterThan(memberActions.length);
      expect(adminActions.length).toBeGreaterThan(chairActions.length);
    });
  });

  describe('getPermissionDeniedReason', () => {
    it('should return admin message for admin-only actions', () => {
      const reason = getPermissionDeniedReason('SET_SPEAKER_TIME_LIMIT');
      expect(reason).toBe('This action requires admin privileges');
    });

    it('should return chair message for chair-only actions', () => {
      const reason = getPermissionDeniedReason('START_MEETING');
      expect(reason).toBe('This action can only be performed by the chair');
    });

    it('should tell a guest what they cannot take part in', () => {
      const reason = getPermissionDeniedReason('MAKE_MOTION');
      expect(reason).toBe('Guests can follow the meeting but not take part in this');
    });

    it('should name server-only actions', () => {
      expect(getPermissionDeniedReason('ADD_MEMBER')).toBe('Only the server applies this action');
    });

    it('should return generic message for other actions', () => {
      const reason = getPermissionDeniedReason('RAISE_HAND');
      expect(reason).toBe('You do not have permission to perform this action');
    });

    it('should return unknown message for invalid actions', () => {
      // @ts-expect-error - Testing invalid action type
      const reason = getPermissionDeniedReason('INVALID_ACTION');
      expect(reason).toBe('Unknown action type');
    });
  });
});
```

Create `backend-node/src/__tests__/attendanceValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { MAX_HEADCOUNT, validateAction } from '../socket/actionValidator.js';

const ann: Member = { id: 1, name: 'Ann', role: 'member', present: true, presentBy: 'device' };
const state: MeetingState = { ...initialState, members: [ann] };

describe('validating attendance actions', () => {
  describe('MARK_PRESENT', () => {
    const fromRoster: Member = { id: 2, name: 'Bo', role: 'member', present: true };

    it('needs the person the server found in the roster', () => {
      const action: MeetingAction = { type: 'MARK_PRESENT', userId: 2, timestamp: '' };
      expect(validateAction(state, action)).toMatchObject({
        valid: false,
        errorCode: 'NOT_A_MEMBER',
      });
      expect(validateAction(state, { ...action, member: fromRoster }).valid).toBe(true);
    });

    it('refuses a member already marked present', () => {
      const marked = { ...state, members: [{ ...ann, presentBy: 'chair' as const }] };
      const action: MeetingAction = { type: 'MARK_PRESENT', userId: 1, member: ann, timestamp: '' };
      expect(validateAction(marked, action)).toMatchObject({
        valid: false,
        errorCode: 'INVALID_STATE',
      });
      // On a device, a member can still be marked, so they stay present without it
      expect(validateAction(state, action).valid).toBe(true);
    });
  });

  describe('SET_HEADCOUNT', () => {
    const headcount = (count: number, names: unknown = []) =>
      validateAction(state, {
        type: 'SET_HEADCOUNT',
        count,
        names,
        timestamp: '',
      } as MeetingAction);

    it('takes a whole number from 0, and at most one name for each person', () => {
      expect(headcount(0).valid).toBe(true);
      expect(headcount(2, ['Dee', ' ', 'Eli']).valid).toBe(true);
      expect(headcount(MAX_HEADCOUNT).valid).toBe(true);
    });

    it.each([
      [-1, []],
      [1.5, []],
      [MAX_HEADCOUNT + 1, []],
      [1, ['Dee', 'Eli']],
      [1, 'Dee'],
      [1, [7]],
      [1, ['x'.repeat(101)]],
    ])('refuses %s with %j', (count, names) => {
      expect(headcount(count as number, names)).toMatchObject({
        valid: false,
        errorCode: 'INVALID_ACTION',
      });
    });
  });

  describe('RELOAD_AGENDA', () => {
    const reload: MeetingAction = { type: 'RELOAD_AGENDA', agenda: [], timestamp: '' };

    it('is allowed only before the meeting starts', () => {
      expect(validateAction(state, reload).valid).toBe(true);
      expect(validateAction({ ...state, meetingActive: true }, reload)).toMatchObject({
        valid: false,
        errorCode: 'MEETING_ALREADY_ACTIVE',
      });
      const adjourned = { ...state, meetingStage: 'adjourned' as const };
      expect(validateAction(adjourned, reload).valid).toBe(false);
    });
  });
});
```

In `backend-node/src/__tests__/actionEnricher.test.ts`, add before `it('keeps the absent member on a proxy the chair grants for them', () => {`:

<!-- prettier-ignore -->
```ts
    it('drops a client-sent person from MARK_PRESENT: the server reads the roster', () => {
      const enriched = enrich(
        { type: 'MARK_PRESENT', userId: 30, member: { id: 30, role: 'admin' } },
        chair,
      );
      expect(enriched.userId).toBe(30);
      expect(enriched).not.toHaveProperty('member');
    });

```

- [ ] **Step 12: Replace `backend-node/src/socket/permissionGuard.ts`**

```ts
import type { MeetingAction, MeetingRole } from '@robbie-bylawyer/shared/types';
import { logger } from '../middleware/logger.js';

type Role = MeetingRole;

/** Who presides: the chair, and admins (secretaries and above), who can do what a chair does */
const PRESIDING: Role[] = ['chair', 'admin'];
/** Everyone who takes part: members vote, move and second; the chair and admins too */
const TAKING_PART: Role[] = ['member', 'chair', 'admin'];
/** Guests as well: following, asking to speak and asking questions */
const EVERYONE: Role[] = ['guest', 'member', 'chair', 'admin'];
/** Actions only the server applies (on join, disconnect and from REST routes) */
const SERVER_ONLY: Role[] = [];

/**
 * Permission matrix for all action types: the meeting roles that may send each one. Meeting
 * roles come from the organization (see deriveMeetingRole); guests never vote, move, second,
 * answer roll call, hold or grant proxies, or are nominated.
 */
const PERMISSIONS: Record<MeetingAction['type'], Role[]> = {
  // Chair-only actions
  START_MEETING: PRESIDING,
  END_MEETING: PRESIDING,
  OPEN_VOTING: PRESIDING,
  CLOSE_VOTING: PRESIDING,
  RECOGNIZE_SPEAKER: PRESIDING,
  CHAIR_RULING: PRESIDING,
  ADOPT_AGENDA: PRESIDING,
  CALL_AGENDA_ITEM: PRESIDING,
  COMPLETE_AGENDA_ITEM: PRESIDING,
  REQUEST_UNANIMOUS_CONSENT: PRESIDING,
  UNANIMOUS_CONSENT_PASSED: PRESIDING,
  ADVANCE_MEETING_STAGE: PRESIDING,
  SET_MEETING_STAGE: PRESIDING,
  SET_QUORUM: ['admin'],
  APPROVE_MINUTES: PRESIDING,
  OPEN_NOMINATIONS: PRESIDING,
  CLOSE_NOMINATIONS: PRESIDING,
  START_ELECTION: PRESIDING,
  CLOSE_ELECTION: PRESIDING,
  DECLARE_ELECTED: PRESIDING,
  SUSPEND_RULE_APPROVED: PRESIDING,
  RESTORE_RULE: PRESIDING,
  ANSWER_INQUIRY: PRESIDING,
  PRESENT_COMMITTEE_REPORT: PRESIDING,
  START_ROLL_CALL: PRESIDING,
  COMPLETE_ROLL_CALL: PRESIDING,
  MARK_ABSENT: PRESIDING,
  SET_AUTO_YIELD: PRESIDING,

  // Attendance: the chair or secretary marks people present and counts the room
  MARK_PRESENT: PRESIDING,
  SET_HEADCOUNT: PRESIDING,

  // Admin-only actions
  SET_SPEAKER_TIME_LIMIT: ['admin'],
  SET_VOTE_TIME_LIMIT: ['admin'],
  ADD_AGENDA_ITEM: PRESIDING,
  REMOVE_AGENDA_ITEM: PRESIDING,
  REORDER_AGENDA: PRESIDING,
  SET_PREVIOUS_MINUTES: ['admin'],
  ADD_COMMITTEE_REPORT: PRESIDING,
  SET_VOTING_METHOD: PRESIDING,

  // Role management: only the chair can be handed over (see roleChangeHandler); the
  // organization decides every other role
  SET_MEMBER_ROLE: PRESIDING,

  // Server-only actions
  ADD_MEMBER: SERVER_ONLY,
  SET_MEMBER_PRESENCE: SERVER_ONLY,
  REFRESH_MEMBERS: SERVER_ONLY,
  RELOAD_AGENDA: SERVER_ONLY,

  // Member actions
  MAKE_MOTION: TAKING_PART,
  SECOND_MOTION: TAKING_PART,
  DECLINE_SECOND: TAKING_PART,
  CAST_VOTE: TAKING_PART,
  OBJECT_TO_CONSENT: TAKING_PART,
  AGENDA_OBJECTION: TAKING_PART,
  NOMINATE: TAKING_PART,
  DECLINE_NOMINATION: TAKING_PART,
  CAST_BALLOT: TAKING_PART,
  WITHDRAW_MOTION: TAKING_PART,
  MODIFY_MOTION: TAKING_PART,
  RESPOND_ROLL_CALL: TAKING_PART,

  // Actions guests may take too: asking for the floor, and asking a question
  RAISE_HAND: EVERYONE,
  LOWER_HAND: EVERYONE,
  YIELD_FLOOR: EVERYONE,
  ASK_INQUIRY: EVERYONE,

  // Proxy voting actions
  SET_PROXY_SETTINGS: PRESIDING, // Admin/chair can enable/configure proxy voting
  GRANT_PROXY: PRESIDING, // Admin/chair grants proxies on behalf of absent members
  REVOKE_PROXY: PRESIDING, // Admin/chair can revoke proxies
  CAST_PROXY_VOTE: TAKING_PART, // Proxy holders can cast proxy votes
  // Member-initiated proxy request actions
  REQUEST_PROXY: TAKING_PART, // Members can request proxies
  ACCEPT_PROXY: TAKING_PART, // Members can accept proxy requests
  DECLINE_PROXY: TAKING_PART, // Members can decline proxy requests
  CANCEL_PROXY_REQUEST: TAKING_PART, // Members can cancel their own requests

  // Member management
  RENAME_MEMBER: EVERYONE, // Anyone can rename themselves once; admin/chair can rename anyone
};

/**
 * Check if a role has permission to perform an action
 * @param role - The user's role
 * @param actionType - The action type being attempted
 * @returns true if the role can perform the action
 */
export function checkPermission(role: Role, actionType: MeetingAction['type']): boolean {
  const allowedRoles = PERMISSIONS[actionType];

  if (!allowedRoles) {
    logger.warn({ actionType }, 'Unknown action type');
    return false;
  }

  return allowedRoles.includes(role);
}

/** Every action type, for tests that walk the action union */
export const ACTION_TYPES = Object.keys(PERMISSIONS) as MeetingAction['type'][];

/**
 * Get all actions a role is permitted to perform
 * @param role - The user's role
 * @returns Array of action types the role can perform
 */
export function getPermittedActions(role: Role): MeetingAction['type'][] {
  return ACTION_TYPES.filter((actionType) => PERMISSIONS[actionType].includes(role));
}

/**
 * Get a human-readable description of why an action was denied
 * @param actionType - The action that was attempted
 * @returns Description of the permission requirement
 */
export function getPermissionDeniedReason(actionType: MeetingAction['type']): string {
  const allowedRoles = PERMISSIONS[actionType];

  if (!allowedRoles) {
    return 'Unknown action type';
  }

  if (allowedRoles.length === 0) {
    return 'Only the server applies this action';
  }

  if (allowedRoles.includes('admin') && !allowedRoles.includes('chair')) {
    return 'This action requires admin privileges';
  }

  if (allowedRoles.includes('chair') && !allowedRoles.includes('member')) {
    return 'This action can only be performed by the chair';
  }

  if (!allowedRoles.includes('guest')) {
    return 'Guests can follow the meeting but not take part in this';
  }

  return 'You do not have permission to perform this action';
}
```

- [ ] **Step 13: Validate the new actions**

In `backend-node/src/socket/actionValidator.ts`, add before `export interface ValidationResult {`:

```ts
/** The most people the chair can count in the room without an account */
export const MAX_HEADCOUNT = 100_000;
```

and before `case 'REORDER_AGENDA': {`:

<!-- prettier-ignore -->
```ts
    // Attendance
    case 'MARK_PRESENT': {
      // The server fills in member from the organization's roster (see attendanceActions.ts)
      if (!action.member || action.member.id !== action.userId) {
        return {
          valid: false,
          error: "That person isn't in the organization",
          errorCode: 'NOT_A_MEMBER',
        };
      }
      const existing = state.members.find((m) => m.id === action.userId);
      if (existing?.present && existing.presentBy === 'chair') {
        return {
          valid: false,
          error: `${existing.name} is already marked present`,
          errorCode: 'INVALID_STATE',
        };
      }
      return { valid: true };
    }

    case 'SET_HEADCOUNT': {
      if (!Number.isInteger(action.count) || action.count < 0 || action.count > MAX_HEADCOUNT) {
        return {
          valid: false,
          error: `The headcount must be a whole number from 0 to ${MAX_HEADCOUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      const names = Array.isArray(action.names) ? action.names : null;
      if (
        !names ||
        names.some((n) => typeof n !== 'string' || n.trim().length > 100) ||
        names.filter((n) => n.trim().length > 0).length > action.count
      ) {
        return {
          valid: false,
          error: 'Give at most one name for each person counted, each up to 100 characters',
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

    case 'RELOAD_AGENDA':
      // Once the meeting starts, the agenda is changed in the meeting
      if (state.meetingActive || state.meetingStage !== 'not-started') {
        return {
          valid: false,
          error: 'The meeting has started; change the agenda in the meeting',
          errorCode: 'MEETING_ALREADY_ACTIVE',
        };
      }
      return { valid: true };

    case 'REFRESH_MEMBERS':
      // Server-only, from the organization's roster
      return { valid: true };

```

`attendanceActions.ts` arrives in Task 6. `SET_MEMBER_PRESENCE` and `ADD_MEMBER` keep their cases; no client role may send them now.

- [ ] **Step 14: Never take the person marked present from a client**

In `backend-node/src/socket/actionEnricher.ts`, add before `// Server generates timestamps using shared utility for consistency`:

<!-- prettier-ignore -->
```ts
  // The person marked present comes from the organization's roster, never from a client
  if (enriched.type === 'MARK_PRESENT') {
    delete enriched.member;
  }

```

- [ ] **Step 15: Let the admin view compile with guests**

In `frontend-unified/src/modules/meetings/views/AdminView.tsx`, in `openRoleChangeModal`, replace `setSelectedRole(member.role);` with:

<!-- prettier-ignore -->
```tsx
    // Guests can't be given a role here; the menu starts at member for them
    setSelectedRole(member.role === 'guest' ? 'member' : member.role);
```

The client plan replaces this view; this keeps it compiling.

- [ ] **Step 16: Run everything**

Run: `npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-checks clean; all pass, including 11 in `attendanceValidation.test.ts`. The frontend and mobile tests run because they use shared's reducer and types.

- [ ] **Step 17: Commit**

```bash
npx prettier --write shared/types shared/reducer shared/utils shared/constants shared/__tests__/reducer/attendance.test.ts shared/__tests__/utils/attendance.test.ts shared/__tests__/utils/minutesGenerator.test.ts backend-node/src/socket/permissionGuard.ts backend-node/src/socket/actionValidator.ts backend-node/src/socket/actionEnricher.ts backend-node/src/__tests__/permissionGuard.test.ts backend-node/src/__tests__/attendanceValidation.test.ts backend-node/src/__tests__/actionEnricher.test.ts frontend-unified/src/modules/meetings/views/AdminView.tsx
git add shared/types shared/reducer shared/utils shared/constants shared/__tests__/reducer/attendance.test.ts shared/__tests__/utils/attendance.test.ts shared/__tests__/utils/minutesGenerator.test.ts backend-node/src/socket/permissionGuard.ts backend-node/src/socket/actionValidator.ts backend-node/src/socket/actionEnricher.ts backend-node/src/__tests__/permissionGuard.test.ts backend-node/src/__tests__/attendanceValidation.test.ts backend-node/src/__tests__/actionEnricher.test.ts frontend-unified/src/modules/meetings/views/AdminView.tsx
git commit -m "feat(room): guests, presence reasons and the headcount in the meeting

Members get the guest role and a reason they are present (on a device, or
marked by the chair); the state carries the packet's organization, title
and date and a headcount of people without an account. MARK_PRESENT and
SET_HEADCOUNT are for the chair and admins; ADD_MEMBER, SET_MEMBER_PRESENCE,
REFRESH_MEMBERS and RELOAD_AGENDA are server-only. attendanceSummary counts
devices, members marked present, the headcount and proxies, never guests,
and the minutes use it."
```

---

### Task 3: Floor tallies, voice votes and floor ballots

Votes become two counts: device votes, one per member, and a floor tally the chair enters for the rest of the room. `CLOSE_VOTING` decides on their sum with the existing `calculateVoteResult`, records both parts, and records every decided motion (today only motions that can be reconsidered leave a record). A voice vote takes no device votes. Elections get floor ballots the same way. A secret ballot keeps no record of who voted which way.

Recording every decided motion means a record is no longer proof that its motion can be reconsidered, so each record carries `reconsiderable` (its motion's `reconsidered` flag), and the reconsider check in shared and in the validator honors it. Records saved before the flag existed were all of reconsiderable motions, so a missing flag counts as reconsiderable. (`ReconsiderForm` in the web client filters the same list; the client plan updates it.)

The log line keeps its form, `Vote: Yea 21, Nay 5. CARRIED.`, because the web client parses it (`useVoteResults`), with the combined totals; when there is a floor tally, the two parts follow it: ` On devices 12 to 3, in the room 9 to 2.` The display and the minutes read the parts from the record.

**Files:**

- Modify: `shared/types/index.ts`, `shared/types/socket.ts`, `shared/reducer/initialState.ts`, `shared/reducer/meetingReducer.ts`, `shared/reducer/handlers/votingHandlers.ts`, `shared/reducer/handlers/electionHandlers.ts`, `shared/utils/voteCalculator.ts`, `shared/utils/index.ts`, `shared/utils/minutesGenerator.ts`, `shared/utils/motionHistoryHelper.ts`, `shared/utils/motionHelpers.ts`
- Modify: `backend-node/src/socket/permissionGuard.ts`, `backend-node/src/socket/actionValidator.ts`, `backend-node/src/bylawyer/bylawSyncService.ts`
- Test: `shared/__tests__/reducer/floorVotes.test.ts` (new), `shared/__tests__/utils/minutesGenerator.test.ts`, `backend-node/src/__tests__/floorVotesValidation.test.ts` (new), `backend-node/src/__integration__/bylawSync.test.ts`

- [ ] **Step 1: Write the failing reducer test**

Create `shared/__tests__/reducer/floorVotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { MOTIONS } from '../../constants/index.js';
import { getValidMotions } from '../../utils/index.js';
import type { Election, MeetingState, Motion, VotingMethod } from '../../types/index.js';

const motion = (overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool',
  mover: 'Ann',
  moverId: 1,
  secondedBy: 'Bo',
  status: 'active',
  ...overrides,
});

/** A vote in progress on `question`, with these device votes and floor tally */
function voting(
  question: Motion,
  votes: { yea: number; nay: number; abstain?: number },
  floor: { yea: number; nay: number; abstain?: number },
  votingMethod: VotingMethod = 'standard',
): MeetingState {
  return {
    ...initialState,
    meetingActive: true,
    votingOpen: true,
    votingMethod,
    currentMotion: question,
    motionStack: [question],
    votes: { abstain: 0, ...votes },
    floorVotes: { abstain: 0, ...floor },
  };
}

const close = (state: MeetingState) =>
  meetingReducer(state, { type: 'CLOSE_VOTING', timestamp: '20:15' });

describe('floor tallies', () => {
  it('start each vote at nothing', () => {
    const before = {
      ...voting(motion(), { yea: 0, nay: 0 }, { yea: 4, nay: 1 }),
      votingOpen: false,
    };
    const opened = meetingReducer(before, {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '20:10',
    });
    expect(opened.floorVotes).toEqual({ yea: 0, nay: 0, abstain: 0 });
  });

  it('are replaced by each entry, so a correction is a new entry', () => {
    const state = voting(motion(), { yea: 1, nay: 0 }, { yea: 9, nay: 2 });
    const next = meetingReducer(state, {
      type: 'SET_FLOOR_TALLY',
      yea: 8,
      nay: 3,
      abstain: 1,
      timestamp: '20:12',
    });
    expect(next.floorVotes).toEqual({ yea: 8, nay: 3, abstain: 1 });
    expect(next.meetingLog).toEqual(state.meetingLog);
  });

  it('count with the device votes when the vote closes, and both parts are logged', () => {
    const closed = close(voting(motion(), { yea: 12, nay: 3 }, { yea: 9, nay: 2 }));
    expect(closed.meetingLog.at(-1)?.message).toBe(
      'Vote: Yea 21, Nay 5. CARRIED. On devices 12 to 3, in the room 9 to 2.',
    );
  });

  it('decide a two-thirds vote that only both parts together reach', () => {
    const question = motion({ vote: '2/3' });
    // On devices alone 4 to 3 falls short of two thirds; with the room, 10 to 5 is exactly it
    const closed = close(voting(question, { yea: 4, nay: 3 }, { yea: 6, nay: 2 }));
    expect(closed.completedMotions.at(-1)?.passed).toBe(true);
    const short = close(voting(question, { yea: 4, nay: 3 }, { yea: 5, nay: 2 }));
    expect(short.completedMotions.at(-1)?.passed).toBe(false);
  });

  it('are the whole of a voice vote, which takes no device votes', () => {
    const state = voting(motion(), { yea: 0, nay: 0 }, { yea: 0, nay: 0 }, 'voice');
    const cast = meetingReducer(state, {
      type: 'CAST_VOTE',
      vote: 'yea',
      voterId: 1,
      timestamp: '20:11',
    });
    expect(cast).toBe(state);

    const closed = close({ ...state, floorVotes: { yea: 30, nay: 4, abstain: 0 } });
    expect(closed.meetingLog.at(-1)?.message).toBe('Vote: Yea 30, Nay 4. CARRIED.');
    expect(closed.completedMotions.at(-1)).toMatchObject({
      method: 'voice',
      deviceVotes: { yea: 0, nay: 0, abstain: 0 },
      floorVotes: { yea: 30, nay: 4, abstain: 0 },
    });
  });
});

describe('the record of a vote', () => {
  it('is kept for every decided motion, with both parts and the method', () => {
    // A recess can't be reconsidered; before, its vote left no record
    const recess = motion({
      ...MOTIONS.recess,
      id: 5,
      type: 'recess',
      text: 'Recess for 10 minutes',
    });
    const state = {
      ...voting(recess, { yea: 3, nay: 1 }, { yea: 2, nay: 0 }),
      voterChoices: { 1: 'yea' as const, 2: 'yea' as const, 3: 'yea' as const, 4: 'nay' as const },
    };
    const closed = close(state);
    expect(closed.completedMotions).toEqual([
      {
        id: 5,
        type: 'recess',
        name: MOTIONS.recess.name,
        text: 'Recess for 10 minutes',
        mover: 'Ann',
        moverId: 1,
        passed: true,
        voterChoices: state.voterChoices,
        timestamp: '20:15',
        reconsidered: false,
        reconsiderable: false,
        deviceVotes: { yea: 3, nay: 1, abstain: 0 },
        floorVotes: { yea: 2, nay: 0, abstain: 0 },
        method: 'standard',
      },
    ]);
  });

  it('keeps no choices for a secret ballot, and clears them when it closes', () => {
    const state = {
      ...voting(motion(), { yea: 2, nay: 1 }, { yea: 0, nay: 0 }, 'ballot'),
      voterChoices: { 1: 'yea' as const, 2: 'yea' as const, 3: 'nay' as const },
    };
    const closed = close(state);
    expect(closed.completedMotions.at(-1)).toMatchObject({ voterChoices: {}, method: 'ballot' });
    expect(closed.voterChoices).toEqual({});
  });

  it("isn't offered for reconsideration when its motion can't be reconsidered", () => {
    const record = {
      id: 5,
      type: 'recess',
      name: 'Recess',
      text: 'Recess for 10 minutes',
      passed: true,
      voterChoices: { 1: 'yea' as const },
      timestamp: '20:15',
      reconsidered: false,
    };
    const offered = (reconsiderable?: boolean) =>
      getValidMotions(
        { ...initialState, meetingActive: true, completedMotions: [{ ...record, reconsiderable }] },
        1,
      ).map((m) => m.key);
    expect(offered(false)).not.toContain('reconsider');
    expect(offered(true)).toContain('reconsider');
    // A record made before the flag existed was of a motion that can be reconsidered
    expect(offered(undefined)).toContain('reconsider');
  });
});

describe('floor ballots in elections', () => {
  const election = (overrides: Partial<Election> = {}): Election => ({
    id: 1,
    position: 'Director',
    candidates: [
      { name: 'Ann', id: 1 },
      { name: 'Bo', id: 2 },
    ],
    requiredVotes: 'majority',
    votingInProgress: true,
    ballotResults: { Ann: 3, Bo: 4 },
    votersWhoVoted: [1, 2, 3, 4, 5, 6, 7],
    floorBallots: {},
    elected: null,
    ...overrides,
  });
  const inElection = (e: Election): MeetingState => ({ ...initialState, currentElection: e });

  it('start empty, and are replaced by each entry', () => {
    const started = meetingReducer(
      {
        ...initialState,
        nominations: [
          {
            id: 1,
            position: 'Director',
            nomineeName: 'Ann',
            nomineeId: 1,
            nominatedBy: 'Bo',
            nominatorId: 2,
            timestamp: '20:20',
            declined: false,
          },
        ],
      },
      {
        type: 'START_ELECTION',
        electionId: 9,
        position: 'Director',
        requiredVotes: 'majority',
        timestamp: '20:21',
      },
    );
    expect(started.currentElection?.floorBallots).toEqual({});

    const entered = meetingReducer(inElection(election()), {
      type: 'SET_FLOOR_BALLOTS',
      counts: { Ann: 6, Bo: 1 },
      timestamp: '20:25',
    });
    expect(entered.currentElection?.floorBallots).toEqual({ Ann: 6, Bo: 1 });
  });

  it('count with the device ballots when the election closes', () => {
    // On devices Bo leads 4 to 3; the paper ballots make it Ann 9 to Bo 5, a majority of 14
    const closed = meetingReducer(inElection(election({ floorBallots: { Ann: 6, Bo: 1 } })), {
      type: 'CLOSE_ELECTION',
      timestamp: '20:30',
    });
    expect(closed.currentElection?.elected).toBe('Ann');
    expect(closed.meetingLog.at(-1)?.message).toBe(
      'Voting closed for Director. Results: Ann: 9 vote(s), Bo: 5 vote(s). Ann elected.',
    );
  });

  it('start again empty on a runoff', () => {
    const tied = election({ floorBallots: { Ann: 1 } });
    const closed = meetingReducer(inElection(tied), { type: 'CLOSE_ELECTION', timestamp: '20:30' });
    expect(closed.currentElection).toMatchObject({ isRunoff: true, floorBallots: {} });
  });
});
```

In `shared/__tests__/utils/minutesGenerator.test.ts`, insert before `it('should include tabled motions', () => {`:

<!-- prettier-ignore -->
```ts
  it('should record both parts of a vote, and who moved it', () => {
    const state = createMockState({
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          mover: 'Bob',
          moverId: 2,
          passed: true,
          voterChoices: {},
          timestamp: '10:15:00',
          reconsidered: false,
          reconsiderable: true,
          deviceVotes: { yea: 12, nay: 3, abstain: 0 },
          floorVotes: { yea: 9, nay: 2, abstain: 1 },
          method: 'ballot',
        },
      ],
    });
    const minutes = generateMeetingMinutes(state);

    expect(minutes.motions[0]).toMatchObject({
      mover: 'Bob',
      moverId: 2,
      voteCount: { yea: 21, nay: 5, abstain: 1 },
      deviceVotes: { yea: 12, nay: 3, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 1 },
      method: 'ballot',
    });
    const markdown = formatMinutesAsMarkdown(minutes);
    expect(markdown).toContain('**Vote:** Yea: 21, Nay: 5, Abstain: 1');
    expect(markdown).toContain('(On devices 12 to 3, in the room 9 to 2)');
  });


```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:run -w shared`
Expected: FAIL in `floorVotes.test.ts` (the floor tally is ignored, a recess leaves no record, `SET_FLOOR_BALLOTS` does nothing) and in the new minutes test (the mover is empty and the count comes from `voterChoices`).

- [ ] **Step 3: The types**

In `shared/types/index.ts`, replace `export type VotingMethod = 'standard' | 'ballot' | 'rollcall';` with:

```ts
/**
 * How a vote is taken. Every method has a floor tally the chair enters for the people in the
 * room not voting on a device; a voice vote has only that.
 */
export type VotingMethod = 'standard' | 'voice' | 'ballot' | 'rollcall';
```

Replace the `CompletedMotion` interface with:

```ts
export interface CompletedMotion {
  readonly id: number;
  readonly type: string;
  readonly name: string;
  readonly text: string;
  readonly passed: boolean;
  /** Each device vote by member; empty for a secret ballot */
  readonly voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  readonly timestamp: string;
  /** Whether a motion to reconsider has brought this vote back */
  readonly reconsidered: boolean;
  readonly bylawAmendment?: BylawAmendment; // Preserved for Bylawyer sync
  readonly mover?: string; // Restored with the motion if it is reconsidered
  readonly moverId?: number;
  // The two parts of the vote, and how it was taken. Records made before these existed, which
  // were only of motions that can be reconsidered, have none of them.
  readonly deviceVotes?: Votes;
  readonly floorVotes?: Votes;
  readonly method?: VotingMethod;
  /** Whether the motion can be reconsidered (its definition's reconsidered flag) */
  readonly reconsiderable?: boolean;
}
```

In `Election`, replace:

<!-- prettier-ignore -->
```ts
  ballotResults: Record<string, number>;
  votersWhoVoted: number[];
  elected: string | null;
```

with:

<!-- prettier-ignore -->
```ts
  /** Ballots cast on devices, by candidate name */
  ballotResults: Record<string, number>;
  votersWhoVoted: number[];
  /** The tellers' count of paper ballots, by candidate name, entered by the chair */
  floorBallots?: Record<string, number>;
  elected: string | null;
```

In `MeetingState`, replace:

<!-- prettier-ignore -->
```ts
  votes: Votes;
  voters: number[];
  voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  votingOpen: boolean;
```

with:

<!-- prettier-ignore -->
```ts
  /** Device votes on the open question */
  votes: Votes;
  voters: number[];
  voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>;
  /** The chair's count of the room for the open question, apart from the device votes */
  floorVotes: Votes;
  votingOpen: boolean;
```

In `MeetingAction`, add after `| { type: 'CLOSE_VOTING'; timestamp: string }`:

<!-- prettier-ignore -->
```ts
  // The chair's count of the room: replaces the floor tally (a correction is a new entry)
  | { type: 'SET_FLOOR_TALLY'; yea: number; nay: number; abstain: number; timestamp: string }
```

and after `| { type: 'CLOSE_ELECTION'; timestamp: string }`:

<!-- prettier-ignore -->
```ts
  // The tellers' count of paper ballots by candidate name: replaces the floor ballots
  | { type: 'SET_FLOOR_BALLOTS'; counts: Record<string, number>; timestamp: string }
```

In `MinutesMotionRecord`, replace:

<!-- prettier-ignore -->
```ts
  voteCount?: { yea: number; nay: number; abstain: number };
  voterChoices?: Record<number, 'yea' | 'nay' | 'abstain'>;
  timestamp: string;
```

with:

<!-- prettier-ignore -->
```ts
  /** Device and floor votes together */
  voteCount?: { yea: number; nay: number; abstain: number };
  voterChoices?: Record<number, 'yea' | 'nay' | 'abstain'>;
  deviceVotes?: Votes;
  floorVotes?: Votes;
  method?: VotingMethod;
  timestamp: string;
```

In `shared/types/socket.ts`, add `| 'VOTING_METHOD'` after `| 'CHAIR_CANNOT_VOTE'`. In `shared/reducer/initialState.ts`, add after `voterChoices: {},`:

```ts
  floorVotes: { yea: 0, nay: 0, abstain: 0 },
```

- [ ] **Step 4: Adding votes**

In `shared/utils/voteCalculator.ts`, replace the first line (the type import) with:

```ts
import type {
  CompletedMotion,
  Votes,
  VoteRequirement,
  VoteCalculationResult,
} from '../types/index.js';

export const NO_VOTES: Votes = { yea: 0, nay: 0, abstain: 0 };

/** Two counts added together: device votes and the floor tally, say */
export function addVotes(a: Votes, b: Votes = NO_VOTES): Votes {
  return { yea: a.yea + b.yea, nay: a.nay + b.nay, abstain: a.abstain + b.abstain };
}

/**
 * A decided motion's vote, device and floor votes together. Records made before the parts
 * were kept are counted from their device votes.
 */
export function completedMotionVotes(motion: CompletedMotion): Votes {
  if (motion.deviceVotes) return addVotes(motion.deviceVotes, motion.floorVotes);
  const counts = { ...NO_VOTES };
  for (const vote of Object.values(motion.voterChoices)) counts[vote]++;
  return counts;
}
```

and in the comment of `canChairVoteDecide`, replace ` * @param votes - Current vote counts, without the chair's vote` with:

```ts
 * @param votes - Current vote counts (device votes and the floor tally together), without the
 *   chair's vote
```

In `shared/utils/index.ts`, add `addVotes,`, `completedMotionVotes,` and `NO_VOTES,` after `canChairVoteDecide,` in the `voteCalculator.js` export.

- [ ] **Step 5: Voting in the reducer**

In `shared/reducer/handlers/votingHandlers.ts`, change the calculator import to:

```ts
import { NO_VOTES, addVotes, calculateVoteResult } from '../../utils/voteCalculator.js';
```

In `OPEN_VOTING`, add after `voterChoices: {},`:

<!-- prettier-ignore -->
```ts
        floorVotes: { yea: 0, nay: 0, abstain: 0 },
```

At the start of `CAST_VOTE`, after the `typedAction` line, add:

<!-- prettier-ignore -->
```ts
      // A voice vote is counted in the room, not on devices
      if (state.votingMethod === 'voice') return state;

```

Replace the start of `CLOSE_VOTING`:

<!-- prettier-ignore -->
```ts
    case 'CLOSE_VOTING': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_VOTING' }>;
      const voteCalc = calculateVoteResult(state.votes, state.currentMotion?.vote || 'majority');
      const { yea, nay } = voteCalc;
```

with:

<!-- prettier-ignore -->
```ts
    case 'SET_FLOOR_TALLY': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_FLOOR_TALLY' }>;
      return {
        ...state,
        floorVotes: { yea: typedAction.yea, nay: typedAction.nay, abstain: typedAction.abstain },
      };
    }

    case 'CLOSE_VOTING': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_VOTING' }>;
      // The result counts the device votes and the chair's floor tally together
      const floorVotes = state.floorVotes ?? NO_VOTES;
      const voteCalc = calculateVoteResult(
        addVotes(state.votes, floorVotes),
        state.currentMotion?.vote || 'majority',
      );
      const { yea, nay } = voteCalc;
      const isBallot = state.votingMethod === 'ballot';
```

Replace the block from `// Save completed motion for potential reconsideration` through `: updatedCompletedMotions;` with:

<!-- prettier-ignore -->
```ts
      // Record every decided motion, with both parts of its vote. A secret ballot keeps no
      // record of who voted which way.
      const completedMotions = state.currentMotion
        ? [
            ...updatedCompletedMotions,
            {
              id: state.currentMotion.id,
              type: state.currentMotion.type,
              name: state.currentMotion.name,
              text: state.currentMotion.text,
              mover: state.currentMotion.mover,
              moverId: state.currentMotion.moverId,
              passed,
              voterChoices: isBallot ? {} : state.voterChoices,
              timestamp: typedAction.timestamp,
              reconsidered: false,
              reconsiderable: state.currentMotion.reconsidered,
              deviceVotes: state.votes,
              floorVotes,
              method: state.votingMethod,
            },
          ]
        : updatedCompletedMotions;

      // Both parts, so the room can check the chair's count
      const floorCounted = floorVotes.yea + floorVotes.nay + floorVotes.abstain > 0;
      const partsLog =
        floorCounted && state.votingMethod !== 'voice'
          ? ` On devices ${state.votes.yea} to ${state.votes.nay}, in the room ${floorVotes.yea} to ${floorVotes.nay}.`
          : '';
```

In the returned state, add after `voteTimerEnd: null,`:

<!-- prettier-ignore -->
```ts
        ...(isBallot && { voterChoices: {} }),
```

and in the log line, change `` `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${processed.suspensionLog}`` to `` `Vote: Yea ${yea}, Nay ${nay}. ${voteResultText}.${partsLog}${processed.suspensionLog}`` (the rest of the template stays).

In `shared/reducer/meetingReducer.ts`, add `case 'SET_FLOOR_TALLY':` after `case 'CLOSE_VOTING':` and `case 'SET_FLOOR_BALLOTS':` after `case 'CLOSE_ELECTION':`.

- [ ] **Step 6: Floor ballots in the reducer**

In `shared/reducer/handlers/electionHandlers.ts`, in `START_ELECTION`, add `floorBallots: {},` after `votersWhoVoted: [],`. Replace the start of `CLOSE_ELECTION`:

<!-- prettier-ignore -->
```ts
    case 'CLOSE_ELECTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_ELECTION' }>;
      if (!state.currentElection) return state;

      const results = state.currentElection.ballotResults;
      const totalVotes = state.currentElection.votersWhoVoted.length;
```

with:

<!-- prettier-ignore -->
```ts
    case 'SET_FLOOR_BALLOTS': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_FLOOR_BALLOTS' }>;
      if (!state.currentElection) return state;
      return {
        ...state,
        currentElection: { ...state.currentElection, floorBallots: typedAction.counts },
      };
    }

    case 'CLOSE_ELECTION': {
      const typedAction = action as Extract<MeetingAction, { type: 'CLOSE_ELECTION' }>;
      if (!state.currentElection) return state;

      // Ballots on devices and the tellers' count of paper ballots together
      const floorBallots = state.currentElection.floorBallots ?? {};
      const results = { ...state.currentElection.ballotResults };
      for (const [name, count] of Object.entries(floorBallots)) {
        results[name] = (results[name] ?? 0) + count;
      }
      const totalVotes =
        state.currentElection.votersWhoVoted.length +
        Object.values(floorBallots).reduce((sum, count) => sum + count, 0);
```

In both places that open another ballot (the runoff, and the next ballot when no one reaches the required vote), add `floorBallots: {},` after `votersWhoVoted: [],`.

- [ ] **Step 7: Reconsider, the minutes and the history**

In `shared/utils/motionHelpers.ts`, after `if (cm.reconsidered) return false; // Already reconsidered`, add:

<!-- prettier-ignore -->
```ts
        if (cm.reconsiderable === false) return false; // Its motion can't be reconsidered
```

In `shared/utils/minutesGenerator.ts`, add after the attendance import:

```ts
import { completedMotionVotes } from './voteCalculator.js';
```

In the motion records, replace:

<!-- prettier-ignore -->
```ts
    mover: '', // Not stored in completedMotions, would need to track this
    moverId: 0,
    outcome: motion.passed ? 'passed' : 'failed',
    voteCount: calculateVoteCount(motion.voterChoices),
    voterChoices: motion.voterChoices,
    timestamp: motion.timestamp,
```

with:

<!-- prettier-ignore -->
```ts
    mover: motion.mover ?? '',
    moverId: motion.moverId ?? 0,
    outcome: motion.passed ? 'passed' : 'failed',
    voteCount: completedMotionVotes(motion),
    voterChoices: motion.voterChoices,
    deviceVotes: motion.deviceVotes,
    floorVotes: motion.floorVotes,
    method: motion.method,
    timestamp: motion.timestamp,
```

Delete the private `calculateVoteCount` function and its comment. In `formatMinutesAsMarkdown`, after the `if (motion.voteCount) { ... }` block, add:

<!-- prettier-ignore -->
```ts
      const floor = motion.floorVotes;
      if (motion.deviceVotes && floor && floor.yea + floor.nay + floor.abstain > 0) {
        lines.push(
          `(On devices ${motion.deviceVotes.yea} to ${motion.deviceVotes.nay}, in the room ${floor.yea} to ${floor.nay})`,
        );
      }
```

In `shared/utils/motionHistoryHelper.ts`, add after the type import:

```ts
import { completedMotionVotes } from './voteCalculator.js';
```

change `const voteCount = calculateVoteCount(motion.voterChoices);` to `const voteCount = completedMotionVotes(motion);` and `mover: '', // Not stored in completedMotions` to `mover: motion.mover ?? '',`, and delete the private `calculateVoteCount` function at the end of the file with its comment.

- [ ] **Step 8: Run the shared tests to see them pass, and build shared**

Run: `npx tsc --noEmit -p shared/tsconfig.json && npm run test:run -w shared && npm run build:shared`
Expected: type-check clean; all pass, including 11 in `reducer/floorVotes.test.ts` and 15 in `utils/minutesGenerator.test.ts`.

Run: `npx tsc --noEmit -p backend-node/tsconfig.json`
Expected: FAIL to compile: the validator's default case and `PERMISSIONS` in `permissionGuard.ts` lack `SET_FLOOR_TALLY` and `SET_FLOOR_BALLOTS`.

- [ ] **Step 9: Write the failing validation test**

Create `backend-node/src/__tests__/floorVotesValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingAction, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { MAX_FLOOR_COUNT, validateAction } from '../socket/actionValidator.js';

const question: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool',
  mover: 'Member 2',
  moverId: 2,
  secondedBy: 'Member 3',
  status: 'active',
};

const voting: MeetingState = {
  ...initialState,
  meetingActive: true,
  votingOpen: true,
  currentMotion: question,
  motionStack: [question],
  members: [
    { id: 1, name: 'Chair', role: 'chair', present: true, presentBy: 'device' },
    { id: 2, name: 'Member 2', role: 'member', present: true, presentBy: 'device' },
  ],
};

describe('validating floor votes', () => {
  describe('CAST_VOTE', () => {
    it('is refused on a voice vote', () => {
      const result = validateAction(
        { ...voting, votingMethod: 'voice' },
        { type: 'CAST_VOTE', vote: 'yea', voterId: 2 },
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'VOTING_METHOD' });
    });

    it("judges the chair's deciding vote on the device votes and the floor tally together", () => {
      const chairVote: MeetingAction = {
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 1,
        isChairDecidingVote: true,
      };
      // On devices 2 to 2 is a tie the chair could break, but the room makes it 5 to 2
      const decided = {
        ...voting,
        votes: { yea: 2, nay: 2, abstain: 0 },
        floorVotes: { yea: 3, nay: 0, abstain: 0 },
      };
      expect(validateAction(decided, chairVote).errorCode).toBe('CHAIR_CANNOT_VOTE');
      // On devices 4 to 2 the chair has no say, but with the room it is 4 to 4
      const tied = {
        ...voting,
        votes: { yea: 4, nay: 2, abstain: 0 },
        floorVotes: { yea: 0, nay: 2, abstain: 0 },
      };
      expect(validateAction(tied, chairVote).valid).toBe(true);
    });
  });

  describe('CAST_PROXY_VOTE', () => {
    it('is refused on a voice vote', () => {
      const state = {
        ...voting,
        votingMethod: 'voice' as const,
        allowProxyVoting: true,
        proxies: [
          {
            id: 1,
            grantedBy: 3,
            grantedTo: 2,
            grantedByName: 'Member 3',
            grantedToName: 'Member 2',
            grantedAt: '20:00',
            scope: 'all' as const,
          },
        ],
      };
      const result = validateAction(state, {
        type: 'CAST_PROXY_VOTE',
        vote: 'yea',
        forMemberId: 3,
        castById: 2,
        timestamp: '',
      });
      expect(result).toMatchObject({ valid: false, errorCode: 'VOTING_METHOD' });
    });
  });

  describe('SET_FLOOR_TALLY', () => {
    const tally = (counts: Record<string, unknown>, state = voting) =>
      validateAction(state, {
        type: 'SET_FLOOR_TALLY',
        yea: 0,
        nay: 0,
        abstain: 0,
        timestamp: '',
        ...counts,
      } as MeetingAction);

    it('takes whole numbers from 0 while a vote is open', () => {
      expect(tally({ yea: 9, nay: 2, abstain: 1 }).valid).toBe(true);
      expect(tally({ yea: MAX_FLOOR_COUNT }).valid).toBe(true);
      expect(tally({ yea: 1 }, { ...voting, votingOpen: false })).toMatchObject({
        valid: false,
        errorCode: 'VOTING_NOT_OPEN',
      });
    });

    it.each([
      { yea: -1 },
      { nay: 1.5 },
      { abstain: '2' },
      { yea: MAX_FLOOR_COUNT + 1 },
      { yea: null },
    ])('refuses %j', (counts) => {
      expect(tally(counts)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    });
  });

  describe('SET_FLOOR_BALLOTS', () => {
    const electing: MeetingState = {
      ...initialState,
      currentElection: {
        id: 1,
        position: 'Director',
        candidates: [{ name: 'Ann', id: 2 }],
        requiredVotes: 'majority',
        votingInProgress: true,
        ballotResults: { Ann: 0 },
        votersWhoVoted: [],
        floorBallots: {},
        elected: null,
      },
    };
    const ballots = (counts: unknown, state = electing) =>
      validateAction(state, { type: 'SET_FLOOR_BALLOTS', counts, timestamp: '' } as MeetingAction);

    it('takes a count for each candidate, written in or not, while ballots are open', () => {
      expect(ballots({ Ann: 6, 'Write-in Name': 1 }).valid).toBe(true);
      expect(ballots({ Ann: 1 }, initialState)).toMatchObject({
        valid: false,
        errorCode: 'NO_ELECTION',
      });
      const closed = {
        ...electing,
        currentElection: { ...electing.currentElection!, votingInProgress: false },
      };
      expect(ballots({ Ann: 1 }, closed).errorCode).toBe('ELECTION_VOTING_NOT_OPEN');
    });

    it.each([[{ Ann: -1 }], [{ Ann: 1.5 }], [{ ' ': 1 }], [[1]], [null], ['Ann']])(
      'refuses %j',
      (counts) => {
        expect(ballots(counts)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      },
    );
  });

  describe('SET_VOTING_METHOD', () => {
    it('takes a known method, and not while a vote is open', () => {
      const closed = { ...voting, votingOpen: false };
      expect(validateAction(closed, { type: 'SET_VOTING_METHOD', method: 'voice' }).valid).toBe(
        true,
      );
      expect(
        validateAction(closed, { type: 'SET_VOTING_METHOD', method: 'show-of-hands' } as never),
      ).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(validateAction(voting, { type: 'SET_VOTING_METHOD', method: 'ballot' })).toMatchObject(
        { valid: false, errorCode: 'VOTING_IN_PROGRESS' },
      );
    });
  });

  describe('a motion to reconsider', () => {
    it("is refused for a vote on a motion that can't be reconsidered", () => {
      const record = {
        id: 5,
        type: 'recess',
        name: 'Recess',
        text: 'Recess',
        passed: true,
        voterChoices: {},
        timestamp: '20:15',
        reconsidered: false,
      };
      const reconsider = (reconsiderable: boolean) =>
        validateAction(
          {
            ...initialState,
            meetingActive: true,
            completedMotions: [{ ...record, reconsiderable }],
          },
          {
            type: 'MAKE_MOTION',
            motionType: 'reconsider',
            text: 'Reconsider the recess',
            mover: 'Member 2',
            moverId: 2,
            motionId: 9,
            reconsideredMotionId: 5,
            timestamp: '',
          },
        );
      expect(reconsider(false)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(reconsider(true).valid).toBe(true);
    });
  });
});
```

In `backend-node/src/__integration__/bylawSync.test.ts`, insert before `it('skips a motion whose document is in another organization', async () => {`:

<!-- prettier-ignore -->
```ts
  it('records the device votes, the floor tally and their total', async () => {
    const { before } = votedStates(f.doc, f.section);
    const after = {
      ...initialState,
      completedMotions: [
        {
          id: 41,
          passed: true,
          voterChoices: {},
          deviceVotes: { yea: 5, nay: 1, abstain: 0 },
          floorVotes: { yea: 9, nay: 2, abstain: 1 },
          method: 'ballot',
        },
      ],
    } as unknown as MeetingState;
    await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment.robbieVoteData).toMatchObject({
      yeaCount: 14,
      nayCount: 3,
      abstainCount: 1,
      deviceVotes: { yea: 5, nay: 1, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 1 },
      method: 'ballot',
    });
  });


```

- [ ] **Step 10: The permission guard and the validator**

In `backend-node/src/socket/permissionGuard.ts`, add `SET_FLOOR_TALLY: PRESIDING,` after `CLOSE_VOTING: PRESIDING,` and `SET_FLOOR_BALLOTS: PRESIDING,` after `CLOSE_ELECTION: PRESIDING,`.

In `backend-node/src/socket/actionValidator.ts`, add `addVotes,` first in the `@robbie-bylawyer/shared/utils` import, and after the `MAX_HEADCOUNT` constant:

```ts
/** The largest count the chair can enter for one choice in a floor tally or floor ballot */
export const MAX_FLOOR_COUNT = 1_000_000;

/** The voting methods (see VotingMethod) */
const VOTING_METHODS = ['standard', 'voice', 'ballot', 'rollcall'];

/** A count the chair enters: a whole number from 0 */
function isCount(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_FLOOR_COUNT;
}
```

In `MAKE_MOTION`'s details check, replace:

<!-- prettier-ignore -->
```ts
        (action.motionType === 'reconsider' &&
          !state.completedMotions.some((m) => m.id === action.reconsideredMotionId)) ||
```

with:

<!-- prettier-ignore -->
```ts
        (action.motionType === 'reconsider' &&
          !state.completedMotions.some(
            (m) => m.id === action.reconsideredMotionId && m.reconsiderable !== false,
          )) ||
```

In `CAST_VOTE`, after the `VOTING_NOT_OPEN` check, add:

<!-- prettier-ignore -->
```ts
      if (state.votingMethod === 'voice') {
        return {
          valid: false,
          error: 'This is a voice vote: the chair counts it in the room',
          errorCode: 'VOTING_METHOD',
        };
      }
```

and replace:

<!-- prettier-ignore -->
```ts
          // Judge on the other members' votes, leaving out a vote the chair already cast
          const previous = state.voterChoices[action.voterId];
          const othersVotes = previous
            ? { ...state.votes, [previous]: state.votes[previous] - 1 }
            : state.votes;
```

with:

<!-- prettier-ignore -->
```ts
          // Judge on everyone else's votes, on devices and in the room, leaving out a vote the
          // chair already cast
          const previous = state.voterChoices[action.voterId];
          const deviceVotes = previous
            ? { ...state.votes, [previous]: state.votes[previous] - 1 }
            : state.votes;
          const othersVotes = addVotes(deviceVotes, state.floorVotes);
```

After the `CLOSE_VOTING` case, add:

<!-- prettier-ignore -->
```ts
    case 'SET_FLOOR_TALLY':
      if (!state.votingOpen) {
        return { valid: false, error: 'Voting is not open', errorCode: 'VOTING_NOT_OPEN' };
      }
      if (![action.yea, action.nay, action.abstain].every(isCount)) {
        return {
          valid: false,
          error: `Each count must be a whole number from 0 to ${MAX_FLOOR_COUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };

    case 'SET_VOTING_METHOD':
      if (!VOTING_METHODS.includes(action.method)) {
        return { valid: false, error: 'Unknown voting method', errorCode: 'INVALID_ACTION' };
      }
      // Changing the method of an open vote would change how its votes are counted and shown
      if (state.votingOpen) {
        return {
          valid: false,
          error: 'The voting method cannot change while a vote is in progress',
          errorCode: 'VOTING_IN_PROGRESS',
        };
      }
      return { valid: true };

```

and delete `case 'SET_VOTING_METHOD':` from the list of always-valid actions near the end. Before `case 'CLOSE_ELECTION':`, add:

<!-- prettier-ignore -->
```ts
    case 'SET_FLOOR_BALLOTS': {
      if (!state.currentElection) {
        return { valid: false, error: 'No election in progress', errorCode: 'NO_ELECTION' };
      }
      if (!state.currentElection.votingInProgress) {
        return {
          valid: false,
          error: 'Election voting is not open',
          errorCode: 'ELECTION_VOTING_NOT_OPEN',
        };
      }
      const counts =
        typeof action.counts === 'object' && action.counts !== null && !Array.isArray(action.counts)
          ? Object.entries(action.counts)
          : null;
      if (
        !counts ||
        counts.length > 100 ||
        counts.some(([name, count]) => !name.trim() || name.length > 200 || !isCount(count))
      ) {
        return {
          valid: false,
          error: `Give each candidate's ballots as a whole number from 0 to ${MAX_FLOOR_COUNT}`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
    }

```

In `CAST_PROXY_VOTE`, after its `VOTING_NOT_OPEN` check, add the same voice-vote refusal as in `CAST_VOTE` (a proxy vote is a device vote):

<!-- prettier-ignore -->
```ts
      if (state.votingMethod === 'voice') {
        return {
          valid: false,
          error: 'This is a voice vote: the chair counts it in the room',
          errorCode: 'VOTING_METHOD',
        };
      }
```

- [ ] **Step 11: Sync both parts of a bylaw amendment's vote**

In `backend-node/src/bylawyer/bylawSyncService.ts`, add after the Prisma type import:

```ts
import { NO_VOTES } from '@robbie-bylawyer/shared/utils';
```

and replace:

<!-- prettier-ignore -->
```ts
    // Build vote data
    const voteData = {
      yeaCount: previousState.votes.yea,
      nayCount: previousState.votes.nay,
      abstainCount: previousState.votes.abstain,
      voterChoices: completedMotion.voterChoices,
      voteRequirement: votedMotion.vote,
    };
```

with:

<!-- prettier-ignore -->
```ts
    // Build vote data: the device votes and the chair's floor tally, and their total
    const deviceVotes = completedMotion.deviceVotes ?? previousState.votes;
    const floorVotes = completedMotion.floorVotes ?? NO_VOTES;
    const voteData = {
      yeaCount: deviceVotes.yea + floorVotes.yea,
      nayCount: deviceVotes.nay + floorVotes.nay,
      abstainCount: deviceVotes.abstain + floorVotes.abstain,
      deviceVotes,
      floorVotes,
      method: completedMotion.method ?? previousState.votingMethod,
      voterChoices: completedMotion.voterChoices,
      voteRequirement: votedMotion.vote,
    };
```

- [ ] **Step 12: Run everything**

Run: `npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-checks clean; all pass, including 18 in `floorVotesValidation.test.ts` and 5 in `bylawSync.test.ts`. The web client's `useVoteResults` tests still parse the log line.

- [ ] **Step 13: Commit**

```bash
npx prettier --write shared/types shared/reducer shared/utils shared/__tests__/reducer/floorVotes.test.ts shared/__tests__/utils/minutesGenerator.test.ts backend-node/src/socket/permissionGuard.ts backend-node/src/socket/actionValidator.ts backend-node/src/bylawyer/bylawSyncService.ts backend-node/src/__tests__/floorVotesValidation.test.ts backend-node/src/__integration__/bylawSync.test.ts
git add shared/types shared/reducer shared/utils shared/__tests__/reducer/floorVotes.test.ts shared/__tests__/utils/minutesGenerator.test.ts backend-node/src/socket/permissionGuard.ts backend-node/src/socket/actionValidator.ts backend-node/src/bylawyer/bylawSyncService.ts backend-node/src/__tests__/floorVotesValidation.test.ts backend-node/src/__integration__/bylawSync.test.ts
git commit -m "feat(room): floor tallies, voice votes and floor ballots

The chair enters a count of the room for each vote (SET_FLOOR_TALLY) and of
paper ballots in an election (SET_FLOOR_BALLOTS); results, the chair's
deciding vote and the bylaw sync use device and floor votes together, and
the log line and the minutes show both parts. A voice vote takes no device
votes. Every decided motion is recorded with both parts and its method; a
secret ballot keeps no record of who voted which way. The voting method
can't change during a vote."
```

---

### Task 4: Who acts, guests, and secret ballots on the wire

The enricher now decides, for every action type, which fields say who is acting, and overwrites them from the socket (`ACTOR_FIELDS`, a `Record` over the whole action union, so a new action type doesn't compile without a decision). Fields that name someone else are left alone. Three fields the design names don't exist yet: `YIELD_FLOOR` gets `yieldedBy` (the speaker yields, or the chair ends the speaker's turn), and the proxy request answers get `acceptedBy`, `declinedBy` and `canceledBy`, which the validator checks against the request. `revokedBy` stays out: only the chair or an admin may revoke a proxy, which the permission guard already enforces.

Everything the server sends a client goes through `publicState`: while a secret ballot is open, `voterChoices` is empty, and decided ballots carry no choices. The server keeps the choices it needs to let a member change their vote. A display socket can't dispatch actions, and the quorum warning counts attendance with `attendanceSummary`. Guests are refused as nominees, proxy holders or grantors, and as chair.

**Files:**

- Create: `backend-node/src/socket/statePublisher.ts`
- Modify: `shared/types/index.ts`, `backend-node/src/socket/actionEnricher.ts`, `backend-node/src/socket/actionValidator.ts`, `backend-node/src/socket/actionHandler.ts`, `backend-node/src/socket/joinHandler.ts`, `backend-node/src/socket/disconnectHandler.ts`, `backend-node/src/socket/stateRequestHandler.ts`
- Test: `backend-node/src/__tests__/actionEnricher.test.ts` (replaced), `backend-node/src/__tests__/statePublisher.test.ts`, `backend-node/src/__tests__/actorValidation.test.ts`, `backend-node/src/__tests__/actionHandler.test.ts` (new)

- [ ] **Step 1: Add the actor fields to the shared types**

In `shared/types/index.ts`, replace `| { type: 'YIELD_FLOOR'; timestamp: string }` with:

<!-- prettier-ignore -->
```ts
  // yieldedBy is set by the server: the speaker, or the chair ending the speaker's turn
  | { type: 'YIELD_FLOOR'; yieldedBy?: number; timestamp: string }
```

and replace:

<!-- prettier-ignore -->
```ts
  | { type: 'ACCEPT_PROXY'; requestId: number; proxyId: number; timestamp: string }
  | { type: 'DECLINE_PROXY'; requestId: number; reason?: string; timestamp: string }
  | { type: 'CANCEL_PROXY_REQUEST'; requestId: number; timestamp: string }
```

with:

<!-- prettier-ignore -->
```ts
  // acceptedBy, declinedBy and canceledBy are set by the server from the signed-in user
  | {
      type: 'ACCEPT_PROXY';
      requestId: number;
      proxyId: number;
      acceptedBy?: number;
      timestamp: string;
    }
  | {
      type: 'DECLINE_PROXY';
      requestId: number;
      reason?: string;
      declinedBy?: number;
      timestamp: string;
    }
  | { type: 'CANCEL_PROXY_REQUEST'; requestId: number; canceledBy?: number; timestamp: string }
```

Run: `npm run build:shared`
Expected: no errors.

- [ ] **Step 2: Write the failing tests**

Replace `backend-node/src/__tests__/actionEnricher.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import type { MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { ACTOR_FIELDS, enrichAction } from '../socket/actionEnricher.js';
import { ACTION_TYPES } from '../socket/permissionGuard.js';

const chair: SocketData = {
  userId: 10,
  email: 'chair@example.com',
  name: 'Chair',
  sessionId: 'session-1',
  meetingCode: 'TEST01',
  role: 'chair',
};
const member: SocketData = {
  ...chair,
  userId: 20,
  email: 'm@example.com',
  name: 'Member',
  role: 'member',
};
// The member as the meeting has them: renamed since signing in
const memberInMeeting: Member = { id: 20, name: 'Renamed Member', role: 'member', present: true };

const enrich = (action: Record<string, unknown>, socket: SocketData = member) =>
  enrichAction(action as unknown as MeetingAction, socket, [memberInMeeting]) as unknown as Record<
    string,
    unknown
  >;

describe('enrichAction', () => {
  describe('who is acting', () => {
    // Every action type has an entry, so a new one can't be added without deciding
    it('is decided for every action type', () => {
      expect(Object.keys(ACTOR_FIELDS).sort()).toEqual([...ACTION_TYPES].sort());
    });

    const withActor = ACTION_TYPES.filter((type) => Object.keys(ACTOR_FIELDS[type]).length > 0);

    it.each(withActor)('%s: a forged actor is replaced with the signed-in member', (type) => {
      const { id, name, member: asMember } = ACTOR_FIELDS[type];
      const forged: Record<string, unknown> = { type };
      if (id) forged[id] = 999;
      if (name) forged[name] = 'Spoof';
      if (asMember) forged.member = { id: 999, name: 'Spoof', role: 'chair', present: true };

      const enriched = enrich(forged);
      if (id) expect(enriched[id]).toBe(20);
      if (name) expect(enriched[name]).toBe('Renamed Member');
      if (asMember) expect(enriched.member).toEqual(memberInMeeting);
    });

    it('covers the fields that name who acts', () => {
      expect(ACTOR_FIELDS).toMatchObject({
        MAKE_MOTION: { id: 'moverId', name: 'mover' },
        SECOND_MOTION: { id: 'seconderId', name: 'seconder' },
        CAST_VOTE: { id: 'voterId' },
        CAST_BALLOT: { id: 'voterId' },
        ASK_INQUIRY: { id: 'askerId', name: 'askedBy' },
        ANSWER_INQUIRY: { name: 'answeredBy' },
        NOMINATE: { id: 'nominatorId', name: 'nominatedBy' },
        OBJECT_TO_CONSENT: { name: 'objector' },
        CAST_PROXY_VOTE: { id: 'castById' },
        REQUEST_PROXY: { id: 'requestedBy', name: 'requestedByName' },
        ACCEPT_PROXY: { id: 'acceptedBy' },
        DECLINE_PROXY: { id: 'declinedBy' },
        CANCEL_PROXY_REQUEST: { id: 'canceledBy' },
        RENAME_MEMBER: { id: 'renamedBy' },
        WITHDRAW_MOTION: { id: 'requesterId' },
        MODIFY_MOTION: { id: 'requesterId' },
        RAISE_HAND: { member: true },
        LOWER_HAND: { member: true },
        YIELD_FLOOR: { id: 'yieldedBy' },
        RESPOND_ROLL_CALL: { id: 'memberId' },
        SET_MEMBER_ROLE: { id: 'changedById', name: 'changedBy' },
      });
    });

    it('uses the signed-in name for a member not yet in the meeting', () => {
      const enriched = enrichAction(
        { type: 'MAKE_MOTION', motionId: 1, mover: 'x', moverId: 99 } as unknown as MeetingAction,
        chair,
      ) as unknown as Record<string, unknown>;
      expect(enriched).toMatchObject({ mover: 'Chair', moverId: 10 });
    });

    it('leaves alone the fields that name someone else', () => {
      const speaker = { id: 30, name: 'Speaker', role: 'member', present: true };
      expect(enrich({ type: 'RECOGNIZE_SPEAKER', member: speaker }, chair).member).toEqual(speaker);
      const nomination = enrich({ type: 'NOMINATE', nomineeId: 30, nomineeName: 'Speaker' });
      expect(nomination).toMatchObject({ nomineeId: 30, nomineeName: 'Speaker' });
      expect(enrich({ type: 'MARK_ABSENT', memberId: 30 }, chair).memberId).toBe(30);
      expect(enrich({ type: 'RENAME_MEMBER', memberId: 30 }, chair).memberId).toBe(30);
      // A chair or admin grants a proxy for the absent member it names
      const grant = enrich({ type: 'GRANT_PROXY', grantedBy: 30, grantedTo: 40 }, chair);
      expect(grant).toMatchObject({ grantedBy: 30, grantedTo: 40 });
    });

    it('drops a client-sent person from MARK_PRESENT: the server reads the roster', () => {
      const enriched = enrich(
        { type: 'MARK_PRESENT', userId: 30, member: { id: 30, role: 'admin' } },
        chair,
      );
      expect(enriched.userId).toBe(30);
      expect(enriched).not.toHaveProperty('member');
    });
  });

  describe('IDs for new items', () => {
    it.each([
      ['MAKE_MOTION', 'motionId'],
      ['ADD_AGENDA_ITEM', 'itemId'],
      ['NOMINATE', 'nominationId'],
      ['START_ELECTION', 'electionId'],
      ['ASK_INQUIRY', 'inquiryId'],
    ])('%s gets a server-generated %s', (type, field) => {
      const enriched = enrich({ type, [field]: 1 });
      expect(enriched[field]).not.toBe(1);
      expect(typeof enriched[field]).toBe('number');
    });
  });

  describe('IDs that reference existing items', () => {
    it('DECLINE_NOMINATION keeps the nomination being declined', () => {
      expect(enrich({ type: 'DECLINE_NOMINATION', nominationId: 42 }).nominationId).toBe(42);
    });

    it('ANSWER_INQUIRY keeps the inquiry being answered', () => {
      const enriched = enrich(
        { type: 'ANSWER_INQUIRY', inquiryId: 42, answer: 'Yes', answeredBy: 'Someone' },
        chair,
      );
      expect(enriched.inquiryId).toBe(42);
      expect(enriched.answeredBy).toBe('Chair');
    });
  });
});
```

Create `backend-node/src/__tests__/statePublisher.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { CompletedMotion, MeetingState } from '@robbie-bylawyer/shared/types';
import { emitState, publicState } from '../socket/statePublisher.js';

const record = (method: CompletedMotion['method']): CompletedMotion => ({
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Resurface the pool',
  passed: true,
  voterChoices: { 2: 'yea', 3: 'nay' },
  timestamp: '20:15',
  reconsidered: false,
  method,
});

const ballot: MeetingState = {
  ...initialState,
  votingOpen: true,
  votingMethod: 'ballot',
  votes: { yea: 1, nay: 1, abstain: 0 },
  voters: [2, 3],
  voterChoices: { 2: 'yea', 3: 'nay' },
};

describe('publicState', () => {
  it('leaves out who voted which way while a secret ballot is open', () => {
    const shown = publicState(ballot);
    expect(shown.voterChoices).toEqual({});
    // The counts and who has voted stay
    expect(shown.votes).toEqual(ballot.votes);
    expect(shown.voters).toEqual([2, 3]);
  });

  it('leaves out the choices recorded for a decided ballot, and keeps other records', () => {
    const state = { ...initialState, completedMotions: [record('ballot'), record('rollcall')] };
    const shown = publicState(state);
    expect(shown.completedMotions[0].voterChoices).toEqual({});
    expect(shown.completedMotions[1].voterChoices).toEqual({ 2: 'yea', 3: 'nay' });
  });

  it('sends any other state as it is', () => {
    const standard = { ...ballot, votingMethod: 'standard' as const };
    expect(publicState(standard)).toBe(standard);
  });
});

describe('emitState', () => {
  it("sends the meeting's room the public state", () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    emitState({ to } as never, 'TEST01', { state: ballot, stateVersion: 4 });
    expect(to).toHaveBeenCalledWith('meeting:TEST01');
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', {
      state: { ...ballot, voterChoices: {} },
      stateVersion: 4,
    });
  });
});
```

Create `backend-node/src/__tests__/actorValidation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { validateAction } from '../socket/actionValidator.js';

const member = (id: number, role: Member['role']): Member => ({
  id,
  name: `Member ${id}`,
  role,
  present: true,
  presentBy: 'device',
});
const chair = member(1, 'chair');
const speaker = member(2, 'member');
const other = member(3, 'member');
const guest = member(9, 'guest');
const state: MeetingState = {
  ...initialState,
  meetingActive: true,
  members: [chair, speaker, other, guest],
};

describe('who may act', () => {
  describe('YIELD_FLOOR', () => {
    const floor = { ...state, recognizedSpeaker: speaker };
    const yieldBy = (yieldedBy: number) =>
      validateAction(floor, { type: 'YIELD_FLOOR', yieldedBy, timestamp: '' });

    it('is for the speaker, or the chair ending their turn', () => {
      expect(yieldBy(2).valid).toBe(true);
      expect(yieldBy(1).valid).toBe(true);
      expect(yieldBy(3)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });
  });

  describe('proxy requests', () => {
    const request = {
      id: 5,
      requestedBy: 2,
      requestedByName: 'Member 2',
      requestedFor: 3,
      requestedForName: 'Member 3',
      requestedAt: '20:00',
      scope: 'all' as const,
      status: 'pending' as const,
    };
    const asked = {
      ...state,
      allowProxyVoting: true,
      allowMemberProxyGrant: true,
      pendingProxyRequests: [request],
    };

    it('are accepted or declined only by the member asked', () => {
      const accept = (acceptedBy: number) =>
        validateAction(asked, {
          type: 'ACCEPT_PROXY',
          requestId: 5,
          proxyId: 1,
          acceptedBy,
          timestamp: '',
        });
      expect(accept(3).valid).toBe(true);
      expect(accept(2)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });

      const decline = (declinedBy: number) =>
        validateAction(asked, { type: 'DECLINE_PROXY', requestId: 5, declinedBy, timestamp: '' });
      expect(decline(3).valid).toBe(true);
      expect(decline(1)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });

    it('are canceled only by the member who asked', () => {
      const cancel = (canceledBy: number) =>
        validateAction(asked, {
          type: 'CANCEL_PROXY_REQUEST',
          requestId: 5,
          canceledBy,
          timestamp: '',
        });
      expect(cancel(2).valid).toBe(true);
      expect(cancel(3)).toMatchObject({ valid: false, errorCode: 'PERMISSION_DENIED' });
    });

    it('cannot ask a guest to hold a proxy', () => {
      const result = validateAction(
        { ...asked, pendingProxyRequests: [] },
        {
          type: 'REQUEST_PROXY',
          requestId: 6,
          requestedBy: 2,
          requestedByName: 'Member 2',
          requestedFor: 9,
          requestedForName: 'Member 9',
          scope: 'all',
          timestamp: '',
        },
      );
      expect(result).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    });
  });

  describe('guests', () => {
    it('cannot be nominated', () => {
      const open = { ...state, nominationsOpen: true, currentNominationPosition: 'Director' };
      const nominate = (nomineeId: number) =>
        validateAction(open, {
          type: 'NOMINATE',
          position: 'Director',
          nomineeName: `Member ${nomineeId}`,
          nomineeId,
          nominatedBy: 'Member 2',
          nominatorId: 2,
          nominationId: 1,
          timestamp: '',
        });
      expect(nominate(9)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(nominate(3).valid).toBe(true);
    });

    it('cannot hold or grant a proxy', () => {
      const grant = (grantedBy: number, grantedTo: number) =>
        validateAction(
          { ...state, allowProxyVoting: true },
          {
            type: 'GRANT_PROXY',
            proxyId: 1,
            grantedBy,
            grantedTo,
            grantedByName: '',
            grantedToName: '',
            scope: 'all',
            timestamp: '',
          },
        );
      expect(grant(9, 2)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(grant(2, 9)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
      expect(grant(3, 2).valid).toBe(true);
    });

    it('cannot take the chair', () => {
      const result = validateAction(state, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: 9,
        newRole: 'chair',
        timestamp: '',
      });
      expect(result).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    });
  });
});
```

Create `backend-node/src/__tests__/actionHandler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';

// The meeting as stored; each test sets it
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({
    getMeeting: async () => ({ id: 1, code: 'TEST01', state: stored.state, stateVersion: 1 }),
  }),
}));
// Apply with the real reducer, as the state manager does
const applyAction = vi.hoisted(() =>
  vi.fn(async (_code: string, action: MeetingAction) => ({
    success: true,
    state: meetingReducer(stored.state, action),
    stateVersion: 2,
  })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));
vi.mock('../bylawyer/bylawSyncService.js', () => ({
  checkAndSyncBylawAmendment: async () => null,
}));

const { handleDispatchAction } = await import('../socket/actionHandler.js');

const question = {
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'Resurface the pool',
  mover: 'Ann',
  moverId: 2,
  secondedBy: 'Bo',
  status: 'active' as const,
  precedence: 1,
  category: 'main' as const,
  interrupt: false,
  needsSecond: true,
  debatable: true,
  amendable: true,
  reconsidered: true,
  vote: 'majority' as const,
  phrase: '',
  help: '',
  whenToUse: '',
};

function socketOf(data: Partial<SocketData>) {
  return {
    data: {
      userId: 2,
      email: 'ann@example.org',
      name: 'Ann',
      sessionId: 's-1',
      meetingCode: 'TEST01',
      role: 'member',
      ...data,
    } as SocketData,
    emit: vi.fn(),
  };
}

async function dispatch(socket: ReturnType<typeof socketOf>, action: Record<string, unknown>) {
  const emit = vi.fn();
  const io = { to: vi.fn(() => ({ emit })), in: () => ({ fetchSockets: async () => [] }) };
  const callback = vi.fn();
  await handleDispatchAction(
    socket as never,
    io as never,
    { action: action as unknown as MeetingAction, clientSequence: 1 },
    callback,
  );
  return { callback, emit };
}

describe('handleDispatchAction', () => {
  beforeEach(() => {
    applyAction.mockClear();
    stored.state = {
      ...initialState,
      meetingCode: 'TEST01',
      meetingActive: true,
      quorum: 3,
      members: [
        { id: 1, name: 'Chair', role: 'chair', present: true, presentBy: 'device' },
        { id: 2, name: 'Ann', role: 'member', present: true, presentBy: 'device' },
        { id: 9, name: 'Guest', role: 'guest', present: true, presentBy: 'device' },
      ],
      currentMotion: question,
      motionStack: [question],
    };
  });

  it('refuses every action from a display', async () => {
    const { callback } = await dispatch(socketOf({ role: 'guest', display: true }), {
      type: 'RAISE_HAND',
      stance: 'pro',
    });
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'PERMISSION_DENIED' }),
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'CAST_VOTE', vote: 'yea' },
    { type: 'MAKE_MOTION', motionType: 'mainMotion', text: 'Paint the clubhouse' },
    { type: 'SECOND_MOTION' },
  ])("refuses a guest's $type", async (action) => {
    const { callback } = await dispatch(socketOf({ userId: 9, role: 'guest' }), action);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: 'PERMISSION_DENIED' }),
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('opens a vote without a warning when the headcount makes the quorum', async () => {
    // Two members on devices (the guest doesn't count) and one person counted by the chair
    stored.state = { ...stored.state, headcount: 1 };
    await dispatch(socketOf({ userId: 1, role: 'chair' }), {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '',
    });
    expect(applyAction.mock.calls[0][1]).not.toHaveProperty('withoutQuorum');
  });

  it('warns when a vote opens without a quorum, guests not counted', async () => {
    await dispatch(socketOf({ userId: 1, role: 'chair' }), {
      type: 'OPEN_VOTING',
      voteTimerEnd: null,
      timestamp: '',
    });
    expect(applyAction.mock.calls[0][1]).toMatchObject({ withoutQuorum: true });
  });

  it("doesn't broadcast who voted which way on a secret ballot", async () => {
    stored.state = {
      ...stored.state,
      votingOpen: true,
      votingMethod: 'ballot',
      voters: [1],
      voterChoices: { 1: 'nay' },
      votes: { yea: 0, nay: 1, abstain: 0 },
    };
    const { emit } = await dispatch(socketOf({}), { type: 'CAST_VOTE', vote: 'yea' });
    const [event, update] = emit.mock.calls[0];
    expect(event).toBe('STATE_UPDATE');
    expect(update.state.votes).toEqual({ yea: 1, nay: 1, abstain: 0 });
    expect(update.state.voterChoices).toEqual({});
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd backend-node && npx vitest run src/__tests__/actionEnricher.test.ts src/__tests__/statePublisher.test.ts src/__tests__/actorValidation.test.ts src/__tests__/actionHandler.test.ts`
Expected: FAIL. `ACTOR_FIELDS` isn't exported, `../socket/statePublisher.js` doesn't exist, a member who isn't the speaker can yield the floor and anyone can answer a proxy request, guests are accepted as nominees and proxy holders, and in `actionHandler.test.ts` the display's action is applied, the guest counts toward quorum and the ballot's choices are broadcast.

- [ ] **Step 4: Replace `backend-node/src/socket/actionEnricher.ts`**

```ts
import type { MeetingAction, Member } from '@robbie-bylawyer/shared/types';
import type { SocketData } from '@robbie-bylawyer/shared/types/socket';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';

/** The ID field each item-creating action assigns to its new item */
const CREATED_ID_FIELDS: Partial<Record<MeetingAction['type'], string>> = {
  MAKE_MOTION: 'motionId',
  ADD_AGENDA_ITEM: 'itemId',
  NOMINATE: 'nominationId',
  START_ELECTION: 'electionId',
  ASK_INQUIRY: 'inquiryId',
};

/** The fields of an action that say who is acting, which the server sets from the socket */
export interface ActorFields {
  /** Set to the sender's user id */
  id?: string;
  /** Set to the sender's current name */
  name?: string;
  /** Set to the sender as a meeting member */
  member?: true;
}

const NONE: ActorFields = {};

/**
 * Who is acting, for every action type. A client can never act as someone else: each of these
 * fields is overwritten with the signed-in user. Fields that name someone else (the speaker
 * the chair recognizes, a nominee, the absent member a proxy is granted for, the member marked
 * absent) are left alone; the permission guard and the validator decide who may name them.
 */
export const ACTOR_FIELDS: Record<MeetingAction['type'], ActorFields> = {
  START_MEETING: NONE,
  END_MEETING: NONE,
  MAKE_MOTION: { id: 'moverId', name: 'mover' },
  SECOND_MOTION: { id: 'seconderId', name: 'seconder' },
  DECLINE_SECOND: NONE,
  OPEN_VOTING: NONE,
  CAST_VOTE: { id: 'voterId' },
  CLOSE_VOTING: NONE,
  SET_FLOOR_TALLY: NONE,
  RAISE_HAND: { member: true },
  LOWER_HAND: { member: true },
  RECOGNIZE_SPEAKER: NONE,
  YIELD_FLOOR: { id: 'yieldedBy' },
  ADD_AGENDA_ITEM: NONE,
  REMOVE_AGENDA_ITEM: NONE,
  ADOPT_AGENDA: NONE,
  AGENDA_OBJECTION: NONE,
  CALL_AGENDA_ITEM: NONE,
  COMPLETE_AGENDA_ITEM: NONE,
  REORDER_AGENDA: NONE,
  RELOAD_AGENDA: NONE,
  SET_SPEAKER_TIME_LIMIT: NONE,
  SET_VOTE_TIME_LIMIT: NONE,
  REQUEST_UNANIMOUS_CONSENT: NONE,
  OBJECT_TO_CONSENT: { name: 'objector' },
  UNANIMOUS_CONSENT_PASSED: NONE,
  SET_VOTING_METHOD: NONE,
  ADVANCE_MEETING_STAGE: NONE,
  SET_MEETING_STAGE: NONE,
  SET_QUORUM: NONE,
  APPROVE_MINUTES: NONE,
  SET_PREVIOUS_MINUTES: NONE,
  ADD_COMMITTEE_REPORT: NONE,
  PRESENT_COMMITTEE_REPORT: NONE,
  SUSPEND_RULE_APPROVED: NONE,
  RESTORE_RULE: NONE,
  CHAIR_RULING: NONE,
  OPEN_NOMINATIONS: NONE,
  NOMINATE: { id: 'nominatorId', name: 'nominatedBy' },
  DECLINE_NOMINATION: NONE,
  CLOSE_NOMINATIONS: NONE,
  START_ELECTION: NONE,
  CAST_BALLOT: { id: 'voterId' },
  CLOSE_ELECTION: NONE,
  SET_FLOOR_BALLOTS: NONE,
  DECLARE_ELECTED: NONE,
  ASK_INQUIRY: { id: 'askerId', name: 'askedBy' },
  ANSWER_INQUIRY: { name: 'answeredBy' },
  SET_MEMBER_ROLE: { id: 'changedById', name: 'changedBy' },
  ADD_MEMBER: NONE,
  SET_MEMBER_PRESENCE: NONE,
  REFRESH_MEMBERS: NONE,
  MARK_PRESENT: NONE,
  SET_HEADCOUNT: NONE,
  WITHDRAW_MOTION: { id: 'requesterId' },
  MODIFY_MOTION: { id: 'requesterId' },
  START_ROLL_CALL: NONE,
  RESPOND_ROLL_CALL: { id: 'memberId' },
  COMPLETE_ROLL_CALL: NONE,
  MARK_ABSENT: NONE,
  SET_AUTO_YIELD: NONE,
  SET_PROXY_SETTINGS: NONE,
  // grantedBy names the absent member a chair or admin grants for (see permissionGuard)
  GRANT_PROXY: NONE,
  REVOKE_PROXY: NONE,
  CAST_PROXY_VOTE: { id: 'castById' },
  REQUEST_PROXY: { id: 'requestedBy', name: 'requestedByName' },
  ACCEPT_PROXY: { id: 'acceptedBy' },
  DECLINE_PROXY: { id: 'declinedBy' },
  CANCEL_PROXY_REQUEST: { id: 'canceledBy' },
  RENAME_MEMBER: { id: 'renamedBy' },
};

/**
 * Enrich action with server-authoritative values
 * This prevents clients from spoofing their identity
 */
export function enrichAction(
  action: MeetingAction,
  socketData: SocketData,
  members: readonly Member[] = [],
): MeetingAction {
  const enriched = { ...action } as MeetingAction & Record<string, unknown>;
  // The member's current name and role: the session keeps the name given at sign-in, so a
  // member renamed since would otherwise be stamped with the old one
  const self = members.find((m) => m.id === socketData.userId) ?? {
    id: socketData.userId,
    name: socketData.name,
    role: socketData.role,
    present: true,
  };

  const actor = ACTOR_FIELDS[enriched.type] ?? NONE;
  if (actor.id) enriched[actor.id] = socketData.userId;
  if (actor.name) enriched[actor.name] = self.name;
  if (actor.member) enriched.member = self;

  // The person marked present comes from the organization's roster, never from a client
  if (enriched.type === 'MARK_PRESENT') {
    delete enriched.member;
  }

  // Server generates timestamps using shared utility for consistency
  if ('timestamp' in enriched) {
    enriched.timestamp = generateTimestamp();
  }

  // Server generates the ID of a new item using shared utility to prevent collisions. Actions
  // that refer to an existing item (DECLINE_NOMINATION, ANSWER_INQUIRY) keep the client's ID.
  const createdIdField = CREATED_ID_FIELDS[enriched.type];
  if (createdIdField && createdIdField in enriched) {
    enriched[createdIdField] = generateId();
  }

  return enriched as MeetingAction;
}
```

- [ ] **Step 5: Create `backend-node/src/socket/statePublisher.ts`**

```ts
import type { Server } from 'socket.io';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  StateUpdatePayload,
} from '@robbie-bylawyer/shared/types/socket';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * The state as clients may see it: who voted which way stays on the server for a secret
 * ballot, while it is open and in the record of each one decided. Every state sent to a
 * client goes through here.
 */
export function publicState(state: MeetingState): MeetingState {
  const openBallot = state.votingOpen && state.votingMethod === 'ballot';
  const ballotChoices = (state.completedMotions ?? []).some(
    (m) => m.method === 'ballot' && Object.keys(m.voterChoices).length > 0,
  );
  if (!openBallot && !ballotChoices) return state;
  return {
    ...state,
    voterChoices: openBallot ? {} : state.voterChoices,
    completedMotions: ballotChoices
      ? state.completedMotions.map((m) => (m.method === 'ballot' ? { ...m, voterChoices: {} } : m))
      : state.completedMotions,
  };
}

/** Send a meeting's new state to everyone in it */
export function emitState(io: TypedServer, meetingCode: string, update: StateUpdatePayload): void {
  io.to(`meeting:${meetingCode}`).emit('STATE_UPDATE', {
    ...update,
    state: publicState(update.state),
  });
}
```

Send every state through it. In `backend-node/src/socket/joinHandler.ts`, add after the `disconnectHandler.js` import:

```ts
import { emitState, publicState } from './statePublisher.js';
```

replace `io.to(roomName).emit('STATE_UPDATE', {` with `emitState(io, data.meetingCode, {`, and in the callback change `state: currentState,` to `state: publicState(currentState),`.

In `backend-node/src/socket/disconnectHandler.ts`, add after the `stateManager.js` import:

```ts
import { emitState } from './statePublisher.js';
```

and replace `io.to(roomName).emit('STATE_UPDATE', {` with `emitState(io, meetingCode, {`.

In `backend-node/src/socket/stateRequestHandler.ts`, add after the logger import:

```ts
import { publicState } from './statePublisher.js';
```

and change `state: meeting.state,` to `state: publicState(meeting.state),`.

- [ ] **Step 6: The action handler**

In `backend-node/src/socket/actionHandler.ts`, add after the `MeetingAction` type import:

```ts
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
```

and after the `stateManager.js` import:

```ts
import { emitState } from './statePublisher.js';
```

Before `// Rate limit actions per user`, add:

<!-- prettier-ignore -->
```ts
    // A display shows the meeting; it doesn't take part
    if (socket.data.display) {
      callback({
        success: false,
        error: 'A display cannot take part in the meeting',
        errorCode: 'PERMISSION_DENIED',
      });
      return;
    }

```

Replace the quorum check:

<!-- prettier-ignore -->
```ts
    // Quorum warning for voting actions (allow but log warning)
    let votingWithoutQuorum = false;
    if (data.action.type === 'OPEN_VOTING') {
      const presentCount = meeting.state.members.reduce(
        (count, m) => count + (m.present ? 1 : 0),
        0,
      );
      if (presentCount < meeting.state.quorum) {
        votingWithoutQuorum = true;
        logger.warn(
          { meetingCode, presentCount, quorumRequired: meeting.state.quorum },
          'Vote opened without quorum',
        );
      }
    }
```

with:

<!-- prettier-ignore -->
```ts
    // Quorum warning for voting actions (allow but log warning). Attendance counts members on
    // a device or marked present, the headcount, and proxies when they count; never guests.
    let votingWithoutQuorum = false;
    if (data.action.type === 'OPEN_VOTING') {
      const attendance = attendanceSummary(meeting.state);
      if (!attendance.hasQuorum) {
        votingWithoutQuorum = true;
        logger.warn(
          { meetingCode, present: attendance.present, quorumRequired: attendance.quorum },
          'Vote opened without quorum',
        );
      }
    }
```

The enricher records who changed a role now, so replace:

<!-- prettier-ignore -->
```ts
    // Special enrichment for SET_MEMBER_ROLE - add audit info and find current chair if needed
    if (data.action.type === 'SET_MEMBER_ROLE') {
      const roleAction = enrichedAction as {
        type: 'SET_MEMBER_ROLE';
        targetMemberId: number;
        newRole: string;
        previousChairId?: number;
        changedBy: string;
        changedById: number;
      };

      // Add audit fields
      roleAction.changedBy = socket.data.name;
      roleAction.changedById = socket.data.userId;

```

with:

<!-- prettier-ignore -->
```ts
    // Special enrichment for SET_MEMBER_ROLE: find the current chair (the enricher records who
    // made the change)
    if (data.action.type === 'SET_MEMBER_ROLE') {
      const roleAction = enrichedAction as {
        type: 'SET_MEMBER_ROLE';
        targetMemberId: number;
        newRole: string;
        previousChairId?: number;
      };

```

Replace:

<!-- prettier-ignore -->
```ts
    const roomName = `meeting:${meetingCode}`;
    io.to(roomName).emit('STATE_UPDATE', {
```

with:

<!-- prettier-ignore -->
```ts
    emitState(io, meetingCode, {
```

- [ ] **Step 7: Who may yield, answer a proxy request, be nominated or hold a proxy**

In `backend-node/src/socket/actionValidator.ts`, add before the `isCount` function:

```ts
/** Whether the member with this id is in the meeting as a guest */
function isGuest(state: MeetingState, memberId: number): boolean {
  return state.members.some((m) => m.id === memberId && m.role === 'guest');
}
```

Replace the `YIELD_FLOOR` case with:

<!-- prettier-ignore -->
```ts
    case 'YIELD_FLOOR': {
      if (!state.recognizedSpeaker) {
        return { valid: false, error: 'No speaker has the floor', errorCode: 'NO_SPEAKER' };
      }
      // The speaker yields, or the chair ends the speaker's turn
      const yielder = state.members.find((m) => m.id === action.yieldedBy);
      if (
        action.yieldedBy !== undefined &&
        action.yieldedBy !== state.recognizedSpeaker.id &&
        yielder?.role !== 'chair' &&
        yielder?.role !== 'admin'
      ) {
        return {
          valid: false,
          error: 'Only the speaker or the chair can yield the floor',
          errorCode: 'PERMISSION_DENIED',
        };
      }
      return { valid: true };
    }
```

In `NOMINATE`, after the `ALREADY_NOMINATED` check, add:

<!-- prettier-ignore -->
```ts
      if (action.nomineeId && isGuest(state, action.nomineeId)) {
        return {
          valid: false,
          error: 'Guests cannot be nominated',
          errorCode: 'INVALID_ACTION',
        };
      }
```

In `SET_MEMBER_ROLE`, after the `MEMBER_NOT_FOUND` check, add:

<!-- prettier-ignore -->
```ts
      if (targetMember.role === 'guest') {
        return {
          valid: false,
          error: 'A guest cannot take the chair',
          errorCode: 'INVALID_ACTION',
        };
      }
```

In `GRANT_PROXY`, after the `Receiving member not found` check, add:

<!-- prettier-ignore -->
```ts
      if (grantingMember.role === 'guest' || receivingMember.role === 'guest') {
        return {
          valid: false,
          error: 'Guests cannot hold or grant proxies',
          errorCode: 'INVALID_ACTION',
        };
      }
```

In `REQUEST_PROXY`, after the `Designated proxy holder not found` check, add:

<!-- prettier-ignore -->
```ts
      if (designatedHolder.role === 'guest') {
        return {
          valid: false,
          error: 'Guests cannot hold proxies',
          errorCode: 'INVALID_ACTION',
        };
      }
```

In `ACCEPT_PROXY`, after its `REQUEST_NOT_PENDING` check, add:

<!-- prettier-ignore -->
```ts
      if (action.acceptedBy !== undefined && action.acceptedBy !== request.requestedFor) {
        return {
          valid: false,
          error: 'Only the member asked can accept this request',
          errorCode: 'PERMISSION_DENIED',
        };
      }
```

In `DECLINE_PROXY`, after its `REQUEST_NOT_PENDING` check, add:

<!-- prettier-ignore -->
```ts
      if (action.declinedBy !== undefined && action.declinedBy !== request.requestedFor) {
        return {
          valid: false,
          error: 'Only the member asked can decline this request',
          errorCode: 'PERMISSION_DENIED',
        };
      }
```

In `CANCEL_PROXY_REQUEST`, after its `REQUEST_NOT_PENDING` check, add:

<!-- prettier-ignore -->
```ts
      if (action.canceledBy !== undefined && action.canceledBy !== request.requestedBy) {
        return {
          valid: false,
          error: 'Only the member who asked can cancel this request',
          errorCode: 'PERMISSION_DENIED',
        };
      }
```

The checks apply when the field is set, which the enricher always does for a client's action; the server's own actions don't carry them.

- [ ] **Step 8: Run them to see them pass**

Run: `cd backend-node && npx vitest run src/__tests__/actionEnricher.test.ts src/__tests__/statePublisher.test.ts src/__tests__/actorValidation.test.ts src/__tests__/actionHandler.test.ts`
Expected: 51 passed (33 in `actionEnricher.test.ts`, 4 in `statePublisher.test.ts`, 7 in `actorValidation.test.ts`, 7 in `actionHandler.test.ts`).

- [ ] **Step 9: Run everything**

Run: `npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w backend-node && npm run test:run -w frontend-unified && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-checks clean; all pass.

- [ ] **Step 10: Commit**

```bash
npx prettier --write shared/types/index.ts backend-node/src/socket backend-node/src/__tests__/actionEnricher.test.ts backend-node/src/__tests__/statePublisher.test.ts backend-node/src/__tests__/actorValidation.test.ts backend-node/src/__tests__/actionHandler.test.ts
git add shared/types/index.ts backend-node/src/socket backend-node/src/__tests__/actionEnricher.test.ts backend-node/src/__tests__/statePublisher.test.ts backend-node/src/__tests__/actorValidation.test.ts backend-node/src/__tests__/actionHandler.test.ts
git commit -m "feat(room): overwrite every actor, refuse guests, keep ballots secret

ACTOR_FIELDS says who acts for every action type, and the enricher sets
those fields from the socket: the speaker who yields, the member answering
a proxy request, the voter, the mover, and the rest. Guests can't be
nominated, hold or grant proxies, or take the chair; a display can't act.
Every state sent to clients goes through publicState, which leaves out who
voted which way on a secret ballot. The quorum warning counts attendance
with attendanceSummary."
```

---

### Task 5: The live meeting is the scheduled meeting

`JOIN_MEETING` no longer creates meetings: a code without a packet is refused with `MEETING_NOT_FOUND` ("No meeting with that code"). The first join creates the live state from the packet (`stateFromPacket`: code, organization, title, date, the quorum from the organization's settings, and the agenda in position order, each item linked by `packetItemId`). Each join derives the person's meeting role from the organization and the packet (`deriveMeetingRole`), reads their name fresh from the database, refuses a user without a name ("Set your name first", `NAME_REQUIRED`), and brings every member's name and role in the state into line with the organization (`REFRESH_MEMBERS`), so a restart, a role changed in the organization, or a presiding officer changed on the schedule all take effect at the next join. `ADMIN_EMAILS` and the in-memory participant roles are gone. A display joins with `{ meetingCode, display: true }`: it needs the viewer role or above, gets the state, and is not a member.

`SET_MEMBER_ROLE` can only hand over the chair (`newRole: 'chair'`, by the chair or an admin); the wire type keeps `'member' | 'chair' | 'admin'` so existing clients compile, and the server refuses the other two. The new presiding officer is saved on the packet, and the previous chair's role goes back to what the organization gives them (admin for a secretary). `START_MEETING` sets the packet's `startedAt` the first time, and `END_MEETING` sets `endedAt`.

The meeting storage keeps its API free of Prisma: `getOrCreateMeeting(code, initial)` takes the state to create, and the join handler builds it. A stored state from before these fields gets their initial values when read (`withDefaults`). The legacy `meeting_participants` DDL stays in `SCHEMA_SQL` with a comment: nothing reads or writes it, and M5 drops it with the other legacy tables.

**Files:**

- Create: `backend-node/src/socket/meetingPacket.ts`, `backend-node/src/socket/meetingRoles.ts`, `backend-node/src/__integration__/liveSockets.ts`
- Modify: `shared/types/socket.ts`, `backend-node/src/db/meetingStorage.ts`, `backend-node/src/socket/joinHandler.ts` (replaced), `backend-node/src/socket/roleChangeHandler.ts` (replaced), `backend-node/src/socket/actionHandler.ts`, `backend-node/src/socket/disconnectHandler.ts`, `backend-node/src/socket/socketAuth.ts`, `backend-node/src/__integration__/db.ts`
- Test: `backend-node/src/__tests__/meetingRoles.test.ts` (new), `backend-node/src/__tests__/joinHandler.test.ts` (replaced), `backend-node/src/__tests__/socketAuth.test.ts`, `backend-node/src/__integration__/liveJoin.test.ts` (new)

- [ ] **Step 1: The error code for a user without a name**

In `shared/types/socket.ts`, add `| 'NAME_REQUIRED'` after `| 'MEMBER_CONNECTED'`. Run `npm run build:shared` and expect no errors.

- [ ] **Step 2: Write the failing unit tests**

Create `backend-node/src/__tests__/meetingRoles.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { OrgRole } from '../generated/prisma/client.js';

// A stubbed roster: user 1 is an owner, 2 a secretary, 3 a member (renamed since), 4 a viewer
const roster = new Map<number, { role: OrgRole; name: string | null; email: string }>([
  [1, { role: 'owner', name: 'Olive', email: 'olive@example.org' }],
  [2, { role: 'secretary', name: 'Pat', email: 'pat@example.org' }],
  [3, { role: 'member', name: 'Dana Smith', email: 'dana@example.org' }],
  [4, { role: 'viewer', name: 'Vic', email: 'vic@example.org' }],
]);
vi.mock('../socket/meetingPacket.js', () => ({
  findOrgPeople: async (_org: string, ids: number[]) =>
    new Map([...roster].filter(([id]) => ids.includes(id))),
  findMeetingPacket: async () => null,
}));

const { deriveMeetingRole, roleChanges } = await import('../socket/meetingRoles.js');

describe('deriveMeetingRole', () => {
  it.each([
    ['owner', 'admin'],
    ['admin', 'admin'],
    ['secretary', 'admin'],
    ['member', 'member'],
    ['viewer', 'guest'],
    [null, 'guest'],
  ] as const)('gives an organization %s the meeting role %s', (orgRole, meetingRole) => {
    expect(deriveMeetingRole(null, orgRole, 7)).toBe(meetingRole);
  });

  it("makes the packet's presiding officer the chair, whatever their organization role", () => {
    for (const orgRole of ['member', 'secretary', 'owner'] as const) {
      expect(deriveMeetingRole(7, orgRole, 7)).toBe('chair');
    }
    // Someone else presides
    expect(deriveMeetingRole(8, 'owner', 7)).toBe('admin');
  });

  it("doesn't let a presiding officer who is no longer a voting member chair", () => {
    expect(deriveMeetingRole(7, 'viewer', 7)).toBe('guest');
    expect(deriveMeetingRole(7, null, 7)).toBe('guest');
  });
});

describe('roleChanges', () => {
  const member = (id: number, name: string, role: Member['role']): Member => ({
    id,
    name,
    role,
    present: true,
  });

  it('lists the members whose name or role the organization now has otherwise', async () => {
    const changes = await roleChanges({ organizationId: 'org', chairUserId: 2 }, [
      member(1, 'Olive', 'admin'), // unchanged
      member(2, 'Pat', 'admin'), // now presides
      member(3, 'Dana', 'chair'), // renamed, and no longer presides
      member(4, 'Vic', 'member'), // a viewer is a guest
      member(9, 'Walk-in', 'guest'), // not in the organization: unchanged
    ]);
    expect(changes).toEqual([
      { id: 2, name: 'Pat', role: 'chair' },
      { id: 3, name: 'Dana Smith', role: 'member' },
      { id: 4, name: 'Vic', role: 'guest' },
    ]);
  });
});
```

Replace `backend-node/src/__tests__/joinHandler.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';

const handleDisconnect = vi.hoisted(() =>
  vi.fn(async (socket: { data: Record<string, unknown> }) => {
    socket.data.meetingCode = null;
  }),
);
vi.mock('../socket/disconnectHandler.js', () => ({ handleDisconnect }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({
    getMeeting: async () => null,
    getOrCreateMeeting: async () => ({ code: 'NEW1', state: initialState, stateVersion: 1 }),
  }),
}));
vi.mock('../socket/meetingPacket.js', () => ({
  findMeetingPacket: async (code: string) =>
    code === 'NEW1'
      ? {
          robbieCode: 'NEW1',
          organizationId: 'org',
          title: null,
          scheduledFor: null,
          chairUserId: null,
          organization: { name: 'Org', eligibleVoters: null, quorumPercent: null, quorumCount: 3 },
          agendaItems: [],
        }
      : null,
  findPerson: async () => ({ name: 'Member', email: 'm@x.org', orgRole: 'member' }),
  countRosterVoters: async () => 1,
  stateFromPacket: () => initialState,
}));
vi.mock('../socket/meetingRoles.js', () => ({
  deriveMeetingRole: () => 'member',
  roleChanges: async () => [],
  updateSocketRoles: async () => {},
}));
vi.mock('../socket/stateManager.js', () => ({
  applyAction: async () => ({ success: true, state: initialState, stateVersion: 2 }),
}));
vi.mock('../socket/presenceReconciler.js', () => ({
  markDisconnectedMembersAbsent: async () => null,
}));

const { handleJoinMeeting } = await import('../socket/joinHandler.js');

function fakeSocket(id: string, meetingCode: string | null, userId: number) {
  const emit = vi.fn();
  return {
    id,
    data: { meetingCode, userId, name: 'Member', email: 'm@x.org', role: 'member', sessionId: 's' },
    handshake: { headers: {} },
    join: vi.fn(),
    to: () => ({ emit }),
  };
}
const io = { to: () => ({ emit: vi.fn() }) };

describe('handleJoinMeeting', () => {
  it('leaves the meeting a socket is already in before joining another', async () => {
    const socket = fakeSocket('socket-1', 'OLD1', 7);
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'NEW1' }, callback);

    // Otherwise it kept receiving the old meeting's updates and stayed present there
    expect(handleDisconnect).toHaveBeenCalledOnce();
    expect(socket.join).toHaveBeenCalledWith('meeting:NEW1');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a malformed meeting code without leaving or joining anything', async () => {
    handleDisconnect.mockClear();
    const socket = fakeSocket('socket-2', 'OLD1', 8);
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'bad code!' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(handleDisconnect).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('refuses a code without a scheduled meeting', async () => {
    const socket = fakeSocket('socket-3', null, 9);
    const callback = vi.fn();

    await handleJoinMeeting(socket as never, io as never, { meetingCode: 'NOPE01' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'No meeting with that code',
      errorCode: 'MEETING_NOT_FOUND',
    });
    expect(socket.join).not.toHaveBeenCalled();
  });
});
```

In `backend-node/src/__tests__/socketAuth.test.ts`, add before `it('accepts a mobile token from the handshake', async () => {`:

<!-- prettier-ignore -->
```ts
  it("keeps no name for a user who hasn't set one, rather than the email", async () => {
    const socket = fakeSocket({ cookie: 'session=abc123' });
    await run(
      socket,
      vi.fn(async () => ({ ...session, user: { ...session.user, name: null } })),
    );
    expect(socket.data.name).toBe('');
  });

```

- [ ] **Step 3: Write the failing integration test, with fake sockets for the real handlers**

In `backend-node/src/__integration__/db.ts`, add `import { pool } from '../db/client.js';` before the Prisma import, and at the end of the file:

```ts
/**
 * Empty the live meetings table, which isn't Prisma's (see meetingStorage). The storage must be
 * initialized (initializeStorage) first, which creates the table.
 */
export async function resetLiveMeetings(): Promise<void> {
  await pool.query('DELETE FROM meetings');
}
```

Create `backend-node/src/__integration__/liveSockets.ts`:

```ts
import { vi } from 'vitest';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type {
  ActionResponse,
  JoinMeetingResponse,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { handleDispatchAction } from '../socket/actionHandler.js';
import { handleJoinMeeting } from '../socket/joinHandler.js';
import { actionRateLimiter, joinRateLimiter } from '../socket/rateLimiter.js';
import { roomManager } from '../socket/roomManager.js';

/** A stand-in for a connected socket.io socket, as the socket handlers use one */
export interface FakeSocket {
  id: string;
  data: SocketData;
  rooms: Set<string>;
  join(room: string): void;
  leave(room: string): void;
  to(room: string): { emit: (event: string, payload: unknown) => void };
  emit: (event: string, payload: unknown) => void;
}

/** What the server sent to a room */
export interface Broadcast {
  room: string;
  event: string;
  payload: unknown;
}

/**
 * Signed-in sockets and a server for the socket handlers, run against the real database and
 * meeting storage without a network
 */
export function liveSockets() {
  const sockets: FakeSocket[] = [];
  const broadcasts: Broadcast[] = [];
  let next = 0;

  const toRoom = (room: string) => ({
    emit: (event: string, payload: unknown) => broadcasts.push({ room, event, payload }),
  });
  const io = {
    to: toRoom,
    in: (room: string) => ({
      fetchSockets: async () => sockets.filter((s) => s.rooms.has(room)),
    }),
  };

  /** A socket signed in as this user (see socketAuth) */
  function connect(user: { id: number; email: string }): FakeSocket {
    const socket: FakeSocket = {
      id: `socket-${++next}`,
      data: {
        userId: user.id,
        email: user.email,
        name: '',
        sessionId: `session-${next}`,
        meetingCode: null,
        role: 'guest',
      },
      rooms: new Set(),
      join(room) {
        this.rooms.add(room);
      },
      leave(room) {
        this.rooms.delete(room);
      },
      to: toRoom,
      emit: vi.fn(),
    };
    sockets.push(socket);
    return socket;
  }

  async function join(
    socket: FakeSocket,
    meetingCode: string,
    display?: boolean,
  ): Promise<JoinMeetingResponse> {
    joinRateLimiter.remove(socket.data.userId);
    const callback = vi.fn();
    await handleJoinMeeting(socket as never, io as never, { meetingCode, display }, callback);
    return callback.mock.calls[0][0];
  }

  async function dispatch(socket: FakeSocket, action: object): Promise<ActionResponse> {
    actionRateLimiter.remove(socket.data.userId);
    const callback = vi.fn();
    await handleDispatchAction(
      socket as never,
      io as never,
      { action: action as MeetingAction, clientSequence: 1 },
      callback,
    );
    return callback.mock.calls[0][0];
  }

  /** Forget the sockets this made, so the next test starts with nobody connected */
  function disconnectAll(): void {
    for (const socket of sockets) {
      if (socket.data.meetingCode) roomManager.removeMember(socket.data.meetingCode, socket.id);
    }
    sockets.length = 0;
    broadcasts.length = 0;
  }

  return { io, sockets, broadcasts, connect, join, dispatch, disconnectAll };
}
```

Create `backend-node/src/__integration__/liveJoin.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { pool } from '../db/client.js';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { signIn } from './helpers.js';
import { liveSockets } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

// The live meetings table and its storage, as the server starts them
beforeAll(initializeStorage);

describe('joining a live meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  it('is refused for a code without a scheduled meeting', async () => {
    const res = await live.join(live.connect(f.users.member), 'NOPE01');
    expect(res).toEqual({
      success: false,
      error: 'No meeting with that code',
      errorCode: 'MEETING_NOT_FOUND',
    });
    expect(await getStorage().getMeeting('NOPE01')).toBeNull();
  });

  it('creates the live meeting from its packet', async () => {
    await prisma.organization.update({
      where: { id: f.orgA.id },
      data: { quorumPercent: 50, quorumCount: null },
    });
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: new Date('2026-10-20T19:00:00Z') },
    });

    const res = await live.join(live.connect(f.users.member), f.packet.code);
    expect(res.success).toBe(true);
    expect(res.state).toMatchObject({
      meetingCode: 'ORGA01',
      organizationId: f.orgA.id,
      title: 'October meeting',
      scheduledFor: '2026-10-20T19:00:00.000Z',
      // Half of the 4 members with the member role or above
      quorum: 2,
      headcount: 0,
      agenda: [
        { id: 1, title: 'Reports', status: 'pending', packetItemId: f.item },
        { id: 2, title: 'New business', status: 'pending', packetItemId: f.item2 },
      ],
    });
  });

  it('takes a quorum count from the organization', async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { quorumCount: 29 } });
    const res = await live.join(live.connect(f.users.member), f.packet.code);
    expect(res.state?.quorum).toBe(29);
  });

  it('gives each person the role their organization gives them', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    const expected = [
      [f.users.owner, 'admin'],
      [f.users.admin, 'admin'],
      [f.users.secretary, 'admin'],
      [f.users.member, 'chair'],
      [f.users.viewer, 'guest'],
      [f.outsider, 'guest'],
    ] as const;
    for (const [user, role] of expected) {
      const socket = live.connect(user);
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
      expect(socket.data.role, user.email).toBe(role);
    }
    const state = await stateOf(f.packet.code);
    expect(state.members.map((m) => [m.name, m.role, m.presentBy])).toEqual([
      ['A owner', 'admin', 'device'],
      ['A admin', 'admin', 'device'],
      ['A secretary', 'admin', 'device'],
      ['A member', 'chair', 'device'],
      ['A viewer', 'guest', 'device'],
      ['Outsider', 'guest', 'device'],
    ]);
  });

  it('refuses a user who has not set a name', async () => {
    const nameless = await signIn('nameless@example.org');
    await prisma.organizationMember.create({
      data: { organizationId: f.orgA.id, userId: nameless.id, role: 'member' },
    });
    const res = await live.join(live.connect(nameless), f.packet.code);
    expect(res).toEqual({
      success: false,
      error: 'Set your name first',
      errorCode: 'NAME_REQUIRED',
    });
  });

  it("refreshes a returning member's name and role, and the chair the state still shows", async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);

    // The schedule changes the presiding officer, and the member renames themselves
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    await prisma.user.update({ where: { id: f.users.member.id }, data: { name: 'Dana' } });
    await live.join(member, f.packet.code);

    const state = await stateOf(f.packet.code);
    expect(state.members.map((m) => [m.id, m.name, m.role])).toEqual([
      [f.users.secretary.id, 'A secretary', 'admin'],
      [f.users.member.id, 'Dana', 'chair'],
    ]);
    expect(member.data.role).toBe('chair');
    expect(secretary.data.role).toBe('admin');
  });

  it('opens a display for members of the organization, without adding it to the meeting', async () => {
    const display = live.connect(f.users.viewer);
    const res = await live.join(display, f.packet.code, true);
    expect(res.success).toBe(true);
    expect(res.state?.meetingCode).toBe('ORGA01');
    expect(display.data).toMatchObject({ display: true, meetingCode: 'ORGA01' });
    expect(display.rooms.has('meeting:ORGA01')).toBe(true);
    expect((await stateOf(f.packet.code)).members).toEqual([]);

    const outsider = await live.join(live.connect(f.outsider), f.packet.code, true);
    expect(outsider).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
  });
});

describe('the chair in a live meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
  });
  afterEach(live.disconnectAll);

  it('is handed over in the meeting and recorded on the packet', async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);

    const res = await live.dispatch(secretary, {
      type: 'SET_MEMBER_ROLE',
      targetMemberId: f.users.member.id,
      newRole: 'chair',
      timestamp: '',
    });
    expect(res.success).toBe(true);

    const packet = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(packet.chairUserId).toBe(f.users.member.id);
    // The previous chair, a secretary, goes back to admin, not member
    const state = await stateOf(f.packet.code);
    expect(state.members.map((m) => [m.id, m.role])).toEqual([
      [f.users.secretary.id, 'admin'],
      [f.users.member.id, 'chair'],
    ]);
    expect(secretary.data.role).toBe('admin');
    expect(member.data.role).toBe('chair');
    expect(res.stateVersion).toBe((await getStorage().getMeeting(f.packet.code))!.stateVersion);
  });

  it('is the only role handed out in the meeting', async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);
    for (const newRole of ['admin', 'member']) {
      const res = await live.dispatch(secretary, {
        type: 'SET_MEMBER_ROLE',
        targetMemberId: f.users.member.id,
        newRole,
        timestamp: '',
      });
      expect(res).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
    }
  });

  it('calls the meeting to order and adjourns it, and the schedule records when', async () => {
    const secretary = live.connect(f.users.secretary);
    await live.join(secretary, f.packet.code);
    expect((await live.dispatch(secretary, { type: 'START_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    const started = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(started.startedAt).toBeInstanceOf(Date);
    expect(started.endedAt).toBeNull();

    expect((await live.dispatch(secretary, { type: 'END_MEETING', timestamp: '' })).success).toBe(
      true,
    );
    const ended = await prisma.meetingPacket.findUniqueOrThrow({ where: { id: f.packet.id } });
    expect(ended.startedAt).toEqual(started.startedAt);
    expect(ended.endedAt).toBeInstanceOf(Date);
  });
});

describe('meeting storage', () => {
  beforeEach(resetLiveMeetings);

  it('fills in the fields a stored meeting was saved without', async () => {
    const { headcount: _h, headcountNames: _n, floorVotes: _f, ...old } = initialState;
    await pool.query(
      `INSERT INTO meetings (code, current_state, state_version) VALUES ('OLD001', $1, 3)`,
      [JSON.stringify({ ...old, meetingCode: 'OLD001' })],
    );
    const meeting = await getStorage().getMeeting('OLD001');
    expect(meeting).toMatchObject({ stateVersion: 3 });
    expect(meeting!.state).toMatchObject({
      meetingCode: 'OLD001',
      headcount: 0,
      headcountNames: [],
      floorVotes: { yea: 0, nay: 0, abstain: 0 },
    });
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `cd backend-node && npx vitest run src/__tests__/meetingRoles.test.ts src/__tests__/joinHandler.test.ts src/__tests__/socketAuth.test.ts`
Expected: FAIL. `../socket/meetingRoles.js` doesn't exist; the old join handler doesn't refuse `NOPE01` (it fails on the storage mock, which no longer offers participant roles); a nameless user's socket is named by email.

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveJoin.test.ts`
Expected: FAIL. A code without a packet gets a meeting, the state has no title, organization or agenda from the packet, everyone joins as `member`, and the chair handed over in the meeting isn't recorded on the packet.

- [ ] **Step 5: The meeting storage**

In `backend-node/src/db/meetingStorage.ts`, replace the comment line `-- Participants (role per meeting)` in `SCHEMA_SQL` with:

```sql
-- Participants (role per meeting). Unused: meeting roles come from the organization at every
-- join. Dropped with the other legacy tables in M5.
```

After the `MeetingRecord` interface, add:

```ts
/**
 * A stored state with every field the current MeetingState has: a meeting saved before a
 * field existed gets its initial value
 */
export function withDefaults(state: MeetingState): MeetingState {
  return { ...initialState, ...state };
}
```

In `StorageProvider`, replace `getOrCreateMeeting(code: string): Promise<MeetingRecord>;` with:

```ts
  /** The meeting with this code, created with the `initial` state if there is none */
  getOrCreateMeeting(code: string, initial: MeetingState): Promise<MeetingRecord>;
```

and delete the `getParticipantRole(...)` and `setParticipantRole(...)` declarations. In both `InMemoryStorage` and `PostgresStorage`:

1. Delete the `participantRoles` field (and, in `PostgresStorage`, its comment line "Use in-memory for participant roles since users table isn't populated yet"), the `this.participantRoles.clear();` line in `InMemoryStorage.shutdown`, and the `getParticipantRole` and `setParticipantRole` methods.
2. Change `async getOrCreateMeeting(code: string): Promise<MeetingRecord> {` to `async getOrCreateMeeting(code: string, initial: MeetingState): Promise<MeetingRecord> {`, and in it change `{ ...initialState, meetingCode: code }` to `{ ...initial, meetingCode: code }`.

In `PostgresStorage.getOrCreateMeeting` and `PostgresStorage.getMeeting`, change `state: result.rows[0].current_state,` to `state: withDefaults(result.rows[0].current_state),`.

- [ ] **Step 6: Create `backend-node/src/socket/meetingPacket.ts`**

```ts
/**
 * A live meeting's packet: the scheduled meeting it is. The packet gives the live state its
 * organization, title, date, presiding officer, quorum and agenda.
 */

import type { AgendaItem, MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { quorumFromSettings } from '@robbie-bylawyer/shared/utils';
import type { OrgRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';

/** What a live meeting needs from its packet and organization */
export interface MeetingPacketInfo {
  robbieCode: string;
  organizationId: string;
  title: string | null;
  scheduledFor: Date | null;
  chairUserId: number | null;
  organization: {
    name: string;
    eligibleVoters: number | null;
    quorumPercent: number | null;
    quorumCount: number | null;
  };
  /** In position order */
  agendaItems: Array<{ id: string; title: string }>;
}

/** A person as a meeting sees them: their name, and their role in the organization if any */
export interface MeetingPerson {
  name: string | null;
  email: string;
  orgRole: OrgRole | null;
}

/** The packet with this meeting code, or null: a code without a packet is no meeting */
export function findMeetingPacket(meetingCode: string): Promise<MeetingPacketInfo | null> {
  return prisma.meetingPacket.findUnique({
    where: { robbieCode: meetingCode },
    select: {
      robbieCode: true,
      organizationId: true,
      title: true,
      scheduledFor: true,
      chairUserId: true,
      organization: {
        select: { name: true, eligibleVoters: true, quorumPercent: true, quorumCount: true },
      },
      agendaItems: { select: { id: true, title: true }, orderBy: { position: 'asc' } },
    },
  });
}

/** A signed-in user, with their role in the organization (null when not a member) */
export async function findPerson(
  organizationId: string,
  userId: number,
): Promise<MeetingPerson | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      memberships: { where: { organizationId }, select: { role: true } },
    },
  });
  if (!user) return null;
  return { name: user.name, email: user.email, orgRole: user.memberships[0]?.role ?? null };
}

/** The organization roles and names of these users; users who aren't members are left out */
export async function findOrgPeople(
  organizationId: string,
  userIds: number[],
): Promise<Map<number, { role: OrgRole; name: string | null; email: string }>> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
  });
  return new Map(rows.map((row) => [row.userId, { role: row.role, ...row.user }]));
}

/** The organization's members with the member role or above: the default quorum base */
export function countRosterVoters(organizationId: string): Promise<number> {
  return prisma.organizationMember.count({
    where: { organizationId, role: { in: ['member', 'secretary', 'admin', 'owner'] } },
  });
}

/** The live agenda from the packet's agenda items, in order, each linked to its item */
export function agendaFromPacket(items: MeetingPacketInfo['agendaItems']): AgendaItem[] {
  return items.map((item, index) => ({
    id: index + 1,
    title: item.title,
    status: 'pending' as const,
    packetItemId: item.id,
  }));
}

/** A new live meeting's state, made from its packet */
export function stateFromPacket(packet: MeetingPacketInfo, rosterVoters: number): MeetingState {
  return {
    ...initialState,
    meetingCode: packet.robbieCode,
    organizationId: packet.organizationId,
    title: packet.title ?? '',
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    quorum: quorumFromSettings(packet.organization, rosterVoters),
    agenda: agendaFromPacket(packet.agendaItems),
  };
}

/** Record on the packet the presiding officer named in the meeting, so it outlasts a restart */
export async function savePresidingOfficer(meetingCode: string, userId: number): Promise<void> {
  await prisma.meetingPacket.update({
    where: { robbieCode: meetingCode },
    data: { chairUserId: userId },
  });
}

/**
 * Record on the packet when the meeting was called to order (the first time) and adjourned,
 * so the schedule shows which meetings happened. Best effort: the meeting goes on regardless.
 */
export async function recordMeetingTimes(
  meetingCode: string,
  action: MeetingAction,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (action.type === 'START_MEETING') {
      await prisma.meetingPacket.updateMany({
        where: { robbieCode: meetingCode, startedAt: null },
        data: { startedAt: now },
      });
    } else if (action.type === 'END_MEETING') {
      await prisma.meetingPacket.updateMany({
        where: { robbieCode: meetingCode },
        data: { endedAt: now },
      });
    }
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to record meeting times');
  }
}
```

- [ ] **Step 7: Create `backend-node/src/socket/meetingRoles.ts`**

```ts
import type { Server } from 'socket.io';
import type { MeetingRole, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import type { OrgRole } from '../generated/prisma/client.js';
import { getStorage } from '../db/meetingStorage.js';
import { atLeast } from '../orgs/roles.js';
import { findMeetingPacket, findOrgPeople } from './meetingPacket.js';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** A member's name and meeting role as the organization has them now */
export interface RoleChange {
  id: number;
  name: string;
  role: MeetingRole;
}

/**
 * A person's role in a live meeting, from the organization: the packet's presiding officer
 * chairs, secretaries and above are admins, members are members, and everyone else (viewers,
 * people outside the organization) is a guest. The presiding officer must still be a member.
 */
export function deriveMeetingRole(
  chairUserId: number | null,
  orgRole: OrgRole | null,
  userId: number,
): MeetingRole {
  if (!orgRole || !atLeast(orgRole, 'member')) return 'guest';
  if (chairUserId === userId) return 'chair';
  return atLeast(orgRole, 'secretary') ? 'admin' : 'member';
}

/** The members whose name or role differs from what the organization has now */
export async function roleChanges(
  packet: { organizationId: string; chairUserId: number | null },
  members: readonly Member[],
): Promise<RoleChange[]> {
  if (members.length === 0) return [];
  const people = await findOrgPeople(
    packet.organizationId,
    members.map((m) => m.id),
  );
  return members.flatMap((m) => {
    const person = people.get(m.id);
    const role = deriveMeetingRole(packet.chairUserId, person?.role ?? null, m.id);
    const name = person?.name ?? m.name;
    return role !== m.role || name !== m.name ? [{ id: m.id, name, role }] : [];
  });
}

/** Give connected sockets their members' new roles, so permissions follow at once */
export async function updateSocketRoles(
  io: TypedServer,
  meetingCode: string,
  changes: ReadonlyArray<{ id: number; role: MeetingRole }>,
): Promise<void> {
  if (changes.length === 0) return;
  const roles = new Map(changes.map((c) => [c.id, c.role]));
  for (const [id, role] of roles) roomManager.updateMemberRole(meetingCode, id, role);
  for (const socket of await io.in(`meeting:${meetingCode}`).fetchSockets()) {
    const role = roles.get(socket.data.userId);
    if (role && !socket.data.display) socket.data.role = role;
  }
}

/**
 * Bring every member's name and role in a live meeting into line with the organization and
 * the packet (after the presiding officer changes, say).
 * @returns the state after the change, or null if nothing changed
 */
export async function syncMeetingRoles(
  io: TypedServer,
  meetingCode: string,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  const packet = await findMeetingPacket(meetingCode);
  const meeting = packet ? await getStorage().getMeeting(meetingCode) : null;
  if (!packet || !meeting) return null;

  const changes = await roleChanges(packet, meeting.state.members);
  if (changes.length === 0) return null;
  const result = await applyAction(meetingCode, {
    type: 'REFRESH_MEMBERS',
    members: changes,
    timestamp: new Date().toISOString(),
  });
  if (!result.success) return null;
  await updateSocketRoles(io, meetingCode, changes);
  return { state: result.state, stateVersion: result.stateVersion };
}
```

- [ ] **Step 8: Replace `backend-node/src/socket/joinHandler.ts`**

```ts
import type { Server, Socket } from 'socket.io';
import type { Member } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  JoinMeetingResponse,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { getStorage, type MeetingRecord } from '../db/meetingStorage.js';
import { joinRateLimiter } from './rateLimiter.js';
import { applyAction, type ApplyActionResult } from './stateManager.js';
import { markDisconnectedMembersAbsent } from './presenceReconciler.js';
import { handleDisconnect } from './disconnectHandler.js';
import { emitState, publicState } from './statePublisher.js';
import {
  countRosterVoters,
  findMeetingPacket,
  findPerson,
  stateFromPacket,
  type MeetingPacketInfo,
} from './meetingPacket.js';
import { deriveMeetingRole, roleChanges, updateSocketRoles } from './meetingRoles.js';
import { logger } from '../middleware/logger.js';
import { meetingCode as meetingCodeSchema } from '../schemas/common.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** The answers when a join is refused */
export const NO_MEETING = 'No meeting with that code';
export const NAME_FIRST = 'Set your name first';
export const DISPLAY_FOR_MEMBERS = "Only the organization's members can open the display";

/** The live meeting for a packet, created from it when the first person arrives */
async function openMeeting(packet: MeetingPacketInfo): Promise<MeetingRecord> {
  const storage = getStorage();
  const existing = await storage.getMeeting(packet.robbieCode);
  if (existing) return existing;
  const rosterVoters = await countRosterVoters(packet.organizationId);
  return storage.getOrCreateMeeting(packet.robbieCode, stateFromPacket(packet, rosterVoters));
}

/**
 * Handle JOIN_MEETING socket event. A live meeting is a scheduled meeting: a code without a
 * packet is refused, and each person's role comes from the packet's organization.
 */
export async function handleJoinMeeting(
  socket: TypedSocket,
  io: TypedServer,
  data: JoinMeetingPayload,
  callback: (response: JoinMeetingResponse) => void,
): Promise<void> {
  try {
    // The socket was authenticated at connection (socketAuth)
    const userId = socket.data.userId;

    // Rate limit join attempts per user
    if (!joinRateLimiter.consume(userId)) {
      const retryAfter = joinRateLimiter.getRetryAfter(userId);
      callback({
        success: false,
        error: `Too many join attempts. Please wait ${Math.ceil(retryAfter / 1000)} seconds.`,
      });
      return;
    }

    const parsedCode = meetingCodeSchema.safeParse(data.meetingCode);
    if (!parsedCode.success) {
      callback({ success: false, error: parsedCode.error.issues[0].message });
      return;
    }
    const meetingCode = parsedCode.data;

    // A socket already in another meeting leaves it first, as on disconnect; otherwise it
    // kept receiving that meeting's updates and its member stayed present there
    if (socket.data.meetingCode && socket.data.meetingCode !== meetingCode) {
      await handleDisconnect(socket, io);
    }

    const packet = await findMeetingPacket(meetingCode);
    const person = packet ? await findPerson(packet.organizationId, userId) : null;
    if (!packet || !person) {
      callback({ success: false, error: NO_MEETING, errorCode: 'MEETING_NOT_FOUND' });
      return;
    }
    const roomName = `meeting:${meetingCode}`;

    // A display (a TV or projector) receives the meeting without becoming a member of it
    if (data.display === true) {
      if (!person.orgRole) {
        callback({ success: false, error: DISPLAY_FOR_MEMBERS, errorCode: 'PERMISSION_DENIED' });
        return;
      }
      const meeting = await openMeeting(packet);
      socket.data.meetingCode = meetingCode;
      socket.data.role = 'guest';
      socket.data.display = true;
      socket.join(roomName);
      callback({
        success: true,
        state: publicState(meeting.state),
        stateVersion: meeting.stateVersion,
        members: roomManager.getMembers(meetingCode),
      });
      return;
    }

    // Members are known by the name they signed in with
    const name = person.name?.trim();
    if (!name) {
      callback({ success: false, error: NAME_FIRST, errorCode: 'NAME_REQUIRED' });
      return;
    }
    const role = deriveMeetingRole(packet.chairUserId, person.orgRole, userId);
    const meeting = await openMeeting(packet);

    // Store socket data
    socket.data.name = name;
    socket.data.meetingCode = meetingCode;
    socket.data.role = role;
    socket.data.display = false;

    // Join the room
    socket.join(roomName);
    const memberData: Member = { id: userId, name, role, present: true, presentBy: 'device' };
    roomManager.addMember(meetingCode, socket.id, memberData);

    const timestamp = new Date().toISOString();
    let currentState = meeting.state;
    let currentVersion = meeting.stateVersion;
    const track = (result: ApplyActionResult) => {
      if (result.success) {
        currentState = result.state;
        currentVersion = result.stateVersion;
      }
    };

    // Add the member, or mark them present again
    const existing = currentState.members.find((m) => m.id === userId);
    track(
      await applyAction(
        meetingCode,
        existing
          ? { type: 'SET_MEMBER_PRESENCE', memberId: userId, present: true, timestamp }
          : { type: 'ADD_MEMBER', member: memberData, timestamp },
      ),
    );

    // Names and roles as the organization has them now: this member's, and those of others
    // that changed since they joined (a new presiding officer, a changed role, a restart)
    const others = await roleChanges(
      packet,
      currentState.members.filter((m) => m.id !== userId),
    );
    const self = currentState.members.find((m) => m.id === userId);
    const selfChanged = !!self && (self.name !== name || self.role !== role);
    const changes = selfChanged ? [{ id: userId, name, role }, ...others] : others;
    if (changes.length > 0) {
      track(
        await applyAction(meetingCode, { type: 'REFRESH_MEMBERS', members: changes, timestamp }),
      );
      await updateSocketRoles(io, meetingCode, others);
    }

    // Members still shown as present with no connection (left over from a server restart)
    // are marked absent, so quorum counts only who is here
    const reconciled = await markDisconnectedMembersAbsent(meetingCode, currentState);
    if (reconciled) {
      currentState = reconciled.state;
      currentVersion = reconciled.stateVersion;
    }

    // Notify others of member joined
    socket.to(roomName).emit('MEMBER_JOINED', {
      member: memberData,
      timestamp,
    });

    // Broadcast updated state to all (including the joiner via callback)
    emitState(io, meetingCode, {
      state: currentState,
      stateVersion: currentVersion,
      triggeredBy: { actionType: 'MEMBER_JOINED', userId },
    });

    callback({
      success: true,
      state: publicState(currentState),
      stateVersion: currentVersion,
      members: roomManager.getMembers(meetingCode),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, 'Error joining meeting');
    callback({ success: false, error: `Failed to join meeting: ${errorMessage}` });
  }
}
```

The reconciler call stays as it is until Task 6 defers it by the grace period.

- [ ] **Step 9: Replace `backend-node/src/socket/roleChangeHandler.ts`**

```ts
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  ActionErrorCode,
} from '@robbie-bylawyer/shared/types/socket';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { logger } from '../middleware/logger.js';
import { savePresidingOfficer } from './meetingPacket.js';
import { syncMeetingRoles, updateSocketRoles } from './meetingRoles.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Validate SET_MEMBER_ROLE action before processing. Meeting roles come from the organization,
 * so the only role handed out in a meeting is the chair (by the chair or an admin).
 * Returns null if valid, error message if invalid
 */
export function validateRoleChange(
  action: MeetingAction,
  socketData: SocketData,
): { error: string; errorCode: ActionErrorCode } | null {
  if (action.type !== 'SET_MEMBER_ROLE') {
    return null;
  }

  if (action.newRole !== 'chair') {
    return {
      error: 'Meeting roles come from the organization; only the chair can be handed over here',
      errorCode: 'PERMISSION_DENIED',
    };
  }

  // Chair cannot assign chair to themselves
  if (socketData.role === 'chair' && action.targetMemberId === socketData.userId) {
    return {
      error: 'You are already the chair',
      errorCode: 'INVALID_ACTION',
    };
  }

  return null;
}

/**
 * After the chair is handed over: record the new presiding officer on the packet, so the chair
 * outlasts a restart, give the sockets their new roles, and bring the previous chair's role
 * back to what the organization gives them (admin for a secretary, say).
 * @returns the state after that, or null when the action wasn't a role change or nothing more
 *   changed
 */
export async function handleRoleChangePostAction(
  io: TypedServer,
  meetingCode: string,
  action: MeetingAction,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  if (action.type !== 'SET_MEMBER_ROLE') {
    return null;
  }

  try {
    await savePresidingOfficer(meetingCode, action.targetMemberId);
    await updateSocketRoles(io, meetingCode, [
      { id: action.targetMemberId, role: 'chair' },
      ...(action.previousChairId ? [{ id: action.previousChairId, role: 'member' as const }] : []),
    ]);
    return await syncMeetingRoles(io, meetingCode);
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to record the new chair');
    return null;
  }
}
```

- [ ] **Step 10: Broadcast the state after the role sync, and record the meeting times**

In `backend-node/src/socket/actionHandler.ts`, add after the `stateManager.js` import:

```ts
import { recordMeetingTimes } from './meetingPacket.js';
```

Replace:

<!-- prettier-ignore -->
```ts
    // Post-action: Update storage and sockets for role changes
    await handleRoleChangePostAction(io, meetingCode, enrichedAction);

    // Broadcast new state to all clients in the room, after the role change (so a new chair's
    // socket already has its permissions) and before the bylaw sync (so the vote result isn't
    // held up by database work). Clients ignore a state older than the one they have.
    emitState(io, meetingCode, {
      state: result.state,
      stateVersion: result.stateVersion,
      triggeredBy: {
        actionType: data.action.type,
        userId,
      },
    });

    callback({ success: true, stateVersion: result.stateVersion });
```

with:

<!-- prettier-ignore -->
```ts
    // Post-action: a new chair is recorded on the packet, and sockets and roles follow
    const afterRoleChange = await handleRoleChangePostAction(io, meetingCode, enrichedAction);
    const latest = afterRoleChange ?? { state: result.state, stateVersion: result.stateVersion };

    // Broadcast new state to all clients in the room, after the role change (so a new chair's
    // socket already has its permissions) and before the bylaw sync (so the vote result isn't
    // held up by database work). Clients ignore a state older than the one they have.
    emitState(io, meetingCode, {
      state: latest.state,
      stateVersion: latest.stateVersion,
      triggeredBy: {
        actionType: data.action.type,
        userId,
      },
    });

    callback({ success: true, stateVersion: latest.stateVersion });

    // Post-action: the schedule records when the meeting was called to order and adjourned
    await recordMeetingTimes(meetingCode, enrichedAction);
```

- [ ] **Step 11: A display leaving, and names**

In `backend-node/src/socket/disconnectHandler.ts`, add at the start of `handleDisconnect`:

<!-- prettier-ignore -->
```ts
  // A display was never a member: it only leaves the room
  if (socket.data.display) {
    if (socket.data.meetingCode) socket.leave(`meeting:${socket.data.meetingCode}`);
    socket.data.meetingCode = null;
    socket.data.display = false;
    return;
  }

```

and change `socket.data.role = null as unknown as 'member' | 'chair' | 'admin';` to `socket.data.role = null as unknown as SocketData['role'];`.

In `backend-node/src/socket/socketAuth.ts`, replace:

<!-- prettier-ignore -->
```ts
      // Clients ask for a name after the first sign-in; until then show the email
      socket.data.name = session.user.name ?? session.user.email;
```

with:

<!-- prettier-ignore -->
```ts
      // Clients ask for a name after the first sign-in; a meeting refuses a user without one
      // (see the join handler), so the email never stands in for it
      socket.data.name = session.user.name ?? '';
```

- [ ] **Step 12: Run them to see them pass**

Run: `cd backend-node && npx tsc --noEmit -p . && npx vitest run src/__tests__/meetingRoles.test.ts src/__tests__/joinHandler.test.ts src/__tests__/socketAuth.test.ts && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveJoin.test.ts`
Expected: type-check clean; 18 passed (9 in `meetingRoles.test.ts`, 3 in `joinHandler.test.ts`, 6 in `socketAuth.test.ts`), then 11 passed in `liveJoin.test.ts`.

- [ ] **Step 13: Run everything**

Run: `npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w backend-node && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-checks clean; all pass.

- [ ] **Step 14: Commit**

```bash
npx prettier --write shared/types/socket.ts backend-node/src/db/meetingStorage.ts backend-node/src/socket backend-node/src/__tests__/meetingRoles.test.ts backend-node/src/__tests__/joinHandler.test.ts backend-node/src/__tests__/socketAuth.test.ts backend-node/src/__integration__/db.ts backend-node/src/__integration__/liveSockets.ts backend-node/src/__integration__/liveJoin.test.ts
git add shared/types/socket.ts backend-node/src/db/meetingStorage.ts backend-node/src/socket backend-node/src/__tests__/meetingRoles.test.ts backend-node/src/__tests__/joinHandler.test.ts backend-node/src/__tests__/socketAuth.test.ts backend-node/src/__integration__/db.ts backend-node/src/__integration__/liveSockets.ts backend-node/src/__integration__/liveJoin.test.ts
git commit -m "feat(room): the live meeting is the scheduled meeting

Joining a code without a packet is refused. The first join creates the
live state from the packet: organization, title, date, the quorum from the
organization's settings, and the agenda. Every join derives meeting roles
from the organization (the presiding officer chairs, secretaries and above
are admins, members are members, everyone else is a guest), refreshes names
and roles in the state, and refuses a user without a name. A display joins
without becoming a member. Only the chair is handed over in the meeting, and
it is saved on the packet, as are the start and end times. ADMIN_EMAILS and
the in-memory participant roles are gone."
```

---

### Task 6: Attendance and presence on the server

`MARK_PRESENT` gets the person from the organization's roster, with the meeting role the organization gives them; a user outside the roster is refused (`NOT_A_MEMBER`, from the validator, since no roster entry was filled in). `MARK_ABSENT` is refused for a member present on a device that is still connected (`MEMBER_CONNECTED`: they are in the room, and leave when their device does); it is allowed once the device is gone, during its grace period too, and always for a member the chair marked present.

A dropped connection starts a 90-second grace period (`PRESENCE_GRACE_MS`, one timer per member in `roomManager`): connecting again within it cancels the timer and changes nothing; after it, the member is marked absent, unless the chair marked them present. Leaving on purpose (`LEAVE_MEETING`, or joining another meeting) marks the member absent at once. A dropped connection leaves `socket.data` alone, because socket.io's connection state recovery (2 minutes, enabled in `index.ts`) brings the socket back with its rooms and `socket.data` and without a new `JOIN_MEETING`; the recovered socket is counted as connected again (which ends its grace period) and, if the grace period ran out meanwhile, its member is present again. Recovered sockets skip `socketAuth` (socket.io's default `skipMiddlewares`); they passed it when they connected, and a socket closed by signing out is closed with `disconnect(true)`, which socket.io doesn't recover.

The disconnect handler and the reconciler only ever clear device presence. After a restart there are no grace timers, so the reconciler runs once the grace period has passed after a join (`scheduleReconcile`, one waiting per meeting) instead of on the join itself.

**Files:**

- Create: `backend-node/src/socket/attendanceActions.ts`
- Modify: `backend-node/src/socket/roomManager.ts`, `backend-node/src/socket/disconnectHandler.ts`, `backend-node/src/socket/presenceReconciler.ts` (all three replaced), `backend-node/src/socket/joinHandler.ts`, `backend-node/src/socket/socketHandler.ts`, `backend-node/src/socket/actionHandler.ts`, `backend-node/src/index.ts`, `backend-node/src/__integration__/liveSockets.ts`
- Test: `backend-node/src/__tests__/roomManager.test.ts`, `backend-node/src/__tests__/recoveredSocket.test.ts` (new), `backend-node/src/__tests__/disconnectHandler.test.ts`, `backend-node/src/__tests__/presenceReconciler.test.ts` (replaced), `backend-node/src/__tests__/joinHandler.test.ts`, `backend-node/src/__integration__/liveAttendance.test.ts` (new)

- [ ] **Step 1: Write the failing unit tests**

Create `backend-node/src/__tests__/roomManager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PRESENCE_GRACE_MS, roomManager } from '../socket/roomManager.js';

const member = { id: 1, name: 'Ann', role: 'member' as const, present: true };

describe('presence grace periods', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    roomManager.cancelGrace('GRACE1', 1);
    roomManager.removeMember('GRACE1', 'socket-1');
    vi.useRealTimers();
  });

  it('run out after PRESENCE_GRACE_MS', () => {
    const onExpire = vi.fn();
    roomManager.startGrace('GRACE1', 1, onExpire);
    expect(roomManager.inGrace('GRACE1', 1)).toBe(true);

    vi.advanceTimersByTime(PRESENCE_GRACE_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(roomManager.inGrace('GRACE1', 1)).toBe(false);
  });

  it('end without effect when the member connects again', () => {
    const onExpire = vi.fn();
    roomManager.startGrace('GRACE1', 1, onExpire);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    roomManager.addMember('GRACE1', 'socket-1', member);

    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(onExpire).not.toHaveBeenCalled();
    expect(roomManager.inGrace('GRACE1', 1)).toBe(false);
  });

  it('are one per member: starting again starts over', () => {
    const first = vi.fn();
    const second = vi.fn();
    roomManager.startGrace('GRACE1', 1, first);
    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    roomManager.startGrace('GRACE1', 1, second);

    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PRESENCE_GRACE_MS / 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
```

Replace `backend-node/src/__tests__/disconnectHandler.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import type { ValidationResult } from '../socket/stateManager.js';

const member: Member = {
  id: 1,
  name: 'Member',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));

// Applies the action's check against the stored state, as the state manager does
const applyAction = vi.hoisted(() =>
  vi.fn(
    async (
      _code: string,
      _action: MeetingAction,
      validator?: (s: MeetingState, a: MeetingAction) => ValidationResult,
    ) => {
      const validation = validator?.(stored.state, _action) ?? { valid: true };
      return validation.valid
        ? { success: true, state: stored.state, stateVersion: 2 }
        : { success: false, error: validation.error };
    },
  ),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

const { PRESENCE_GRACE_MS, roomManager } = await import('../socket/roomManager.js');
const { handleDisconnect } = await import('../socket/disconnectHandler.js');
const { actionRateLimiter, joinRateLimiter } = await import('../socket/rateLimiter.js');

function fakeSocket(id: string, userId = 1) {
  return {
    id,
    data: { meetingCode: 'TEST01', userId, name: 'Member', email: 'm@x', role: 'member' },
    leave: vi.fn(),
  };
}

describe('handleDisconnect', () => {
  const emit = vi.fn();
  const io = { to: () => ({ emit }) };

  beforeEach(() => {
    vi.useFakeTimers();
    applyAction.mockClear();
    emit.mockClear();
    stored.state = { ...initialState, members: [member] };
    roomManager.addMember('TEST01', 'old-socket', member);
  });
  afterEach(() => {
    roomManager.removeMember('TEST01', 'old-socket');
    roomManager.removeMember('TEST01', 'new-socket');
    roomManager.cancelGrace('TEST01', 1);
    vi.useRealTimers();
  });

  describe('when the connection drops', () => {
    it('marks the member absent only once the grace period has passed', async () => {
      const socket = fakeSocket('old-socket');
      await handleDisconnect(socket as never, io as never, 'disconnect');
      expect(applyAction).not.toHaveBeenCalled();
      // Connection state recovery may bring the socket back with its meeting
      expect(socket.data.meetingCode).toBe('TEST01');

      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(applyAction).toHaveBeenCalledWith(
        'TEST01',
        expect.objectContaining({ type: 'SET_MEMBER_PRESENCE', memberId: 1, present: false }),
        expect.any(Function),
      );
      expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
      expect(emit).toHaveBeenCalledWith('MEMBER_LEFT', expect.anything());
    });

    it('changes nothing when the member reconnects within the grace period', async () => {
      await handleDisconnect(fakeSocket('old-socket') as never, io as never, 'disconnect');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS / 3);
      roomManager.addMember('TEST01', 'new-socket', member);

      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(applyAction).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('leaves a member the chair marked present', async () => {
      stored.state = { ...initialState, members: [{ ...member, presentBy: 'chair' }] };
      await handleDisconnect(fakeSocket('old-socket') as never, io as never, 'disconnect');
      await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS);
      expect(applyAction).toHaveBeenCalledOnce();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('when the member leaves', () => {
    it('marks them absent at once, and the socket leaves the meeting', async () => {
      const socket = fakeSocket('old-socket');
      await handleDisconnect(socket as never, io as never, 'leave');
      expect(applyAction).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
      expect(socket.leave).toHaveBeenCalledWith('meeting:TEST01');
      // Leaving a meeting doesn't sign the socket out
      expect(socket.data.userId).toBe(1);
      expect(socket.data.meetingCode).toBeNull();
    });

    it('leaves a member present who reconnects before the write is applied', async () => {
      applyAction.mockImplementationOnce(async (_code, action, validator) => {
        roomManager.addMember('TEST01', 'new-socket', member);
        const validation = validator!(stored.state, action);
        return { success: validation.valid, error: validation.error } as never;
      });
      await handleDisconnect(fakeSocket('old-socket') as never, io as never, 'leave');
      expect(emit).not.toHaveBeenCalled();
    });
  });

  it('does nothing to presence for a display', async () => {
    const socket = {
      ...fakeSocket('display-socket'),
      data: { ...fakeSocket('x').data, display: true },
    };
    await handleDisconnect(socket as never, io as never, 'leave');
    expect(applyAction).not.toHaveBeenCalled();
    expect(socket.leave).toHaveBeenCalledWith('meeting:TEST01');
    expect(socket.data.meetingCode).toBeNull();
  });

  it("doesn't reset the user's join or action allowance when they leave", async () => {
    const userId = 42;
    roomManager.addMember('TEST01', 'spender', { ...member, id: userId });
    while (joinRateLimiter.consume(userId));
    while (actionRateLimiter.consume(userId));

    await handleDisconnect(fakeSocket('spender', userId) as never, io as never, 'leave');

    // Leaving and joining again must not buy a fresh allowance
    expect(joinRateLimiter.getRemaining(userId)).toBe(0);
    expect(actionRateLimiter.getRemaining(userId)).toBe(0);
  });
});
```

Replace `backend-node/src/__tests__/presenceReconciler.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';

type Validator = (state: MeetingState) => { valid: boolean };
const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
const applyAction = vi.hoisted(() =>
  vi.fn(async (_code: string, _action: unknown, validator?: Validator) => ({
    success: validator ? validator(stored.state).valid : true,
    state: stored.state,
    stateVersion: 2,
  })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({ getMeeting: async () => ({ state: stored.state, stateVersion: 1 }) }),
}));

const { PRESENCE_GRACE_MS, roomManager } = await import('../socket/roomManager.js');
const { markDisconnectedMembersAbsent, scheduleReconcile } =
  await import('../socket/presenceReconciler.js');

const member = (id: number, present: boolean, presentBy?: 'device' | 'chair'): Member => ({
  id,
  name: `Member ${id}`,
  role: 'member',
  present,
  ...(presentBy ? { presentBy } : {}),
});

describe('markDisconnectedMembersAbsent', () => {
  beforeEach(() => {
    applyAction.mockClear();
    roomManager.removeMember('RECON1', 'socket-1');
    roomManager.removeMember('RECON1', 'socket-2');
    roomManager.cancelGrace('RECON1', 4);
  });

  it('marks absent the members left present on a device with no connection (after a restart)', async () => {
    roomManager.addMember('RECON1', 'socket-1', member(1, true));
    stored.state = {
      ...initialState,
      members: [
        member(1, true, 'device'),
        member(2, true, 'device'),
        member(3, false),
        member(5, true), // saved before presentBy existed: on a device
      ],
    };

    await markDisconnectedMembersAbsent('RECON1', stored.state);

    expect(
      applyAction.mock.calls.map((call) => (call[1] as { memberId: number }).memberId),
    ).toEqual([2, 5]);
  });

  it('leaves members the chair marked present, and members within their grace period', async () => {
    roomManager.startGrace('RECON1', 4, () => {});
    stored.state = {
      ...initialState,
      members: [member(3, true, 'chair'), member(4, true, 'device')],
    };
    expect(await markDisconnectedMembersAbsent('RECON1', stored.state)).toBeNull();
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('leaves a member alone who reconnects before the write is applied', async () => {
    stored.state = { ...initialState, members: [member(2, true, 'device')] };
    applyAction.mockImplementationOnce(async (_code, _action, validator) => {
      roomManager.addMember('RECON1', 'socket-2', member(2, true));
      return { success: validator!(stored.state).valid, state: stored.state, stateVersion: 2 };
    });

    const result = await markDisconnectedMembersAbsent('RECON1', stored.state);

    expect(result).toBeNull();
  });
});

describe('scheduleReconcile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    applyAction.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('waits the grace period, then marks the stale members absent and sends the state', async () => {
    stored.state = { ...initialState, members: [member(7, true, 'device')] };
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };

    scheduleReconcile(io as never, 'RECON2');
    scheduleReconcile(io as never, 'RECON2'); // one waits per meeting
    await vi.advanceTimersByTimeAsync(PRESENCE_GRACE_MS - 1);
    expect(applyAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(applyAction).toHaveBeenCalledOnce();
    expect(io.to).toHaveBeenCalledWith('meeting:RECON2');
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.anything());
  });
});
```

Create `backend-node/src/__tests__/recoveredSocket.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';

const stored = vi.hoisted(() => ({ state: null as unknown as MeetingState }));
vi.mock('../db/meetingStorage.js', () => ({
  getStorage: () => ({ getMeeting: async () => ({ state: stored.state, stateVersion: 5 }) }),
}));
const applyAction = vi.hoisted(() =>
  vi.fn(async () => ({ success: true, state: stored.state, stateVersion: 6 })),
);
vi.mock('../socket/stateManager.js', () => ({ applyAction }));

const { roomManager } = await import('../socket/roomManager.js');
const { handleRecoveredSocket } = await import('../socket/joinHandler.js');

function recovered(data: Record<string, unknown> = {}) {
  return {
    id: 'recovered-socket',
    data: { meetingCode: 'REC001', userId: 3, name: 'Ann', role: 'member', ...data },
  };
}

describe('handleRecoveredSocket', () => {
  const emit = vi.fn();
  const io = { to: () => ({ emit }) };

  beforeEach(() => {
    applyAction.mockClear();
    emit.mockClear();
    roomManager.removeMember('REC001', 'recovered-socket');
  });

  it('counts the member connected again, which ends their grace period', async () => {
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'member', present: true, presentBy: 'device' }],
    };
    roomManager.startGrace('REC001', 3, () => {});

    await handleRecoveredSocket(recovered() as never, io as never);

    expect(roomManager.isMemberConnected('REC001', 3)).toBe(true);
    expect(roomManager.inGrace('REC001', 3)).toBe(false);
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('marks the member present again when the grace period ran out meanwhile', async () => {
    stored.state = {
      ...initialState,
      members: [{ id: 3, name: 'Ann', role: 'member', present: false }],
    };

    await handleRecoveredSocket(recovered() as never, io as never);

    expect(applyAction).toHaveBeenCalledWith(
      'REC001',
      expect.objectContaining({ type: 'SET_MEMBER_PRESENCE', memberId: 3, present: true }),
    );
    expect(emit).toHaveBeenCalledWith('STATE_UPDATE', expect.objectContaining({ stateVersion: 6 }));
  });

  it('does nothing for a display', async () => {
    await handleRecoveredSocket(recovered({ display: true }) as never, io as never);
    expect(roomManager.isMemberConnected('REC001', 3)).toBe(false);
  });
});
```

In `backend-node/src/__tests__/joinHandler.test.ts`, replace the reconciler mock:

<!-- prettier-ignore -->
```ts
vi.mock('../socket/presenceReconciler.js', () => ({
  markDisconnectedMembersAbsent: async () => null,
}));
```

with:

```ts
vi.mock('../socket/presenceReconciler.js', () => ({ scheduleReconcile: () => {} }));
```

- [ ] **Step 2: Write the failing integration test**

In `backend-node/src/__integration__/liveSockets.ts`, add after the `actionHandler.js` import:

```ts
import { handleDisconnect } from '../socket/disconnectHandler.js';
```

add before the `disconnectAll` function:

<!-- prettier-ignore -->
```ts
  /** A socket's connection drops (a phone locks), starting its member's grace period */
  function drop(socket: FakeSocket): Promise<void> {
    return handleDisconnect(socket as never, io as never, 'disconnect');
  }

```

replace the loop in `disconnectAll`:

<!-- prettier-ignore -->
```ts
    for (const socket of sockets) {
      if (socket.data.meetingCode) roomManager.removeMember(socket.data.meetingCode, socket.id);
    }
```

with:

<!-- prettier-ignore -->
```ts
    for (const socket of sockets) {
      if (!socket.data.meetingCode) continue;
      roomManager.removeMember(socket.data.meetingCode, socket.id);
      roomManager.cancelGrace(socket.data.meetingCode, socket.data.userId);
    }
```

and change the returned object to `return { io, sockets, broadcasts, connect, join, dispatch, drop, disconnectAll };`.

Create `backend-node/src/__integration__/liveAttendance.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

beforeAll(initializeStorage);

describe('attendance in a live meeting', () => {
  let f: Fixture;
  let chair: FakeSocket;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    chair = live.connect(f.users.secretary);
    await live.join(chair, f.packet.code);
  });
  afterEach(live.disconnectAll);

  it('marks a person from the roster present, with the role the organization gives them', async () => {
    const res = await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.users.owner.id,
      timestamp: '',
    });
    expect(res.success).toBe(true);
    const owner = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.owner.id);
    expect(owner).toEqual({
      id: f.users.owner.id,
      name: 'A owner',
      role: 'admin',
      present: true,
      presentBy: 'chair',
    });
  });

  it('ignores who a client says the person is', async () => {
    await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.users.member.id,
      member: { id: f.users.member.id, name: 'Forged', role: 'chair', present: true },
      timestamp: '',
    });
    const marked = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(marked).toMatchObject({ name: 'A member', role: 'member' });
  });

  it('refuses to mark present someone outside the roster', async () => {
    const res = await live.dispatch(chair, {
      type: 'MARK_PRESENT',
      userId: f.outsider.id,
      timestamp: '',
    });
    expect(res).toMatchObject({ success: false, errorCode: 'NOT_A_MEMBER' });
  });

  it("refuses a member's MARK_PRESENT", async () => {
    const member = live.connect(f.users.member);
    await live.join(member, f.packet.code);
    const res = await live.dispatch(member, {
      type: 'MARK_PRESENT',
      userId: f.users.owner.id,
      timestamp: '',
    });
    expect(res).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
  });

  it('marks absent a member present on a device only once the device is gone', async () => {
    const member = live.connect(f.users.member);
    await live.join(member, f.packet.code);
    const markAbsent = () =>
      live.dispatch(chair, {
        type: 'MARK_ABSENT',
        memberId: f.users.member.id,
        excused: false,
        timestamp: '',
      });

    expect(await markAbsent()).toMatchObject({ success: false, errorCode: 'MEMBER_CONNECTED' });

    // The member's phone locks: within its grace period the chair may mark them absent
    live.drop(member);
    expect((await markAbsent()).success).toBe(true);
    const absent = (await stateOf(f.packet.code)).members.find((m) => m.id === f.users.member.id);
    expect(absent?.present).toBe(false);
  });

  it('marks absent a member the chair marked present', async () => {
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    const res = await live.dispatch(chair, {
      type: 'MARK_ABSENT',
      memberId: f.users.owner.id,
      excused: true,
      timestamp: '',
    });
    expect(res.success).toBe(true);
  });

  it('counts the headcount and members marked present toward quorum, never guests', async () => {
    await prisma.organization.update({ where: { id: f.orgA.id }, data: { quorumCount: 4 } });
    await resetLiveMeetings();
    await live.join(chair, f.packet.code);
    const guest = live.connect(f.outsider);
    await live.join(guest, f.packet.code);
    await live.dispatch(chair, { type: 'MARK_PRESENT', userId: f.users.owner.id, timestamp: '' });
    await live.dispatch(chair, {
      type: 'SET_HEADCOUNT',
      count: 2,
      names: ['Dee'],
      timestamp: '',
    });

    const state = await stateOf(f.packet.code);
    expect(state.headcount).toBe(2);
    expect(state.headcountNames).toEqual(['Dee']);
    expect(attendanceSummary(state)).toMatchObject({
      devicePresent: 1,
      markedPresent: 1,
      headcount: 2,
      present: 4,
      quorum: 4,
      hasQuorum: true,
      guests: 1,
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd backend-node && npx vitest run src/__tests__/roomManager.test.ts src/__tests__/disconnectHandler.test.ts src/__tests__/presenceReconciler.test.ts src/__tests__/recoveredSocket.test.ts`
Expected: FAIL. `PRESENCE_GRACE_MS`, `startGrace`, `scheduleReconcile` and `handleRecoveredSocket` don't exist, a dropped connection is marked absent at once, and the reconciler marks absent a member the chair marked present.

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveAttendance.test.ts`
Expected: FAIL. Every `MARK_PRESENT` is refused as not in the roster (nothing fills in the person yet), and a connected member can be marked absent.

- [ ] **Step 4: Replace `backend-node/src/socket/roomManager.ts`**

```ts
import type { Member } from '@robbie-bylawyer/shared/types';

interface RoomMember extends Member {
  socketId: string;
}

/**
 * How long a member stays present after their last connection drops: a locked phone or a
 * moment without signal costs nothing, and a member who comes back during a vote can vote
 */
export const PRESENCE_GRACE_MS = 90_000;

/**
 * Simple in-memory room manager for tracking connected members, and the grace period each
 * disconnected member has before they are marked absent
 * In a multi-server setup, you would use Redis or similar
 */
class RoomManager {
  private rooms: Map<string, Map<string, RoomMember>> = new Map();
  private graceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  addMember(meetingCode: string, socketId: string, member: Member): void {
    if (!this.rooms.has(meetingCode)) {
      this.rooms.set(meetingCode, new Map());
    }

    const room = this.rooms.get(meetingCode)!;
    room.set(socketId, { ...member, socketId });
    // Back within the grace period: nothing changes
    this.cancelGrace(meetingCode, member.id);
  }

  removeMember(meetingCode: string, socketId: string): void {
    const room = this.rooms.get(meetingCode);
    if (room) {
      room.delete(socketId);
      if (room.size === 0) {
        this.rooms.delete(meetingCode);
      }
    }
  }

  getMembers(meetingCode: string): Member[] {
    const room = this.rooms.get(meetingCode);
    if (!room) return [];

    // Deduplicate by member ID (same user might have multiple connections)
    const memberMap = new Map<number, Member>();
    for (const roomMember of room.values()) {
      const { socketId: _, ...member } = roomMember;
      memberMap.set(member.id, member);
    }

    return Array.from(memberMap.values());
  }

  getMemberCount(meetingCode: string): number {
    return this.getMembers(meetingCode).length;
  }

  isMemberConnected(meetingCode: string, memberId: number): boolean {
    const room = this.rooms.get(meetingCode);
    if (!room) return false;

    for (const member of room.values()) {
      if (member.id === memberId) return true;
    }
    return false;
  }

  updateMemberRole(meetingCode: string, memberId: number, newRole: Member['role']): void {
    const room = this.rooms.get(meetingCode);
    if (!room) return;

    for (const [socketId, member] of room.entries()) {
      if (member.id === memberId) {
        room.set(socketId, { ...member, role: newRole });
      }
    }
  }

  /**
   * Start a disconnected member's grace period: `onExpire` runs after PRESENCE_GRACE_MS unless
   * the member connects again first. One timer per member: starting it again restarts it.
   */
  startGrace(meetingCode: string, memberId: number, onExpire: () => void): void {
    this.cancelGrace(meetingCode, memberId);
    const key = `${meetingCode}:${memberId}`;
    const timer = setTimeout(() => {
      this.graceTimers.delete(key);
      onExpire();
    }, PRESENCE_GRACE_MS);
    // A pending grace period doesn't keep the process alive (at shutdown, say)
    timer.unref?.();
    this.graceTimers.set(key, timer);
  }

  /** Stop a member's grace period; true if one was running */
  cancelGrace(meetingCode: string, memberId: number): boolean {
    const key = `${meetingCode}:${memberId}`;
    const timer = this.graceTimers.get(key);
    if (!timer) return false;
    clearTimeout(timer);
    this.graceTimers.delete(key);
    return true;
  }

  /** Whether a disconnected member is within their grace period */
  inGrace(meetingCode: string, memberId: number): boolean {
    return this.graceTimers.has(`${meetingCode}:${memberId}`);
  }
}

export const roomManager = new RoomManager();
```

- [ ] **Step 5: Replace `backend-node/src/socket/disconnectHandler.ts`**

```ts
import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';
import { emitState } from './statePublisher.js';
import { runEvent } from './socketEvents.js';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Mark a member absent who is present because of a device that is gone. Writes to a meeting
 * are queued, so this checks again when it is applied: a member who has reconnected, or whom
 * the chair has marked present, stays present.
 */
export async function markDeviceAbsent(
  io: TypedServer,
  meetingCode: string,
  member: { id: number; name: string; role: SocketData['role'] },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const result = await applyAction(
    meetingCode,
    { type: 'SET_MEMBER_PRESENCE', memberId: member.id, present: false, timestamp },
    (state) => {
      if (roomManager.isMemberConnected(meetingCode, member.id)) {
        return { valid: false, error: 'Member reconnected' };
      }
      const current = state.members.find((m) => m.id === member.id);
      if (!current?.present || current.presentBy === 'chair') {
        return { valid: false, error: 'Not present on a device' };
      }
      return { valid: true };
    },
  );
  if (!result.success) return;

  emitState(io, meetingCode, {
    state: result.state,
    stateVersion: result.stateVersion,
    triggeredBy: { actionType: 'MEMBER_LEFT', userId: member.id },
  });
  io.to(`meeting:${meetingCode}`).emit('MEMBER_LEFT', {
    member: { id: member.id, name: member.name, role: member.role, present: false },
    timestamp,
  });
}

/**
 * Handle a socket leaving its meeting. A dropped connection ('disconnect') starts the member's
 * grace period (see PRESENCE_GRACE_MS) and leaves socket.data alone, since connection state
 * recovery may bring the socket back with it; leaving on purpose ('leave': LEAVE_MEETING, or
 * joining another meeting) marks the member absent at once.
 */
export async function handleDisconnect(
  socket: TypedSocket,
  io: TypedServer,
  reason: 'disconnect' | 'leave' = 'leave',
): Promise<void> {
  const meetingCode = socket.data.meetingCode;
  if (!meetingCode || !socket.data.userId) return;
  const roomName = `meeting:${meetingCode}`;

  // A display was never a member: it only leaves the room
  if (!socket.data.display) {
    roomManager.removeMember(meetingCode, socket.id);
    const member = { id: socket.data.userId, name: socket.data.name, role: socket.data.role };

    // Another connection of the same member keeps them present
    if (!roomManager.isMemberConnected(meetingCode, member.id)) {
      if (reason === 'disconnect') {
        roomManager.startGrace(meetingCode, member.id, () =>
          runEvent('presence grace', markDeviceAbsent(io, meetingCode, member)),
        );
      } else {
        roomManager.cancelGrace(meetingCode, member.id);
        await markDeviceAbsent(io, meetingCode, member);
      }
    }
  }

  // The user's rate limit buckets stay: removing them here gave anyone who left and joined
  // again a fresh allowance. The limiters' periodic cleanup frees idle buckets.

  if (reason === 'leave') {
    socket.leave(roomName);
    // The socket leaves the meeting but stays signed in (its identity came from its session)
    socket.data.meetingCode = null;
    socket.data.role = null as unknown as SocketData['role'];
    socket.data.display = false;
  }
}
```

- [ ] **Step 6: Replace `backend-node/src/socket/presenceReconciler.ts`**

```ts
import type { Server } from 'socket.io';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { getStorage } from '../db/meetingStorage.js';
import { PRESENCE_GRACE_MS, roomManager } from './roomManager.js';
import { applyAction } from './stateManager.js';
import { emitState } from './statePublisher.js';
import { runEvent } from './socketEvents.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Whether a member is present only because of a device that is gone, with no grace left */
function isStale(meetingCode: string, member: MeetingState['members'][number]): boolean {
  return (
    member.present &&
    member.presentBy !== 'chair' &&
    !roomManager.isMemberConnected(meetingCode, member.id) &&
    !roomManager.inGrace(meetingCode, member.id)
  );
}

/**
 * Mark absent every member the state shows as present on a device that has no live
 * connection and no grace period running.
 *
 * Device presence means "connected": joining marks a member present, and a dropped connection
 * marks them absent after its grace period. But a server restart drops every connection
 * without running the disconnect handler, so members who don't come back would stay present,
 * and count toward quorum, for the rest of the meeting. Members the chair marked present stay
 * present. Each write re-checks when it is applied, in case the member reconnects first.
 *
 * @returns the state after the last write, or null if nothing changed
 */
export async function markDisconnectedMembersAbsent(
  meetingCode: string,
  state: MeetingState,
): Promise<{ state: MeetingState; stateVersion: number } | null> {
  let latest: { state: MeetingState; stateVersion: number } | null = null;
  const stale = state.members.filter((m) => isStale(meetingCode, m));

  for (const member of stale) {
    const result = await applyAction(
      meetingCode,
      {
        type: 'SET_MEMBER_PRESENCE',
        memberId: member.id,
        present: false,
        timestamp: new Date().toISOString(),
      },
      (current) => {
        const now = current.members.find((m) => m.id === member.id);
        return now && isStale(meetingCode, now)
          ? { valid: true }
          : { valid: false, error: 'Member reconnected' };
      },
    );
    if (result.success) {
      latest = { state: result.state, stateVersion: result.stateVersion };
    }
  }
  return latest;
}

/** The meetings with a reconcile waiting */
const pending = new Set<string>();

/**
 * Reconcile a meeting's presence once the grace period has passed: after a server restart
 * there are no grace timers, so members who were connected get the same time to come back
 * before they are marked absent. Called on each join; one reconcile waits per meeting.
 */
export function scheduleReconcile(
  io: TypedServer,
  meetingCode: string,
  delayMs: number = PRESENCE_GRACE_MS,
): void {
  if (pending.has(meetingCode)) return;
  pending.add(meetingCode);
  const timer = setTimeout(() => {
    pending.delete(meetingCode);
    runEvent('presence reconcile', reconcile(io, meetingCode));
  }, delayMs);
  timer.unref?.();
}

async function reconcile(io: TypedServer, meetingCode: string): Promise<void> {
  const meeting = await getStorage().getMeeting(meetingCode);
  if (!meeting) return;
  const reconciled = await markDisconnectedMembersAbsent(meetingCode, meeting.state);
  if (reconciled) {
    emitState(io, meetingCode, reconciled);
  }
}
```

- [ ] **Step 7: Joins, recovered sockets and connection state recovery**

In `backend-node/src/socket/joinHandler.ts`, change the reconciler import to:

```ts
import { scheduleReconcile } from './presenceReconciler.js';
```

change `await handleDisconnect(socket, io);` to `await handleDisconnect(socket, io, 'leave');`, and replace:

<!-- prettier-ignore -->
```ts
    // Members still shown as present with no connection (left over from a server restart)
    // are marked absent, so quorum counts only who is here
    const reconciled = await markDisconnectedMembersAbsent(meetingCode, currentState);
    if (reconciled) {
      currentState = reconciled.state;
      currentVersion = reconciled.stateVersion;
    }
```

with:

<!-- prettier-ignore -->
```ts
    // Members still shown as present on a device with no connection (left over from a server
    // restart) are marked absent once the grace period has passed, so quorum counts only who
    // is here
    scheduleReconcile(io, meetingCode);
```

At the end of the file, add:

```ts
/**
 * A socket that connection state recovery brought back (after a moment without signal):
 * socket.io restores its rooms and socket.data, and the client doesn't join again. Count it as
 * connected again, which ends its grace period; if the grace period ran out meanwhile, the
 * member is present again.
 */
export async function handleRecoveredSocket(socket: TypedSocket, io: TypedServer): Promise<void> {
  const meetingCode = socket.data.meetingCode;
  if (!meetingCode || socket.data.display) return;
  const { userId, name, role } = socket.data;
  roomManager.addMember(meetingCode, socket.id, { id: userId, name, role, present: true });

  const meeting = await getStorage().getMeeting(meetingCode);
  const member = meeting?.state.members.find((m) => m.id === userId);
  if (!member || member.present) return;
  const result = await applyAction(meetingCode, {
    type: 'SET_MEMBER_PRESENCE',
    memberId: userId,
    present: true,
    timestamp: new Date().toISOString(),
  });
  if (result.success) {
    emitState(io, meetingCode, {
      state: result.state,
      stateVersion: result.stateVersion,
      triggeredBy: { actionType: 'MEMBER_JOINED', userId },
    });
  }
}
```

In `backend-node/src/socket/socketHandler.ts`, change the join import to `import { handleJoinMeeting, handleRecoveredSocket } from './joinHandler.js';`, add at the start of the `connection` listener:

<!-- prettier-ignore -->
```ts
    // Back after a moment without signal, with its meeting (see connectionStateRecovery)
    if (socket.recovered) {
      runEvent('recover', handleRecoveredSocket(socket, io));
    }

```

and pass the reason on: `handleDisconnect(socket, io, 'leave')` for `LEAVE_MEETING` and `handleDisconnect(socket, io, 'disconnect')` for `disconnect`.

In `backend-node/src/index.ts`, replace the end of the socket.io options:

<!-- prettier-ignore -->
```ts
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
```

with:

<!-- prettier-ignore -->
```ts
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // A phone that loses signal for a moment resumes the same session: its meeting, and the
  // state updates it missed. Recovered sockets skip the session check (socketAuth), which they
  // passed when they connected; a socket closed by signing out is not recovered.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});
```

- [ ] **Step 8: Create `backend-node/src/socket/attendanceActions.ts`**

```ts
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import { findMeetingPacket, findOrgPeople } from './meetingPacket.js';
import { deriveMeetingRole } from './meetingRoles.js';
import { roomManager } from './roomManager.js';

type Prepared = { action: MeetingAction } | { error: string; errorCode: ActionErrorCode };

/**
 * What the server adds to the attendance actions before they are validated:
 * - MARK_PRESENT gets the person from the organization's roster, with the meeting role the
 *   organization gives them (the validator refuses it without one: not in the roster)
 * - MARK_ABSENT is refused for a member present on a device that is still connected: they are
 *   still in the room, and leave when their device does
 */
export async function prepareAttendanceAction(
  meetingCode: string,
  state: MeetingState,
  action: MeetingAction,
): Promise<Prepared> {
  if (action.type === 'MARK_PRESENT') {
    const packet = state.organizationId ? await findMeetingPacket(meetingCode) : null;
    if (!packet) return { action };
    const person = (await findOrgPeople(packet.organizationId, [action.userId])).get(action.userId);
    if (!person) return { action };
    return {
      action: {
        ...action,
        member: {
          id: action.userId,
          // Someone marked present may never have signed in to set a name
          name: person.name ?? person.email.split('@')[0],
          role: deriveMeetingRole(packet.chairUserId, person.role, action.userId),
          present: true,
        },
      },
    };
  }

  if (action.type === 'MARK_ABSENT') {
    const member = state.members.find((m) => m.id === action.memberId);
    if (
      member?.present &&
      member.presentBy !== 'chair' &&
      roomManager.isMemberConnected(meetingCode, member.id)
    ) {
      return {
        error: `${member.name} is still connected: they leave when their device does`,
        errorCode: 'MEMBER_CONNECTED',
      };
    }
    // Absent now, so the grace period of a device that just left has nothing to do
    roomManager.cancelGrace(meetingCode, action.memberId);
  }

  return { action };
}
```

In `backend-node/src/socket/actionHandler.ts`, add after the `meetingPacket.js` import:

```ts
import { prepareAttendanceAction } from './attendanceActions.js';
```

and before `// Pre-validate action before applying`:

<!-- prettier-ignore -->
```ts
    // Attendance: the roster entry for MARK_PRESENT, and MARK_ABSENT only once a device is gone
    const prepared = await prepareAttendanceAction(meetingCode, meeting.state, enrichedAction);
    if ('error' in prepared) {
      callback({ success: false, error: prepared.error, errorCode: prepared.errorCode });
      socket.emit('ACTION_REJECTED', {
        clientSequence: data.clientSequence,
        reason: prepared.error,
        errorCode: prepared.errorCode,
      });
      return;
    }
    enrichedAction = prepared.action;

```

- [ ] **Step 9: Run them to see them pass**

Run: `cd backend-node && npx tsc --noEmit -p . && npx vitest run src/__tests__/roomManager.test.ts src/__tests__/disconnectHandler.test.ts src/__tests__/presenceReconciler.test.ts src/__tests__/recoveredSocket.test.ts src/__tests__/joinHandler.test.ts && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveAttendance.test.ts src/__integration__/liveJoin.test.ts`
Expected: type-check clean; 20 passed (3 in `roomManager.test.ts`, 7 in `disconnectHandler.test.ts`, 4 in `presenceReconciler.test.ts`, 3 in `recoveredSocket.test.ts`, 3 in `joinHandler.test.ts`), then 18 passed (7 in `liveAttendance.test.ts`, 11 in `liveJoin.test.ts`).

- [ ] **Step 10: Run everything**

Run: `npm run test:run -w backend-node && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
npx prettier --write backend-node/src/socket backend-node/src/index.ts backend-node/src/__tests__/roomManager.test.ts backend-node/src/__tests__/disconnectHandler.test.ts backend-node/src/__tests__/presenceReconciler.test.ts backend-node/src/__tests__/recoveredSocket.test.ts backend-node/src/__tests__/joinHandler.test.ts backend-node/src/__integration__/liveSockets.ts backend-node/src/__integration__/liveAttendance.test.ts
git add backend-node/src/socket backend-node/src/index.ts backend-node/src/__tests__/roomManager.test.ts backend-node/src/__tests__/disconnectHandler.test.ts backend-node/src/__tests__/presenceReconciler.test.ts backend-node/src/__tests__/recoveredSocket.test.ts backend-node/src/__tests__/joinHandler.test.ts backend-node/src/__integration__/liveSockets.ts backend-node/src/__integration__/liveAttendance.test.ts
git commit -m "feat(room): mark people present from the roster, and keep locked phones present

MARK_PRESENT takes the person from the organization's roster, with the role
the organization gives them; MARK_ABSENT waits until a member's device is
gone. A dropped connection starts a 90-second grace period before its
member is marked absent, and coming back within it changes nothing;
socket.io's connection state recovery brings a socket back with its
meeting. Only device presence is ever cleared automatically, and after a
restart the reconciler waits the grace period."
```

---

### Task 7: The roster, reloading the agenda, and the chair changed on the schedule

`GET /api/packets/:code/roster` (viewer) gives the chair console what it needs to mark people present: the organization's members `{ userId, name, email, orgRole }` and pending additions `{ email, role }`. Pending additions are shown to viewers here, as the design asks, though the members route shows them only to admins; a pending addition can't be marked present (it has no account), so the list is for reference.

`POST /api/packets/:code/reload-agenda` replaces the live agenda with the packet's, through `applyAction` with a server-only `RELOAD_AGENDA`, before the meeting starts; once it has, the answer is 409 and the agenda is changed in the meeting. The design names both "the chair or an admin" and "secretary" for it, so the rule is member (the route coverage test needs one) and the handler lets through a secretary or above, or the packet's presiding officer, and answers anyone else 403 "You need the secretary role for this". Without a live meeting yet there is nothing to replace (the first join brings the packet's agenda), and the answer says so: `{ live: false, agenda }`. The new state goes to the room through the server's socket.io instance.

Changing the presiding officer on the schedule (`PUT /api/packets/:id` with `chairUserId`) brings a live meeting's roles in line at once (`syncMeetingRoles`), so the chair doesn't wait for the next join.

**Files:**

- Modify: `backend-node/src/bylawyer/routes/packets.ts`
- Test: `backend-node/src/__integration__/liveSchedule.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `backend-node/src/__integration__/liveSchedule.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { setIoInstance } from '../socket/ioInstance.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { liveSockets } from './liveSockets.js';
import { describeRules } from './rules.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

beforeAll(async () => {
  await initializeStorage();
  // Routes send live meetings their new state through the server's socket.io instance
  setIoInstance(live.io as never);
});

describeRules('live schedule rules', [
  {
    method: 'get',
    route: '/packets/:robbieCode/roster',
    path: (f) => `/api/packets/${f.packet.code}/roster`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/packets/:robbieCode/reload-agenda',
    path: (f) => `/api/packets/${f.packet.code}/reload-agenda`,
    min: 'secretary',
    ok: 200,
  },
]);

describe('the roster of a meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("lists the organization's members and pending additions", async () => {
    const res = await call('get', `/api/packets/${f.packet.code}/roster`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(5);
    expect(res.body.members[0]).toEqual({
      userId: f.users.viewer.id,
      name: 'A viewer',
      email: 'viewer@example.org',
      orgRole: 'viewer',
    });
    expect(res.body.invites).toEqual([{ email: 'pending@example.org', role: 'member' }]);
  });
});

describe('reloading the agenda from the schedule', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  const reload = (cookie: string) =>
    call('post', `/api/packets/${f.packet.code}/reload-agenda`, { cookie });

  it("has nothing to replace before anyone joins: the first join brings the packet's agenda", async () => {
    const res = await reload(f.users.secretary.cookie);
    expect(res.body).toEqual({
      live: false,
      agenda: [
        { id: 1, title: 'Reports', status: 'pending', packetItemId: f.item },
        { id: 2, title: 'New business', status: 'pending', packetItemId: f.item2 },
      ],
    });
    expect(await getStorage().getMeeting(f.packet.code)).toBeNull();
  });

  it('replaces the live agenda before the meeting starts, and sends the room the change', async () => {
    await live.join(live.connect(f.users.member), f.packet.code);
    await prisma.meetingAgendaItem.update({
      where: { id: f.item2 },
      data: { title: 'Old business' },
    });
    await prisma.meetingAgendaItem.create({
      data: { packetId: f.packet.id, title: 'Adjournment', position: 2 },
    });
    live.broadcasts.length = 0;

    const res = await reload(f.users.secretary.cookie);
    expect(res.status).toBe(200);
    expect(res.body.live).toBe(true);
    const titles = (await stateOf(f.packet.code)).agenda.map((item) => item.title);
    expect(titles).toEqual(['Reports', 'Old business', 'Adjournment']);
    expect(live.broadcasts).toEqual([
      expect.objectContaining({ room: 'meeting:ORGA01', event: 'STATE_UPDATE' }),
    ]);
  });

  it('is refused once the meeting has started', async () => {
    const chair = live.connect(f.users.secretary);
    await live.join(chair, f.packet.code);
    await live.dispatch(chair, { type: 'START_MEETING', timestamp: '' });

    const res = await reload(f.users.secretary.cookie);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'The meeting has started; change the agenda in the meeting',
    });
  });

  it('is open to the presiding officer, whatever their role', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.member.id },
    });
    expect((await reload(f.users.member.cookie)).status).toBe(200);
  });
});

describe('changing the presiding officer on the schedule', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  it("changes the live meeting's chair at once", async () => {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { chairUserId: f.users.secretary.id },
    });
    await live.join(secretary, f.packet.code);
    await live.join(member, f.packet.code);

    const res = await call('put', `/api/packets/${f.packet.id}`, {
      cookie: f.users.admin.cookie,
      body: { chairUserId: f.users.member.id },
    });
    expect(res.status).toBe(200);
    const roles = (await stateOf(f.packet.code)).members.map((m) => [m.id, m.role]);
    expect(roles).toEqual([
      [f.users.secretary.id, 'admin'],
      [f.users.member.id, 'chair'],
    ]);
    expect(member.data.role).toBe('chair');
    expect(secretary.data.role).toBe('admin');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveSchedule.test.ts`
Expected: FAIL. Both routes answer 404 (`GET /packets/:robbieCode/roster` and `POST /packets/:robbieCode/reload-agenda` don't exist), and a chair changed on the schedule leaves the live meeting's roles as they were.

- [ ] **Step 3: Add the routes and the live sync**

In `backend-node/src/bylawyer/routes/packets.ts`, replace `import { atLeast } from '../../orgs/roles.js';` with:

```ts
import { atLeast, roleNeeded } from '../../orgs/roles.js';
import { listMembers } from '../../orgs/membershipService.js';
import { getStorage } from '../../db/meetingStorage.js';
import { agendaFromPacket, findMeetingPacket } from '../../socket/meetingPacket.js';
import { syncMeetingRoles } from '../../socket/meetingRoles.js';
import { getIoInstance } from '../../socket/ioInstance.js';
import { applyAction } from '../../socket/stateManager.js';
import { emitState } from '../../socket/statePublisher.js';
import { validateAction } from '../../socket/actionValidator.js';
```

Before the `canPreside` function, add:

```ts
/**
 * After the presiding officer changes on the schedule: a live meeting's roles follow at once,
 * for the people in it and their sockets
 */
async function syncLiveRoles(meetingCode: string): Promise<void> {
  const io = getIoInstance();
  if (!io) return;
  const synced = await syncMeetingRoles(io, meetingCode);
  if (synced) emitState(io, meetingCode, synced);
}
```

In the `PUT /api/packets/:id` handler, add before `res.json(updated);`:

<!-- prettier-ignore -->
```ts
      if (chairUserId !== undefined && chairUserId !== packet.chairUserId) {
        await syncLiveRoles(packet.robbieCode);
      }

```

At the end of the file, add:

```ts
/**
 * GET /api/packets/:robbieCode/roster
 * The meeting's organization's members and pending additions, for marking people present
 */
packetsRouter.get(
  '/packets/:robbieCode/roster',
  validate({ params: robbieCodeParam }),
  requireRole('viewer', fromParam('robbieCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const { members, invites = [] } = await listMembers(req.org!.id, true);
      res.json({
        members: members.map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          orgRole: m.role,
        })),
        invites: invites.map((i) => ({ email: i.email, role: i.role })),
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting roster');
      res.status(500).json({ error: 'Failed to get the roster' });
    }
  },
);

/**
 * POST /api/packets/:robbieCode/reload-agenda
 * Replace a live meeting's agenda with the packet's, before the meeting starts: for a
 * secretary or above, or the meeting's presiding officer. Without a live meeting yet there is
 * nothing to replace; the first person to join brings the packet's agenda.
 */
packetsRouter.post(
  '/packets/:robbieCode/reload-agenda',
  validate({ params: robbieCodeParam }),
  requireRole('member', fromParam('robbieCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const meetingCode = req.params.robbieCode;
      const packet = await findMeetingPacket(meetingCode);
      if (!packet || packet.organizationId !== req.org!.id) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!atLeast(req.org!.role, 'secretary') && packet.chairUserId !== req.user!.id) {
        return res.status(403).json({ error: roleNeeded('secretary') });
      }

      const agenda = agendaFromPacket(packet.agendaItems);
      const meeting = await getStorage().getMeeting(meetingCode);
      if (!meeting) {
        return res.json({ live: false, agenda });
      }

      const result = await applyAction(
        meetingCode,
        { type: 'RELOAD_AGENDA', agenda, timestamp: new Date().toISOString() },
        validateAction,
      );
      // Refused once the meeting has started (see the validator)
      if (!result.success) {
        return res.status(409).json({ error: result.error });
      }
      const io = getIoInstance();
      if (io) {
        emitState(io, meetingCode, { state: result.state, stateVersion: result.stateVersion });
      }
      res.json({ live: true, agenda: result.state.agenda });
    } catch (error) {
      logger.error({ err: error }, 'Error reloading the agenda');
      res.status(500).json({ error: 'Failed to reload the agenda' });
    }
  },
);
```

The rule matrix for reload-agenda says `min: 'secretary'`: the fixture's member isn't the presiding officer, so the member gets the handler's 403 with the secretary message, exactly as `describeRules` expects for the role below the minimum.

- [ ] **Step 4: Run it to see it pass**

Run: `cd backend-node && npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveSchedule.test.ts`
Expected: type-check clean; 8 passed.

- [ ] **Step 5: Run everything**

Run: `npm run test:run -w backend-node && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: all pass; the route coverage test finds a rule on both new routes.

- [ ] **Step 6: Commit**

```bash
npx prettier --write backend-node/src/bylawyer/routes/packets.ts backend-node/src/__integration__/liveSchedule.test.ts
git add backend-node/src/bylawyer/routes/packets.ts backend-node/src/__integration__/liveSchedule.test.ts
git commit -m "feat(room): the meeting roster, reloading the agenda, and the chair on the schedule

GET /api/packets/:code/roster lists the organization's members and pending
additions for marking people present. POST /api/packets/:code/reload-agenda
replaces the live agenda with the packet's before the meeting starts (a
secretary or the presiding officer). Changing the presiding officer on the
schedule changes the live meeting's chair at once."
```

---

### Task 8: Documentation, the full check and a live check

**Files:**

- Modify: `spec.md`, `CLAUDE.md`

The mobile app needs no change: after every task above, `npx tsc --noEmit -p mobile/tsconfig.json` and its tests pass. It keeps working without new features: it joins with `{ meetingCode }`, shows its role as text, and a guest's vote or motion is refused by the server with a message. Its own `voterChoices` read shows no vote during a secret ballot.

- [ ] **Step 1: Record the milestones in `spec.md`**

Under `### M3. Organization authorization (REST and socket)`, after the bullet that starts `- Socket identity: the enricher must overwrite every actor field`, add:

```markdown
- **Done 2026-10-06 (server, in the room):** a live meeting is its packet: joining a code without one is refused, and the first join creates the state from it (organization, title, date, quorum, agenda). Meeting roles are derived from the organization at every join (the packet's presiding officer chairs, secretaries and above are admins, members are members, everyone else is a non-voting guest), so they survive a restart; `ADMIN_EMAILS` and the in-memory participant roles are gone, and only the chair is handed over in a meeting (saved on the packet). Guests can follow, ask for the floor and ask questions; they can't move, second, vote, answer roll call, hold or grant proxies, be nominated or take the chair, and never count toward quorum or vote totals. The enricher overwrites the actor fields of every action type (`ACTOR_FIELDS`, checked against the whole action union), and `ADD_MEMBER`, `SET_MEMBER_PRESENCE`, `REFRESH_MEMBERS` and `RELOAD_AGENDA` are server-only. A display joins without becoming a member. Not done: closing a meeting to guests, and removing a guest.
- Follow-up: the demo seed (`backend-node/src/scripts/seedDemo.ts`, not written yet) must set each packet's `chairUserId` and the organization's `eligibleVoters` and `quorumPercent`, or its meetings have no chair and a quorum of 3.
```

Under `### M7. Parliamentary correctness`, replace:

```markdown
- Quorum is a fixed number (default 3), never enforced, and `proxiesCountForQuorum` is unused.
- Ballot votes are not secret: `voterChoices` are stored and exported in minutes.
```

with:

```markdown
- **Done 2026-10-06 (server):** quorum comes from the organization (a percentage of its eligible voting members, or a count) and counts members on a device, members marked present by the chair, a headcount of people without an account, and proxies when `proxiesCountForQuorum` is set (`attendanceSummary`); opening a vote without it still only warns. Votes add the chair's floor tally to the device votes, the chair's deciding vote is judged on both, a voice vote takes no device votes, and elections add floor ballots. A secret ballot's choices are never sent to clients and aren't kept once it closes.
```

Under `### M8. Minutes`, after the bullet that starts `- Correct mover and seconder`, add:

```markdown
- **Done 2026-10-06 (server):** every decided motion is recorded with its mover, both parts of its vote and its method; the minutes show the headcount (and names), guests apart from members, and both parts of each vote.
```

Under `### M12. Production readiness`, after the bullet that starts `- **Fixed 2026-10-06:** presence is reconciled with live connections on each join`, add:

```markdown
- **Done 2026-10-06:** a dropped connection keeps its member present for 90 seconds (a locked phone costs nothing, and a member back during a vote can vote), socket.io's connection state recovery (2 minutes) resumes a session with the updates it missed, and after a restart presence is reconciled only once that grace period has passed. Members marked present by the chair are never marked absent automatically.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In "Robbie Features", replace `- Meeting storage (PostgreSQL or in-memory fallback)` with:

```markdown
- Meeting storage in PostgreSQL. A live meeting is created from its packet (its scheduled meeting), so meetings need the database; the in-memory storage mode can't run one.
- Meeting roles from the organization at every join: the packet's presiding officer is the chair, secretaries and above are admins, members are members, everyone else is a non-voting guest
- Attendance as members on a device, members marked present by the chair, and a headcount of people without an account (`attendanceSummary` in shared); votes as device votes plus the chair's floor tally
```

In "Socket.io Events", replace the client line with:

```markdown
- Client → Server: `JOIN_MEETING` (`{ meetingCode, display? }`; a display receives the state without becoming a member), `LEAVE_MEETING`, `DISPATCH_ACTION`, `REQUEST_STATE`
```

In the "API Endpoints" list, replace the `POST /api/organizations/{id}/packets` line with:

```markdown
- `PUT /api/organizations/{id}` - Name, description, and attendance settings: `eligibleVoters`, and `quorumPercent` or `quorumCount` (admin)
- `GET/POST /api/organizations/{id}/packets` - The schedule (meetings not yet adjourned first) / schedule a meeting (claims a meeting code; `chairUserId` defaults to the creator); `DELETE /api/packets/{id}` also deletes its uploaded files
- `GET /api/packets/{code}/roster` - The meeting's organization's members and pending additions, for marking people present
- `POST /api/packets/{code}/reload-agenda` - Replace the live agenda with the packet's before the meeting starts (secretary, or the presiding officer)
```

Under "Key Conventions", add after item 10:

```markdown
11. **Live meetings:** a meeting code is a `MeetingPacket`; `JOIN_MEETING` refuses a code without one and creates the live state from it (`backend-node/src/socket/meetingPacket.ts`). Meeting roles come from `deriveMeetingRole` (`socket/meetingRoles.ts`) at every join, never from memory. Every action goes through the reducer, `actionValidator`, `permissionGuard` and `actionEnricher`, and all four are exhaustive over the action union: a new action needs a case in the reducer and the validator, an entry in `PERMISSIONS` (empty for server-only actions) and an entry in `ACTOR_FIELDS`. Every state sent to clients goes through `publicState` (`socket/statePublisher.ts`), which strips secret ballot choices. A dropped connection gets `PRESENCE_GRACE_MS` (90 seconds) before its member is marked absent; only device presence (`presentBy: 'device'`) is cleared automatically.
```

If your `backend-node/.env` sets `ADMIN_EMAILS`, it can go: nothing reads it.

- [ ] **Step 3: Full check**

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration
```

Expected: all pass. Lint reports warnings only, no more than before this plan (77 when it was written). When this plan was written the counts were: shared 311 tests in 13 files, backend-node 495 in 30 files, integration 304 in 23 files, frontend-unified 133 in 33 files, mobile 86 in 10 suites; tests added on the branch since then raise them.

- [ ] **Step 4: Live check**

Start the server against the throwaway database with test sign-in, on a spare port (from `backend-node/`, in the background):

```bash
PORT=3101 DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie ENABLE_TEST_AUTH=true npm run dev
```

Then sign in, name the user, accept the terms, create an organization and set its attendance, and schedule a meeting:

```bash
curl -s -c /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"email":"live@example.org","code":"000000"}' localhost:3101/api/auth/verify
curl -s -b /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"version":"2026-10-06"}' localhost:3101/api/auth/accept-terms
curl -s -b /tmp/robbie-cookies -X PATCH -H 'Content-Type: application/json' -d '{"name":"Live Check"}' localhost:3101/api/auth/me
ORG=$(curl -s -b /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"name":"Live Check HOA"}' localhost:3101/api/organizations | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -b /tmp/robbie-cookies -X PUT -H 'Content-Type: application/json' -d '{"eligibleVoters":142,"quorumPercent":20}' localhost:3101/api/organizations/$ORG
curl -s -b /tmp/robbie-cookies -H 'Content-Type: application/json' -d '{"robbieCode":"LIVE01","title":"Annual meeting","scheduledFor":"2026-11-05"}' localhost:3101/api/organizations/$ORG/packets
curl -s -b /tmp/robbie-cookies localhost:3101/api/organizations/$ORG/packets
curl -s -b /tmp/robbie-cookies localhost:3101/api/packets/LIVE01/roster
curl -s -b /tmp/robbie-cookies -X POST localhost:3101/api/packets/LIVE01/reload-agenda
```

Expected, in order: the user JSON (`"name":null`); `{"termsAccepted":true}`; the user with `"name":"Live Check"`; no output (the organization's id is in `ORG`); the organization with `"eligibleVoters":142,"quorumPercent":20,"quorumCount":null`; the packet with `"chairUserId"` the user's id and `"startedAt":null,"endedAt":null`; a list of that one packet with `"chair":{"name":"Live Check"}`; `{"members":[{"userId":<id>,"name":"Live Check","email":"live@example.org","orgRole":"owner"}],"invites":[]}`; `{"live":false,"agenda":[]}`. On a second run against the same database the organization's slug and the meeting code are taken; use another name and code.

Then join over a socket (from the repository root, where `socket.io-client` is installed):

```bash
TOKEN=$(awk '$6=="session"{print $7}' /tmp/robbie-cookies) node --input-type=module -e "
import { io } from 'socket.io-client';
const socket = io('http://localhost:3101', { extraHeaders: { Cookie: 'session=' + process.env.TOKEN } });
const join = (payload) => new Promise((resolve) => socket.emit('JOIN_MEETING', payload, resolve));
const act = (action) => new Promise((resolve) => socket.emit('DISPATCH_ACTION', { action, clientSequence: 1 }, resolve));
socket.on('connect', async () => {
  console.log(JSON.stringify(await join({ meetingCode: 'NOPE01' })));
  const res = await join({ meetingCode: 'LIVE01' });
  const me = res.state.members[0];
  console.log(JSON.stringify({ success: res.success, title: res.state.title, quorum: res.state.quorum, me }));
  console.log(JSON.stringify(await act({ type: 'SET_HEADCOUNT', count: 3, names: ['Dee'], timestamp: '' })));
  console.log(JSON.stringify(await act({ type: 'SET_MEMBER_ROLE', targetMemberId: me.id, newRole: 'admin', timestamp: '' })));
  socket.disconnect();
});
"
```

Expected:

```
{"success":false,"error":"No meeting with that code","errorCode":"MEETING_NOT_FOUND"}
{"success":true,"title":"Annual meeting","quorum":29,"me":{"id":<id>,"name":"Live Check","role":"chair","present":true,"presentBy":"device"}}
{"success":true,"stateVersion":3}
{"success":false,"error":"Meeting roles come from the organization; only the chair can be handed over here","errorCode":"PERMISSION_DENIED"}
```

(29 is 20% of 142, rounded up; the creator presides.) Stop the server. The browser check of the meeting screens is the client plan's.

- [ ] **Step 5: Commit**

```bash
npx prettier --write spec.md CLAUDE.md
git add spec.md CLAUDE.md
git commit -m "docs: record the in-the-room server work"
```

---

## Self-review notes

- **Design coverage (design section to task):**
  - Decisions: a live meeting is a scheduled meeting, refused without a packet (Task 5); roles derived at every join, `ADMIN_EMAILS` removed (Task 5); attendance as three numbers against the organization's count (Tasks 1, 2, 6); votes as two tallies summed at close and shown apart (Task 3); the wire protocol unchanged, new fields optional (`display`, `errorCode`, the actor fields; Tasks 2, 4, 5); the screens are the client plan's.
  - Roles in a meeting: the role table and `deriveMeetingRole` (Task 5, unit-tested for every organization role and the presiding officer); `SET_MEMBER_ROLE` only for the chair, written to `chairUserId` (Task 5), and the schedule's change taking effect live (Task 7); the participant roles and `meeting_participants` no longer read or written (Task 5); names and roles refreshed on rejoin, "Set your name first" (Task 5); the guard with `guest`, `ADD_MEMBER` and `SET_MEMBER_PRESENCE` server-only (Task 2); every actor field overwritten, table-driven over the action union (Task 4).
  - Attendance: organization settings and routes (Task 1); `presentBy`, the headcount and names, the quorum from the settings, `organizationId`, `title`, `scheduledFor` (Tasks 2, 5); `MARK_PRESENT` from the roster, refused outside it (Tasks 2, 6); `MARK_ABSENT` clearing `presentBy`, refused while the device is connected (Tasks 2, 6); `SET_HEADCOUNT` (Task 2); `attendanceSummary` and its use by the server's quorum check and the minutes (Tasks 2, 4); the roster route (Task 7).
  - Phones that lock: `PRESENCE_GRACE_MS` and one timer per member, the reconnect cases, connection state recovery, the reconciler waiting after a restart (Task 6).
  - Votes: `floorVotes`, `voice`, the completed record's parts and method, every decided motion recorded, `SET_FLOOR_TALLY`, the result on both parts with `calculateVoteResult`, the deciding vote on both, `CAST_VOTE` refused for voice and for guests, floor ballots in elections (Tasks 2, 3); ballot choices removed from broadcasts and from the record (Tasks 3, 4).
  - The schedule is the meeting: `chairUserId`, `startedAt`, `endedAt` (Task 1); the state from the packet with `packetItemId` (Task 5); reload-agenda (Task 7); start and end written to the packet (Task 5); the schedule list for the Live Meetings page (Task 1).
  - The display view: the server half, `JOIN_MEETING { display: true }` for viewers and above, not a member, no presence (Tasks 5, 6); the page is the client plan's.
  - Deep link and QR, elections from the chair's screen, Screens, the Playwright harness: the client plan.
  - Persistence and the server: `getOrCreateMeeting(code, initial)` with the packet's state (Task 5); the new actions through reducer, validator, guard and enricher (Tasks 2 to 4); rate limiting, the write queue and the bylaw sync unchanged (the sync records both parts, Task 3).
  - Testing, server and shared: every listed test is in Tasks 2 to 7 (reducer tests for the attendance actions, floor tallies with exactly two thirds across both parts, voice votes, floor ballots, every decided motion recorded, `attendanceSummary`; role derivation; join refused without a packet; guests refused and excluded from quorum; the enricher over the action union; the grace period with fake timers; ballot redaction; `MARK_PRESENT` outside the roster; chair transfer saved; agenda from the packet; the roster and reload-agenda routes).
- **Where the code and the design differ, and what this plan does:**
  - The design lists `YIELD_FLOOR` among the actions whose `member` is overwritten, but it has no actor field. It gets `yieldedBy`, and the validator lets only the speaker or the chair or an admin yield (any member could before).
  - The design names `revokedBy`, `acceptedBy`, `declinedBy` and `cancelledBy`; none exists in the action union (the old enricher checked for them in vain). `ACCEPT_PROXY`, `DECLINE_PROXY` and `CANCEL_PROXY_REQUEST` gain `acceptedBy`, `declinedBy` and `canceledBy` (American spelling), checked against the request; `REVOKE_PROXY` needs none, being for the chair and admins only.
  - The design says `MARK_PRESENT` applies `ADD_MEMBER` and `SET_MEMBER_PRESENCE`; this plan makes it one reducer action that the server fills from the roster, so it is one write and one log line, with the same effect.
  - The design's example log line ("On devices 12 to 3, in the room 9 to 2: 21 to 5, carried") would break the web client's `useVoteResults` parser; the log keeps `Vote: Yea 21, Nay 5. CARRIED.` and appends the parts. The display and minutes read the record.
  - Recording every decided motion would have made every motion look reconsiderable (the record's existence was the check); records carry `reconsiderable`, and a missing flag (older records) counts as reconsiderable. Note that `constants/motions.ts` marks Adjourn as reconsiderable, which RONR doesn't; not changed here.
  - `MARK_ABSENT` follows the Attendance rule (refused while the member's device is connected); the design's known limit says the chair may mark such a member absent. The rule wins here: the chair waits for the device to leave or the grace period.
  - Reload-agenda: the design says both "the chair or an admin" and "secretary"; the route takes a secretary or above, or the presiding officer.
  - `SET_MEMBER_ROLE.newRole` keeps its wide type, so the current admin view compiles; the server refuses anything but `chair`.
  - The design doesn't say who may preside. The schedule requires a member of the organization with the member role or above (a viewer can't be named, `CHAIR_NOT_MEMBER`), and a presiding officer who has since lost that role joins as a guest, not the chair (`deriveMeetingRole`); the meeting then has no chair until one is handed the role, and admins run it.
  - Joining needs the packet, which is in Postgres (Prisma), so the meeting storage's in-memory mode (no `DATABASE_URL`) can no longer run a meeting. It couldn't sign anyone in either, since sessions are in Prisma; `CLAUDE.md` says so in Task 8.
  - `Member.role` gaining `guest` breaks one line of `AdminView.tsx`, changed in Task 2; `useQuorumStatus` and `ReconsiderForm` stay as they are (`attendanceSummary` and `reconsiderable` are additive) and move to the client plan.
  - The legacy `meeting_participants` DDL stays (unused, commented) for M5 to drop with the other legacy tables.
  - The voting method can't change while a vote is open (new): switching a ballot to a standard vote mid-vote would otherwise have changed how its votes were shown.
- **Response changes the client plan must handle:** `JOIN_MEETING` answers `{ success: false, error: 'No meeting with that code', errorCode: 'MEETING_NOT_FOUND' }` for a code without a packet and `errorCode: 'NAME_REQUIRED'` for a user without a name, and takes `display: true` (viewer and above); `Member.role` can be `guest` and members carry `presentBy`; the state has `organizationId`, `title`, `scheduledFor`, `headcount`, `headcountNames`, `floorVotes`; `voterChoices` is empty during a secret ballot (show "Vote recorded" from `voters`); completed motions carry `deviceVotes`, `floorVotes`, `method`, `reconsiderable` (filter `ReconsiderForm` on it); `currentElection.floorBallots`; new actions `MARK_PRESENT { userId }`, `SET_HEADCOUNT { count, names }`, `SET_FLOOR_TALLY { yea, nay, abstain }`, `SET_FLOOR_BALLOTS { counts }`, voting method `voice`; `SET_MEMBER_ROLE` accepts only `newRole: 'chair'`; new error codes `VOTING_METHOD`, `MEMBER_CONNECTED`, `NAME_REQUIRED`; the chair's deciding-vote offer should use `canChairVoteDecide(addVotes(votes, floorVotes), ...)`; `useQuorumStatus` should become a wrapper of `attendanceSummary`; the vote log line may carry a parts sentence after the result; new routes `GET /api/organizations/:orgId/packets`, `GET /api/packets/:code/roster`, `POST /api/packets/:code/reload-agenda`, and the attendance and presiding-officer fields on organizations and packets.
- **Known limits added:** a guest's name is whatever they signed in with; in-meeting renames (`RENAME_MEMBER`) last until the member's next join, which refreshes the sign-in name; someone marked present who never set a name shows the first part of their email; a proxy vote cast during a secret ballot still shows its choice in `proxyVotes` (proxies are out of scope); a display is refused to people outside the organization, while a guest's phone is not.
- **Names used across tasks:** `MeetingRole`, `presentBy`, `withPresence` (memberHandlers), `attendanceHandler`, `attendanceSummary`, `AttendanceSummary`, `quorumFromSettings`, `QuorumSettings`, `addVotes`, `completedMotionVotes`, `NO_VOTES`, `logMemberMarkedPresent`, `logHeadcountSet`; `MAX_HEADCOUNT`, `MAX_FLOOR_COUNT`, `ACTION_TYPES`, `ACTOR_FIELDS`, `ActorFields`; `publicState`, `emitState`; `MeetingPacketInfo`, `MeetingPerson`, `findMeetingPacket`, `findPerson`, `findOrgPeople`, `countRosterVoters`, `agendaFromPacket`, `stateFromPacket`, `savePresidingOfficer`, `recordMeetingTimes`; `deriveMeetingRole`, `roleChanges`, `RoleChange`, `updateSocketRoles`, `syncMeetingRoles`; `NO_MEETING`, `NAME_FIRST`, `DISPLAY_FOR_MEMBERS`, `handleRecoveredSocket`; `prepareAttendanceAction`; `PRESENCE_GRACE_MS`, `startGrace`, `cancelGrace`, `inGrace`; `markDeviceAbsent`, `handleDisconnect(socket, io, 'disconnect' | 'leave')`; `markDisconnectedMembersAbsent`, `scheduleReconcile`; `withDefaults`, `getOrCreateMeeting(code, initial)`; `CHAIR_NOT_MEMBER`, `ONE_QUORUM`, `canPreside`, `syncLiveRoles`; `resetLiveMeetings`, `liveSockets`, `FakeSocket`, `Broadcast`.
- **Placeholder scan:** no "TBD", no "similar to Task N"; every new file is given whole; every changed block is shown before and after or anchored to an exact line. `<timestamp>` in the migration's directory name is Prisma's, and `<id>` in the live check's expected output is the signed-in user's id, which depends on the database.
