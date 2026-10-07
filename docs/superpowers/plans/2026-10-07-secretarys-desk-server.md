# The Secretary's Desk (Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the secretary the paperwork around a meeting: bylaws turned from pasted text, Markdown, plain text or a Word document into sections in one step; search across the current bylaws; an amendment preview that keeps the old text; minutes that the app drafts at adjournment from a record that finally holds every disposition (mover, seconder, both parts of the vote, unanimous consent, withdrawals, motions that died, rulings, each ballot of an election, the approval of the last minutes), that a secretary edits and publishes, and that the next meeting approves, with or without corrections, from the chair's screen.

**Architecture:** Prisma gains `Organization.timeZone`, `MeetingPacket.location` and a `Minutes` model (one row per packet: Markdown, a status of draft, published or approved, and who did what when). In `shared/`, `parseBylaws` turns text into a section tree; the meeting state records what the minutes need and the log can't give (`CompletedMotion.seconder`, `disposition`, `decidedAt`, `agendaItemId`, `quorumPresent`; motions disposed of without a vote; `chairRulings`; each election's `ballots`; `minutesApproval` with its corrections; `previousMinutesId`; `quorumAtCallToOrder`; `attendedIds`), and the enricher stamps each decision with the server's clock (`at`, ISO) so the minutes can order and time them. `generateMeetingMinutes` groups every disposition under the agenda item it was made in, and `formatMinutesAsMarkdown(minutes, context)` writes it in the organization's time zone. On the server, two import routes (Word to text, and parsed sections to a version in one transaction), an organization search route, the amendment preview with the old text, five minutes routes, the draft written when `END_MEETING` is applied, the latest published minutes loaded into a meeting before it is called to order, and the minutes marked approved when the meeting approves them. `minutesService.ts` is deleted.

**Tech Stack:** Node 24, Express 5, Prisma 7 (`@prisma/adapter-pg`), zod 4, mammoth 1.13.0 (Word to HTML), jszip 3.10.2 (test fixtures only), Vitest 5, supertest.

---

**Design:** `docs/superpowers/specs/2026-10-07-secretarys-desk-design.md` (Phase C of `docs/mvp-roadmap.md`). This plan is the server and shared half. A client plan follows (`docs/superpowers/plans/2026-10-07-secretarys-desk-clients.md`) for the import screen, the print pages, the export menu, the amendment preview tab, header search, the minutes list and editor, the approval in the chair console, phone view and display, the time zone in Settings and on organization creation, the place on the schedule, and the Playwright scenarios. The names in "API this plan adds" and "Names used across tasks" are the client plan's contract.

**API this plan adds** (all under `/api`, all behind sign-in and the terms):

| Call                                                     | Rule                                   | Answer                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /documents/:docId/import/docx`                     | secretary                              | Raw body (`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` or `application/octet-stream`), at most 5 MB: `{ text }`, the document as text with `#` heading lines. 400 `{ error: NO_FILE }` without a body, 400 `{ error: NOT_A_DOCX }` for a file mammoth can't read, 413 over the limit. The file is never stored.  |
| `POST /documents/:docId/versions/import`                 | secretary                              | Body `{ effectiveDate?, notes?, sections: ParsedSection[] }` (at most 2,000 sections, 6 levels; JSON up to 2 MB): 201, the new version with `sectionCount`; it is made current, all in one transaction                                                                                                                                                      |
| `GET /organizations/:orgId/search?q=`                    | viewer                                 | `{ query, results: SearchHit[] }`: at most 20 sections of the current version of each of the organization's documents whose label, title or content contains `q` (2 to 200 characters, any case); `SearchHit` is `{ documentId, documentTitle, versionId, sectionId, numberLabel, title, snippet }`. 400 for a `q` under 2 characters                       |
| `GET /amendments/:id/preview` (changed)                  | viewer                                 | As before (`{ amendmentId, amendmentTitle, sections }`, each section with `modified`, `added`, `deleted`, `children`), and each section now carries `previous: { numberLabel, title, content } \| null`, its text before the amendment when it is modified or renumbered                                                                                    |
| `GET /organizations/:orgId/minutes`                      | viewer                                 | `MinutesSummary[]`, the latest meeting first: `{ id, status, generatedAt, updatedAt, publishedAt, approvedAt, packet: { id, robbieCode, title, scheduledFor } }`. Drafts only for secretaries and above                                                                                                                                                     |
| `GET /minutes/:id`                                       | viewer; a draft is 404 below secretary | `MinutesRecord`: `{ id, organizationId, packetId, status, body, generatedAt, updatedAt, publishedAt, approvedAt, corrections, packet: { id, robbieCode, title, scheduledFor, location }, organization: { id, name, timeZone }, updatedBy: { id, name } \| null, publishedBy: { id, name } \| null, approvedAtPacket: { id, title, scheduledFor } \| null }` |
| `PUT /minutes/:id`                                       | secretary                              | Body `{ body }` (Markdown, at most 200,000 characters; JSON up to 2 MB): the `MinutesRecord`; `updatedBy` is the user. 409 `{ error: MINUTES_APPROVED }` once approved                                                                                                                                                                                      |
| `POST /minutes/:id/publish`                              | secretary                              | The `MinutesRecord`, now `published` (publishing published minutes changes nothing). 409 `{ error: MINUTES_APPROVED }` once approved                                                                                                                                                                                                                        |
| `POST /minutes/:id/regenerate`                           | secretary                              | The `MinutesRecord` with the body written again from the meeting's live record. 409 `{ error: ONLY_DRAFTS_REGENERATE }` unless a draft, 409 `{ error: NO_MEETING_RECORD }` when the meeting has no live record                                                                                                                                              |
| `POST /organizations`, `PUT /organizations/:id`          | as before                              | Take `timeZone` (an IANA name, 400 for one the server doesn't know); organizations carry `timeZone` (default `America/Chicago`)                                                                                                                                                                                                                             |
| `POST /organizations/:orgId/packets`, `PUT /packets/:id` | as before                              | Take `location` (at most 500 characters; `null` clears it on update); packets, and the schedule's rows, carry `location`                                                                                                                                                                                                                                    |
| Socket: the state                                        |                                        | `previousMinutesId`, `minutesApproval: { corrections, timestamp, decidedAt?, agendaItemId? } \| null`, `quorumAtCallToOrder`, `chairRulings`, `attendedIds`; completed motions carry `seconder`, `disposition`, `decidedAt`, `agendaItemId`, `quorumPresent`; `currentElection.ballots`; officers carry `ballots`, `agendaItemId`, `decidedAt`              |
| Socket: `APPROVE_MINUTES { corrections? }`               | the chair and admins                   | Approves the previous minutes as read, or with the corrections (at most 2,000 characters); the server then marks the minutes in `previousMinutesId` approved                                                                                                                                                                                                |
| Socket: `SET_PREVIOUS_MINUTES { minutes, minutesId? }`   | server only (was admin)                | The server puts the organization's latest published minutes before a meeting not yet called to order                                                                                                                                                                                                                                                        |

**Conventions:**

- Work on a branch made from `main` once Phase B has merged: `git fetch origin && git switch -c feat/secretarys-desk origin/main`.
- Paths are from the repository root. Run commands from the repository root; commands for backend-node's own scripts start with `cd backend-node &&`. Use `&&` between commands, never `;`.
- Use Node 24. The system `node` is 22; put Node 24 first on the PATH in each shell, and check that `node --version` prints `v24.21.0`:

  ```bash
  export PATH=/tmp/claude-1000/-home-steve-workspace-robbie/943dc342-9d15-4cdf-b298-60456f7372f0/scratchpad/node24/node-v24.21.0-linux-x64/bin:$PATH
  ```

- Never point anything at port 5432 (another project's database; `backend-node/.env` points there). Integration tests and migrations use a throwaway Postgres on port 55432. Start it once, if `docker ps --filter name=robbie-ci-pg` doesn't list it, and bring its `robbie` database up to date:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate deploy
  ```

- Integration tests: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`; one file: append `-- <path>`. Unit tests: `npm run test:run -w backend-node` and `npm run test:run -w shared`; one file: `cd backend-node && npx vitest run src/__tests__/<name>.test.ts` or `cd shared && npx vitest run __tests__/<dir>/<name>.test.ts`.
- After any change under `shared/`, run `npm run build:shared` before type-checking or testing backend-node, frontend-unified or mobile: they read shared's `dist`. Every task that changes `shared/` type-checks the mobile app too (`npx tsc --noEmit -p mobile/tsconfig.json`): it must keep compiling, and nothing in this plan changes it.
- The Prisma client is generated into `backend-node/src/generated/prisma` (gitignored): `npm run db:generate` after a schema change, and import from `../generated/prisma/client.js`, never `@prisma/client`.
- The action union is exhaustive in four places: the reducer's switch, `PERMISSIONS` in `permissionGuard.ts`, the validator's switch, and `ACTOR_FIELDS` in `actionEnricher.ts`. This plan adds no action type; it adds fields to five and changes who may send `SET_PREVIOUS_MINUTES`.
- New `MeetingState` fields get a value in `initialState` and are read with `?? <empty>` in the reducer and the generator: a stored state gets them from `withDefaults`, but some shared tests build states without `initialState`.
- Before/after snippets show the code as it is when the task starts. Match a snippet by its text and keep the file's indentation.
- The snippets were written against `feat/in-the-room` at commit `de04b63`, while Phase B was still landing. If Phase B changed a file after that and a snippet no longer matches, read the file, make the change the step describes at the place it names, and keep Phase B's code; never undo it to make a snippet fit.
- Before each commit, run `npx prettier --write` on the TypeScript, JSON and Markdown files you changed (Prettier has no parser for `.prisma` or `.sql` files); CI checks formatting.
- `git add` only the paths each commit step lists (and `git rm` what a step deletes). Never run `git checkout`, `git stash` or `git reset`.
- Commit messages carry no `Co-Authored-By` or other attribution lines.
- No emdashes and American spelling in code, comments, copy and commit messages.
- Task 1 writes a migration file. A project hook asks for confirmation on migration files; confirm with the owner. The migration is used exactly as Prisma generates it: no hand edits. (The organization's time zone needs none: `@default("America/Chicago")` makes Prisma write `NOT NULL DEFAULT 'America/Chicago'`, which gives existing organizations that zone.) If an edit ever seems needed, stop and ask the owner first.
- Generate migrations against a fresh database made for the purpose, never the throwaway `robbie` database: `prisma migrate dev` refuses a database with tables its migrations don't know, and `robbie` has the live `meetings` table that the server creates outside Prisma. Apply migrations to `robbie` with `prisma migrate deploy`.
- The socket handlers are tested two ways: unit tests with mocked storage under `backend-node/src/__tests__`, and integration tests that run the real handlers against the database with fake sockets (`backend-node/src/__integration__/liveSockets.ts`).
- Every new route has a `requireRole` (or `signedInOnly`) rule; `routeCoverage.test.ts` fails without one. Its rule matrix goes in `describeRules` (`rules.ts`): 401 without a session, 404 for another organization's member, 403 just below the minimum, and the success status at the minimum.

---

## File structure

| File                                                                                                                         | Responsibility                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend-node/prisma/schema.prisma`, `prisma/migrations/<timestamp>_secretarys_desk/`                                        | `Organization.timeZone`, `MeetingPacket.location`, `MinutesStatus`, `Minutes`                                                                                                             |
| `backend-node/src/schemas/common.ts`, `organizations.ts`, `packets.ts`                                                       | `isTimeZone`, `timeZoneName`; `timeZone` on organizations; `location` on packets                                                                                                          |
| `backend-node/src/bylawyer/routes/organizations.ts`, `orgs/organizationService.ts`                                           | The time zone on create and update                                                                                                                                                        |
| `backend-node/src/bylawyer/routes/packets.ts`                                                                                | The place on create, update and in the schedule                                                                                                                                           |
| `shared/utils/bylawsParser.ts` (new), `shared/utils/index.ts`                                                                | `ParsedSection`, `parseBylaws`, `describeParsedBylaws`                                                                                                                                    |
| `backend-node/src/bylawyer/services/docxText.ts` (new)                                                                       | `DOCX_TYPES`, `DOCX_LIMIT`, `docxToText`, `htmlToImportText`                                                                                                                              |
| `backend-node/src/schemas/versions.ts`, `bylawyer/routes/versions.ts`                                                        | `importVersionBody`, `ImportedSection`; `POST /documents/:docId/import/docx`, `POST /documents/:docId/versions/import`                                                                    |
| `backend-node/src/app.ts`                                                                                                    | The Word document's raw body (5 MB) and the larger JSON bodies (2 MB), each read only after sign-in                                                                                       |
| `backend-node/src/bylawyer/services/search.ts` (new), `schemas/documents.ts`, `routes/documents.ts`                          | `snippetAround`, `searchOrganization`, `SearchHit`, `SEARCH_LIMIT`; `searchQuery`; `GET /organizations/:orgId/search`                                                                     |
| `backend-node/src/bylawyer/services/amendmentService.ts`                                                                     | `previous` on modified sections in the preview                                                                                                                                            |
| `shared/types/index.ts`, `shared/reducer/initialState.ts`                                                                    | `Disposition`, the record fields, `ChairRulingRecord`, `MinutesApprovalRecord`, the new state fields and action fields, `MinutesEntry`, `MinutesItem`, `MeetingMinutes`, `MinutesContext` |
| `shared/reducer/handlers/records.ts` (new)                                                                                   | `decisionContext`, `unvotedRecord`, `withAttended`                                                                                                                                        |
| `shared/reducer/handlers/*.ts` (lifecycle, member, attendance, motion, voting, consent, rule suspension, election, settings) | Recording each disposition, ruling, ballot, approval and attendance                                                                                                                       |
| `shared/constants/logMessages.ts`                                                                                            | `logMinutesApprovedWithCorrections`                                                                                                                                                       |
| `shared/utils/motionHistoryHelper.ts`                                                                                        | The history leaves out motions that never reached a vote, and shows no vote count for unanimous consent                                                                                   |
| `shared/utils/minutesGenerator.ts`                                                                                           | `generateMeetingMinutes`, `formatMinutesAsMarkdown(minutes, context)`, rewritten                                                                                                          |
| `backend-node/src/socket/actionEnricher.ts`, `actionValidator.ts`, `permissionGuard.ts`                                      | `CLOCKED_ACTIONS` and `at`; the corrections' length; `SET_PREVIOUS_MINUTES` server-only                                                                                                   |
| `frontend-unified/src/modules/meetings/utils/question.ts`                                                                    | `itemsDecided` counts the records, so unanimous consent isn't counted twice                                                                                                               |
| `backend-node/src/bylawyer/services/meetingMinutes.ts` (new)                                                                 | `minutesContext`, `writeMinutes`, `draftMinutesOnAdjournment`, `previousMinutesFor`, `markPreviousMinutesApproved`                                                                        |
| `backend-node/src/schemas/minutes.ts` (new), `bylawyer/routes/minutes.ts` (new), `routes/index.ts`                           | `updateMinutesBody`; `minutesRouter`, `MINUTES_APPROVED`, `ONLY_DRAFTS_REGENERATE`, `NO_MEETING_RECORD`                                                                                   |
| `backend-node/src/orgs/resolvers.ts`                                                                                         | `orgOfMinutes`                                                                                                                                                                            |
| `backend-node/src/bylawyer/services/minutesService.ts`                                                                       | Deleted (dead code; it had no tests)                                                                                                                                                      |
| `backend-node/src/socket/actionHandler.ts`, `joinHandler.ts`, `meetingPacket.ts`                                             | The draft at adjournment; approval marking; the previous minutes before the call to order; the packet's `id` in `MeetingPacketInfo`                                                       |
| `backend-node/src/demo/demoSeed.ts`                                                                                          | The time zone, the place, and the 2025 annual meeting's published minutes (packet `MAPLE25`)                                                                                              |
| `backend-node/src/__integration__/fixtures.ts`, `docx.ts` (new), new and changed tests                                       | Fixture minutes; a Word document built in memory                                                                                                                                          |
| `spec.md`, `CLAUDE.md`                                                                                                       | Milestones and project guidance (Task 10)                                                                                                                                                 |

---

### Task 1: The organization's time zone, the meeting's place, and the minutes table

**Files:**

- Modify: `backend-node/prisma/schema.prisma`
- Create: `backend-node/prisma/migrations/<timestamp>_secretarys_desk/migration.sql` (generated, unedited)
- Modify: `backend-node/src/schemas/common.ts`, `backend-node/src/schemas/organizations.ts`, `backend-node/src/schemas/packets.ts`, `backend-node/src/bylawyer/routes/organizations.ts`, `backend-node/src/orgs/organizationService.ts`, `backend-node/src/bylawyer/routes/packets.ts`
- Test: `backend-node/src/__integration__/organizations.test.ts`, `backend-node/src/__integration__/packets.test.ts`

The minutes give times in the organization's time zone (an IANA name such as `America/Chicago`). The web app will send the creator's browser zone when an organization is created; existing organizations and any created without one get `America/Chicago`. A packet gets a place (`location`), which the minutes print under the title; until now the scheduler asked for it in the description. The `Minutes` table arrives here too, so the whole schema change is one migration.

- [ ] **Step 1: Edit `backend-node/prisma/schema.prisma`**

In `model Organization`, replace:

<!-- prettier-ignore -->
```prisma
  quorumPercent  Int?
  quorumCount    Int? @default(3)

  documents Document[]
  meetings  Meeting[]
  members   OrganizationMember[]
  invites   OrganizationInvite[]
  packets   MeetingPacket[]
}
```

with:

<!-- prettier-ignore -->
```prisma
  quorumPercent  Int?
  quorumCount    Int? @default(3)
  // Where its meetings are held, as an IANA name: the minutes give times there
  timeZone       String @default("America/Chicago")

  documents Document[]
  meetings  Meeting[]
  members   OrganizationMember[]
  invites   OrganizationInvite[]
  packets   MeetingPacket[]
  minutes   Minutes[]
}
```

In `model MeetingPacket`, replace:

<!-- prettier-ignore -->
```prisma
  title          String?
  description    String?
  scheduledFor   DateTime?
```

with:

<!-- prettier-ignore -->
```prisma
  title          String?
  description    String?
  // Where the meeting is held
  location       String?
  scheduledFor   DateTime?
```

and replace:

<!-- prettier-ignore -->
```prisma
  attachments  Attachment[]
  agendaItems  MeetingAgendaItem[]

  @@index([organizationId])
}
```

with:

<!-- prettier-ignore -->
```prisma
  attachments  Attachment[]
  agendaItems  MeetingAgendaItem[]
  // Its own minutes, and the minutes it approved
  minutes          Minutes?  @relation("MeetingMinutes")
  minutesApproved  Minutes[] @relation("MinutesApprovedAt")

  @@index([organizationId])
}
```

(The first `@@index([organizationId])` after `agendaItems  MeetingAgendaItem[]` is the packet's; `MeetingAgendaItem` has `@@index([packetId, position])`.)

In `model User`, replace:

<!-- prettier-ignore -->
```prisma
  amendments  Amendment[]
  chairing    MeetingPacket[]
}
```

with:

<!-- prettier-ignore -->
```prisma
  amendments  Amendment[]
  chairing    MeetingPacket[]
  minutesUpdated   Minutes[] @relation("MinutesUpdatedBy")
  minutesPublished Minutes[] @relation("MinutesPublishedBy")
}
```

At the end of the file, append:

<!-- prettier-ignore -->
```prisma

// A meeting's minutes go from the app's draft to published (members can read them, and the next
// meeting is asked to approve them) to approved
enum MinutesStatus {
  draft
  published
  approved
}

// The minutes of a scheduled meeting: Markdown that the app drafts at adjournment and a secretary
// edits. One per packet.
model Minutes {
  id                 String        @id @default(uuid())
  organizationId     String
  packetId           String        @unique
  status             MinutesStatus @default(draft)
  body               String
  generatedAt        DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  updatedById        Int?
  publishedAt        DateTime?
  publishedById      Int?
  approvedAt         DateTime?
  // The meeting that approved them, and the corrections it made
  approvedAtPacketId String?
  corrections        String?

  organization     Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  packet           MeetingPacket  @relation("MeetingMinutes", fields: [packetId], references: [id], onDelete: Cascade)
  approvedAtPacket MeetingPacket? @relation("MinutesApprovedAt", fields: [approvedAtPacketId], references: [id], onDelete: SetNull)
  updatedBy        User?          @relation("MinutesUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  publishedBy      User?          @relation("MinutesPublishedBy", fields: [publishedById], references: [id], onDelete: SetNull)

  @@index([organizationId, status])
}
```

Then run `cd backend-node && npx prisma format` and expect "Formatted prisma/schema.prisma". It may realign the columns of the blocks above; keep what it writes.

- [ ] **Step 2: Generate the migration without applying it**

Generate it against a fresh database (see Conventions), then drop that database. `DIRECT_URL` must be set explicitly: `prisma.config.ts` loads `.env`, which would otherwise supply the developer database on 5432.

Run:

```bash
docker exec robbie-ci-pg createdb -U postgres robbie_migrate
cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate npx prisma migrate deploy && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie_migrate npx prisma migrate dev --create-only --name secretarys_desk
docker exec robbie-ci-pg dropdb -U postgres robbie_migrate
```

Expected: `All migrations have been successfully applied.` (the existing five, to the fresh database), then `Prisma Migrate created the following migration without applying it <timestamp>_secretarys_desk`. Read the file: it is the whole change and needs no edit. It should hold, in Prisma's order, a `CREATE TYPE "MinutesStatus" AS ENUM ('draft', 'published', 'approved')`, `ALTER TABLE "MeetingPacket" ADD COLUMN "location" TEXT`, `ALTER TABLE "Organization" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago'`, `CREATE TABLE "Minutes"` with the thirteen columns above (`"status" "MinutesStatus" NOT NULL DEFAULT 'draft'`, `"generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`), the unique index `Minutes_packetId_key`, the index `Minutes_organizationId_status_idx`, and five foreign keys (`organizationId` and `packetId` `ON DELETE CASCADE`; `approvedAtPacketId`, `updatedById` and `publishedById` `ON DELETE SET NULL`). If anything else appears (a change to a table this task doesn't touch), stop: the schema and the migrations have drifted, and the owner decides.

- [ ] **Step 3: Apply it to the throwaway database and regenerate the client**

Run:

```bash
cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate deploy && npm run db:generate && npx tsc --noEmit -p .
```

Expected: `Applying migration <timestamp>_secretarys_desk`, `All migrations have been successfully applied.`, `Generated Prisma Client`, and a clean type-check.

- [ ] **Step 4: Write the failing tests**

In `backend-node/src/__integration__/organizations.test.ts`, insert before `it('changes only the name and description', async () => {`:

<!-- prettier-ignore -->
```ts
  it("keep their meetings in the creator's time zone, or Chicago's without one", async () => {
    const ann = await signIn('ann@example.org');
    const denver = await call('post', '/api/organizations', {
      cookie: ann.cookie,
      body: { name: 'Garden Club', timeZone: 'America/Denver' },
    });
    expect(denver.status).toBe(201);
    expect(denver.body.timeZone).toBe('America/Denver');

    const plain = await call('post', '/api/organizations', {
      cookie: ann.cookie,
      body: { name: 'Book Club' },
    });
    expect(plain.body.timeZone).toBe('America/Chicago');

    // Organizations made before there was a time zone got Chicago's from the migration
    const read = await call('get', `/api/organizations/${f.orgA.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(read.body.timeZone).toBe('America/Chicago');
  });

  it('change their time zone, only to one the server knows', async () => {
    const put = (timeZone: string) =>
      call('put', `/api/organizations/${f.orgA.id}`, {
        cookie: f.users.admin.cookie,
        body: { timeZone },
      });
    const paris = await put('Europe/Paris');
    expect(paris.status).toBe(200);
    expect(paris.body.timeZone).toBe('Europe/Paris');

    for (const timeZone of ['Mars/Olympus', '', 'America/Chicago; DROP TABLE']) {
      expect((await put(timeZone)).status, timeZone).toBe(400);
    }
    const created = await call('post', '/api/organizations', {
      cookie: f.users.member.cookie,
      body: { name: 'Nowhere Club', timeZone: 'Nowhere/Land' },
    });
    expect(created.status).toBe(400);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: f.orgA.id } });
    expect(org.timeZone).toBe('Europe/Paris');
  });


```

In `backend-node/src/__integration__/packets.test.ts`, insert before `it('are no longer created without an organization', async () => {`:

<!-- prettier-ignore -->
```ts
  it('record where the meeting is held', async () => {
    const cookie = f.users.secretary.cookie;
    const created = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie,
      body: { robbieCode: 'NEW001', location: 'Maple Grove Clubhouse' },
    });
    expect(created.status).toBe(201);
    expect(created.body.location).toBe('Maple Grove Clubhouse');

    const moved = await call('put', `/api/packets/${created.body.id}`, {
      cookie,
      body: { location: 'The pool deck' },
    });
    expect(moved.body.location).toBe('The pool deck');

    const unchanged = await call('put', `/api/packets/${created.body.id}`, {
      cookie,
      body: { title: 'Pool meeting' },
    });
    expect(unchanged.body.location).toBe('The pool deck');

    const cleared = await call('put', `/api/packets/${created.body.id}`, {
      cookie,
      body: { location: null },
    });
    expect(cleared.body.location).toBeNull();

    const tooLong = await call('post', `/api/organizations/${f.orgA.id}/packets`, {
      cookie,
      body: { robbieCode: 'NEW002', location: 'x'.repeat(501) },
    });
    expect(tooLong.status).toBe(400);
  });


```

In the same file, in `it('are listed for the organization, meetings not yet adjourned first', ...)`, replace:

```ts
      description: null,
      scheduledFor: '2026-11-01T00:00:00.000Z',
```

with:

```ts
      description: null,
      location: null,
      scheduledFor: '2026-11-01T00:00:00.000Z',
```

- [ ] **Step 5: Run them to see them fail**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/organizations.test.ts src/__integration__/packets.test.ts`
Expected: FAIL. zod drops `timeZone` and `location` (the organization is created and updated in Chicago, the bad zones are accepted, the packet has no place), and the schedule's rows have no `location`.

- [ ] **Step 6: The time zone in the request schemas**

In `backend-node/src/schemas/common.ts`, add after the `dateString` export:

```ts
/** Whether the runtime knows this IANA time zone name (America/Chicago, Europe/Paris) */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone name the server can format times in */
export const timeZoneName = z
  .string()
  .min(1)
  .max(64)
  .refine(isTimeZone, { message: 'Unknown time zone' });
```

In `backend-node/src/schemas/organizations.ts`, replace:

```ts
import { z } from 'zod';

export const createOrganizationBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional(),
});
```

with:

```ts
import { z } from 'zod';
import { timeZoneName } from './common.js';

export const createOrganizationBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional(),
  // The creator's time zone; America/Chicago without one
  timeZone: timeZoneName.optional(),
});
```

and replace:

```ts
    quorumCount: z.number().int().min(1).max(1_000_000).optional(),
  })
```

with:

```ts
    quorumCount: z.number().int().min(1).max(1_000_000).optional(),
    timeZone: timeZoneName.optional(),
  })
```

Then change the comment above `updateOrganizationBody` to:

```ts
// The name, the description, the attendance settings and the time zone change here; zod drops
// any other field. Setting the quorum one way clears the other (see PUT /organizations/:id).
```

- [ ] **Step 7: Store the time zone**

In `backend-node/src/orgs/organizationService.ts`, replace:

```ts
  data: { name: string; slug: string; description?: string },
```

with:

```ts
  data: { name: string; slug: string; description?: string; timeZone?: string },
```

In `backend-node/src/bylawyer/routes/organizations.ts`, replace:

```ts
const { name, slug: providedSlug, description } = req.body;
```

with:

```ts
const { name, slug: providedSlug, description, timeZone } = req.body;
```

and:

```ts
const org = await createOwnedOrganization(req.user!.id, { name, slug, description });
```

with:

```ts
const org = await createOwnedOrganization(req.user!.id, {
  name,
  slug,
  description,
  timeZone,
});
```

and in `PUT /organizations/:id`, replace:

```ts
const { name, description, eligibleVoters, quorumPercent, quorumCount } = req.body;
const data: Prisma.OrganizationUpdateInput = { name, description, eligibleVoters };
```

with:

```ts
const { name, description, eligibleVoters, quorumPercent, quorumCount, timeZone } = req.body;
const data: Prisma.OrganizationUpdateInput = {
  name,
  description,
  eligibleVoters,
  timeZone,
};
```

Change the comment above that route to `// Update the organization's name, description, attendance settings and time zone. The quorum is a` (keeping its second line, `// percentage or a count: setting one clears the other.`).

- [ ] **Step 8: The meeting's place**

In `backend-node/src/schemas/packets.ts`, replace:

```ts
export const createPacketBody = z.object({
  robbieCode: meetingCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
```

with:

```ts
/** Where the meeting is held */
const location = z.string().max(500);

export const createPacketBody = z.object({
  robbieCode: meetingCode,
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  location: location.optional(),
```

and replace:

```ts
export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
```

with:

```ts
export const updatePacketBody = z.object({
  title: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  // null clears it
  location: location.nullable().optional(),
```

In `backend-node/src/bylawyer/routes/packets.ts`, in `GET /organizations/:orgId/packets`, replace:

```ts
        description: true,
        scheduledFor: true,
        chairUserId: true,
```

with:

```ts
        description: true,
        location: true,
        scheduledFor: true,
        chairUserId: true,
```

In the `POST /api/organizations/:orgId/packets` comment, change the `Body:` line to ` * Body: { robbieCode, title?, description?, location?, scheduledFor?, chairUserId? }`, and in its handler replace:

```ts
const { robbieCode, title, description, scheduledFor } = req.body;
```

with:

```ts
const { robbieCode, title, description, location, scheduledFor } = req.body;
```

and:

```ts
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
        include: packetInclude,
```

with:

```ts
          title,
          description,
          location,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
        include: packetInclude,
```

In the `PUT /api/packets/:id` comment, change the `Body:` line to ` * Body: { title?, description?, location?, scheduledFor?, chairUserId? }`, and in its handler replace:

```ts
const { title, description, scheduledFor, chairUserId } = req.body;
```

with:

```ts
const { title, description, location, scheduledFor, chairUserId } = req.body;
```

and:

```ts
        data: {
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
        include: {
```

with:

```ts
        data: {
          title,
          description,
          location,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
        include: {
```

`GET /packets/:robbieCode` and the create and update responses return every column of the packet, so they carry `location` with no further change.

- [ ] **Step 9: Run them to see them pass**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/organizations.test.ts src/__integration__/packets.test.ts`
Expected: all pass, the three new cases among them.

- [ ] **Step 10: Type-check and run everything**

Run: `cd backend-node && npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass.

- [ ] **Step 11: Commit**

```bash
npx prettier --write backend-node/src/schemas/common.ts backend-node/src/schemas/organizations.ts backend-node/src/schemas/packets.ts backend-node/src/bylawyer/routes/organizations.ts backend-node/src/orgs/organizationService.ts backend-node/src/bylawyer/routes/packets.ts backend-node/src/__integration__/organizations.test.ts backend-node/src/__integration__/packets.test.ts
git add backend-node/prisma/schema.prisma backend-node/prisma/migrations backend-node/src/schemas/common.ts backend-node/src/schemas/organizations.ts backend-node/src/schemas/packets.ts backend-node/src/bylawyer/routes/organizations.ts backend-node/src/orgs/organizationService.ts backend-node/src/bylawyer/routes/packets.ts backend-node/src/__integration__/organizations.test.ts backend-node/src/__integration__/packets.test.ts
git commit -m "feat(desk): the organization's time zone, the meeting's place, and the minutes table

Organizations keep their meetings' time zone (an IANA name, America/Chicago
by default and for existing organizations); it is set on creation and by
admins. A packet records where the meeting is held. The Minutes table holds
one meeting's minutes as Markdown, with their status (draft, published,
approved) and who did what when."
```

---

### Task 2: The bylaws parser

**Files:**

- Create: `shared/utils/bylawsParser.ts`
- Modify: `shared/utils/index.ts`
- Test: `shared/__tests__/utils/bylawsParser.test.ts`

One parser for every source: pasted text, a `.txt` or `.md` file, and a Word document, which the server turns into text with `#` lines for its headings (Task 3). It is pure, and the import screen calls it again whenever the secretary edits the text and presses "Parse again".

The rules, in the order the parser applies them:

- **Labeled headings.** At the start of a line (after any `#` marks and surrounding `**`), case-insensitively: `Article` with a Roman numeral, a number or a number word up to twenty (`Article IV`, `ARTICLE 4`, `Article Four`); `Section`, `Sec.` or `§` with a number (`Section 4.2`, `Sec. 4.2`, `§ 3`); or a bare decimal label of two or more parts followed by text (`4.2 Quorum`, `4.2.1 In Person`; a bare `4.` is not a label, so a numbered list in the text stays text). Labels are written the same way whatever the source: `Article IV`, `Article Four`, `Section 4.2` (also for `Sec.` and `§`), and bare decimals as they are.
- **Titles.** After the label, past an optional separator (a period, colon, hyphen, en dash or em dash), the rest of the line is a title when it reads like one (at most 10 words and 80 characters, the first word and every word longer than three letters capitalized), or a title and the start of the content when it is a short title, a period and more text (`Section 2.2 Voting Rights. Each lot has one vote.`). Otherwise it is content. A heading with nothing after its label takes the next non-blank line as its title when that line reads like a title and doesn't end with a period, comma or semicolon. An all-caps title is put in title case (`NAME AND PURPOSE` is `Name and Purpose`).
- **Nesting.** Articles are top level. A section goes under the current article; a decimal label nests under the open section whose label is its prefix (`4.2.1` under `4.2`). Sections before any article are top level.
- **Markdown headings** (`#` to `######`) are the structure only when no line has a label: each level nests under the one above it, the heading text is the title, and there is no label.
- **Content.** The lines between headings are the content of the nearest heading above them, with line breaks and paragraphs (blank lines) kept and runs of blank lines made one. Text before the first heading is a preamble: a first section with no label and no title.

`describeParsedBylaws` says what was found, for the review screen: "6 articles, 23 sections" (articles are the top-level sections labeled `Article`, sections are everything beneath them), "5 sections" when the top level isn't articles, ", and a preamble" when there is one, and "No headings found" when only a preamble was found.

- [ ] **Step 1: Write the failing test**

Create `shared/__tests__/utils/bylawsParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeParsedBylaws, parseBylaws, type ParsedSection } from '../../utils/index.js';

/** A parsed section, written compactly */
function s(
  numberLabel: string | null,
  title: string | null,
  content = '',
  children: ParsedSection[] = [],
): ParsedSection {
  return { numberLabel, title, content, children };
}

const lines = (...text: string[]) => text.join('\n');

describe('parseBylaws', () => {
  it.each<[string, string, ParsedSection[]]>([
    [
      'articles with titles on their own lines, and decimal sections',
      lines(
        'Article I',
        'Name and Purpose',
        '',
        'Section 1.1 Name',
        'The name of this corporation is Maple Grove Homeowners Association, Inc.',
        '',
        'Section 1.2 Purpose',
        'The Association maintains the common areas.',
        '',
        'Article II',
        'Membership and Voting Rights',
        '',
        'Section 2.1 Membership',
        'Every owner of a lot is a member.',
      ),
      [
        s('Article I', 'Name and Purpose', '', [
          s(
            'Section 1.1',
            'Name',
            'The name of this corporation is Maple Grove Homeowners Association, Inc.',
          ),
          s('Section 1.2', 'Purpose', 'The Association maintains the common areas.'),
        ]),
        s('Article II', 'Membership and Voting Rights', '', [
          s('Section 2.1', 'Membership', 'Every owner of a lot is a member.'),
        ]),
      ],
    ],
    [
      'all caps, a title after a dash, and section titles ending in a period',
      lines(
        'ARTICLE I - NAME AND PURPOSE',
        'SECTION 1. NAME. The name of this corporation is Maple Grove.',
        'SECTION 2. PURPOSE. The Association maintains the common areas.',
        'ARTICLE II - BOARD OF DIRECTORS',
        'SECTION 1. NUMBER. The Board has five directors.',
      ),
      [
        s('Article I', 'Name and Purpose', '', [
          s('Section 1', 'Name', 'The name of this corporation is Maple Grove.'),
          s('Section 2', 'Purpose', 'The Association maintains the common areas.'),
        ]),
        s('Article II', 'Board of Directors', '', [
          s('Section 1', 'Number', 'The Board has five directors.'),
        ]),
      ],
    ],
    [
      'number words and a colon, with text right under the article',
      lines(
        'Article One: Name',
        'The name is Maple Grove.',
        'Article Two: Members',
        'Each lot has one vote.',
      ),
      [
        s('Article One', 'Name', 'The name is Maple Grove.'),
        s('Article Two', 'Members', 'Each lot has one vote.'),
      ],
    ],
    [
      'Sec. and the section sign',
      lines(
        'Article 4. Meetings',
        'Sec. 4.1 Annual Meeting. The annual meeting is held each year.',
        '\u00a7 4.2 Quorum',
        'Twenty percent of the votes is a quorum.',
      ),
      [
        s('Article 4', 'Meetings', '', [
          s('Section 4.1', 'Annual Meeting', 'The annual meeting is held each year.'),
          s('Section 4.2', 'Quorum', 'Twenty percent of the votes is a quorum.'),
        ]),
      ],
    ],
    [
      'bare decimal labels, nested by their numbers',
      lines(
        '4.1 Annual Meeting',
        'The annual meeting is held in March.',
        '4.2 Quorum',
        '4.2.1 In Person. Members present in person count.',
        '4.2.2 By Proxy. Members present by proxy count.',
        '4.3 Notice',
        'Notice is mailed ten days ahead.',
      ),
      [
        s('4.1', 'Annual Meeting', 'The annual meeting is held in March.'),
        s('4.2', 'Quorum', '', [
          s('4.2.1', 'In Person', 'Members present in person count.'),
          s('4.2.2', 'By Proxy', 'Members present by proxy count.'),
        ]),
        s('4.3', 'Notice', 'Notice is mailed ten days ahead.'),
      ],
    ],
    [
      'a sentence after a bare article heading, which is text and not a title',
      lines('ARTICLE III', 'The Board manages the affairs of the Association.'),
      [s('Article III', null, 'The Board manages the affairs of the Association.')],
    ],
    [
      'text before the first heading, as a preamble',
      lines(
        'BYLAWS OF MAPLE GROVE HOMEOWNERS ASSOCIATION, INC.',
        '',
        'Adopted March 15, 2024.',
        '',
        'Article I',
        'Name',
      ),
      [
        s(
          null,
          null,
          'BYLAWS OF MAPLE GROVE HOMEOWNERS ASSOCIATION, INC.\n\nAdopted March 15, 2024.',
        ),
        s('Article I', 'Name'),
      ],
    ],
    [
      'Markdown headings when no line has a label',
      lines(
        '# Name',
        '',
        'The club is the Garden Club.',
        '',
        '# Members',
        '',
        '## Dues',
        '',
        'Dues are $20 a year.',
        '',
        '## Meetings',
        '',
        'The club meets monthly.',
      ),
      [
        s(null, 'Name', 'The club is the Garden Club.'),
        s(null, 'Members', '', [
          s(null, 'Dues', 'Dues are $20 a year.'),
          s(null, 'Meetings', 'The club meets monthly.'),
        ]),
      ],
    ],
    [
      'Markdown headings that carry labels, as a Word document converts',
      lines(
        '## Article I - Name',
        '',
        '### Section 1.1 Name of the Association',
        '',
        'The name is Maple Grove.',
      ),
      [
        s('Article I', 'Name', '', [
          s('Section 1.1', 'Name of the Association', 'The name is Maple Grove.'),
        ]),
      ],
    ],
    [
      'paragraphs and line breaks kept, and runs of blank lines made one',
      lines(
        'Section 1 Assessments',
        'Each lot pays an annual assessment.',
        '',
        '',
        '',
        'The Board sets it each year,',
        'in the budget.   ',
      ),
      [
        s(
          'Section 1',
          'Assessments',
          'Each lot pays an annual assessment.\n\nThe Board sets it each year,\nin the budget.',
        ),
      ],
    ],
    [
      'an em dash or an en dash between the label and the title',
      lines(
        'Article III \u2014 Board of Directors',
        'Section 3.1 \u2013 Number. The Board has five directors.',
      ),
      [
        s('Article III', 'Board of Directors', '', [
          s('Section 3.1', 'Number', 'The Board has five directors.'),
        ]),
      ],
    ],
    [
      'a section that starts with a sentence, without a title',
      'Section 2.4 A member may vote by written proxy filed with the Secretary.',
      [s('Section 2.4', null, 'A member may vote by written proxy filed with the Secretary.')],
    ],
    [
      'bold labels and Windows line endings',
      '**Article I**\r\nName\r\n\r\n**Section 1.1 Name**\r\nThe name is Maple Grove.\r\n',
      [s('Article I', 'Name', '', [s('Section 1.1', 'Name', 'The name is Maple Grove.')])],
    ],
    [
      'plain text without headings, as one preamble',
      lines('We meet on Tuesdays.', 'Dues are $20.'),
      [s(null, null, 'We meet on Tuesdays.\nDues are $20.')],
    ],
    ['nothing at all', '  \n\n  ', []],
  ])('reads %s', (_shape, text, expected) => {
    expect(parseBylaws(text)).toEqual(expected);
  });
});

describe('describeParsedBylaws', () => {
  it('counts articles and the sections beneath them', () => {
    const parsed = parseBylaws(
      lines(
        'Article I',
        'Name',
        'Section 1.1 Name',
        'Section 1.2 Purpose',
        'Article II',
        'Members',
        'Section 2.1 Membership',
      ),
    );
    expect(describeParsedBylaws(parsed)).toBe('2 articles, 3 sections');
  });

  it('counts sections when the top level is not articles', () => {
    const parsed = parseBylaws(lines('4.1 Annual Meeting', '4.2 Quorum', '4.2.1 In Person'));
    expect(describeParsedBylaws(parsed)).toBe('3 sections');
  });

  it('says one of a kind, and mentions a preamble', () => {
    const parsed = parseBylaws(lines('Bylaws of the Garden Club', '', 'Article I', 'Name'));
    expect(describeParsedBylaws(parsed)).toBe('1 article, and a preamble');
  });

  it('says when it found no headings', () => {
    expect(describeParsedBylaws(parseBylaws('We meet on Tuesdays.'))).toBe('No headings found');
    expect(describeParsedBylaws([])).toBe('No headings found');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd shared && npx vitest run __tests__/utils/bylawsParser.test.ts`
Expected: FAIL: `parseBylaws` is not exported from `../../utils/index.js`.

- [ ] **Step 3: Create `shared/utils/bylawsParser.ts`**

```ts
/**
 * Bylaws as text to a section tree, the same way whatever the source: pasted text, a .txt or
 * .md file, or a Word document the server turned into text with its headings as # lines. Pure:
 * the import screen runs it again whenever the text changes.
 */

/** A section found in the text, before it is saved */
export interface ParsedSection {
  numberLabel: string | null;
  title: string | null;
  content: string;
  children: ParsedSection[];
}

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

// Between a label and a title on its line: a period, a colon, a hyphen, an en dash or an em dash
const SEPARATOR = String.raw`(?:[.:\-\u2013\u2014]\s*)?`;

const ARTICLE = new RegExp(
  String.raw`^article\s+([ivxlcdm]+|\d+|${NUMBER_WORDS.join('|')})\b\.?\s*${SEPARATOR}(.*)$`,
  'i',
);
const SECTION = new RegExp(
  String.raw`^(?:section|sec\.?|\u00a7)\s*(\d+(?:\.\d+)*)\.?\s*${SEPARATOR}(.*)$`,
  'i',
);
// Two or more parts, so a numbered list ("1. The Board...") stays text
const DECIMAL = /^(\d+(?:\.\d+)+)\.?\s+(\S.*)$/;
const MARKDOWN = /^(#{1,6})\s+(.+)$/;

// Lower case in a title, unless first
const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

type Heading =
  | { kind: 'article'; label: string; rest: string }
  | { kind: 'section'; label: string; key: string; rest: string }
  | { kind: 'markdown'; level: number; text: string };

/** A line's text without surrounding bold marks */
function unwrap(text: string): string {
  return text.replace(/^(\*\*|__)(.+)\1$/, '$2').trim();
}

/** An article's number as the label writes it: IV, 4 or Four */
function numeral(value: string): string {
  if (/^\d+$/.test(value)) return value;
  const word = value.toLowerCase();
  if (NUMBER_WORDS.includes(word)) return word.charAt(0).toUpperCase() + word.slice(1);
  return value.toUpperCase();
}

/** An article or section heading, with or without # marks, or null */
function labeledHeading(line: string): Heading | null {
  const markdown = MARKDOWN.exec(line);
  const text = unwrap(markdown ? markdown[2] : line);
  const article = ARTICLE.exec(text);
  if (article)
    return { kind: 'article', label: `Article ${numeral(article[1])}`, rest: article[2] };
  const section = SECTION.exec(text);
  if (section) {
    return { kind: 'section', label: `Section ${section[1]}`, key: section[1], rest: section[2] };
  }
  const decimal = DECIMAL.exec(text);
  if (decimal) return { kind: 'section', label: decimal[1], key: decimal[1], rest: decimal[2] };
  return null;
}

/** A Markdown heading, or null */
function markdownHeading(line: string): Heading | null {
  const markdown = MARKDOWN.exec(line);
  return markdown
    ? { kind: 'markdown', level: markdown[1].length, text: unwrap(markdown[2]) }
    : null;
}

/**
 * Whether text reads like a title: at most 10 words and 80 characters, the first word and every
 * word longer than three letters capitalized ("Name and Purpose", "RULES OF ORDER")
 */
function isTitleLike(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 10 || text.length > 80) return false;
  return words.every(
    (word, index) => (index > 0 && word.length <= 3) || /^[A-Z0-9("'\u201c]/.test(word),
  );
}

/** A title without a closing period or colon, and in title case if it was all capitals */
function tidyTitle(text: string): string {
  const title = text.trim().replace(/[.:]$/, '').trim();
  if (/[a-z]/.test(title) || !/[A-Z]/.test(title)) return title;
  return title
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/** The rest of a heading's line: a title, a title and the start of the content, or content */
function splitTitle(rest: string): { title: string | null; content: string } {
  const text = rest.trim();
  if (!text) return { title: null, content: '' };
  const sentence = /^([^.]+)\.\s+(\S[\s\S]*)$/.exec(text);
  if (sentence && isTitleLike(sentence[1])) {
    return { title: tidyTitle(sentence[1]), content: sentence[2] };
  }
  const whole = text.replace(/[.:]$/, '');
  if (isTitleLike(whole)) return { title: tidyTitle(whole), content: '' };
  return { title: null, content: text };
}

/** Lines as content: trailing spaces gone, runs of blank lines made one, trimmed */
function tidyContent(contentLines: string[]): string {
  return contentLines
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function newSection(numberLabel: string | null, title: string | null): ParsedSection {
  return { numberLabel, title, content: '', children: [] };
}

/** The sections of a bylaws text (see the rules in the plan's Task 2 and the tests) */
export function parseBylaws(text: string): ParsedSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // Labels, wherever they appear, decide the structure; # headings only without them
  const labeled = lines.some((line) => labeledHeading(line.trim()) !== null);
  const headingOf = labeled ? labeledHeading : markdownHeading;

  const roots: ParsedSection[] = [];
  const bodies = new Map<ParsedSection, string[]>();
  const preamble: string[] = [];
  let current: ParsedSection | null = null;
  let awaitingTitle: ParsedSection | null = null;
  // Labeled structure: the open article, and the open sections with their decimal keys
  let article: ParsedSection | null = null;
  const openSections: Array<{ node: ParsedSection; key: string }> = [];
  // Markdown structure: the open headings with their levels
  const openLevels: Array<{ node: ParsedSection; level: number }> = [];

  for (const raw of lines) {
    const line = raw.trim();

    // A heading with nothing after its label takes the next line as its title, if it is one
    if (awaitingTitle) {
      if (!line) continue;
      const titleLine = unwrap(line);
      if (!headingOf(line) && !/[.;,]$/.test(titleLine) && isTitleLike(titleLine)) {
        awaitingTitle.title = tidyTitle(titleLine);
        awaitingTitle = null;
        continue;
      }
      awaitingTitle = null;
    }

    const heading = headingOf(line);
    if (!heading) {
      // In a labeled text, a # line without a label is text: keep its words, not its marks
      const plain = labeled ? (MARKDOWN.exec(line)?.[2] ?? raw.trimEnd()) : raw.trimEnd();
      if (current) bodies.get(current)!.push(plain);
      else preamble.push(plain);
      continue;
    }

    if (heading.kind === 'markdown') {
      const node = newSection(null, tidyTitle(heading.text));
      bodies.set(node, []);
      while (openLevels.length > 0 && openLevels[openLevels.length - 1].level >= heading.level) {
        openLevels.pop();
      }
      const parent = openLevels[openLevels.length - 1]?.node;
      (parent ? parent.children : roots).push(node);
      openLevels.push({ node, level: heading.level });
      current = node;
      continue;
    }

    const { title, content } = splitTitle(heading.rest);
    const node = newSection(heading.label, title);
    bodies.set(node, content ? [content] : []);
    if (heading.kind === 'article') {
      roots.push(node);
      article = node;
      openSections.length = 0;
    } else {
      // A decimal label nests under the open section whose label is its prefix
      while (
        openSections.length > 0 &&
        !heading.key.startsWith(`${openSections[openSections.length - 1].key}.`)
      ) {
        openSections.pop();
      }
      const parent = openSections[openSections.length - 1]?.node ?? article;
      (parent ? parent.children : roots).push(node);
      openSections.push({ node, key: heading.key });
    }
    current = node;
    if (!title && !content) awaitingTitle = node;
  }

  const finish = (node: ParsedSection) => {
    node.content = tidyContent(bodies.get(node) ?? []);
    node.children.forEach(finish);
  };
  roots.forEach(finish);
  const intro = tidyContent(preamble);
  return intro ? [{ ...newSection(null, null), content: intro }, ...roots] : roots;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function countAll(sections: ParsedSection[]): number {
  return sections.reduce((sum, section) => sum + 1 + countAll(section.children), 0);
}

/**
 * What the parser found, for the review screen: "6 articles, 23 sections" when the top level is
 * articles (the sections are everything beneath them), otherwise "5 sections"; ", and a
 * preamble" when the text has one
 */
export function describeParsedBylaws(sections: ParsedSection[]): string {
  const preamble =
    sections.length > 0 && sections[0].numberLabel === null && sections[0].title === null;
  const top = preamble ? sections.slice(1) : sections;
  if (top.length === 0) return 'No headings found';
  const nested = top.reduce((sum, section) => sum + countAll(section.children), 0);
  const articles = top.filter((section) => /^article\b/i.test(section.numberLabel ?? '')).length;
  const found =
    articles === top.length
      ? [plural(articles, 'article'), ...(nested > 0 ? [plural(nested, 'section')] : [])].join(', ')
      : plural(top.length + nested, 'section');
  return preamble ? `${found}, and a preamble` : found;
}
```

- [ ] **Step 4: Export it from `shared/utils/index.ts`**

Append:

```ts
export { parseBylaws, describeParsedBylaws, type ParsedSection } from './bylawsParser.js';
```

- [ ] **Step 5: Run it to see it pass, and build shared**

Run: `cd shared && npx vitest run __tests__/utils/bylawsParser.test.ts && cd .. && npm run build:shared`
Expected: 19 passed (15 shapes and 4 descriptions), then a clean build.

If a shape fails, read the rule in this task's introduction that it exercises and fix the parser to follow it; the expected trees are the rules.

- [ ] **Step 6: Run everything that reads shared**

Run: `npm run test:run -w shared && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json`
Expected: all pass, all clean.

- [ ] **Step 7: Commit**

```bash
npx prettier --write shared/utils/bylawsParser.ts shared/utils/index.ts shared/__tests__/utils/bylawsParser.test.ts
git add shared/utils/bylawsParser.ts shared/utils/index.ts shared/__tests__/utils/bylawsParser.test.ts
git commit -m "feat(desk): parse bylaws text into articles and sections

parseBylaws reads articles (Roman numerals, numbers, number words), sections
(Section, Sec., the section sign, bare decimals nested by their numbers),
titles on the label's line or the next one, and Markdown headings when the
text has no labels. Text before the first heading is a preamble.
describeParsedBylaws counts what it found for the review screen."
```

---

### Task 3: Importing bylaws: a Word document to text, and parsed sections to a version

**Files:**

- Modify: `backend-node/package.json`, `package-lock.json` (mammoth, and jszip for tests)
- Create: `backend-node/src/bylawyer/services/docxText.ts`
- Modify: `backend-node/src/schemas/versions.ts`, `backend-node/src/bylawyer/routes/versions.ts`, `backend-node/src/app.ts`
- Create: `backend-node/src/__integration__/docx.ts`, `backend-node/src/__integration__/import.test.ts`, `backend-node/src/__tests__/docxText.test.ts`
- Modify: `backend-node/src/__integration__/routeCoverage.test.ts`

The Word route reads the file with mammoth into HTML and turns the HTML into text, keeping each heading paragraph as a `#` line (one `#` per heading level) so the parser has the structure Word had; the file is read from memory and never stored. Its body is raw, at most 5 MB, read only after the session and terms are checked, like uploads. The version route takes the tree the client parsed (and the secretary corrected) and creates the version and all its sections in one transaction: one `createMany` with ids made on the server, so a parent and its children go in one statement. Its JSON may be larger than the app's 100 KB default, so it gets a 2 MB parser, also after sign-in.

- [ ] **Step 1: Install mammoth and jszip**

Run: `npm install mammoth@1.13.0 -w backend-node && npm install --save-dev jszip@3.10.2 -w backend-node`
Expected: `backend-node/package.json` lists `"mammoth": "^1.13.0"` under `dependencies` and `"jszip": "^3.10.2"` under `devDependencies`, and `package-lock.json` changes. mammoth ships its own types (`export = mammoth`, so it is imported as a default with the repository's `esModuleInterop`); so does jszip.

- [ ] **Step 2: Write the failing unit test**

Create `backend-node/src/__tests__/docxText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { htmlToImportText } from '../bylawyer/services/docxText.js';

describe('htmlToImportText', () => {
  it('keeps headings as # lines and paragraphs apart, without other markup', () => {
    const html =
      '<h1>Article I</h1><p>Name and Purpose</p><h2>Section 1.1</h2>' +
      '<p>The name is <strong>Maple Grove</strong>.</p>';
    expect(htmlToImportText(html)).toBe(
      '# Article I\n\nName and Purpose\n\n## Section 1.1\n\nThe name is Maple Grove.',
    );
  });

  it('decodes entities and keeps line breaks', () => {
    expect(htmlToImportText('<p>Dues &amp; fees&nbsp;are &#36;20<br />a year</p>')).toBe(
      'Dues & fees are $20\na year',
    );
  });

  it('puts list items on their own lines', () => {
    expect(htmlToImportText('<ul><li>One</li><li>Two</li></ul>')).toBe('One\nTwo');
  });

  it('turns nothing into nothing', () => {
    expect(htmlToImportText('')).toBe('');
  });
});
```

- [ ] **Step 3: Write the failing integration test, with a Word document made in memory**

Create `backend-node/src/__integration__/docx.ts`:

```ts
import JSZip from 'jszip';

/** A paragraph of a test Word document: a heading of level 1 or 2, or body text */
export interface DocxParagraph {
  text: string;
  heading?: 1 | 2;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// Word's built-in heading styles, by the names mammoth maps to h1 and h2
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
</w:styles>`;

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paragraphXml({ text, heading }: DocxParagraph): string {
  const style = heading ? `<w:pPr><w:pStyle w:val="Heading${heading}"/></w:pPr>` : '';
  return `<w:p>${style}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/** A minimal .docx with these paragraphs, built in memory (no binary fixture in the repository) */
export async function makeDocx(paragraphs: DocxParagraph[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
  zip.file('word/styles.xml', STYLES);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map(paragraphXml)
      .join('')}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** The header a browser sends with a .docx */
export const DOCX_HEADERS = {
  'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
```

Create `backend-node/src/__integration__/import.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { parseBylaws } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../db/prisma.js';
import { NOT_A_DOCX, NO_FILE } from '../bylawyer/services/docxText.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';
import { DOCX_HEADERS, makeDocx } from './docx.js';

const BYLAWS = [
  { text: 'Article I. Name and Purpose', heading: 1 as const },
  { text: 'Section 1.1 Name. The name is Maple Grove.' },
  { text: 'Article II. Members', heading: 2 as const },
  { text: 'Each lot has one vote & one voice.' },
];

let docx: Buffer;
beforeAll(async () => {
  docx = await makeDocx(BYLAWS);
});

const imported = {
  effectiveDate: '2026-03-15',
  notes: 'Pasted from the 2024 bylaws',
  sections: [
    {
      numberLabel: 'Article I',
      title: 'Name and Purpose',
      content: '',
      children: [
        { numberLabel: 'Section 1.1', title: 'Name', content: 'The name is A.', children: [] },
        {
          numberLabel: 'Section 1.2',
          title: 'Purpose',
          content: 'Gardens.\n\nAnd paths.',
          children: [{ numberLabel: '1.2.1', title: 'Paths', content: '', children: [] }],
        },
      ],
    },
    { numberLabel: 'Article II', title: 'Members', content: '', children: [] },
  ],
};

describeRules('import rules', [
  {
    method: 'post',
    route: '/documents/:docId/import/docx',
    path: (f) => `/api/documents/${f.doc}/import/docx`,
    body: () => docx,
    headers: () => DOCX_HEADERS,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/versions/import',
    path: (f) => `/api/documents/${f.doc}/versions/import`,
    body: () => imported,
    min: 'secretary',
    ok: 201,
  },
]);

describe('importing a Word document', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const send = (body: Buffer, headers: Record<string, string> = DOCX_HEADERS) =>
    call('post', `/api/documents/${f.doc}/import/docx`, {
      cookie: f.users.secretary.cookie,
      body,
      headers,
    });

  it('turns it into text with its headings as # lines, which the parser reads', async () => {
    const res = await send(docx);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text:
        '# Article I. Name and Purpose\n\nSection 1.1 Name. The name is Maple Grove.\n\n' +
        '## Article II. Members\n\nEach lot has one vote & one voice.',
    });
    expect(parseBylaws(res.body.text).map((s) => [s.numberLabel, s.title])).toEqual([
      ['Article I', 'Name and Purpose'],
      ['Article II', 'Members'],
    ]);
  });

  it('takes a file sent as plain bytes, as some browsers send a .docx', async () => {
    const res = await send(docx, { 'Content-Type': 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  it('refuses no file, and a file that is not a Word document', async () => {
    expect((await send(Buffer.alloc(0))).body).toEqual({ error: NO_FILE });
    const notWord = await send(Buffer.from('This is plain text, not a zip file.'));
    expect(notWord.status).toBe(400);
    expect(notWord.body).toEqual({ error: NOT_A_DOCX });
    // A type the route doesn't read leaves no body at all
    const text = await send(Buffer.from('Article I'), { 'Content-Type': 'text/plain' });
    expect(text.body).toEqual({ error: NO_FILE });
  });

  it('refuses a file over 5 MB', async () => {
    const res = await send(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it("doesn't read the file of someone who isn't signed in", async () => {
    const res = await call('post', `/api/documents/${f.doc}/import/docx`, {
      body: Buffer.alloc(5 * 1024 * 1024 + 1),
      headers: DOCX_HEADERS,
    });
    expect(res.status).toBe(401);
  });
});

describe('importing parsed sections', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const importSections = (body: object) =>
    call('post', `/api/documents/${f.doc}/versions/import`, {
      cookie: f.users.secretary.cookie,
      body,
    });

  it('makes them a new current version, in order and nested as given', async () => {
    const res = await importSections(imported);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      documentId: f.doc,
      versionNumber: 3,
      notes: 'Pasted from the 2024 bylaws',
      effectiveDate: '2026-03-15T00:00:00.000Z',
      sectionCount: 5,
    });

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    expect(doc.currentVersionId).toBe(res.body.id);

    const tree = await call('get', `/api/versions/${res.body.id}/tree`, {
      cookie: f.users.viewer.cookie,
    });
    const shape = (nodes: Array<Record<string, unknown>>): unknown[] =>
      nodes.map((n) => [
        n.position,
        n.numberLabel,
        n.title,
        n.content,
        shape(n.children as Array<Record<string, unknown>>),
      ]);
    expect(shape(tree.body)).toEqual([
      [
        0,
        'Article I',
        'Name and Purpose',
        null,
        [
          [0, 'Section 1.1', 'Name', 'The name is A.', []],
          [
            1,
            'Section 1.2',
            'Purpose',
            'Gardens.\n\nAnd paths.',
            [[0, '1.2.1', 'Paths', null, []]],
          ],
        ],
      ],
      [1, 'Article II', 'Members', null, []],
    ]);
  });

  it('leaves the old versions as they were', async () => {
    await importSections(imported);
    expect(await prisma.section.count({ where: { versionId: f.v2 } })).toBe(2);
    expect(await prisma.section.count({ where: { versionId: f.v1 } })).toBe(1);
  });

  it('saves nothing when a section is refused', async () => {
    const res = await importSections({
      sections: [{ numberLabel: 'x'.repeat(101), title: null, content: '', children: [] }],
    });
    expect(res.status).toBe(400);
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(2);
  });

  it('refuses no sections, too many, or too deep', async () => {
    expect((await importSections({ sections: [] })).status).toBe(400);
    const many = Array.from({ length: 2001 }, () => ({
      numberLabel: null,
      title: 'Rule',
      content: '',
      children: [],
    }));
    expect((await importSections({ sections: many })).status).toBe(400);
    let deep: Record<string, unknown> = {
      numberLabel: null,
      title: 'Leaf',
      content: '',
      children: [],
    };
    for (let level = 0; level < 6; level++) {
      deep = { numberLabel: null, title: `Level ${level}`, content: '', children: [deep] };
    }
    expect((await importSections({ sections: [deep] })).status).toBe(400);
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(2);
  });

  it('takes bylaws larger than the usual 100 KB limit', async () => {
    // Three articles of 38,000 characters: about 114 KB of JSON
    const long = 'Every member shall act in good faith. '.repeat(1000);
    const res = await importSections({
      sections: [1, 2, 3].map((n) => ({
        numberLabel: `Article ${n}`,
        title: 'Conduct',
        content: long,
        children: [],
      })),
    });
    expect(res.status).toBe(201);
    expect(res.body.sectionCount).toBe(3);
  });
});
```

The tree's `content` is `null` where the import sent `''`: an empty content is saved as no content, as the section editor saves it.

- [ ] **Step 4: Run them to see them fail**

Run: `cd backend-node && npx vitest run src/__tests__/docxText.test.ts && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/import.test.ts`
Expected: FAIL: `../bylawyer/services/docxText.js` doesn't exist.

- [ ] **Step 5: Create `backend-node/src/bylawyer/services/docxText.ts`**

```ts
/**
 * A Word document as text for the bylaws parser: each heading paragraph a # line (one # per
 * heading level), every other paragraph its text, apart by a blank line. The file is read from
 * memory and never stored.
 */

import mammoth from 'mammoth';

/** The types a .docx arrives with: its own, or plain bytes from a browser that doesn't know it */
export const DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];

/** The largest Word document read */
export const DOCX_LIMIT = '5mb';

/** The answers when there is nothing to read */
export const NO_FILE = 'No file received';
export const NOT_A_DOCX = 'That file is not a Word document Robbie can read';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(entity: string, code: string): string {
  if (code.startsWith('#')) {
    const value =
      code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
  }
  return ENTITIES[code.toLowerCase()] ?? entity;
}

/** mammoth's HTML as the parser's text: headings as # lines, paragraphs apart, no markup */
export function htmlToImportText(html: string): string {
  return html
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_match, level: string, inner: string) => `\n\n${'#'.repeat(Number(level))} ${inner}\n\n`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(p|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of a .docx; throws when mammoth can't read the file */
export async function docxToText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer },
    // Images aren't text: leave them out rather than inline them
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
  );
  return htmlToImportText(value);
}
```

- [ ] **Step 6: The import body in `backend-node/src/schemas/versions.ts`**

Append:

```ts
/** A section as the import sends it: what the parser found, after the secretary's fixes */
export interface ImportedSection {
  numberLabel: string | null;
  title: string | null;
  content: string;
  children: ImportedSection[];
}

/** At most this many sections in one import, and this many levels */
export const MAX_IMPORTED_SECTIONS = 2000;
export const MAX_IMPORT_DEPTH = 6;

const importedSection: z.ZodType<ImportedSection> = z.lazy(() =>
  z.object({
    numberLabel: z.string().max(100).nullable(),
    title: z.string().max(500).nullable(),
    content: z.string().max(100_000),
    children: z.array(importedSection),
  }),
);

/** How many sections a tree has, and how many levels deep it goes */
function measure(sections: ImportedSection[]): { count: number; depth: number } {
  let count = 0;
  let depth = 0;
  for (const section of sections) {
    const below = measure(section.children);
    count += 1 + below.count;
    depth = Math.max(depth, 1 + below.depth);
  }
  return { count, depth };
}

export const importVersionBody = z
  .object({
    effectiveDate: dateString.optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    sections: z.array(importedSection).min(1),
  })
  .refine(
    (body) => {
      const { count, depth } = measure(body.sections);
      return count <= MAX_IMPORTED_SECTIONS && depth <= MAX_IMPORT_DEPTH;
    },
    {
      message: `At most ${MAX_IMPORTED_SECTIONS} sections, ${MAX_IMPORT_DEPTH} levels deep`,
      path: ['sections'],
    },
  );

export type ImportVersionBody = z.infer<typeof importVersionBody>;
```

- [ ] **Step 7: The two routes in `backend-node/src/bylawyer/routes/versions.ts`**

Replace:

```ts
import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Section } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, docIdParam } from '../../schemas/common.js';
import { createVersionBody, updateVersionBody, diffParams } from '../../schemas/versions.js';
import { diffSections } from '../services/versionDiff.js';
```

with:

```ts
import { randomUUID } from 'crypto';
import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Prisma, Section } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, docIdParam } from '../../schemas/common.js';
import {
  createVersionBody,
  updateVersionBody,
  diffParams,
  importVersionBody,
  type ImportedSection,
  type ImportVersionBody,
} from '../../schemas/versions.js';
import { diffSections } from '../services/versionDiff.js';
import { NOT_A_DOCX, NO_FILE, docxToText } from '../services/docxText.js';
```

After the `renderMarkdown` function, add:

```ts
/**
 * An imported tree as rows for one createMany: ids made here, so each child names its parent,
 * and positions in the order given. Empty labels, titles and content are saved as none.
 */
function importedRows(
  versionId: string,
  sections: ImportedSection[],
  parentId: string | null = null,
): Prisma.SectionCreateManyInput[] {
  return sections.flatMap((section, position) => {
    const id = randomUUID();
    return [
      {
        id,
        versionId,
        parentId,
        position,
        numberLabel: section.numberLabel?.trim() || null,
        title: section.title?.trim() || null,
        content: section.content.trim() || null,
      },
      ...importedRows(versionId, section.children, id),
    ];
  });
}
```

After the `POST /documents/:docId/versions` route (the one that ends with `res.status(500).json({ error: 'Failed to create version' });` and its closing `);`), add:

```ts
/**
 * POST /api/documents/:docId/import/docx
 * A Word document as text for the bylaws parser. The body is the raw file (at most 5 MB; see
 * app.ts), read from memory and never stored.
 */
versionsRouter.post(
  '/documents/:docId/import/docx',
  validate({ params: docIdParam }),
  requireRole('secretary', byDocument),
  async (req, res) => {
    // express.raw leaves no Buffer for an empty body or a type it doesn't read
    const file: unknown = req.body;
    if (!Buffer.isBuffer(file) || file.length === 0) {
      return res.status(400).json({ error: NO_FILE });
    }
    try {
      res.json({ text: await docxToText(file) });
    } catch (error) {
      logger.warn({ err: error }, 'A Word document could not be read');
      res.status(400).json({ error: NOT_A_DOCX });
    }
  },
);

/**
 * POST /api/documents/:docId/versions/import
 * A new version from parsed sections, made current: the version and every section in one
 * transaction, so a failed import leaves nothing behind.
 * Body: { effectiveDate?, notes?, sections: ImportedSection[] }
 */
versionsRouter.post(
  '/documents/:docId/versions/import',
  validate({ params: docIdParam, body: importVersionBody }),
  requireRole('secretary', byDocument),
  async (req, res) => {
    try {
      const documentId = req.params.docId;
      const { effectiveDate, notes, sections } = req.body as ImportVersionBody;
      const version = await prisma.$transaction(async (tx) => {
        const last = await tx.version.findFirst({
          where: { documentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const created = await tx.version.create({
          data: {
            documentId,
            versionNumber: (last?.versionNumber ?? 0) + 1,
            effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
            notes: notes?.trim() || null,
          },
        });
        const rows = importedRows(created.id, sections);
        await tx.section.createMany({ data: rows });
        await tx.document.update({
          where: { id: documentId },
          data: { currentVersionId: created.id },
        });
        return { ...created, sectionCount: rows.length };
      });
      res.status(201).json(version);
    } catch (error) {
      logger.error({ err: error }, 'Failed to import a version');
      res.status(500).json({ error: 'Failed to import the version' });
    }
  },
);
```

- [ ] **Step 8: Read the bodies only after sign-in, in `backend-node/src/app.ts`**

Add after `import { membersRouter } from './orgs/memberRoutes.js';`:

```ts
import { DOCX_LIMIT, DOCX_TYPES } from './bylawyer/services/docxText.js';
```

Replace:

```ts
app.use(express.json());
```

with:

```ts
// A Word document for the bylaws import, raw and at most 5 MB, read after the same checks
app.use(
  '/api/documents/:docId/import/docx',
  authenticate,
  requireTerms,
  express.raw({ type: DOCX_TYPES, limit: DOCX_LIMIT }),
);

// The JSON bodies that can be larger than the 100 KB default (a whole set of bylaws), also
// read only after sign-in. The JSON parser below skips a body already read here.
export const LARGE_JSON_PATHS = ['/api/documents/:docId/versions/import'];
app.use(LARGE_JSON_PATHS, authenticate, requireTerms, express.json({ limit: '2mb' }));

app.use(express.json());
```

- [ ] **Step 9: The new middleware in the route coverage test**

In `backend-node/src/__integration__/routeCoverage.test.ts`, replace:

```ts
  // The upload mount: session and terms before the 10 MB body is read
  authenticate,
  requireTerms,
  'rawParser',
  'jsonParser',
```

with:

```ts
  // The upload mount: session and terms before the 10 MB body is read
  authenticate,
  requireTerms,
  'rawParser',
  // The Word document import: the same, for 5 MB
  authenticate,
  requireTerms,
  'rawParser',
  // The larger JSON bodies (LARGE_JSON_PATHS): the same, for 2 MB
  authenticate,
  requireTerms,
  'jsonParser',
  'jsonParser',
```

- [ ] **Step 10: Run them to see them pass**

Run: `cd backend-node && npx vitest run src/__tests__/docxText.test.ts && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/import.test.ts src/__integration__/routeCoverage.test.ts`
Expected: 4 passed, then all pass (`import.test.ts` has 12: two rule cases, five for the Word document and five for the sections).

If the first Word test fails on the text, compare mammoth's HTML for the fixture (log `(await mammoth.convertToHtml({ buffer: docx })).value` once) with `htmlToImportText`'s rules; the expected text is the contract with the parser.

- [ ] **Step 11: Type-check and run everything**

Run: `cd backend-node && npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass (`health.test.ts` still answers 413 above 100 KB on other routes).

- [ ] **Step 12: Commit**

```bash
npx prettier --write backend-node/package.json backend-node/src/bylawyer/services/docxText.ts backend-node/src/schemas/versions.ts backend-node/src/bylawyer/routes/versions.ts backend-node/src/app.ts backend-node/src/__integration__/docx.ts backend-node/src/__integration__/import.test.ts backend-node/src/__integration__/routeCoverage.test.ts backend-node/src/__tests__/docxText.test.ts
git add backend-node/package.json package-lock.json backend-node/src/bylawyer/services/docxText.ts backend-node/src/schemas/versions.ts backend-node/src/bylawyer/routes/versions.ts backend-node/src/app.ts backend-node/src/__integration__/docx.ts backend-node/src/__integration__/import.test.ts backend-node/src/__integration__/routeCoverage.test.ts backend-node/src/__tests__/docxText.test.ts
git commit -m "feat(desk): import bylaws from a Word document or parsed text

POST /api/documents/:docId/import/docx turns a .docx (at most 5 MB, never
stored) into text with its headings as # lines, for the parser.
POST /api/documents/:docId/versions/import saves parsed sections as a new
current version in one transaction. Both are for secretaries, and their
bodies are read only after sign-in."
```

---

### Task 4: Search across the organization's bylaws, and the old text in an amendment's preview

**Files:**

- Create: `backend-node/src/bylawyer/services/search.ts`
- Modify: `backend-node/src/schemas/documents.ts`, `backend-node/src/bylawyer/routes/documents.ts`, `backend-node/src/bylawyer/services/amendmentService.ts`
- Create: `backend-node/src/__integration__/search.test.ts`, `backend-node/src/__tests__/search.test.ts`
- Modify: `backend-node/src/__integration__/amendments.test.ts`

The header's search has called `/api/search`, which never existed. The new route searches what members read: the current version of each of the organization's documents, never an older version and never another organization's. Each result names its section, so the web app can open the document at it. The amendment preview has always computed the document as it would read after the amendment, but replaced a modified section's text, so the page can't show what changed; each section now keeps its text from before in `previous`.

- [ ] **Step 1: Write the failing tests**

Create `backend-node/src/__tests__/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { snippetAround } from '../bylawyer/services/search.js';

describe('snippetAround', () => {
  it('gives a short text whole, on one line', () => {
    expect(snippetAround('The name\nis A.', 'name')).toBe('The name is A.');
  });

  it('cuts a long text around the first match, marking the cuts', () => {
    const text = `${'a '.repeat(100)}Quorum is twenty percent.${' b'.repeat(100)}`;
    const snippet = snippetAround(text, 'quorum');
    expect(snippet).toMatch(/^\.\.\.(a )+Quorum is twenty percent\.( b)+\.\.\.$/);
    expect(snippet.length).toBeLessThanOrEqual(132);
  });

  it('gives the start of the text when the match is in the label or title', () => {
    expect(snippetAround('x'.repeat(200), 'quorum')).toBe(`${'x'.repeat(120)}...`);
    expect(snippetAround('', 'quorum')).toBe('');
  });
});
```

Create `backend-node/src/__integration__/search.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('search rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/search',
    path: (f) => `/api/organizations/${f.orgA.id}/search?q=name`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('searching the bylaws', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const search = (q: string) =>
    call('get', `/api/organizations/${f.orgA.id}/search?q=${encodeURIComponent(q)}`, {
      cookie: f.users.viewer.cookie,
    });

  it("finds the current version's sections by label, title or content, in any case", async () => {
    const res = await search('NAME');
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('NAME');
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results).toEqual(
      expect.arrayContaining([
        {
          documentId: f.doc,
          documentTitle: 'Bylaws',
          versionId: f.v2,
          sectionId: f.section,
          numberLabel: '1',
          title: 'Name',
          snippet: 'The name is A.',
        },
        {
          documentId: f.doc,
          documentTitle: 'Bylaws',
          versionId: f.v2,
          sectionId: f.child,
          numberLabel: '1.1',
          title: null,
          snippet: 'The short name is A.',
        },
      ]),
    );

    const byLabel = await search('1.1');
    expect(byLabel.body.results.map((r: { sectionId: string }) => r.sectionId)).toEqual([f.child]);
  });

  it('never searches an older version or another organization', async () => {
    // v1's section says "Old A"; Org B's says "The name is B."
    expect((await search('Old A')).body.results).toEqual([]);
    expect((await search('is B')).body.results).toEqual([]);
  });

  it('cuts a long section around the first match', async () => {
    await prisma.section.create({
      data: {
        versionId: f.v2,
        numberLabel: '2',
        title: 'Quorum',
        content: `${'Members meet. '.repeat(20)}A quorum is twenty percent. ${'Votes count. '.repeat(20)}`,
      },
    });
    const res = await search('twenty');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].snippet).toMatch(/^\.\.\..*A quorum is twenty percent\..*\.\.\.$/);
  });

  it('answers at most 20 results', async () => {
    await prisma.section.createMany({
      data: Array.from({ length: 25 }, (_, position) => ({
        versionId: f.v2,
        position: position + 1,
        content: `The gate code is ${position}.`,
      })),
    });
    expect((await search('gate')).body.results).toHaveLength(20);
  });

  it('needs at least 2 characters', async () => {
    expect((await search('a')).status).toBe(400);
    expect((await search(' a ')).status).toBe(400);
  });
});
```

In `backend-node/src/__integration__/amendments.test.ts`, append:

```ts
describe('amendment previews', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const preview = () =>
    call('get', `/api/amendments/${f.draft}/preview`, { cookie: f.users.viewer.cookie });

  it('show a modified section with its text from before', async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    const [name] = res.body.sections;
    expect(name).toMatchObject({
      id: f.section,
      content: 'The name is A2.',
      modified: true,
      previous: { numberLabel: '1', title: 'Name', content: 'The name is A.' },
    });
    expect(name.children[0]).toMatchObject({ id: f.child, modified: false, previous: null });
  });

  it('show added and deleted sections without text from before', async () => {
    await prisma.amendmentChange.createMany({
      data: [
        {
          amendmentId: f.draft,
          changeType: 'add',
          newNumberLabel: '2',
          newTitle: 'Purpose',
          newContent: 'Gardens.',
          position: 1,
        },
        { amendmentId: f.draft, changeType: 'delete', targetSectionId: f.child, position: 2 },
      ],
    });
    const res = await preview();
    const added = res.body.sections.find((s: { added: boolean }) => s.added);
    expect(added).toMatchObject({
      numberLabel: '2',
      title: 'Purpose',
      content: 'Gardens.',
      previous: null,
    });
    expect(res.body.sections[0].children[0]).toMatchObject({
      id: f.child,
      deleted: true,
      previous: null,
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend-node && npx vitest run src/__tests__/search.test.ts && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/search.test.ts src/__integration__/amendments.test.ts`
Expected: FAIL: `../bylawyer/services/search.js` doesn't exist, the search route answers 404, and the preview's sections have no `previous`.

- [ ] **Step 3: Create `backend-node/src/bylawyer/services/search.ts`**

```ts
/**
 * Search across an organization's documents as members read them: the current version of
 * each, never an older one, never another organization's
 */

import { prisma } from '../../db/prisma.js';

/** At most this many results */
export const SEARCH_LIMIT = 20;

/** A section that matched, with the text around the first match */
export interface SearchHit {
  documentId: string;
  documentTitle: string;
  versionId: string;
  sectionId: string;
  numberLabel: string | null;
  title: string | null;
  snippet: string;
}

/**
 * About `radius` characters either side of the first match, on one line, with "..." where the
 * text is cut. Without a match in the text (it was in the label or title), its start.
 */
export function snippetAround(text: string, query: string, radius = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}...` : flat;
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);
  return `${start > 0 ? '...' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '...' : ''}`;
}

/** Sections of the organization's current versions whose label, title or content has `query` */
export async function searchOrganization(
  organizationId: string,
  query: string,
): Promise<SearchHit[]> {
  const documents = await prisma.document.findMany({
    where: { organizationId, currentVersionId: { not: null } },
    select: { id: true, title: true, currentVersionId: true },
  });
  const byVersion = new Map(documents.map((doc) => [doc.currentVersionId!, doc]));
  if (byVersion.size === 0) return [];

  const contains = { contains: query, mode: 'insensitive' as const };
  const sections = await prisma.section.findMany({
    where: {
      versionId: { in: [...byVersion.keys()] },
      OR: [{ numberLabel: contains }, { title: contains }, { content: contains }],
    },
    select: { id: true, versionId: true, numberLabel: true, title: true, content: true },
    orderBy: [{ versionId: 'asc' }, { position: 'asc' }],
    take: SEARCH_LIMIT,
  });

  return sections
    .map((section) => {
      const doc = byVersion.get(section.versionId)!;
      return {
        documentId: doc.id,
        documentTitle: doc.title,
        versionId: section.versionId,
        sectionId: section.id,
        numberLabel: section.numberLabel,
        title: section.title,
        snippet: snippetAround(section.content ?? '', query),
      };
    })
    .sort((a, b) => a.documentTitle.localeCompare(b.documentTitle));
}
```

- [ ] **Step 4: The route**

In `backend-node/src/schemas/documents.ts`, append:

```ts
/** A search of the organization's bylaws: at least 2 characters */
export const searchQuery = z.object({
  q: z.string().trim().min(2, 'Search for at least 2 characters').max(200),
});
```

In `backend-node/src/bylawyer/routes/documents.ts`, replace:

```ts
import { createDocumentBody, updateDocumentBody, atDateQuery } from '../../schemas/documents.js';
```

with:

```ts
import {
  createDocumentBody,
  updateDocumentBody,
  atDateQuery,
  searchQuery,
} from '../../schemas/documents.js';
import { searchOrganization } from '../services/search.js';
```

and before `// Create document`, add:

```ts
/**
 * GET /api/organizations/:orgId/search?q=
 * Sections of the current version of each of the organization's documents whose label, title
 * or content has the query, in any case: at most 20, each with the text around the match
 */
documentsRouter.get(
  '/organizations/:orgId/search',
  validate({ params: orgIdParam, query: searchQuery }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      const query = String(req.query.q);
      res.json({ query, results: await searchOrganization(req.org!.id, query) });
    } catch (error) {
      logger.error({ err: error }, 'Failed to search');
      res.status(500).json({ error: 'Failed to search' });
    }
  },
);
```

- [ ] **Step 5: The text from before, in `backend-node/src/bylawyer/services/amendmentService.ts`'s `previewAmendment`**

Replace:

```ts
// Build a mutable copy of the section tree
const sectionsCopy = currentVersion.sections.map((s) => ({
  id: s.id,
  parentId: s.parentId,
  position: s.position,
  numberLabel: s.numberLabel,
  title: s.title,
  content: s.content,
  annotation: s.annotation,
  modified: false,
  added: false,
  deleted: false,
}));
```

with:

```ts
// The text of a section before the amendment changed it
type Previous = { numberLabel: string | null; title: string | null; content: string | null };
const before = (s: { numberLabel: string | null; title: string | null; content: string | null }) =>
  ({ numberLabel: s.numberLabel, title: s.title, content: s.content }) as Previous;

// Build a mutable copy of the section tree; `previous` is set when a change touches it
const sectionsCopy = currentVersion.sections.map((s) => ({
  id: s.id,
  parentId: s.parentId,
  position: s.position,
  numberLabel: s.numberLabel,
  title: s.title,
  content: s.content,
  annotation: s.annotation,
  modified: false,
  added: false,
  deleted: false,
  previous: null as Previous | null,
}));
```

In the `add` branch, replace:

```ts
          modified: false,
          added: true,
          deleted: false,
        });
```

with:

```ts
          modified: false,
          added: true,
          deleted: false,
          previous: null,
        });
```

In the `modify` branch, replace:

```ts
        if (section) {
          if (change.newContent !== null) section.content = change.newContent;
```

with:

```ts
        if (section) {
          // Two changes to one section: the text from before is the version's
          section.previous ??= before(section);
          if (change.newContent !== null) section.content = change.newContent;
```

In the `renumber` branch, replace:

```ts
        if (section && change.newNumberLabel !== null) {
          section.numberLabel = change.newNumberLabel;
```

with:

```ts
        if (section && change.newNumberLabel !== null) {
          section.previous ??= before(section);
          section.numberLabel = change.newNumberLabel;
```

- [ ] **Step 6: Run them to see them pass**

Run: `cd backend-node && npx vitest run src/__tests__/search.test.ts && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/search.test.ts src/__integration__/amendments.test.ts`
Expected: 3 passed; then all pass (`search.test.ts` has 6, and `amendments.test.ts` gains 2).

- [ ] **Step 7: Type-check and run everything**

Run: `cd backend-node && npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass.

- [ ] **Step 8: Commit**

```bash
npx prettier --write backend-node/src/bylawyer/services/search.ts backend-node/src/schemas/documents.ts backend-node/src/bylawyer/routes/documents.ts backend-node/src/bylawyer/services/amendmentService.ts backend-node/src/__integration__/search.test.ts backend-node/src/__integration__/amendments.test.ts backend-node/src/__tests__/search.test.ts
git add backend-node/src/bylawyer/services/search.ts backend-node/src/schemas/documents.ts backend-node/src/bylawyer/routes/documents.ts backend-node/src/bylawyer/services/amendmentService.ts backend-node/src/__integration__/search.test.ts backend-node/src/__integration__/amendments.test.ts backend-node/src/__tests__/search.test.ts
git commit -m "feat(desk): search the organization's bylaws, and keep the old text in a preview

GET /api/organizations/:orgId/search finds sections of each document's
current version by label, title or content (at most 20, with a snippet
around the match), never an older version or another organization's. The
amendment preview gives each modified or renumbered section its text from
before, so the page can show what changed."
```

---

### Task 5: A meeting record the minutes can be written from

**Files:**

- Modify: `shared/types/index.ts`, `shared/reducer/initialState.ts`, `shared/constants/logMessages.ts`
- Create: `shared/reducer/handlers/records.ts`
- Modify: `shared/reducer/handlers/meetingLifecycleHandlers.ts`, `memberHandlers.ts`, `attendanceHandlers.ts`, `motionHandlers.ts`, `votingHandlers.ts`, `consentHandlers.ts`, `ruleSuspensionHandlers.ts`, `electionHandlers.ts`, `settingsHandlers.ts` (all under `shared/reducer/handlers/`)
- Modify: `shared/utils/motionHistoryHelper.ts`
- Modify: `backend-node/src/socket/actionEnricher.ts`, `backend-node/src/socket/actionValidator.ts`, `backend-node/src/socket/permissionGuard.ts`
- Modify: `frontend-unified/src/modules/meetings/utils/question.ts`
- Test: `shared/__tests__/reducer/meetingRecord.test.ts` (new), `shared/__tests__/reducer/floorVotes.test.ts`, `shared/__tests__/utils/motionHistoryHelper.test.ts`, `backend-node/src/__tests__/actionEnricher.test.ts`, `backend-node/src/__tests__/minutesActions.test.ts` (new), `backend-node/src/__tests__/permissionGuard.test.ts`, `frontend-unified/src/modules/meetings/utils/__tests__/question.test.ts`

The minutes can't be written from the log: its timestamps are clock times without a date, in the server's zone (`generateTimestamp()`), and its lines are prose. So the state records what the minutes need, and the generator (Task 6) reads only records:

- **Every disposition of a motion** goes into `completedMotions`: carried or failed on a vote (as today), and now adopted by unanimous consent, withdrawn by its mover, or dead for want of a second. Each record gains `seconder`, `disposition`, `decidedAt` (the server's clock, ISO), `agendaItemId` (the item under way) and, for decisions, `quorumPresent`. A record with no votes has empty `voterChoices` and can't be reconsidered (only an adopted one keeps its motion's flag, and nobody is on its prevailing side).
- **The chair's rulings** go into `chairRulings` (`lastChairRuling` is overwritten by the next one). Appeals are motions, so they are in `completedMotions` already.
- **Each ballot of an election**: `currentElection.ballots` collects every closed ballot's count (devices and paper together), across runoffs, and the officer declared elected keeps them, with `agendaItemId` and `decidedAt`.
- **The approval of the previous minutes**: `APPROVE_MINUTES` takes `corrections`, recorded in `minutesApproval` (with where and when); `SET_PREVIOUS_MINUTES` takes the `minutesId` the server loaded (Task 8), kept in `previousMinutesId`, and becomes server-only.
- **Attendance**: `attendedIds` lists every member who has been present (a member who left before adjournment is `present: false` by then), and `quorumAtCallToOrder` whether a quorum was present when the meeting was called to order.
- **The clock**: the enricher stamps `at` (ISO) on the seven actions that decide something (`CLOCKED_ACTIONS`). `timestamp` and the log stay as they are: the web app's `adjournedAt`, `formatClockTime` and `useVoteResults` read the clock format.

Everything new is optional on the record types, and the new state fields have defaults, so the mobile app and stored meetings carry on. Two consumers of `completedMotions` change with it: the web app's `itemsDecided` (the display's "3 items decided") counted unanimous consents from the log, which would now count them twice, and the motion history would have listed motions that were never decided.

- [ ] **Step 1: Write the failing reducer test**

Create `shared/__tests__/reducer/meetingRecord.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { meetingReducer, initialState } from '../../reducer/index.js';
import { MOTIONS } from '../../constants/index.js';
import type { Election, MeetingState, Member, Motion } from '../../types/index.js';

// The server's clock when a decision is made (the enricher's `at`)
const AT = '2026-10-21T00:20:00.000Z';

const members: Member[] = [
  { id: 1, name: 'Ann', role: 'chair', present: true, presentBy: 'device' },
  { id: 2, name: 'Bo', role: 'member', present: true, presentBy: 'device' },
  { id: 3, name: 'Cy', role: 'member', present: true, presentBy: 'device' },
];
const item = { id: 3, title: 'Old business', status: 'active' as const };

/** A meeting in session with a quorum (3 of 3), during agenda item 3 */
const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  members,
  quorum: 3,
  agenda: [item],
  currentAgendaItem: item,
};

const motion = (overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS.mainMotion,
  id: 7,
  type: 'mainMotion',
  text: 'Resurface the pool',
  mover: 'Bo',
  moverId: 2,
  secondedBy: 'Cy',
  status: 'active',
  ...overrides,
});

const awaitingSecond = () => motion({ secondedBy: null, status: 'pending' });

describe('the meeting record', () => {
  it('keeps the seconder, the agenda item, the quorum and the time of a vote', () => {
    const voting: MeetingState = {
      ...inSession,
      currentMotion: motion(),
      motionStack: [motion()],
      votingOpen: true,
      votes: { yea: 2, nay: 0, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
    };
    const closed = meetingReducer(voting, {
      type: 'CLOSE_VOTING',
      at: AT,
      timestamp: '7:20:00 PM',
    });
    expect(closed.completedMotions).toEqual([
      expect.objectContaining({
        id: 7,
        mover: 'Bo',
        seconder: 'Cy',
        passed: true,
        disposition: 'carried',
        agendaItemId: 3,
        quorumPresent: true,
        decidedAt: AT,
        deviceVotes: { yea: 2, nay: 0, abstain: 0 },
        floorVotes: { yea: 9, nay: 2, abstain: 0 },
      }),
    ]);
  });

  it('keeps a failed vote without a quorum, and no time without the clock', () => {
    const voting: MeetingState = {
      ...inSession,
      members: [members[0], { ...members[1], present: false }, { ...members[2], present: false }],
      currentMotion: motion(),
      motionStack: [motion()],
      votingOpen: true,
      votes: { yea: 0, nay: 1, abstain: 0 },
    };
    const record = meetingReducer(voting, { type: 'CLOSE_VOTING', timestamp: '' })
      .completedMotions[0];
    expect(record).toMatchObject({ passed: false, disposition: 'failed', quorumPresent: false });
    expect(record).not.toHaveProperty('decidedAt');
  });

  it('keeps a motion that died for lack of a second', () => {
    const next = meetingReducer(
      { ...inSession, pendingSecond: awaitingSecond() },
      { type: 'DECLINE_SECOND', at: AT, timestamp: '7:21:00 PM' },
    );
    expect(next.pendingSecond).toBeNull();
    expect(next.completedMotions).toEqual([
      {
        id: 7,
        type: 'mainMotion',
        name: 'Main Motion',
        text: 'Resurface the pool',
        passed: false,
        voterChoices: {},
        timestamp: '7:21:00 PM',
        reconsidered: false,
        reconsiderable: false,
        mover: 'Bo',
        moverId: 2,
        disposition: 'no-second',
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);
  });

  it('keeps a withdrawn motion, awaiting a second or seconded, but only its mover can withdraw it', () => {
    const awaiting = meetingReducer(
      { ...inSession, pendingSecond: awaitingSecond() },
      { type: 'WITHDRAW_MOTION', requesterId: 2, at: AT, timestamp: '7:22:00 PM' },
    );
    expect(awaiting.completedMotions).toEqual([
      expect.objectContaining({ id: 7, disposition: 'withdrawn', passed: false, decidedAt: AT }),
    ]);
    expect(awaiting.completedMotions[0]).not.toHaveProperty('seconder');

    const pending = { ...inSession, currentMotion: motion(), motionStack: [motion()] };
    const seconded = meetingReducer(pending, {
      type: 'WITHDRAW_MOTION',
      requesterId: 2,
      timestamp: '7:23:00 PM',
    });
    expect(seconded.currentMotion).toBeNull();
    expect(seconded.completedMotions).toEqual([
      expect.objectContaining({
        id: 7,
        disposition: 'withdrawn',
        seconder: 'Cy',
        reconsiderable: false,
      }),
    ]);

    const refused = meetingReducer(pending, {
      type: 'WITHDRAW_MOTION',
      requesterId: 3,
      timestamp: '',
    });
    expect(refused).toBe(pending);
  });

  it('keeps a motion adopted by unanimous consent, with the quorum', () => {
    const asking = {
      ...inSession,
      currentMotion: motion(),
      motionStack: [motion()],
      unanimousConsentPending: true,
    };
    const adopted = meetingReducer(asking, {
      type: 'UNANIMOUS_CONSENT_PASSED',
      at: AT,
      timestamp: '7:24:00 PM',
    });
    expect(adopted.completedMotions).toEqual([
      expect.objectContaining({
        id: 7,
        passed: true,
        disposition: 'unanimous',
        quorumPresent: true,
        seconder: 'Cy',
        agendaItemId: 3,
        decidedAt: AT,
        voterChoices: {},
        reconsiderable: MOTIONS.mainMotion.reconsidered,
      }),
    ]);
  });

  it("keeps each ruling of the chair, which lastChairRuling doesn't", () => {
    const point = motion({
      ...MOTIONS.pointOrder,
      id: 8,
      type: 'pointOrder',
      text: 'The speaker is off the subject',
    });
    const ruled = meetingReducer(
      { ...inSession, currentMotion: point, motionStack: [motion(), point] },
      {
        type: 'CHAIR_RULING',
        ruling: 'sustain',
        explanation: 'Debate must be on the motion',
        at: AT,
        timestamp: '7:25:00 PM',
      },
    );
    expect(ruled.chairRulings).toEqual([
      {
        ruling: 'The point is well taken.',
        explanation: 'Debate must be on the motion',
        motionText: 'The speaker is off the subject',
        timestamp: '7:25:00 PM',
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);
  });

  it('keeps each ballot of an election, and gives them to the officer elected', () => {
    const election: Election = {
      id: 1,
      position: 'Director',
      candidates: [
        { name: 'Carmen', id: 4 },
        { name: 'Ray', id: 5 },
      ],
      requiredVotes: 'majority',
      votingInProgress: true,
      ballotResults: { Carmen: 4, Ray: 4 },
      votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8],
      floorBallots: { Carmen: 1, Ray: 1 },
      elected: null,
    };
    // A tie: a second ballot opens, and the first is kept
    let state = meetingReducer(
      { ...inSession, currentElection: election },
      { type: 'CLOSE_ELECTION', timestamp: '8:00:00 PM' },
    );
    expect(state.currentElection?.ballots).toEqual([{ Carmen: 5, Ray: 5 }]);

    state = {
      ...state,
      currentElection: {
        ...state.currentElection!,
        ballotResults: { Carmen: 6, Ray: 3 },
        votersWhoVoted: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      },
    };
    state = meetingReducer(state, { type: 'CLOSE_ELECTION', timestamp: '8:05:00 PM' });
    expect(state.currentElection?.elected).toBe('Carmen');

    state = meetingReducer(state, {
      type: 'DECLARE_ELECTED',
      candidateName: 'Carmen',
      at: AT,
      timestamp: '8:06:00 PM',
    });
    expect(state.electedOfficers).toEqual([
      {
        position: 'Director',
        name: 'Carmen',
        memberId: 4,
        electedAt: '8:06:00 PM',
        ballots: [
          { Carmen: 5, Ray: 5 },
          { Carmen: 6, Ray: 3 },
        ],
        agendaItemId: 3,
        decidedAt: AT,
      },
    ]);
  });

  it('keeps the approval of the minutes, as read or with corrections', () => {
    const asRead = meetingReducer(inSession, {
      type: 'APPROVE_MINUTES',
      at: AT,
      timestamp: '7:05:00 PM',
    });
    expect(asRead.minutesApproved).toBe(true);
    expect(asRead.minutesApproval).toEqual({
      corrections: null,
      timestamp: '7:05:00 PM',
      agendaItemId: 3,
      decidedAt: AT,
    });
    expect(asRead.meetingLog.at(-1)?.message).toBe('Minutes from previous meeting approved.');

    const corrected = meetingReducer(inSession, {
      type: 'APPROVE_MINUTES',
      corrections: '  Adjourned at 8:15 PM, not 8:50 PM.  ',
      timestamp: '7:05:00 PM',
    });
    expect(corrected.minutesApproval?.corrections).toBe('Adjourned at 8:15 PM, not 8:50 PM.');
    expect(corrected.meetingLog.at(-1)?.message).toBe(
      'Minutes from previous meeting approved with corrections: Adjourned at 8:15 PM, not 8:50 PM.',
    );

    const blank = meetingReducer(inSession, {
      type: 'APPROVE_MINUTES',
      corrections: '   ',
      timestamp: '',
    });
    expect(blank.minutesApproval?.corrections).toBeNull();
  });

  it('notes which published minutes are before the meeting', () => {
    const loaded = meetingReducer(initialState, {
      type: 'SET_PREVIOUS_MINUTES',
      minutes: '# Minutes of the 2025 Annual Meeting',
      minutesId: 'minutes-1',
    });
    expect(loaded).toMatchObject({
      minutesFromPreviousMeeting: '# Minutes of the 2025 Annual Meeting',
      previousMinutesId: 'minutes-1',
    });
    const typed = meetingReducer(loaded, { type: 'SET_PREVIOUS_MINUTES', minutes: 'Typed in' });
    expect(typed.previousMinutesId).toBeNull();
  });

  it('notes whether a quorum was present at the call to order', () => {
    const before = { ...initialState, members, quorum: 3 };
    const start = { type: 'START_MEETING' as const, timestamp: '' };
    expect(meetingReducer(before, start).quorumAtCallToOrder).toBe(true);
    expect(meetingReducer({ ...before, quorum: 4 }, start).quorumAtCallToOrder).toBe(false);
  });

  it('remembers who attended, also once they leave', () => {
    let state: MeetingState = initialState;
    state = meetingReducer(state, {
      type: 'ADD_MEMBER',
      member: { id: 2, name: 'Bo', role: 'member', present: true },
      timestamp: '',
    });
    state = meetingReducer(state, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 2,
      present: false,
      timestamp: '',
    });
    state = meetingReducer(state, {
      type: 'MARK_PRESENT',
      userId: 3,
      member: { id: 3, name: 'Cy', role: 'member', present: false },
      timestamp: '',
    });
    state = meetingReducer(state, {
      type: 'ADD_MEMBER',
      member: { id: 4, name: 'Di', role: 'member', present: false },
      timestamp: '',
    });
    expect(state.attendedIds).toEqual([2, 3]);

    state = meetingReducer(state, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 4,
      present: true,
      timestamp: '',
    });
    expect(state.attendedIds).toEqual([2, 3, 4]);
  });

  it('keeps records in a state saved before they existed', () => {
    const { chairRulings: _rulings, attendedIds: _attended, ...old } = inSession;
    const point = motion({ ...MOTIONS.pointOrder, id: 8, type: 'pointOrder', text: 'Order' });
    const ruled = meetingReducer(
      { ...old, currentMotion: point, motionStack: [point] } as MeetingState,
      { type: 'CHAIR_RULING', ruling: 'overrule', timestamp: '' },
    );
    expect(ruled.chairRulings).toHaveLength(1);
    const joined = meetingReducer(old as MeetingState, {
      type: 'SET_MEMBER_PRESENCE',
      memberId: 2,
      present: false,
      timestamp: '',
    });
    expect(joined.members[1].present).toBe(false);
  });
});
```

In `shared/__tests__/reducer/floorVotes.test.ts`, in `it('is kept for every decided motion, with both parts and the method', ...)`, replace:

```ts
        floorVotes: { yea: 2, nay: 0, abstain: 0 },
        method: 'standard',
      },
    ]);
```

with:

```ts
        floorVotes: { yea: 2, nay: 0, abstain: 0 },
        method: 'standard',
        seconder: 'Bo',
        disposition: 'carried',
        // Nobody is present in this state, against a quorum of 3
        quorumPresent: false,
      },
    ]);
```

In `shared/__tests__/utils/motionHistoryHelper.test.ts`, insert before `  it('should include tabled motions', () => {`:

```ts
it('leaves out motions never decided, and gives no count for unanimous consent', () => {
  const record = {
    type: 'mainMotion',
    name: 'Main Motion',
    voterChoices: {},
    timestamp: '10:15:00',
    reconsidered: false,
  };
  const state = createMockState({
    completedMotions: [
      { ...record, id: 1, text: 'Thank the board', passed: true, disposition: 'unanimous' },
      { ...record, id: 2, text: 'Paint it red', passed: false, disposition: 'no-second' },
      { ...record, id: 3, text: 'Repave the lot', passed: false, disposition: 'withdrawn' },
    ],
  });
  const history = getMotionHistory(state);
  expect(history.map((m) => [m.id, m.outcome])).toEqual([[1, 'passed']]);
  expect(history[0].voteCount).toBeUndefined();
});
```

- [ ] **Step 2: Write the failing server and web tests**

Create `backend-node/src/__tests__/minutesActions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MAX_CORRECTIONS_LENGTH, validateAction } from '../socket/actionValidator.js';
import { checkPermission } from '../socket/permissionGuard.js';

describe('approving the minutes', () => {
  const active = { ...initialState, meetingActive: true };

  it('takes corrections up to 2,000 characters', () => {
    const approve = (corrections: unknown) =>
      validateAction(active, {
        type: 'APPROVE_MINUTES',
        corrections: corrections as string,
        timestamp: '',
      });
    expect(MAX_CORRECTIONS_LENGTH).toBe(2000);
    expect(approve(undefined)).toEqual({ valid: true });
    expect(approve('x'.repeat(2000))).toEqual({ valid: true });
    expect(approve('x'.repeat(2001))).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
    expect(approve(42)).toMatchObject({ valid: false, errorCode: 'INVALID_ACTION' });
  });

  it('is done once', () => {
    expect(
      validateAction(
        { ...active, minutesApproved: true },
        { type: 'APPROVE_MINUTES', timestamp: '' },
      ),
    ).toMatchObject({ valid: false, errorCode: 'MINUTES_ALREADY_APPROVED' });
  });

  it('is for the chair and admins, and the previous minutes are only the server's to set', () => {
    expect(checkPermission('chair', 'APPROVE_MINUTES')).toBe(true);
    expect(checkPermission('admin', 'APPROVE_MINUTES')).toBe(true);
    expect(checkPermission('member', 'APPROVE_MINUTES')).toBe(false);
    for (const role of ['admin', 'chair', 'member', 'guest'] as const) {
      expect(checkPermission(role, 'SET_PREVIOUS_MINUTES'), role).toBe(false);
    }
  });
});
```

In `backend-node/src/__tests__/permissionGuard.test.ts`, replace:

```ts
const adminOnlyActions = [
  'SET_SPEAKER_TIME_LIMIT',
  'SET_VOTE_TIME_LIMIT',
  'SET_PREVIOUS_MINUTES',
] as const;
```

with:

```ts
const adminOnlyActions = ['SET_SPEAKER_TIME_LIMIT', 'SET_VOTE_TIME_LIMIT'] as const;
```

and:

```ts
        'RELOAD_AGENDA',
        'SET_MEETING_INFO',
      ] as const;
```

with:

```ts
        'RELOAD_AGENDA',
        'SET_MEETING_INFO',
        'SET_PREVIOUS_MINUTES',
      ] as const;
```

In `backend-node/src/__tests__/actionEnricher.test.ts`, replace:

```ts
import { describe, it, expect } from 'vitest';
```

with:

```ts
import { describe, it, expect, vi } from 'vitest';
```

and:

```ts
import { ACTOR_FIELDS, enrichAction } from '../socket/actionEnricher.js';
```

with:

```ts
import { ACTOR_FIELDS, CLOCKED_ACTIONS, enrichAction } from '../socket/actionEnricher.js';
```

and append:

```ts
describe('the clock on decisions', () => {
  it('stamps each decision the minutes record with when it happened, whatever a client says', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T19:42:00Z'));
    try {
      expect([...CLOCKED_ACTIONS].sort()).toEqual([
        'APPROVE_MINUTES',
        'CHAIR_RULING',
        'CLOSE_VOTING',
        'DECLARE_ELECTED',
        'DECLINE_SECOND',
        'UNANIMOUS_CONSENT_PASSED',
        'WITHDRAW_MOTION',
      ]);
      for (const type of CLOCKED_ACTIONS) {
        const stamped = enrich({ type, timestamp: '', at: '1999-01-01T00:00:00.000Z' }, chair);
        expect(stamped.at, type).toBe('2026-10-20T19:42:00.000Z');
      }
      expect(enrich({ type: 'OPEN_VOTING', timestamp: '' }, chair)).not.toHaveProperty('at');
    } finally {
      vi.useRealTimers();
    }
  });
});
```

In `frontend-unified/src/modules/meetings/utils/__tests__/question.test.ts`, replace the whole `it('says when the meeting adjourned and how many things it decided', () => {` block (from that line through its closing `});`) with:

```ts
it('says when the meeting adjourned and how many things it decided', () => {
  const record = { type: 'mainMotion', name: 'Main Motion', voterChoices: {}, reconsidered: false };
  const state: MeetingState = {
    ...initialState,
    meetingStage: 'adjourned',
    meetingLog: [
      { time: '8:10:00 PM', message: 'Motion CARRIED by unanimous consent.' },
      { time: '8:42:15 PM', message: 'Meeting adjourned.' },
    ],
    completedMotions: [
      { ...record, id: 1, text: 'Resurface the pool', passed: true, timestamp: '7:45:00 PM' },
      {
        ...record,
        id: 2,
        text: 'Thank the board',
        passed: true,
        timestamp: '8:10:00 PM',
        disposition: 'unanimous',
      },
      // Recorded for the minutes, but nothing was decided
      {
        ...record,
        id: 3,
        text: 'Paint the clubhouse',
        passed: false,
        timestamp: '8:12:00 PM',
        disposition: 'no-second',
      },
      {
        ...record,
        id: 4,
        text: 'Repave the lot',
        passed: false,
        timestamp: '8:13:00 PM',
        disposition: 'withdrawn',
      },
    ],
    electedOfficers: [
      { position: 'Director', name: 'Carmen Diaz', memberId: 5, electedAt: '8:30:00 PM' },
    ],
  };
  expect(adjournedAt(state)).toBe('8:42 PM');
  // The vote, the unanimous consent (counted once, from its record) and the election
  expect(itemsDecided(state)).toBe(3);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd shared && npx vitest run __tests__/reducer/meetingRecord.test.ts __tests__/reducer/floorVotes.test.ts __tests__/utils/motionHistoryHelper.test.ts`
Expected: FAIL: no `seconder`, `disposition` or `quorumPresent` on the vote's record, nothing recorded for a declined second, a withdrawal or unanimous consent, no `chairRulings`, `ballots`, `minutesApproval`, `previousMinutesId`, `quorumAtCallToOrder` or `attendedIds`, and the history lists the three records. (The server and web tests fail to compile until Step 13.)

- [ ] **Step 4: The types, in `shared/types/index.ts`**

In `interface CompletedMotion`, replace:

```ts
  /** Whether the motion can be reconsidered (its definition's reconsidered flag) */
  readonly reconsiderable?: boolean;
}
```

with:

```ts
  /** Whether the motion can be reconsidered (its definition's reconsidered flag) */
  readonly reconsiderable?: boolean;
  // What the minutes need. Records made before these existed have none of them.
  /** Who seconded it */
  readonly seconder?: string;
  /** How it was disposed of; a record without one was decided on a vote */
  readonly disposition?: Disposition;
  /** When, by the server's clock (ISO) */
  readonly decidedAt?: string;
  /** The agenda item under way when it was disposed of */
  readonly agendaItemId?: number;
  /** Whether a quorum was present when it was decided, on a vote or by unanimous consent */
  readonly quorumPresent?: boolean;
}

/**
 * How a motion was disposed of: carried or failed on a vote, adopted by unanimous consent,
 * withdrawn by its mover, or dead for want of a second
 */
export type Disposition = 'carried' | 'failed' | 'unanimous' | 'withdrawn' | 'no-second';

/** A ruling of the chair on a point that takes no vote, as the minutes record it */
export interface ChairRulingRecord {
  /** "The point is well taken." */
  readonly ruling: string;
  readonly explanation?: string;
  /** The point ruled on */
  readonly motionText: string;
  readonly timestamp: string;
  readonly decidedAt?: string;
  readonly agendaItemId?: number;
}

/** How the meeting approved the previous meeting's minutes */
export interface MinutesApprovalRecord {
  /** The corrections made, or null when approved as read */
  readonly corrections: string | null;
  readonly timestamp: string;
  readonly decidedAt?: string;
  readonly agendaItemId?: number;
}
```

In `interface Election`, replace:

```ts
  floorBallots?: Record<string, number>;
  elected: string | null;
```

with:

```ts
  floorBallots?: Record<string, number>;
  /** Each closed ballot's count, devices and paper together, the first ballot first */
  ballots?: Array<Record<string, number>>;
  elected: string | null;
```

In `interface Officer`, replace:

```ts
  readonly memberId: number;
  readonly electedAt: string;
}
```

with:

```ts
  readonly memberId: number;
  readonly electedAt: string;
  /** Each ballot's count in the election that chose them */
  readonly ballots?: ReadonlyArray<Record<string, number>>;
  readonly agendaItemId?: number;
  readonly decidedAt?: string;
}
```

In `interface MeetingState`, replace:

```ts
minutesFromPreviousMeeting: string;
minutesApproved: boolean;
```

with:

```ts
  /** The previous meeting's published minutes (Markdown), put before this meeting */
  minutesFromPreviousMeeting: string;
  minutesApproved: boolean;
  /** Which minutes those are (a Minutes id), or null when none were loaded */
  previousMinutesId: string | null;
  /** How the meeting approved them, or null until it has */
  minutesApproval: MinutesApprovalRecord | null;
  /** Whether a quorum was present when the meeting was called to order; null before */
  quorumAtCallToOrder: boolean | null;
  /** The chair's rulings, in order */
  chairRulings: ChairRulingRecord[];
  /** Members who have been present at any point, for the minutes' attendance */
  attendedIds: number[];
```

In the action union, replace:

```ts
  // seconderId is set by the server from the signed-in user
  | { type: 'SECOND_MOTION'; seconder: string; seconderId?: number; timestamp: string }
  | { type: 'DECLINE_SECOND'; timestamp: string }
```

with:

```ts
  // seconderId is set by the server from the signed-in user
  | { type: 'SECOND_MOTION'; seconder: string; seconderId?: number; timestamp: string }
  // `at` (ISO) is set by the server on the decisions the minutes record (CLOCKED_ACTIONS)
  | { type: 'DECLINE_SECOND'; at?: string; timestamp: string }
```

and:

```ts
  | { type: 'CLOSE_VOTING'; timestamp: string }
```

with:

```ts
  | { type: 'CLOSE_VOTING'; at?: string; timestamp: string }
```

and:

```ts
  | { type: 'UNANIMOUS_CONSENT_PASSED'; timestamp: string }
```

with:

```ts
  | { type: 'UNANIMOUS_CONSENT_PASSED'; at?: string; timestamp: string }
```

and:

```ts
  | { type: 'APPROVE_MINUTES'; timestamp: string }
  | { type: 'SET_PREVIOUS_MINUTES'; minutes: string }
```

with:

```ts
  // Approve the previous minutes as read, or with the corrections the chair enters
  | { type: 'APPROVE_MINUTES'; corrections?: string; at?: string; timestamp: string }
  // Server-only: the previous meeting's published minutes, and which they are
  | { type: 'SET_PREVIOUS_MINUTES'; minutes: string; minutesId?: string }
```

and:

```ts
      ruling: 'sustain' | 'overrule' | 'allow' | 'deny';
      explanation?: string;
      timestamp: string;
```

with:

```ts
      ruling: 'sustain' | 'overrule' | 'allow' | 'deny';
      explanation?: string;
      at?: string;
      timestamp: string;
```

and:

```ts
  | { type: 'DECLARE_ELECTED'; candidateName: string; timestamp: string }
```

with:

```ts
  | { type: 'DECLARE_ELECTED'; candidateName: string; at?: string; timestamp: string }
```

and:

```ts
  | { type: 'WITHDRAW_MOTION'; requesterId: number; timestamp: string }
```

with:

```ts
  | { type: 'WITHDRAW_MOTION'; requesterId: number; at?: string; timestamp: string }
```

- [ ] **Step 5: Initial values and a log line**

In `shared/reducer/initialState.ts`, replace:

```ts
  minutesFromPreviousMeeting: '', // Can be set via admin interface before meeting
  minutesApproved: false,
```

with:

```ts
  // The previous meeting's published minutes, put before this one by the server
  minutesFromPreviousMeeting: '',
  minutesApproved: false,
  previousMinutesId: null,
  minutesApproval: null,
  quorumAtCallToOrder: null,
  chairRulings: [],
  attendedIds: [],
```

and change the comment line ` * - Previous Minutes: Can be set via admin interface` to ` * - Previous Minutes: the organization's latest published minutes, loaded by the server`.

In `shared/constants/logMessages.ts`, replace:

```ts
// Minutes
export const LOG_MINUTES_APPROVED = 'Minutes from previous meeting approved.';
```

with:

```ts
// Minutes
export const LOG_MINUTES_APPROVED = 'Minutes from previous meeting approved.';

export function logMinutesApprovedWithCorrections(corrections: string): string {
  return `Minutes from previous meeting approved with corrections: ${corrections}`;
}
```

- [ ] **Step 6: Create `shared/reducer/handlers/records.ts`**

```ts
import type { CompletedMotion, Disposition, MeetingState, Motion } from '../../types/index.js';
import { attendanceSummary } from '../../utils/attendance.js';

/** Where and when a decision was made: the agenda item under way, and the server's clock */
export function decisionContext(
  state: MeetingState,
  at: string | undefined,
): { agendaItemId?: number; decidedAt?: string } {
  return {
    ...(state.currentAgendaItem ? { agendaItemId: state.currentAgendaItem.id } : {}),
    ...(at ? { decidedAt: at } : {}),
  };
}

/** Whether a quorum is present now, as the meeting counts it */
export function quorumNow(state: MeetingState): boolean {
  return attendanceSummary(state).hasQuorum;
}

/**
 * The record of a motion disposed of without a vote: adopted by unanimous consent, withdrawn,
 * or dead for want of a second. It has no votes, so nobody is on its prevailing side; only an
 * adopted one keeps its motion's reconsider flag.
 */
export function unvotedRecord(
  state: MeetingState,
  motion: Motion,
  disposition: Exclude<Disposition, 'carried' | 'failed'>,
  timestamp: string,
  at: string | undefined,
): CompletedMotion {
  const adopted = disposition === 'unanimous';
  return {
    id: motion.id,
    type: motion.type,
    name: motion.name,
    text: motion.text,
    passed: adopted,
    voterChoices: {},
    timestamp,
    reconsidered: false,
    reconsiderable: adopted && motion.reconsidered,
    mover: motion.mover,
    moverId: motion.moverId,
    ...(motion.secondedBy ? { seconder: motion.secondedBy } : {}),
    disposition,
    ...(adopted ? { quorumPresent: quorumNow(state) } : {}),
    ...decisionContext(state, at),
  };
}

/** The members who have attended, with this one among them */
export function withAttended(state: MeetingState, memberId: number): number[] {
  const attended = state.attendedIds ?? [];
  return attended.includes(memberId) ? attended : [...attended, memberId];
}
```

- [ ] **Step 7: Attendance and the call to order**

In `shared/reducer/handlers/meetingLifecycleHandlers.ts`, replace:

```ts
import type { ActionHandler } from './types.js';
```

with:

```ts
import { quorumNow } from './records.js';
import type { ActionHandler } from './types.js';
```

and in `START_MEETING`, replace:

```ts
const started = log(timestamp, LOG_MEETING_CALLED_TO_ORDER);
```

with:

```ts
const started = log(timestamp, LOG_MEETING_CALLED_TO_ORDER);
// Whether a quorum is present as the meeting is called to order, for the minutes
const quorumAtCallToOrder = quorumNow(state);
```

The case has two returns (one completes a first agenda item called "Call to order", one doesn't). In each, replace the line `meetingStage: 'call-to-order',` with:

```ts
          meetingStage: 'call-to-order',
          quorumAtCallToOrder,
```

(keeping each return's indentation).

In `shared/reducer/handlers/memberHandlers.ts`, replace:

```ts
import type { ActionHandler } from './types.js';
```

with:

```ts
import { withAttended } from './records.js';
import type { ActionHandler } from './types.js';
```

In `ADD_MEMBER`, replace:

```ts
        members: [...state.members, typedAction.member],
```

with:

```ts
        members: [...state.members, typedAction.member],
        attendedIds: typedAction.member.present
          ? withAttended(state, typedAction.member.id)
          : state.attendedIds,
```

In `SET_MEMBER_PRESENCE`, replace:

```ts
        members: state.members.map((m) =>
          m.id === typedAction.memberId ? withPresence(m, typedAction.present, presentBy) : m,
        ),
```

with:

```ts
        members: state.members.map((m) =>
          m.id === typedAction.memberId ? withPresence(m, typedAction.present, presentBy) : m,
        ),
        attendedIds: typedAction.present
          ? withAttended(state, typedAction.memberId)
          : state.attendedIds,
```

In `shared/reducer/handlers/attendanceHandlers.ts`, replace:

```ts
import { withPresence } from './memberHandlers.js';
```

with:

```ts
import { withPresence } from './memberHandlers.js';
import { withAttended } from './records.js';
```

and:

```ts
          : [...state.members, marked],
        meetingLog: log(typedAction.timestamp, logMemberMarkedPresent(marked.name)),
```

with:

```ts
          : [...state.members, marked],
        attendedIds: withAttended(state, marked.id),
        meetingLog: log(typedAction.timestamp, logMemberMarkedPresent(marked.name)),
```

- [ ] **Step 8: Motions that never reached a vote, in `shared/reducer/handlers/motionHandlers.ts`**

Replace:

```ts
import { isRuleSuspended, markSingleActionComplete } from '../../utils/ruleSuspensionHelper.js';
import type { ActionHandler } from './types.js';
```

with:

```ts
import { isRuleSuspended, markSingleActionComplete } from '../../utils/ruleSuspensionHelper.js';
import { unvotedRecord } from './records.js';
import type { ActionHandler } from './types.js';
```

Replace the `DECLINE_SECOND` case:

```ts
    case 'DECLINE_SECOND': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLINE_SECOND' }>;
      return {
        ...state,
        pendingSecond: null,
        meetingLog: log(typedAction.timestamp, LOG_MOTION_FAILED_NO_SECOND),
      };
    }
```

with:

```ts
    case 'DECLINE_SECOND': {
      const typedAction = action as Extract<MeetingAction, { type: 'DECLINE_SECOND' }>;
      // The motion dies for want of a second; the minutes say so
      const died = state.pendingSecond;
      return {
        ...state,
        pendingSecond: null,
        completedMotions: died
          ? [
              ...state.completedMotions,
              unvotedRecord(state, died, 'no-second', typedAction.timestamp, typedAction.at),
            ]
          : state.completedMotions,
        meetingLog: log(typedAction.timestamp, LOG_MOTION_FAILED_NO_SECOND),
      };
    }
```

In `WITHDRAW_MOTION`, replace:

```ts
        // Motion not yet seconded - can be withdrawn freely
        return {
          ...state,
          pendingSecond: null,
          meetingLog: log(typedAction.timestamp, logMotionWithdrawn(state.pendingSecond.mover)),
        };
      }
```

with:

```ts
        // Motion not yet seconded - can be withdrawn freely
        return {
          ...state,
          pendingSecond: null,
          completedMotions: [
            ...state.completedMotions,
            unvotedRecord(
              state,
              state.pendingSecond,
              'withdrawn',
              typedAction.timestamp,
              typedAction.at,
            ),
          ],
          meetingLog: log(typedAction.timestamp, logMotionWithdrawn(state.pendingSecond.mover)),
        };
      }
```

and:

```ts
        currentMotion: previousMotion,
        motionStack: newStack,
        votingOpen: false,
```

with:

```ts
        currentMotion: previousMotion,
        motionStack: newStack,
        completedMotions: [
          ...state.completedMotions,
          unvotedRecord(
            state,
            motionToWithdraw,
            'withdrawn',
            typedAction.timestamp,
            typedAction.at,
          ),
        ],
        votingOpen: false,
```

- [ ] **Step 9: Votes and unanimous consent**

In `shared/reducer/handlers/votingHandlers.ts`, replace:

```ts
import type { MeetingAction } from '../../types/index.js';
```

with:

```ts
import type { CompletedMotion, MeetingAction } from '../../types/index.js';
```

and:

```ts
import type { ActionHandler } from './types.js';
```

with:

```ts
import { decisionContext, quorumNow } from './records.js';
import type { ActionHandler } from './types.js';
```

and replace the record of the decided motion:

```ts
// Record every decided motion, with both parts of its vote. A secret ballot keeps no
// record of who voted which way, in person or by proxy.
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
```

with:

```ts
// Record every decided motion, with both parts of its vote, who moved and seconded it,
// and where and when it was decided. A secret ballot keeps no record of who voted which
// way, in person or by proxy.
const decided = state.currentMotion;
const record: CompletedMotion | null = decided
  ? {
      id: decided.id,
      type: decided.type,
      name: decided.name,
      text: decided.text,
      mover: decided.mover,
      moverId: decided.moverId,
      passed,
      voterChoices: isBallot ? {} : state.voterChoices,
      timestamp: typedAction.timestamp,
      reconsidered: false,
      reconsiderable: decided.reconsidered,
      deviceVotes: state.votes,
      floorVotes,
      method: state.votingMethod,
      ...(decided.secondedBy ? { seconder: decided.secondedBy } : {}),
      disposition: passed ? 'carried' : 'failed',
      quorumPresent: quorumNow(state),
      ...decisionContext(state, typedAction.at),
    }
  : null;
const completedMotions = record ? [...updatedCompletedMotions, record] : updatedCompletedMotions;
```

In `shared/reducer/handlers/consentHandlers.ts`, replace:

```ts
import type { ActionHandler } from './types.js';
```

with:

```ts
import { unvotedRecord } from './records.js';
import type { ActionHandler } from './types.js';
```

and:

```ts
        completedMotions: restored?.completedMotions ?? state.completedMotions,
```

with:

```ts
        // Adopted without a vote: recorded as unanimous consent, with the quorum
        completedMotions: [
          ...(restored?.completedMotions ?? state.completedMotions),
          ...(state.currentMotion
            ? [
                unvotedRecord(
                  state,
                  state.currentMotion,
                  'unanimous',
                  typedAction.timestamp,
                  typedAction.at,
                ),
              ]
            : []),
        ],
```

- [ ] **Step 10: Rulings, ballots and the approval of the minutes**

In `shared/reducer/handlers/ruleSuspensionHandlers.ts`, replace:

```ts
import type { ActionHandler } from './types.js';
```

with:

```ts
import { decisionContext } from './records.js';
import type { ActionHandler } from './types.js';
```

and:

```ts
        currentMotion: motionStack.at(-1) ?? null,
        motionStack,
        lastChairRuling,
```

with:

```ts
        currentMotion: motionStack.at(-1) ?? null,
        motionStack,
        lastChairRuling,
        // lastChairRuling is the one an appeal can name; the minutes need them all
        chairRulings: [
          ...(state.chairRulings ?? []),
          {
            ruling: rulingText,
            ...(typedAction.explanation ? { explanation: typedAction.explanation } : {}),
            motionText,
            timestamp: typedAction.timestamp,
            ...decisionContext(state, typedAction.at),
          },
        ],
```

In `shared/reducer/handlers/electionHandlers.ts`, replace:

```ts
import type { ActionHandler } from './types.js';
```

with:

```ts
import { decisionContext } from './records.js';
import type { ActionHandler } from './types.js';
```

In `CLOSE_ELECTION`, replace:

```ts
for (const [name, count] of Object.entries(floorBallots)) {
  results[name] = (results[name] ?? 0) + count;
}
```

with:

```ts
for (const [name, count] of Object.entries(floorBallots)) {
  results[name] = (results[name] ?? 0) + count;
}
// Every ballot's count is kept for the minutes, whatever comes of it
const ballots = [...(state.currentElection.ballots ?? []), results];
```

then add `ballots,` to the `currentElection` of each of the three returns that follow. In the runoff's, replace:

```ts
            floorBallots: {},
            votingInProgress: true,
            elected: null,
            isRunoff: true,
```

with:

```ts
            floorBallots: {},
            ballots,
            votingInProgress: true,
            elected: null,
            isRunoff: true,
```

in the next ballot's, replace:

```ts
            floorBallots: {},
            votingInProgress: true,
            elected: null,
            // Counts the repeated ballots (the first ballot is round 0)
```

with:

```ts
            floorBallots: {},
            ballots,
            votingInProgress: true,
            elected: null,
            // Counts the repeated ballots (the first ballot is round 0)
```

and in the winner's, replace:

```ts
          ballotResults: results,
          votingInProgress: false,
          elected: winner,
```

with:

```ts
          ballotResults: results,
          ballots,
          votingInProgress: false,
          elected: winner,
```

In `DECLARE_ELECTED`, replace:

```ts
const officer: Officer = {
  position: state.currentElection.position,
  name: typedAction.candidateName,
  memberId,
  electedAt: typedAction.timestamp,
};
```

with:

```ts
const ballots = state.currentElection.ballots ?? [];
const officer: Officer = {
  position: state.currentElection.position,
  name: typedAction.candidateName,
  memberId,
  electedAt: typedAction.timestamp,
  ...(ballots.length > 0 ? { ballots } : {}),
  ...decisionContext(state, typedAction.at),
};
```

In `shared/reducer/handlers/settingsHandlers.ts`, replace:

```ts
import { LOG_MINUTES_APPROVED, logQuorumChanged } from '../../constants/logMessages.js';
import type { ActionHandler } from './types.js';
```

with:

```ts
import {
  LOG_MINUTES_APPROVED,
  logMinutesApprovedWithCorrections,
  logQuorumChanged,
} from '../../constants/logMessages.js';
import { decisionContext } from './records.js';
import type { ActionHandler } from './types.js';
```

and replace the `APPROVE_MINUTES` and `SET_PREVIOUS_MINUTES` cases:

```ts
    case 'APPROVE_MINUTES': {
      const typedAction = action as Extract<MeetingAction, { type: 'APPROVE_MINUTES' }>;
      return {
        ...state,
        minutesApproved: true,
        meetingLog: log(typedAction.timestamp, LOG_MINUTES_APPROVED),
      };
    }

    case 'SET_PREVIOUS_MINUTES': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_PREVIOUS_MINUTES' }>;
      return { ...state, minutesFromPreviousMeeting: typedAction.minutes };
    }
```

with:

```ts
    case 'APPROVE_MINUTES': {
      const typedAction = action as Extract<MeetingAction, { type: 'APPROVE_MINUTES' }>;
      // Blank corrections are none: approved as read
      const corrections = typedAction.corrections?.trim() || null;
      return {
        ...state,
        minutesApproved: true,
        minutesApproval: {
          corrections,
          timestamp: typedAction.timestamp,
          ...decisionContext(state, typedAction.at),
        },
        meetingLog: log(
          typedAction.timestamp,
          corrections ? logMinutesApprovedWithCorrections(corrections) : LOG_MINUTES_APPROVED,
        ),
      };
    }

    case 'SET_PREVIOUS_MINUTES': {
      const typedAction = action as Extract<MeetingAction, { type: 'SET_PREVIOUS_MINUTES' }>;
      return {
        ...state,
        minutesFromPreviousMeeting: typedAction.minutes,
        previousMinutesId: typedAction.minutesId ?? null,
      };
    }
```

- [ ] **Step 11: The motion history, in `shared/utils/motionHistoryHelper.ts`**

Replace:

```ts
  // Add completed motions (passed/failed)
  state.completedMotions.forEach((motion) => {
    const voteCount = completedMotionVotes(motion);
```

with:

```ts
  // Add completed motions (passed/failed). Motions withdrawn or dead for want of a second were
  // never decided, and unanimous consent has no count.
  state.completedMotions.forEach((motion) => {
    if (motion.disposition === 'withdrawn' || motion.disposition === 'no-second') return;
    const voteCount =
      motion.disposition === 'unanimous' ? undefined : completedMotionVotes(motion);
```

- [ ] **Step 12: Run the shared tests to see them pass, and build shared**

Run: `cd shared && npx vitest run __tests__/reducer/meetingRecord.test.ts __tests__/reducer/floorVotes.test.ts __tests__/utils/motionHistoryHelper.test.ts && cd .. && npm run test:run -w shared && npm run build:shared`
Expected: 12 passed in `meetingRecord.test.ts`, the other two files pass, the whole shared suite passes (the reducer tests that close votes, decline seconds, withdraw and adopt by consent read records with `toMatchObject` or by index, so the appended records don't disturb them), and a clean build.

- [ ] **Step 13: The clock, the corrections and the server-only minutes on the server**

In `backend-node/src/socket/actionEnricher.ts`, after the `CREATED_ID_FIELDS` constant, add:

```ts
/**
 * The decisions the minutes record, stamped with the server's clock (ISO) as `at`, from which
 * the minutes order them and give their times. Each action's `timestamp` is a clock time
 * without a date (generateTimestamp), which the log shows as it is.
 */
export const CLOCKED_ACTIONS: ReadonlySet<MeetingAction['type']> = new Set<MeetingAction['type']>([
  'CLOSE_VOTING',
  'UNANIMOUS_CONSENT_PASSED',
  'DECLINE_SECOND',
  'WITHDRAW_MOTION',
  'CHAIR_RULING',
  'DECLARE_ELECTED',
  'APPROVE_MINUTES',
]);
```

and replace:

```ts
// Server generates timestamps using shared utility for consistency
if ('timestamp' in enriched) {
  enriched.timestamp = generateTimestamp();
}
```

with:

```ts
// Server generates timestamps using shared utility for consistency
if ('timestamp' in enriched) {
  enriched.timestamp = generateTimestamp();
}

// When a decision the minutes record happened, by the server's clock, never a client's
if (CLOCKED_ACTIONS.has(enriched.type)) {
  enriched.at = new Date().toISOString();
}
```

In `backend-node/src/socket/actionValidator.ts`, replace:

```ts
export const MAX_FLOOR_COUNT = 1_000_000;
```

with:

```ts
export const MAX_FLOOR_COUNT = 1_000_000;

/** The longest corrections to the previous minutes the chair can enter */
export const MAX_CORRECTIONS_LENGTH = 2000;
```

and replace:

```ts
    case 'APPROVE_MINUTES':
      if (state.minutesApproved) {
        return {
          valid: false,
          error: 'Minutes are already approved',
          errorCode: 'MINUTES_ALREADY_APPROVED',
        };
      }
      return { valid: true };
```

with:

```ts
    case 'APPROVE_MINUTES':
      if (state.minutesApproved) {
        return {
          valid: false,
          error: 'Minutes are already approved',
          errorCode: 'MINUTES_ALREADY_APPROVED',
        };
      }
      if (
        action.corrections !== undefined &&
        (typeof action.corrections !== 'string' ||
          action.corrections.length > MAX_CORRECTIONS_LENGTH)
      ) {
        return {
          valid: false,
          error: `Corrections can be at most ${MAX_CORRECTIONS_LENGTH} characters`,
          errorCode: 'INVALID_ACTION',
        };
      }
      return { valid: true };
```

In `backend-node/src/socket/permissionGuard.ts`, replace:

```ts
  SET_PREVIOUS_MINUTES: ['admin'],
```

with:

```ts
  // The server loads the previous meeting's published minutes (see joinHandler)
  SET_PREVIOUS_MINUTES: SERVER_ONLY,
```

- [ ] **Step 14: Count decisions once, in `frontend-unified/src/modules/meetings/utils/question.ts`**

Replace:

```ts
/** How many things the meeting decided: votes, unanimous consents and elections */
export function itemsDecided(state: MeetingState): number {
  const consents = state.meetingLog.filter((e) =>
    e.message.startsWith('Motion CARRIED by unanimous consent'),
  ).length;
  return state.completedMotions.length + consents + state.electedOfficers.length;
}
```

with:

```ts
/**
 * How many things the meeting decided: votes, unanimous consents and elections. Motions
 * withdrawn or dead for want of a second are on the record too, but decided nothing.
 */
export function itemsDecided(state: MeetingState): number {
  const decided = state.completedMotions.filter(
    (m) => m.disposition !== 'withdrawn' && m.disposition !== 'no-second',
  ).length;
  return decided + state.electedOfficers.length;
}
```

- [ ] **Step 15: Run everything**

Run:

```bash
cd backend-node && npx vitest run src/__tests__/minutesActions.test.ts src/__tests__/actionEnricher.test.ts src/__tests__/permissionGuard.test.ts && cd .. && cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/question.test.ts && cd .. && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration
```

Expected: the four files pass (`minutesActions.test.ts` has 3), every type-check is clean, and every suite passes.

- [ ] **Step 16: Commit**

```bash
npx prettier --write shared/types/index.ts shared/reducer/initialState.ts shared/constants/logMessages.ts shared/reducer/handlers/records.ts shared/reducer/handlers/meetingLifecycleHandlers.ts shared/reducer/handlers/memberHandlers.ts shared/reducer/handlers/attendanceHandlers.ts shared/reducer/handlers/motionHandlers.ts shared/reducer/handlers/votingHandlers.ts shared/reducer/handlers/consentHandlers.ts shared/reducer/handlers/ruleSuspensionHandlers.ts shared/reducer/handlers/electionHandlers.ts shared/reducer/handlers/settingsHandlers.ts shared/utils/motionHistoryHelper.ts shared/__tests__/reducer/meetingRecord.test.ts shared/__tests__/reducer/floorVotes.test.ts shared/__tests__/utils/motionHistoryHelper.test.ts backend-node/src/socket/actionEnricher.ts backend-node/src/socket/actionValidator.ts backend-node/src/socket/permissionGuard.ts backend-node/src/__tests__/minutesActions.test.ts backend-node/src/__tests__/actionEnricher.test.ts backend-node/src/__tests__/permissionGuard.test.ts frontend-unified/src/modules/meetings/utils/question.ts frontend-unified/src/modules/meetings/utils/__tests__/question.test.ts
git add shared/types/index.ts shared/reducer/initialState.ts shared/constants/logMessages.ts shared/reducer/handlers/records.ts shared/reducer/handlers/meetingLifecycleHandlers.ts shared/reducer/handlers/memberHandlers.ts shared/reducer/handlers/attendanceHandlers.ts shared/reducer/handlers/motionHandlers.ts shared/reducer/handlers/votingHandlers.ts shared/reducer/handlers/consentHandlers.ts shared/reducer/handlers/ruleSuspensionHandlers.ts shared/reducer/handlers/electionHandlers.ts shared/reducer/handlers/settingsHandlers.ts shared/utils/motionHistoryHelper.ts shared/__tests__/reducer/meetingRecord.test.ts shared/__tests__/reducer/floorVotes.test.ts shared/__tests__/utils/motionHistoryHelper.test.ts backend-node/src/socket/actionEnricher.ts backend-node/src/socket/actionValidator.ts backend-node/src/socket/permissionGuard.ts backend-node/src/__tests__/minutesActions.test.ts backend-node/src/__tests__/actionEnricher.test.ts backend-node/src/__tests__/permissionGuard.test.ts frontend-unified/src/modules/meetings/utils/question.ts frontend-unified/src/modules/meetings/utils/__tests__/question.test.ts
git commit -m "feat(desk): a meeting record the minutes can be written from

Every disposition of a motion is recorded: on a vote, by unanimous consent,
withdrawn, or dead for want of a second, each with its seconder, the agenda
item, the quorum and the server's time (at, stamped on the seven deciding
actions). The chair's rulings, each ballot of an election, who attended,
the quorum at the call to order and the approval of the previous minutes
with any corrections are kept too. SET_PREVIOUS_MINUTES is server-only and
names the minutes it loads. The display counts each decision once."
```

---

### Task 6: The minutes generator and their Markdown, rewritten

**Files:**

- Modify: `shared/types/index.ts`
- Replace: `shared/utils/minutesGenerator.ts`, `shared/__tests__/utils/minutesGenerator.test.ts`
- Delete: `backend-node/src/bylawyer/services/minutesService.ts`

The generator was never called, and it shows: it parses the log for attendance, writes "Invalid Date" for times (it parses clock times), leaves the seconder empty, can't place a decision under its agenda item, and knows nothing of unanimous consent, withdrawals, rulings, ballots or the approval of the minutes. It is rewritten on the record from Task 5. `generateMeetingMinutes(state)` says what happened; `formatMinutesAsMarkdown(minutes, context)` writes it, with what the state doesn't hold (`MinutesContext`: the organization's name and time zone, the meeting's title, place and date, when it was called to order and adjourned, from the packet, and the organization's voting members for the absent list). Votes and ballots are written as counts only, never who voted which way.

The minutes read like this (the test's scenario, in Chicago):

```markdown
# Maple Grove HOA

## Minutes of the 2026 Annual Meeting

Tuesday, October 20, 2026, at Maple Grove Clubhouse.

Dana Okafor presided. The meeting was called to order at 7:02 PM.

## Attendance

**Members present (6):** Alice Brennan, Ben Whitaker, Carmen Diaz (marked present), Dana Okafor, Grace Kim, Pat Lindqvist.

**Also present without an account (3):** Dee Fox, Eli Grant and 1 other.

**Guests:** Sam Ortiz.

**Absent (2):** David Nguyen, Elena Petrova.

A quorum of 29 was present at the call to order.

## Proceedings

### 3. Old business: pool resurfacing contract

**Main Motion.** Alice Brennan moved: "I move that we resurface the pool this spring." Seconded by Ben Whitaker. Carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5. A quorum was present.
```

`minutesService.ts` goes now: it typed itself on the old `MeetingMinutes`, was never imported, and had no tests.

- [ ] **Step 1: Write the failing test**

Replace `shared/__tests__/utils/minutesGenerator.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '../../reducer/index.js';
import { NO_VOTES, formatMinutesAsMarkdown, generateMeetingMinutes } from '../../utils/index.js';
import type { CompletedMotion, MeetingState, MinutesContext } from '../../types/index.js';

/** The server's clock on the night, in UTC (7:00 PM in Chicago is midnight UTC) */
const at = (time: string) => `2026-10-21T${time}:00.000Z`;

function record(
  overrides: Partial<CompletedMotion> & Pick<CompletedMotion, 'id' | 'text'>,
): CompletedMotion {
  return {
    type: 'mainMotion',
    name: 'Main Motion',
    passed: true,
    voterChoices: {},
    timestamp: '',
    reconsidered: false,
    ...overrides,
  };
}

/** Maple Grove's annual meeting, adjourned: every kind of thing the minutes record */
const scenario: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  meetingStage: 'adjourned',
  quorum: 29,
  quorumAtCallToOrder: true,
  members: [
    { id: 1, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
    { id: 2, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'device' },
    { id: 3, name: 'Ben Whitaker', role: 'member', present: true, presentBy: 'device' },
    { id: 4, name: 'Carmen Diaz', role: 'member', present: true, presentBy: 'chair' },
    // Left before the adjournment
    { id: 5, name: 'Grace Kim', role: 'member', present: false },
    { id: 6, name: 'Sam Ortiz', role: 'guest', present: true, presentBy: 'device' },
    { id: 7, name: 'Pat Lindqvist', role: 'admin', present: true, presentBy: 'device' },
  ],
  attendedIds: [1, 2, 3, 4, 5, 6, 7],
  headcount: 3,
  headcountNames: ['Dee Fox', 'Eli Grant'],
  agenda: [
    { id: 1, title: 'Call to order', status: 'completed' },
    { id: 2, title: 'Approval of the minutes of the 2025 annual meeting', status: 'completed' },
    { id: 3, title: 'Old business: pool resurfacing contract', status: 'completed' },
    {
      id: 4,
      title: 'New business: amend Section 4.2 to lower the quorum to 15%',
      status: 'completed',
    },
    { id: 5, title: 'Election of two directors', status: 'completed' },
    { id: 6, title: "Treasurer's report", status: 'pending' },
    { id: 7, title: 'Adjournment', status: 'completed' },
  ],
  minutesApproval: {
    corrections: 'The 2025 meeting adjourned at 8:15 PM, not 8:50 PM',
    timestamp: '7:05:00 PM',
    decidedAt: at('00:05'),
    agendaItemId: 2,
  },
  completedMotions: [
    record({
      id: 10,
      text: 'I move that we resurface the pool this spring',
      mover: 'Alice Brennan',
      moverId: 2,
      seconder: 'Ben Whitaker',
      deviceVotes: { yea: 12, nay: 3, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
      method: 'standard',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 3,
      decidedAt: at('00:20'),
    }),
    // Recorded after the vote above but decided before it: the clock orders them
    record({
      id: 11,
      type: 'amend',
      name: 'Amend',
      text: 'Strike spring and insert summer',
      mover: 'Ben Whitaker',
      moverId: 3,
      passed: false,
      disposition: 'withdrawn',
      agendaItemId: 3,
      decidedAt: at('00:15'),
    }),
    record({
      id: 12,
      text: 'Paint the clubhouse red',
      mover: 'Grace Kim',
      moverId: 5,
      passed: false,
      disposition: 'no-second',
      agendaItemId: 3,
      decidedAt: at('00:25'),
    }),
    record({
      id: 13,
      type: 'appeal',
      name: "Appeal the Chair's Decision",
      text: 'Appeal the ruling on the point of order',
      mover: 'Ben Whitaker',
      moverId: 3,
      seconder: 'Alice Brennan',
      deviceVotes: { yea: 15, nay: 5, abstain: 0 },
      floorVotes: NO_VOTES,
      method: 'standard',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 3,
      decidedAt: at('00:23'),
    }),
    record({
      id: 14,
      type: 'bylawAmendment',
      name: 'Bylaw Amendment',
      text: 'Amend Section 4.2 to lower the quorum to 15%',
      mover: 'Pat Lindqvist',
      moverId: 7,
      seconder: 'Alice Brennan',
      // A secret ballot: its record keeps no choices
      deviceVotes: { yea: 14, nay: 4, abstain: 1 },
      floorVotes: { yea: 8, nay: 2, abstain: 0 },
      method: 'ballot',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 4,
      decidedAt: at('00:40'),
    }),
    record({
      id: 15,
      text: 'Thank the outgoing directors',
      mover: 'Carmen Diaz',
      moverId: 4,
      seconder: 'a member in the room',
      disposition: 'unanimous',
      quorumPresent: true,
      agendaItemId: 4,
      decidedAt: at('00:45'),
    }),
    record({
      id: 16,
      text: 'Adopt the 2027 budget',
      mover: 'Put by the chair',
      moverId: 0,
      seconder: 'Carmen Diaz',
      deviceVotes: { yea: 20, nay: 1, abstain: 0 },
      floorVotes: NO_VOTES,
      method: 'standard',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 4,
      decidedAt: at('00:50'),
    }),
    // Decided outside any agenda item
    record({
      id: 17,
      text: 'Hold the next meeting online',
      mover: 'Ben Whitaker',
      moverId: 3,
      seconder: 'Alice Brennan',
      passed: false,
      deviceVotes: NO_VOTES,
      floorVotes: { yea: 4, nay: 20, abstain: 0 },
      method: 'voice',
      disposition: 'failed',
      quorumPresent: false,
      decidedAt: at('01:30'),
    }),
  ],
  chairRulings: [
    {
      ruling: 'The point is well taken.',
      explanation: 'Debate must be on the motion',
      motionText: 'Point of order: the speaker is off the subject',
      timestamp: '',
      decidedAt: at('00:22'),
      agendaItemId: 3,
    },
  ],
  electedOfficers: [
    {
      position: 'Director',
      name: 'Carmen Diaz',
      memberId: 4,
      electedAt: '',
      ballots: [{ 'Carmen Diaz': 18, 'Ray Castillo': 9 }],
      agendaItemId: 5,
      decidedAt: at('01:05'),
    },
    {
      position: 'Director',
      name: 'Frank Osei',
      memberId: 0,
      electedAt: '',
      ballots: [
        { 'Frank Osei': 12, 'Hector Ramos': 12 },
        { 'Frank Osei': 15, 'Hector Ramos': 11 },
      ],
      agendaItemId: 5,
      decidedAt: at('01:15'),
    },
  ],
};

const context: MinutesContext = {
  organizationName: 'Maple Grove HOA',
  timeZone: 'America/Chicago',
  title: '2026 Annual Meeting',
  location: 'Maple Grove Clubhouse',
  scheduledFor: '2026-10-21T00:00:00.000Z',
  calledToOrderAt: '2026-10-21T00:02:00.000Z',
  adjournedAt: '2026-10-21T01:42:00.000Z',
  voters: [
    { id: 1, name: 'Dana Okafor' },
    { id: 2, name: 'Alice Brennan' },
    { id: 3, name: 'Ben Whitaker' },
    { id: 4, name: 'Carmen Diaz' },
    { id: 5, name: 'Grace Kim' },
    { id: 7, name: 'Pat Lindqvist' },
    { id: 8, name: 'Elena Petrova' },
    { id: 9, name: 'David Nguyen' },
  ],
};

const nothingKnown: MinutesContext = {
  organizationName: 'Garden Club',
  timeZone: 'America/Chicago',
  title: '',
  location: null,
  scheduledFor: null,
  calledToOrderAt: null,
  adjournedAt: null,
  voters: [],
};

describe('the minutes', () => {
  it('record the meeting, each decision under its agenda item in the order it happened', () => {
    const markdown = formatMinutesAsMarkdown(generateMeetingMinutes(scenario), context);
    expect(markdown).toBe(
      [
        '# Maple Grove HOA',
        '',
        '## Minutes of the 2026 Annual Meeting',
        '',
        'Tuesday, October 20, 2026, at Maple Grove Clubhouse.',
        '',
        'Dana Okafor presided. The meeting was called to order at 7:02 PM.',
        '',
        '## Attendance',
        '',
        '**Members present (6):** Alice Brennan, Ben Whitaker, Carmen Diaz (marked present), Dana Okafor, Grace Kim, Pat Lindqvist.',
        '',
        '**Also present without an account (3):** Dee Fox, Eli Grant and 1 other.',
        '',
        '**Guests:** Sam Ortiz.',
        '',
        '**Absent (2):** David Nguyen, Elena Petrova.',
        '',
        'A quorum of 29 was present at the call to order.',
        '',
        '## Proceedings',
        '',
        '### 1. Call to order',
        '',
        '### 2. Approval of the minutes of the 2025 annual meeting',
        '',
        'The minutes of the previous meeting were approved with corrections: The 2025 meeting adjourned at 8:15 PM, not 8:50 PM.',
        '',
        '### 3. Old business: pool resurfacing contract',
        '',
        '**Amend.** Ben Whitaker moved: "Strike spring and insert summer." Withdrawn by the mover.',
        '',
        '**Main Motion.** Alice Brennan moved: "I move that we resurface the pool this spring." Seconded by Ben Whitaker. Carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5. A quorum was present.',
        '',
        '**Ruling of the chair.** On "Point of order: the speaker is off the subject." the chair ruled: The point is well taken. Debate must be on the motion.',
        '',
        '**Appeal the Chair\'s Decision.** Ben Whitaker moved: "Appeal the ruling on the point of order." Seconded by Alice Brennan. The chair\'s decision was sustained, 15 to 5. A quorum was present.',
        '',
        '**Main Motion.** Grace Kim moved: "Paint the clubhouse red." Died for lack of a second.',
        '',
        '### 4. New business: amend Section 4.2 to lower the quorum to 15%',
        '',
        '**Bylaw Amendment.** Pat Lindqvist moved: "Amend Section 4.2 to lower the quorum to 15%." Seconded by Alice Brennan. Carried by ballot, on devices 14 to 4 and in the room 8 to 2: 22 to 6, 1 abstaining. A quorum was present.',
        '',
        '**Main Motion.** Carmen Diaz moved: "Thank the outgoing directors." Seconded by a member in the room. Adopted by unanimous consent. A quorum was present.',
        '',
        '**Main Motion.** The chair put the question: "Adopt the 2027 budget." Seconded by Carmen Diaz. Carried, 20 to 1. A quorum was present.',
        '',
        '### 5. Election of two directors',
        '',
        '**Election for Director.** Ballot 1: Carmen Diaz 18, Ray Castillo 9. Carmen Diaz was elected.',
        '',
        '**Election for Director.** Ballot 1: Frank Osei 12, Hector Ramos 12. Ballot 2: Frank Osei 15, Hector Ramos 11. Frank Osei was elected.',
        '',
        "### 6. Treasurer's report",
        '',
        'Not taken up.',
        '',
        '### 7. Adjournment',
        '',
        '### Other business',
        '',
        '**Main Motion.** Ben Whitaker moved: "Hold the next meeting online." Seconded by Alice Brennan. Failed on a voice vote, 4 to 20. No quorum was present.',
        '',
        '## Adjournment',
        '',
        'The meeting adjourned at 8:42 PM.',
        '',
      ].join('\n'),
    );
  });

  it('leave out what they do not know', () => {
    const minutes = generateMeetingMinutes({ ...initialState, title: 'Board meeting' });
    expect(formatMinutesAsMarkdown(minutes, nothingKnown)).toBe(
      [
        '# Garden Club',
        '',
        '## Minutes of the Board meeting',
        '',
        '## Attendance',
        '',
        '**Members present:** none.',
        '',
        '## Proceedings',
        '',
        'No business was recorded.',
        '',
      ].join('\n'),
    );
  });

  it('count a vote recorded before its parts were kept from its choices, and name nobody', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      completedMotions: [
        record({
          id: 1,
          text: 'Approve the budget',
          mover: 'Alice',
          voterChoices: { 1: 'yea', 2: 'yea', 3: 'nay' },
        }),
      ],
    });
    expect(minutes.otherEntries).toHaveLength(1);
    expect(formatMinutesAsMarkdown(minutes, nothingKnown)).toContain(
      '**Main Motion.** Alice moved: "Approve the budget." Carried, 2 to 1.\n',
    );
  });

  it('give times in UTC when the time zone is unknown', () => {
    const markdown = formatMinutesAsMarkdown(generateMeetingMinutes(initialState), {
      ...nothingKnown,
      timeZone: 'Nowhere/Land',
      calledToOrderAt: '2026-10-21T00:02:00.000Z',
    });
    expect(markdown).toContain('The meeting was called to order at 12:02 AM.');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd shared && npx vitest run __tests__/utils/minutesGenerator.test.ts`
Expected: FAIL: `formatMinutesAsMarkdown` writes the old layout ("# Meeting Minutes", "**Meeting Code:**", an "Invalid Date") and has no `otherEntries`.

- [ ] **Step 3: The minutes' types, in `shared/types/index.ts`**

Replace everything from the line `// Meeting Minutes types` to the end of the file with:

```ts
// Meeting Minutes types

/** Something the minutes record */
export type MinutesEntry =
  | { kind: 'motion'; motion: CompletedMotion }
  | { kind: 'ruling'; ruling: ChairRulingRecord }
  | { kind: 'election'; officer: Officer }
  | { kind: 'minutes'; approval: MinutesApprovalRecord };

/** An agenda item, with what was decided under it in the order it happened */
export interface MinutesItem {
  title: string;
  status: AgendaItem['status'];
  entries: MinutesEntry[];
}

/** What the minutes of a meeting record, from its final state (see generateMeetingMinutes) */
export interface MeetingMinutes {
  meetingCode: string;
  title: string;
  chairName: string | null;
  /** Members (not guests) present at any point; marked when the chair marked them present */
  present: Array<{ id: number; name: string; marked: boolean }>;
  /** Guests present at any point, by name */
  guests: string[];
  /** People present without an account, and the names given for them */
  headcount: number;
  headcountNames: string[];
  quorum: number;
  quorumAtCallToOrder: boolean | null;
  /** The agenda in order */
  items: MinutesItem[];
  /** What was decided outside any agenda item, in order */
  otherEntries: MinutesEntry[];
}

/** What the minutes need from outside the meeting state: its organization and its packet */
export interface MinutesContext {
  organizationName: string;
  /** An IANA time zone name: the minutes give dates and times there */
  timeZone: string;
  title: string;
  location: string | null;
  /** When the meeting was scheduled, called to order and adjourned (ISO) */
  scheduledFor: string | null;
  calledToOrderAt: string | null;
  adjournedAt: string | null;
  /** The organization's voting members (member role and above), for the absent list */
  voters: Array<{ id: number; name: string }>;
}
```

(`AttendanceRecord`, `MinutesMotionRecord` and `MinutesElectionRecord` go: only the old generator and `minutesService.ts` used them.)

- [ ] **Step 4: Replace `shared/utils/minutesGenerator.ts`**

```ts
import type {
  ChairRulingRecord,
  CompletedMotion,
  MeetingMinutes,
  MeetingState,
  MinutesApprovalRecord,
  MinutesContext,
  MinutesEntry,
  Officer,
  Votes,
} from '../types/index.js';
import { PUT_BY_CHAIR } from '../constants/floor.js';
import { NO_VOTES, addVotes, completedMotionVotes } from './voteCalculator.js';

/** An entry with where and when it happened, for grouping and ordering */
interface Placed {
  entry: MinutesEntry;
  agendaItemId?: number;
  decidedAt?: string;
  order: number;
}

const byName = (a: string, b: string) => a.localeCompare(b);

/**
 * What the minutes of a meeting record, from its final state: who attended (anyone present at
 * any point), and each agenda item with what was decided under it, in the order it happened
 * by the server's clock. Votes and ballots are counts: who voted which way is never kept here.
 */
export function generateMeetingMinutes(state: MeetingState): MeetingMinutes {
  const attended = new Set(state.attendedIds ?? []);
  const there = state.members.filter((m) => m.present || attended.has(m.id));
  const present = there
    .filter((m) => m.role !== 'guest')
    .map((m) => ({ id: m.id, name: m.name, marked: m.presentBy === 'chair' }))
    .sort((a, b) => byName(a.name, b.name));
  const guests = there
    .filter((m) => m.role === 'guest')
    .map((m) => m.name)
    .sort(byName);

  const placed: Placed[] = [];
  const add = (entry: MinutesEntry, where: { agendaItemId?: number; decidedAt?: string }) => {
    placed.push({
      entry,
      agendaItemId: where.agendaItemId,
      decidedAt: where.decidedAt,
      order: placed.length,
    });
  };
  for (const motion of state.completedMotions) add({ kind: 'motion', motion }, motion);
  for (const ruling of state.chairRulings ?? []) add({ kind: 'ruling', ruling }, ruling);
  for (const officer of state.electedOfficers) add({ kind: 'election', officer }, officer);
  if (state.minutesApproval) {
    add({ kind: 'minutes', approval: state.minutesApproval }, state.minutesApproval);
  }
  // By the server's clock; anything recorded without it comes first, in the order it was kept
  placed.sort((a, b) => (a.decidedAt ?? '').localeCompare(b.decidedAt ?? '') || a.order - b.order);

  const agendaIds = new Set(state.agenda.map((item) => item.id));
  return {
    meetingCode: state.meetingCode,
    title: state.title,
    chairName: state.members.find((m) => m.role === 'chair')?.name ?? null,
    present,
    guests,
    headcount: state.headcount ?? 0,
    headcountNames: state.headcountNames ?? [],
    quorum: state.quorum,
    quorumAtCallToOrder: state.quorumAtCallToOrder ?? null,
    items: state.agenda.map((item) => ({
      title: item.title,
      status: item.status,
      entries: placed.filter((p) => p.agendaItemId === item.id).map((p) => p.entry),
    })),
    otherEntries: placed
      .filter((p) => p.agendaItemId === undefined || !agendaIds.has(p.agendaItemId))
      .map((p) => p.entry),
  };
}

/** A time zone this runtime knows, or UTC */
function knownZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

// ICU puts a narrow no-break space before AM and PM; the minutes are plain text
const plainSpaces = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ');

/** "7:02 PM" in the organization's time zone */
function clockTime(iso: string, timeZone: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    ),
  );
}

/** "Tuesday, October 20, 2026" in the organization's time zone */
function longDate(iso: string, timeZone: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso)),
  );
}

/** Text as a sentence: with a closing period unless it has one (or a question or exclamation mark) */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const counted = (votes: Votes) => votes.yea + votes.nay + votes.abstain > 0;

/** "Carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5." and the like */
function voteText(motion: CompletedMotion): string {
  const result =
    motion.type === 'appeal'
      ? motion.passed
        ? "The chair's decision was sustained"
        : "The chair's decision was overturned"
      : motion.passed
        ? 'Carried'
        : 'Failed';
  // A record made before the parts were kept is counted from its device votes
  const device = motion.deviceVotes ?? completedMotionVotes(motion);
  const floor = motion.floorVotes ?? NO_VOTES;
  const total = addVotes(device, floor);
  const abstaining = total.abstain > 0 ? `, ${total.abstain} abstaining` : '';
  if (motion.method === 'voice') {
    const count = counted(floor) ? `, ${floor.yea} to ${floor.nay}` : '';
    return `${result} on a voice vote${count}${abstaining}.`;
  }
  const how =
    motion.method === 'ballot'
      ? ' by ballot'
      : motion.method === 'rollcall'
        ? ' on a roll call'
        : '';
  if (counted(device) && counted(floor)) {
    return `${result}${how}, on devices ${device.yea} to ${device.nay} and in the room ${floor.yea} to ${floor.nay}: ${total.yea} to ${total.nay}${abstaining}.`;
  }
  if (counted(total)) return `${result}${how}, ${total.yea} to ${total.nay}${abstaining}.`;
  return `${result}${how}.`;
}

function quorumNote(motion: CompletedMotion): string {
  if (motion.quorumPresent === undefined) return '';
  return motion.quorumPresent ? ' A quorum was present.' : ' No quorum was present.';
}

function outcomeText(motion: CompletedMotion): string {
  switch (motion.disposition) {
    case 'withdrawn':
      return 'Withdrawn by the mover.';
    case 'no-second':
      return 'Died for lack of a second.';
    case 'unanimous':
      return `Adopted by unanimous consent.${quorumNote(motion)}`;
    default:
      return `${voteText(motion)}${quorumNote(motion)}`;
  }
}

function motionText(motion: CompletedMotion): string {
  const text = `"${sentence(motion.text)}"`;
  const moved =
    motion.mover === PUT_BY_CHAIR
      ? `The chair put the question: ${text}`
      : motion.mover
        ? `${motion.mover} moved: ${text}`
        : `Moved: ${text}`;
  const seconded = motion.seconder ? ` Seconded by ${motion.seconder}.` : '';
  return `**${motion.name}.** ${moved}${seconded} ${outcomeText(motion)}`;
}

function rulingText(ruling: ChairRulingRecord): string {
  const why = ruling.explanation ? ` ${sentence(ruling.explanation)}` : '';
  return `**Ruling of the chair.** On "${sentence(ruling.motionText)}" the chair ruled: ${ruling.ruling}${why}`;
}

function electionText(officer: Officer): string {
  const ballots = (officer.ballots ?? []).map((counts, index) => {
    const tally = Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name} ${count}`)
      .join(', ');
    return `Ballot ${index + 1}: ${tally}.`;
  });
  return [`**Election for ${officer.position}.**`, ...ballots, `${officer.name} was elected.`].join(
    ' ',
  );
}

function approvalText(approval: MinutesApprovalRecord): string {
  return approval.corrections
    ? `The minutes of the previous meeting were approved with corrections: ${sentence(approval.corrections)}`
    : 'The minutes of the previous meeting were approved as read.';
}

function entryText(entry: MinutesEntry): string {
  switch (entry.kind) {
    case 'motion':
      return motionText(entry.motion);
    case 'ruling':
      return rulingText(entry.ruling);
    case 'election':
      return electionText(entry.officer);
    case 'minutes':
      return approvalText(entry.approval);
  }
}

/**
 * The minutes as Markdown, the secretary's draft: a heading with the organization, the meeting,
 * its date and place and who presided; attendance; each agenda item with what was decided under
 * it; and the adjournment. Dates and times are the organization's.
 */
export function formatMinutesAsMarkdown(minutes: MeetingMinutes, context: MinutesContext): string {
  const zone = knownZone(context.timeZone);
  const lines: string[] = [];
  const paragraph = (text: string) => lines.push(text, '');

  paragraph(`# ${context.organizationName}`);
  paragraph(`## Minutes of the ${context.title || minutes.title || 'Meeting'}`);
  const day = context.scheduledFor ?? context.calledToOrderAt;
  if (day) {
    paragraph(`${longDate(day, zone)}${context.location ? `, at ${context.location}` : ''}.`);
  } else if (context.location) {
    paragraph(`At ${context.location}.`);
  }
  const opening = [
    ...(minutes.chairName ? [`${minutes.chairName} presided.`] : []),
    ...(context.calledToOrderAt
      ? [`The meeting was called to order at ${clockTime(context.calledToOrderAt, zone)}.`]
      : []),
  ];
  if (opening.length > 0) paragraph(opening.join(' '));

  paragraph('## Attendance');
  const members = minutes.present.map((p) => (p.marked ? `${p.name} (marked present)` : p.name));
  paragraph(
    members.length > 0
      ? `**Members present (${members.length}):** ${members.join(', ')}.`
      : '**Members present:** none.',
  );
  if (minutes.headcount > 0) {
    const named = minutes.headcountNames;
    const others = minutes.headcount - named.length;
    if (named.length === 0) {
      paragraph(`**Also present without an account:** ${minutes.headcount}.`);
    } else {
      const rest = others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : '';
      paragraph(
        `**Also present without an account (${minutes.headcount}):** ${named.join(', ')}${rest}.`,
      );
    }
  }
  if (minutes.guests.length > 0) paragraph(`**Guests:** ${minutes.guests.join(', ')}.`);
  const presentIds = new Set(minutes.present.map((p) => p.id));
  const absent = context.voters
    .filter((v) => !presentIds.has(v.id))
    .map((v) => v.name)
    .sort(byName);
  if (absent.length > 0) paragraph(`**Absent (${absent.length}):** ${absent.join(', ')}.`);
  if (minutes.quorumAtCallToOrder !== null) {
    paragraph(
      `A quorum of ${minutes.quorum} was ${minutes.quorumAtCallToOrder ? '' : 'not '}present at the call to order.`,
    );
  }

  paragraph('## Proceedings');
  minutes.items.forEach((item, index) => {
    paragraph(`### ${index + 1}. ${item.title}`);
    if (item.status === 'pending' && item.entries.length === 0) paragraph('Not taken up.');
    for (const entry of item.entries) paragraph(entryText(entry));
  });
  if (minutes.otherEntries.length > 0) {
    if (minutes.items.length > 0) paragraph('### Other business');
    for (const entry of minutes.otherEntries) paragraph(entryText(entry));
  }
  if (minutes.items.length === 0 && minutes.otherEntries.length === 0) {
    paragraph('No business was recorded.');
  }

  if (context.adjournedAt) {
    paragraph('## Adjournment');
    paragraph(`The meeting adjourned at ${clockTime(context.adjournedAt, zone)}.`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Format meeting minutes as JSON (for export/API)
 */
export function formatMinutesAsJSON(minutes: MeetingMinutes): string {
  return JSON.stringify(minutes, null, 2);
}
```

- [ ] **Step 5: Delete the dead service**

Run: `git rm backend-node/src/bylawyer/services/minutesService.ts`
Expected: `rm 'backend-node/src/bylawyer/services/minutesService.ts'`. Nothing imports it (`grep -rn minutesService backend-node/src` prints nothing).

- [ ] **Step 6: Run it to see it pass, and build shared**

Run: `cd shared && npx vitest run __tests__/utils/minutesGenerator.test.ts && cd .. && npm run build:shared`
Expected: 4 passed, then a clean build. If the first test fails only on a time, check that Node's ICU has the full time zone data (`node -e "console.log(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date('2026-10-21T00:02:00Z')))"` prints `7:02 PM`, with a narrow space that the formatter makes plain).

- [ ] **Step 7: Run everything that reads shared**

Run: `npm run test:run -w shared && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w backend-node`
Expected: all pass, all clean (nothing else used the old minutes types).

- [ ] **Step 8: Commit**

```bash
npx prettier --write shared/types/index.ts shared/utils/minutesGenerator.ts shared/__tests__/utils/minutesGenerator.test.ts
git add shared/types/index.ts shared/utils/minutesGenerator.ts shared/__tests__/utils/minutesGenerator.test.ts
git commit -m "feat(desk): minutes written from the meeting record

generateMeetingMinutes reads the record, not the log: attendance (members
present at any point, those marked present, the headcount with names,
guests), and each agenda item with every disposition under it in the order
it happened. formatMinutesAsMarkdown writes the draft in the organization's
time zone: who presided, when the meeting was called to order and
adjourned, who was absent, the quorum, both parts of each vote, unanimous
consent, withdrawals, motions that died, rulings, each ballot of an
election, and the approval of the previous minutes with any corrections.
The dead minutesService.ts goes."
```

---

### Task 7: The minutes routes

**Files:**

- Create: `backend-node/src/bylawyer/services/meetingMinutes.ts`, `backend-node/src/schemas/minutes.ts`, `backend-node/src/bylawyer/routes/minutes.ts`
- Modify: `backend-node/src/bylawyer/routes/index.ts`, `backend-node/src/app.ts`, `backend-node/src/orgs/resolvers.ts`
- Modify: `backend-node/src/__integration__/fixtures.ts`, `backend-node/src/__integration__/resolvers.test.ts`
- Create: `backend-node/src/__integration__/minutes.test.ts`

Five routes. Members read published and approved minutes; a draft is the secretary's until it is published, so below secretary it is not found (404, as an outsider's resource is), and the list leaves drafts out. Secretaries edit (the last to save is named, and last save wins), publish, and write a draft again from the meeting's live record. Approved minutes are the record: they can't be edited or published again. The body is Markdown up to 200,000 characters, so its route gets the 2 MB JSON parser from Task 3.

The fixture gains two minutes: published minutes of A's empty packet (`ORGA02`, "the September meeting") and draft minutes of its packet (`ORGA01`).

- [ ] **Step 1: Write the failing tests**

In `backend-node/src/__integration__/fixtures.ts`, in `interface Fixture`, replace:

```ts
/** A's packet with nothing in it (code ORGA02) */
emptyPacket: {
  id: string;
  code: string;
}
```

with:

```ts
/** A's packet with nothing in it (code ORGA02) */
emptyPacket: {
  id: string;
  code: string;
}
/** Published minutes of emptyPacket (published by A's secretary), and draft minutes of packet */
minutes: string;
draftMinutes: string;
```

in `seedFixture`, insert before `  const invite = await prisma.organizationInvite.create({`:

```ts
const minutes = await prisma.minutes.create({
  data: {
    organizationId: orgA.id,
    packetId: emptyPacket.id,
    status: 'published',
    body: '# Org A\n\n## Minutes of the September meeting\n\nThe meeting adjourned at 8:00 PM.\n',
    publishedAt: new Date('2026-09-10T12:00:00Z'),
    publishedById: users.secretary.id,
  },
});
const draftMinutes = await prisma.minutes.create({
  data: {
    organizationId: orgA.id,
    packetId: packet.id,
    body: '# Org A\n\n## Minutes of the October meeting\n',
  },
});
```

and in the returned object, replace:

```ts
    emptyPacket: { id: emptyPacket.id, code: emptyPacket.robbieCode },
```

with:

```ts
    emptyPacket: { id: emptyPacket.id, code: emptyPacket.robbieCode },
    minutes: minutes.id,
    draftMinutes: draftMinutes.id,
```

In `backend-node/src/__integration__/resolvers.test.ts`, add `orgOfMinutes,` to the import list (after `orgOfMeeting,`), add after `expect(await orgOfAttachment(f.upload)).toBe(a);`:

```ts
expect(await orgOfMinutes(f.minutes)).toBe(a);
```

and add `orgOfMinutes,` to the `byId` list (after `orgOfAttachment,`).

Create `backend-node/src/__integration__/minutes.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { OrgRole } from '../generated/prisma/client.js';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import {
  MINUTES_APPROVED,
  NO_MEETING_RECORD,
  ONLY_DRAFTS_REGENERATE,
} from '../bylawyer/routes/minutes.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

// Writing minutes again reads the meeting's live record, in the live meetings table; no test
// starts with one left over from another file
beforeAll(initializeStorage);
beforeEach(resetLiveMeetings);

describeRules('minutes rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/minutes',
    path: (f) => `/api/organizations/${f.orgA.id}/minutes`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/minutes/:id',
    path: (f) => `/api/minutes/${f.minutes}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/minutes/:id',
    path: (f) => `/api/minutes/${f.draftMinutes}`,
    body: () => ({ body: '# Edited' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/minutes/:id/publish',
    path: (f) => `/api/minutes/${f.draftMinutes}/publish`,
    min: 'secretary',
    ok: 200,
  },
  {
    // The fixture's meeting never met: the rule lets a secretary through to the answer that
    // there is nothing to write from
    method: 'post',
    route: '/minutes/:id/regenerate',
    path: (f) => `/api/minutes/${f.draftMinutes}/regenerate`,
    min: 'secretary',
    ok: 409,
  },
]);

describe('minutes', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const as = (role: OrgRole) => f.users[role].cookie;

  it('are listed by meeting date, the drafts only for secretaries and above', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.emptyPacket.id },
      data: { scheduledFor: new Date('2026-09-01T00:00:00Z') },
    });
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: new Date('2026-10-20T19:00:00Z') },
    });
    const path = `/api/organizations/${f.orgA.id}/minutes`;

    const secretary = await call('get', path, { cookie: as('secretary') });
    expect(secretary.body.map((m: { id: string }) => m.id)).toEqual([f.draftMinutes, f.minutes]);
    expect(secretary.body[1]).toEqual({
      id: f.minutes,
      status: 'published',
      generatedAt: expect.any(String),
      updatedAt: expect.any(String),
      publishedAt: '2026-09-10T12:00:00.000Z',
      approvedAt: null,
      packet: {
        id: f.emptyPacket.id,
        robbieCode: 'ORGA02',
        title: null,
        scheduledFor: '2026-09-01T00:00:00.000Z',
      },
    });

    const member = await call('get', path, { cookie: as('member') });
    expect(member.body.map((m: { id: string }) => m.id)).toEqual([f.minutes]);
  });

  it('are read by members once published; a draft is not there for them', async () => {
    const published = await call('get', `/api/minutes/${f.minutes}`, { cookie: as('viewer') });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      id: f.minutes,
      packetId: f.emptyPacket.id,
      status: 'published',
      body: expect.stringContaining('September meeting'),
      corrections: null,
      packet: {
        id: f.emptyPacket.id,
        robbieCode: 'ORGA02',
        title: null,
        scheduledFor: null,
        location: null,
      },
      organization: { id: f.orgA.id, name: 'Org A', timeZone: 'America/Chicago' },
      publishedBy: { id: f.users.secretary.id, name: 'A secretary' },
      updatedBy: null,
      approvedAtPacket: null,
    });

    for (const role of ['viewer', 'member'] as const) {
      const draft = await call('get', `/api/minutes/${f.draftMinutes}`, { cookie: as(role) });
      expect(draft.status, role).toBe(404);
      expect(draft.body).toEqual({ error: 'Not found' });
    }
    const secretary = await call('get', `/api/minutes/${f.draftMinutes}`, {
      cookie: as('secretary'),
    });
    expect(secretary.body.status).toBe('draft');
  });

  it('are edited by a secretary, who is named as the last to save', async () => {
    const res = await call('put', `/api/minutes/${f.draftMinutes}`, {
      cookie: as('secretary'),
      body: { body: '# Minutes\n\nFixed a name.' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      body: '# Minutes\n\nFixed a name.',
      status: 'draft',
      updatedBy: { id: f.users.secretary.id, name: 'A secretary' },
    });
  });

  it('take a long text, but not one over 200,000 characters', async () => {
    const put = (body: string) =>
      call('put', `/api/minutes/${f.draftMinutes}`, { cookie: as('secretary'), body: { body } });
    // 128,000 characters: more than the usual 100 KB of JSON
    expect((await put('The meeting discussed the pool. '.repeat(4000))).status).toBe(200);
    expect((await put('x'.repeat(200_001))).status).toBe(400);
  });

  it('are published once, and approved minutes are not changed', async () => {
    const path = `/api/minutes/${f.draftMinutes}/publish`;
    const published = await call('post', path, { cookie: as('secretary') });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      status: 'published',
      publishedBy: { id: f.users.secretary.id },
    });
    expect(published.body.publishedAt).not.toBeNull();

    // Publishing again changes nothing: the first publisher stays
    const again = await call('post', path, { cookie: as('admin') });
    expect(again.status).toBe(200);
    expect(again.body.publishedBy.id).toBe(f.users.secretary.id);

    await prisma.minutes.update({
      where: { id: f.minutes },
      data: { status: 'approved', approvedAt: new Date() },
    });
    const edit = await call('put', `/api/minutes/${f.minutes}`, {
      cookie: as('secretary'),
      body: { body: 'Changed' },
    });
    expect(edit.status).toBe(409);
    expect(edit.body).toEqual({ error: MINUTES_APPROVED });
    const republish = await call('post', `/api/minutes/${f.minutes}/publish`, {
      cookie: as('secretary'),
    });
    expect(republish.status).toBe(409);
    const stored = await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } });
    expect(stored).toMatchObject({ status: 'approved' });
    expect(stored.body).not.toBe('Changed');
  });

  it('are written again from the meeting, for a draft only', async () => {
    // ORGA01's live record: adjourned after a vote that carried in both parts
    await getStorage().getOrCreateMeeting('ORGA01', {
      ...initialState,
      meetingCode: 'ORGA01',
      organizationId: f.orgA.id,
      title: 'October meeting',
      meetingStage: 'adjourned',
      members: [{ id: f.users.member.id, name: 'A member', role: 'member', present: true }],
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          mover: 'A member',
          moverId: f.users.member.id,
          passed: true,
          voterChoices: {},
          timestamp: '',
          reconsidered: false,
          deviceVotes: { yea: 2, nay: 0, abstain: 0 },
          floorVotes: { yea: 9, nay: 2, abstain: 0 },
          method: 'standard',
          disposition: 'carried',
        },
      ],
    });

    const res = await call('post', `/api/minutes/${f.draftMinutes}/regenerate`, {
      cookie: as('secretary'),
    });
    expect(res.status).toBe(200);
    expect(res.body.body).toContain('## Minutes of the October meeting');
    expect(res.body.body).toContain(
      '**Main Motion.** A member moved: "Resurface the pool." Carried, on devices 2 to 0 and in the room 9 to 2: 11 to 2.',
    );
    expect(res.body.updatedBy).toMatchObject({ id: f.users.secretary.id });

    const published = await call('post', `/api/minutes/${f.minutes}/regenerate`, {
      cookie: as('secretary'),
    });
    expect(published.status).toBe(409);
    expect(published.body).toEqual({ error: ONLY_DRAFTS_REGENERATE });
  });

  it('say when the meeting has no record to write them from', async () => {
    const res = await call('post', `/api/minutes/${f.draftMinutes}/regenerate`, {
      cookie: as('secretary'),
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: NO_MEETING_RECORD });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/minutes.test.ts src/__integration__/resolvers.test.ts`
Expected: FAIL: `../bylawyer/routes/minutes.js` and `orgOfMinutes` don't exist.

- [ ] **Step 3: Create `backend-node/src/bylawyer/services/meetingMinutes.ts`**

```ts
/**
 * Minutes: written from a meeting's live record and what its packet and organization say
 */

import type { MeetingState, MinutesContext } from '@robbie-bylawyer/shared/types';
import { formatMinutesAsMarkdown, generateMeetingMinutes } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../../db/prisma.js';

/**
 * What the minutes need from outside the meeting state: the organization's name and time zone,
 * the meeting's title, place and times from its packet, and the organization's voting members
 * (member role and above) for the absent list. Null when the packet is gone.
 */
export async function minutesContext(packetId: string): Promise<MinutesContext | null> {
  const packet = await prisma.meetingPacket.findUnique({
    where: { id: packetId },
    select: {
      organizationId: true,
      title: true,
      location: true,
      scheduledFor: true,
      startedAt: true,
      endedAt: true,
      organization: { select: { name: true, timeZone: true } },
    },
  });
  if (!packet) return null;
  const voters = await prisma.organizationMember.findMany({
    where: {
      organizationId: packet.organizationId,
      role: { in: ['member', 'secretary', 'admin', 'owner'] },
    },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  return {
    organizationName: packet.organization.name,
    timeZone: packet.organization.timeZone,
    title: packet.title ?? '',
    location: packet.location,
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    calledToOrderAt: packet.startedAt?.toISOString() ?? null,
    adjournedAt: packet.endedAt?.toISOString() ?? null,
    // Someone who never set a name is listed by the first part of their email, as in a meeting
    voters: voters.map((v) => ({ id: v.userId, name: v.user.name ?? v.user.email.split('@')[0] })),
  };
}

/** A meeting's minutes as Markdown, from its live state */
export function writeMinutes(state: MeetingState, context: MinutesContext): string {
  return formatMinutesAsMarkdown(generateMeetingMinutes(state), context);
}
```

- [ ] **Step 4: The body, the resolver and the routes**

Create `backend-node/src/schemas/minutes.ts`:

```ts
import { z } from 'zod';

/** The longest minutes, in characters of Markdown */
export const MAX_MINUTES_LENGTH = 200_000;

export const updateMinutesBody = z.object({
  body: z.string().max(MAX_MINUTES_LENGTH),
});
```

In `backend-node/src/orgs/resolvers.ts`, append:

```ts
export async function orgOfMinutes(id: string): Promise<string | null> {
  const minutes = await prisma.minutes.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return minutes?.organizationId ?? null;
}
```

Create `backend-node/src/bylawyer/routes/minutes.ts`:

```ts
/**
 * Minutes Routes
 *
 * The minutes of each scheduled meeting: drafted by the app when the meeting adjourns, edited
 * and published by a secretary, read by members once published, and approved at the next
 * meeting (see the action handler)
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { OrgRole, Prisma } from '../../generated/prisma/client.js';
import { getStorage } from '../../db/meetingStorage.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../middleware/logger.js';
import { orgIdParam, uuidParam } from '../../schemas/common.js';
import { updateMinutesBody } from '../../schemas/minutes.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfMinutes, orgOfOrganization } from '../../orgs/resolvers.js';
import { atLeast } from '../../orgs/roles.js';
import { minutesContext, writeMinutes } from '../services/meetingMinutes.js';

export const minutesRouter: RouterType = Router();

const byMinutes = fromParam('id', orgOfMinutes);

/** The answers when minutes can't be changed as asked */
export const MINUTES_APPROVED = 'Approved minutes are the record and cannot be changed';
export const ONLY_DRAFTS_REGENERATE = 'Only a draft can be written again from the meeting';
export const NO_MEETING_RECORD = 'The meeting has no record to write the minutes from';

/** A minutes response: the text, its status, who did what, its meeting and organization */
const MINUTES_SELECT = {
  id: true,
  organizationId: true,
  packetId: true,
  status: true,
  body: true,
  generatedAt: true,
  updatedAt: true,
  publishedAt: true,
  approvedAt: true,
  corrections: true,
  packet: {
    select: { id: true, robbieCode: true, title: true, scheduledFor: true, location: true },
  },
  organization: { select: { id: true, name: true, timeZone: true } },
  updatedBy: { select: { id: true, name: true } },
  publishedBy: { select: { id: true, name: true } },
  approvedAtPacket: { select: { id: true, title: true, scheduledFor: true } },
} satisfies Prisma.MinutesSelect;

/** Drafts are for secretaries and above; to everyone else they don't exist */
const seesDrafts = (role: OrgRole) => atLeast(role, 'secretary');

const readMinutes = (id: string) =>
  prisma.minutes.findUniqueOrThrow({ where: { id }, select: MINUTES_SELECT });

/**
 * GET /api/organizations/:orgId/minutes
 * The organization's minutes, the latest meeting first (meetings without a date last)
 */
minutesRouter.get(
  '/organizations/:orgId/minutes',
  validate({ params: orgIdParam }),
  requireRole('viewer', fromParam('orgId', orgOfOrganization)),
  async (req, res) => {
    try {
      const minutes = await prisma.minutes.findMany({
        where: {
          organizationId: req.org!.id,
          ...(seesDrafts(req.org!.role) ? {} : { status: { not: 'draft' as const } }),
        },
        select: {
          id: true,
          status: true,
          generatedAt: true,
          updatedAt: true,
          publishedAt: true,
          approvedAt: true,
          packet: { select: { id: true, robbieCode: true, title: true, scheduledFor: true } },
        },
        orderBy: [
          { packet: { scheduledFor: { sort: 'desc', nulls: 'last' } } },
          { generatedAt: 'desc' },
        ],
      });
      res.json(minutes);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list minutes');
      res.status(500).json({ error: 'Failed to list minutes' });
    }
  },
);

/**
 * GET /api/minutes/:id
 * One meeting's minutes. A draft is not found below secretary.
 */
minutesRouter.get(
  '/minutes/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byMinutes),
  async (req, res) => {
    try {
      const minutes = await prisma.minutes.findUnique({
        where: { id: req.params.id },
        select: MINUTES_SELECT,
      });
      if (!minutes || (minutes.status === 'draft' && !seesDrafts(req.org!.role))) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(minutes);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get minutes');
      res.status(500).json({ error: 'Failed to get the minutes' });
    }
  },
);

/**
 * PUT /api/minutes/:id
 * The secretary's text. The last save wins, and its author is named. Approved minutes are the
 * record and stay as they are.
 * Body: { body }
 */
minutesRouter.put(
  '/minutes/:id',
  validate({ params: uuidParam, body: updateMinutesBody }),
  requireRole('secretary', byMinutes),
  async (req, res) => {
    try {
      const { id } = req.params;
      // One statement, so minutes approved in the meantime aren't changed
      const updated = await prisma.minutes.updateMany({
        where: { id, status: { not: 'approved' } },
        data: { body: req.body.body, updatedById: req.user!.id },
      });
      if (updated.count === 0) return res.status(409).json({ error: MINUTES_APPROVED });
      res.json(await readMinutes(id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to save minutes');
      res.status(500).json({ error: 'Failed to save the minutes' });
    }
  },
);

/**
 * POST /api/minutes/:id/publish
 * Members can read them, and the next meeting is asked to approve them. Publishing published
 * minutes changes nothing.
 */
minutesRouter.post(
  '/minutes/:id/publish',
  validate({ params: uuidParam }),
  requireRole('secretary', byMinutes),
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.minutes.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'published', publishedAt: new Date(), publishedById: req.user!.id },
      });
      const minutes = await readMinutes(id);
      if (minutes.status === 'approved') return res.status(409).json({ error: MINUTES_APPROVED });
      res.json(minutes);
    } catch (error) {
      logger.error({ err: error }, 'Failed to publish minutes');
      res.status(500).json({ error: 'Failed to publish the minutes' });
    }
  },
);

/**
 * POST /api/minutes/:id/regenerate
 * Write a draft again from the meeting's live record, replacing its text (the page asks
 * first). Only a draft: published minutes are what members have read.
 */
minutesRouter.post(
  '/minutes/:id/regenerate',
  validate({ params: uuidParam }),
  requireRole('secretary', byMinutes),
  async (req, res) => {
    try {
      const { id } = req.params;
      const minutes = await prisma.minutes.findUniqueOrThrow({
        where: { id },
        select: { status: true, packetId: true, packet: { select: { robbieCode: true } } },
      });
      if (minutes.status !== 'draft') {
        return res.status(409).json({ error: ONLY_DRAFTS_REGENERATE });
      }
      const meeting = await getStorage().getMeeting(minutes.packet.robbieCode);
      const context = await minutesContext(minutes.packetId);
      if (!meeting || !context) return res.status(409).json({ error: NO_MEETING_RECORD });

      await prisma.minutes.updateMany({
        where: { id, status: 'draft' },
        data: {
          body: writeMinutes(meeting.state, context),
          generatedAt: new Date(),
          updatedById: req.user!.id,
        },
      });
      res.json(await readMinutes(id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to regenerate minutes');
      res.status(500).json({ error: 'Failed to write the minutes again' });
    }
  },
);
```

In `backend-node/src/bylawyer/routes/index.ts`, append:

```ts
// The minutes of scheduled meetings
export { minutesRouter } from './minutes.js';
```

In `backend-node/src/app.ts`, replace:

```ts
  agendaItemsRouter,
} from './bylawyer/routes/index.js';
```

with:

```ts
  agendaItemsRouter,
  minutesRouter,
} from './bylawyer/routes/index.js';
```

replace:

```ts
export const LARGE_JSON_PATHS = ['/api/documents/:docId/versions/import'];
```

with:

```ts
export const LARGE_JSON_PATHS = ['/api/documents/:docId/versions/import', '/api/minutes/:id'];
```

and replace:

```ts
app.use('/api', membersRouter);
```

with:

```ts
app.use('/api', membersRouter);
app.use('/api', minutesRouter);
```

- [ ] **Step 5: Run them to see them pass**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/minutes.test.ts src/__integration__/resolvers.test.ts src/__integration__/routeCoverage.test.ts`
Expected: all pass (`minutes.test.ts` has 12: five rule cases and seven behaviors); the route coverage test finds a rule on each new route.

- [ ] **Step 6: Type-check and run everything**

Run: `cd backend-node && npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass (the fixture's new minutes cascade with their packets wherever a test deletes one).

- [ ] **Step 7: Commit**

```bash
npx prettier --write backend-node/src/bylawyer/services/meetingMinutes.ts backend-node/src/schemas/minutes.ts backend-node/src/bylawyer/routes/minutes.ts backend-node/src/bylawyer/routes/index.ts backend-node/src/app.ts backend-node/src/orgs/resolvers.ts backend-node/src/__integration__/fixtures.ts backend-node/src/__integration__/resolvers.test.ts backend-node/src/__integration__/minutes.test.ts
git add backend-node/src/bylawyer/services/meetingMinutes.ts backend-node/src/schemas/minutes.ts backend-node/src/bylawyer/routes/minutes.ts backend-node/src/bylawyer/routes/index.ts backend-node/src/app.ts backend-node/src/orgs/resolvers.ts backend-node/src/__integration__/fixtures.ts backend-node/src/__integration__/resolvers.test.ts backend-node/src/__integration__/minutes.test.ts
git commit -m "feat(desk): the minutes routes

GET /api/organizations/:orgId/minutes lists an organization's minutes by
meeting date; GET /api/minutes/:id reads one. Members see published and
approved minutes; a draft is a secretary's until published (404 below
secretary). PUT saves the secretary's Markdown (the last save wins and is
named), publish makes the minutes readable and puts them before the next
meeting, and regenerate writes a draft again from the meeting's record.
Approved minutes are not changed."
```

---

### Task 8: Minutes in the live meeting: drafted at adjournment, put before the next meeting, approved there

**Files:**

- Modify: `backend-node/src/bylawyer/services/meetingMinutes.ts`, `backend-node/src/socket/actionHandler.ts`, `backend-node/src/socket/joinHandler.ts`, `backend-node/src/socket/meetingPacket.ts`
- Modify: `backend-node/src/__tests__/actionHandler.test.ts`, `backend-node/src/__tests__/joinHandler.test.ts`, `backend-node/src/__tests__/recoveredSocket.test.ts` (one mock each)
- Create: `backend-node/src/__integration__/liveMinutes.test.ts`

Three things the live meeting does with minutes, each best effort like the bylaw sync (the meeting goes on if one fails, and the failure is logged):

- **Adjourning drafts them.** After `END_MEETING` is applied, broadcast and its time recorded on the packet, the server writes the draft from the final state, unless the packet has minutes already: a meeting adjourned again (called to order after adjourning, then adjourned) keeps the secretary's text, and the secretary can write the draft again from the minutes page.
- **The previous minutes are put before the meeting.** When someone opens a meeting not yet called to order that has no previous minutes loaded, the server loads the organization's most recent published minutes (not yet approved, and not the meeting's own) with the server-only `SET_PREVIOUS_MINUTES { minutes, minutesId }`. That covers the state's creation (the design's moment) and also minutes published after the state was created, as long as the meeting hasn't started. Once called to order, nothing is loaded.
- **Approving them marks them approved.** After `APPROVE_MINUTES`, the minutes in `previousMinutesId` become `approved`, with the approving meeting's packet and the corrections, if they are still published minutes of the meeting's organization.

- [ ] **Step 1: Write the failing integration test**

Create `backend-node/src/__integration__/liveMinutes.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const live = liveSockets();
const stateOf = async (code: string): Promise<MeetingState> =>
  (await getStorage().getMeeting(code))!.state;

// The live meetings table and its storage, as the server starts them
beforeAll(initializeStorage);

describe('minutes in a live meeting', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  /**
   * A's October meeting (ORGA01, no presiding officer, so the secretary runs it as an admin),
   * with the member and the owner on devices: three present, A's quorum of 3
   */
  async function openMeeting() {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    const owner = live.connect(f.users.owner);
    for (const socket of [secretary, member, owner]) {
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
    }
    return { secretary, member, owner };
  }

  async function act(socket: FakeSocket, action: Record<string, unknown>) {
    const res = await live.dispatch(socket, { timestamp: '', ...action });
    expect(res, JSON.stringify(action)).toMatchObject({ success: true });
  }

  it('are drafted from the record when the meeting adjourns', async () => {
    await prisma.minutes.delete({ where: { id: f.draftMinutes } });
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { location: 'The clubhouse', scheduledFor: new Date('2026-10-21T00:00:00Z') },
    });
    const { secretary, member, owner } = await openMeeting();
    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, { type: 'ADOPT_AGENDA' });
    await act(member, {
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: 'Resurface the pool',
      mover: '',
      moverId: 0,
      motionId: 0,
    });
    await act(owner, { type: 'SECOND_MOTION', seconder: '' });
    await act(secretary, { type: 'OPEN_VOTING', voteTimerEnd: null });
    await act(member, { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    await act(owner, { type: 'CAST_VOTE', vote: 'yea', voterId: 0 });
    await act(secretary, { type: 'SET_FLOOR_TALLY', yea: 9, nay: 2, abstain: 0 });
    await act(secretary, { type: 'CLOSE_VOTING' });
    await act(secretary, { type: 'END_MEETING' });

    const minutes = await prisma.minutes.findUniqueOrThrow({ where: { packetId: f.packet.id } });
    expect(minutes).toMatchObject({
      status: 'draft',
      updatedById: null,
      organizationId: f.orgA.id,
    });
    expect(minutes.body).toContain('## Minutes of the October meeting');
    // The packet's date and place, in the organization's time zone (Chicago)
    expect(minutes.body).toContain('Tuesday, October 20, 2026, at The clubhouse.');
    expect(minutes.body).toContain(
      '**Main Motion.** A member moved: "Resurface the pool." Seconded by A owner. Carried, on devices 2 to 0 and in the room 9 to 2: 11 to 2. A quorum was present.',
    );
    expect(minutes.body).toMatch(/The meeting adjourned at \d{1,2}:\d{2} [AP]M\./);
  });

  it("are drafted once: a meeting adjourned again keeps the secretary's text", async () => {
    // The fixture's draft stands for the secretary's edits
    await prisma.minutes.update({
      where: { id: f.draftMinutes },
      data: { body: 'Edited by the secretary' },
    });
    const { secretary } = await openMeeting();
    for (const type of ['START_MEETING', 'END_MEETING', 'START_MEETING', 'END_MEETING']) {
      await act(secretary, { type });
    }
    const all = await prisma.minutes.findMany({ where: { packetId: f.packet.id } });
    expect(all.map((m) => m.body)).toEqual(['Edited by the secretary']);
  });

  it('put the latest published minutes before the meeting, and its approval marks them', async () => {
    const { secretary } = await openMeeting();
    const state = await stateOf(f.packet.code);
    expect(state.previousMinutesId).toBe(f.minutes);
    expect(state.minutesFromPreviousMeeting).toContain('Minutes of the September meeting');

    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, {
      type: 'APPROVE_MINUTES',
      corrections: 'The meeting adjourned at 8:10 PM',
    });

    const approved = await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } });
    expect(approved).toMatchObject({
      status: 'approved',
      approvedAtPacketId: f.packet.id,
      corrections: 'The meeting adjourned at 8:10 PM',
    });
    expect(approved.approvedAt).not.toBeNull();
    expect((await stateOf(f.packet.code)).minutesApproval?.corrections).toBe(
      'The meeting adjourned at 8:10 PM',
    );
  });

  it('approved as read, they keep no corrections', async () => {
    const { secretary } = await openMeeting();
    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, { type: 'APPROVE_MINUTES' });
    expect(await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } })).toMatchObject({
      status: 'approved',
      corrections: null,
    });
  });

  it("never put drafts, approved minutes, another organization's or the meeting's own before it", async () => {
    await prisma.minutes.update({ where: { id: f.minutes }, data: { status: 'approved' } });
    // The meeting's own minutes, even published
    await prisma.minutes.update({ where: { id: f.draftMinutes }, data: { status: 'published' } });
    await prisma.minutes.create({
      data: {
        organizationId: f.orgB.id,
        packetId: f.packetB.id,
        status: 'published',
        body: "Org B's minutes",
      },
    });
    await openMeeting();
    const state = await stateOf(f.packet.code);
    expect(state.previousMinutesId).toBeNull();
    expect(state.minutesFromPreviousMeeting).toBe('');
  });

  it('are put before a meeting not yet called to order once they are published', async () => {
    await prisma.minutes.update({ where: { id: f.minutes }, data: { status: 'draft' } });
    await live.join(live.connect(f.users.member), f.packet.code);
    expect((await stateOf(f.packet.code)).previousMinutesId).toBeNull();

    // Published while the meeting waits: the next person to arrive brings them in
    await prisma.minutes.update({ where: { id: f.minutes }, data: { status: 'published' } });
    await live.join(live.connect(f.users.owner), f.packet.code);
    expect((await stateOf(f.packet.code)).previousMinutesId).toBe(f.minutes);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveMinutes.test.ts`
Expected: FAIL: no minutes are drafted at adjournment, `previousMinutesId` stays null, and the September minutes stay published.

- [ ] **Step 3: The three services, in `backend-node/src/bylawyer/services/meetingMinutes.ts`**

Replace:

```ts
import type { MeetingState, MinutesContext } from '@robbie-bylawyer/shared/types';
import { formatMinutesAsMarkdown, generateMeetingMinutes } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../../db/prisma.js';
```

with:

```ts
import type { MeetingState, MinutesContext } from '@robbie-bylawyer/shared/types';
import { formatMinutesAsMarkdown, generateMeetingMinutes } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../middleware/logger.js';
```

and append:

```ts
/**
 * The draft minutes of a meeting that has just adjourned, written from its final state, unless
 * the meeting has minutes already: a meeting adjourned again keeps the secretary's text (the
 * secretary can write the draft again). Best effort: the meeting has adjourned regardless.
 */
export async function draftMinutesOnAdjournment(
  meetingCode: string,
  state: MeetingState,
): Promise<void> {
  try {
    const packet = await prisma.meetingPacket.findUnique({
      where: { robbieCode: meetingCode },
      select: { id: true, organizationId: true, minutes: { select: { id: true } } },
    });
    if (!packet || packet.minutes) return;
    const context = await minutesContext(packet.id);
    if (!context) return;
    await prisma.minutes.create({
      data: {
        organizationId: packet.organizationId,
        packetId: packet.id,
        body: writeMinutes(state, context),
      },
    });
  } catch (error) {
    // Adjourned twice at once: the other adjournment wrote the draft
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    logger.error({ err: error, meetingCode }, 'Failed to draft the minutes');
  }
}

/**
 * The minutes to put before a meeting: the organization's most recent published minutes, not
 * yet approved and not the meeting's own (the latest meeting first, then the latest published)
 */
export function previousMinutesFor(
  organizationId: string,
  packetId: string,
): Promise<{ id: string; body: string } | null> {
  return prisma.minutes.findFirst({
    where: { organizationId, status: 'published', packetId: { not: packetId } },
    orderBy: [
      { packet: { scheduledFor: { sort: 'desc', nulls: 'last' } } },
      { publishedAt: 'desc' },
    ],
    select: { id: true, body: true },
  });
}

/**
 * The previous minutes a meeting approved, marked approved with the meeting and its
 * corrections: only minutes of the meeting's organization that are still published. Best
 * effort, like the bylaw sync: the approval stands in the meeting regardless.
 */
export async function markPreviousMinutesApproved(
  meetingCode: string,
  state: MeetingState,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (!state.previousMinutesId) return;
    const packet = await prisma.meetingPacket.findUnique({
      where: { robbieCode: meetingCode },
      select: { id: true, organizationId: true },
    });
    if (!packet) return;
    await prisma.minutes.updateMany({
      where: {
        id: state.previousMinutesId,
        organizationId: packet.organizationId,
        status: 'published',
      },
      data: {
        status: 'approved',
        approvedAt: now,
        approvedAtPacketId: packet.id,
        corrections: state.minutesApproval?.corrections ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, meetingCode }, 'Failed to mark the previous minutes approved');
  }
}
```

- [ ] **Step 4: Draft and approve after the action, in `backend-node/src/socket/actionHandler.ts`**

Replace:

```ts
import { checkAndSyncBylawAmendment } from '../bylawyer/bylawSyncService.js';
```

with:

```ts
import { checkAndSyncBylawAmendment } from '../bylawyer/bylawSyncService.js';
import {
  draftMinutesOnAdjournment,
  markPreviousMinutesApproved,
} from '../bylawyer/services/meetingMinutes.js';
```

and replace:

```ts
// Post-action: the schedule records when the meeting was called to order and adjourned
await recordMeetingTimes(meetingCode, enrichedAction);
```

with:

```ts
// Post-action: the schedule records when the meeting was called to order and adjourned
await recordMeetingTimes(meetingCode, enrichedAction);

// Post-action: the minutes. Adjourning drafts them (after the times they give are
// recorded); approving the previous minutes marks them approved. Both best effort.
if (enrichedAction.type === 'END_MEETING') {
  await draftMinutesOnAdjournment(meetingCode, latest.state);
} else if (enrichedAction.type === 'APPROVE_MINUTES') {
  await markPreviousMinutesApproved(meetingCode, latest.state);
}
```

In `backend-node/src/__tests__/actionHandler.test.ts`, replace:

```ts
vi.mock('../bylawyer/bylawSyncService.js', () => ({
  checkAndSyncBylawAmendment: async () => null,
}));
```

with:

```ts
vi.mock('../bylawyer/bylawSyncService.js', () => ({
  checkAndSyncBylawAmendment: async () => null,
}));
vi.mock('../bylawyer/services/meetingMinutes.js', () => ({
  draftMinutesOnAdjournment: async () => {},
  markPreviousMinutesApproved: async () => {},
}));
```

- [ ] **Step 5: The packet's id, in `backend-node/src/socket/meetingPacket.ts`**

Replace:

```ts
export interface MeetingPacketInfo {
  robbieCode: string;
```

with:

```ts
export interface MeetingPacketInfo {
  id: string;
  robbieCode: string;
```

and in `findMeetingPacket`, replace:

```ts
    select: {
      robbieCode: true,
      organizationId: true,
```

with:

```ts
    select: {
      id: true,
      robbieCode: true,
      organizationId: true,
```

- [ ] **Step 6: The previous minutes before the call to order, in `backend-node/src/socket/joinHandler.ts`**

Replace:

```ts
import { deriveMeetingRole, roleChanges, updateSocketRoles } from './meetingRoles.js';
```

with:

```ts
import { deriveMeetingRole, roleChanges, updateSocketRoles } from './meetingRoles.js';
import { previousMinutesFor } from '../bylawyer/services/meetingMinutes.js';
```

and replace the whole `openMeeting` function:

```ts
/**
 * The live meeting for a packet, created from it when the first person arrives. A live state
 * saved before it recorded its organization, title and date gets them from the packet.
 */
async function openMeeting(packet: MeetingPacketInfo): Promise<MeetingRecord> {
  const storage = getStorage();
  const existing = await storage.getMeeting(packet.robbieCode);
  if (!existing) {
    const rosterVoters = await countRosterVoters(packet.organizationId);
    return storage.getOrCreateMeeting(packet.robbieCode, stateFromPacket(packet, rosterVoters));
  }
  if (existing.state.organizationId) return existing;
  const result = await applyAction(packet.robbieCode, {
    type: 'SET_MEETING_INFO',
    organizationId: packet.organizationId,
    title: packet.title ?? '',
    scheduledFor: packet.scheduledFor?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
  });
  return result.success
    ? { ...existing, state: result.state, stateVersion: result.stateVersion }
    : existing;
}
```

with:

```ts
/**
 * The live meeting for a packet, created from it when the first person arrives. A live state
 * saved before it recorded its organization, title and date gets them from the packet. Before
 * the call to order, the previous meeting's minutes are put before it.
 */
async function openMeeting(packet: MeetingPacketInfo): Promise<MeetingRecord> {
  const storage = getStorage();
  const existing = await storage.getMeeting(packet.robbieCode);
  let meeting: MeetingRecord;
  if (!existing) {
    const rosterVoters = await countRosterVoters(packet.organizationId);
    meeting = await storage.getOrCreateMeeting(
      packet.robbieCode,
      stateFromPacket(packet, rosterVoters),
    );
  } else if (existing.state.organizationId) {
    meeting = existing;
  } else {
    const result = await applyAction(packet.robbieCode, {
      type: 'SET_MEETING_INFO',
      organizationId: packet.organizationId,
      title: packet.title ?? '',
      scheduledFor: packet.scheduledFor?.toISOString() ?? null,
      timestamp: new Date().toISOString(),
    });
    meeting = result.success
      ? { ...existing, state: result.state, stateVersion: result.stateVersion }
      : existing;
  }
  return withPreviousMinutes(packet, meeting);
}

/**
 * A meeting not yet called to order, without previous minutes, gets the organization's most
 * recent published minutes (not yet approved, not its own) to approve. Best effort: a meeting
 * opens without them.
 */
async function withPreviousMinutes(
  packet: MeetingPacketInfo,
  meeting: MeetingRecord,
): Promise<MeetingRecord> {
  if (meeting.state.meetingStage !== 'not-started' || meeting.state.previousMinutesId) {
    return meeting;
  }
  try {
    const previous = await previousMinutesFor(packet.organizationId, packet.id);
    if (!previous) return meeting;
    const result = await applyAction(packet.robbieCode, {
      type: 'SET_PREVIOUS_MINUTES',
      minutes: previous.body,
      minutesId: previous.id,
    });
    return result.success
      ? { ...meeting, state: result.state, stateVersion: result.stateVersion }
      : meeting;
  } catch (error) {
    logger.error(
      { err: error, meetingCode: packet.robbieCode },
      'Failed to put the previous minutes before the meeting',
    );
    return meeting;
  }
}
```

In `backend-node/src/__tests__/joinHandler.test.ts` and `backend-node/src/__tests__/recoveredSocket.test.ts`, replace (in each):

```ts
vi.mock('../socket/meetingPacket.js', () => ({
```

with:

```ts
vi.mock('../bylawyer/services/meetingMinutes.js', () => ({ previousMinutesFor: async () => null }));
vi.mock('../socket/meetingPacket.js', () => ({
```

- [ ] **Step 7: Run it to see it pass**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/liveMinutes.test.ts`
Expected: 6 passed.

- [ ] **Step 8: Type-check and run everything**

Run: `cd backend-node && npx tsc --noEmit -p . && npm run test:run && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: type-check clean; all pass. The other live tests open ORGA01, which now brings in the fixture's published September minutes: one more state version at the first join, and no change they check (`liveJoin.test.ts` compares the join's version with the stored one; `liveAttendance.test.ts`, `liveFloor.test.ts` and `liveSchedule.test.ts` check no state version, and `liveSchedule.test.ts` clears its broadcasts after the join).

- [ ] **Step 9: Commit**

```bash
npx prettier --write backend-node/src/bylawyer/services/meetingMinutes.ts backend-node/src/socket/actionHandler.ts backend-node/src/socket/joinHandler.ts backend-node/src/socket/meetingPacket.ts backend-node/src/__tests__/actionHandler.test.ts backend-node/src/__tests__/joinHandler.test.ts backend-node/src/__tests__/recoveredSocket.test.ts backend-node/src/__integration__/liveMinutes.test.ts
git add backend-node/src/bylawyer/services/meetingMinutes.ts backend-node/src/socket/actionHandler.ts backend-node/src/socket/joinHandler.ts backend-node/src/socket/meetingPacket.ts backend-node/src/__tests__/actionHandler.test.ts backend-node/src/__tests__/joinHandler.test.ts backend-node/src/__tests__/recoveredSocket.test.ts backend-node/src/__integration__/liveMinutes.test.ts
git commit -m "feat(desk): minutes drafted at adjournment and approved at the next meeting

When a meeting adjourns, the server drafts its minutes from the final state,
once per meeting. A meeting not yet called to order gets the organization's
latest published minutes to approve, and approving them in the meeting
marks them approved, with the meeting and any corrections. All three are
best effort, like the bylaw sync."
```

---

### Task 9: The demo's 2025 minutes, place and time zone

**Files:**

- Modify: `backend-node/src/demo/demoSeed.ts`, `backend-node/src/scripts/seedDemo.ts`
- Test: `backend-node/src/__integration__/demoSeed.test.ts`

The roadmap's scenario approves "the 2025 minutes" at the annual meeting. The seed had last year's meeting only as a Bylawyer meeting record, and minutes belong to a packet, so it gains last year's annual meeting as an adjourned packet (`MAPLE25`, Dana presiding) with the minutes Pat published, and the 2026 packet gains its place. Every meeting opened in the demo before it is called to order (the annual meeting, and the Playwright scenario's) then has the 2025 minutes to approve. The organization's time zone is set explicitly to Chicago's, as the scenario assumes.

- [ ] **Step 1: Write the failing test**

In `backend-node/src/__integration__/demoSeed.test.ts`, replace:

```ts
import { DEMO_MEETING_CODE, DEMO_SLUG, DemoSeedError, seedDemo } from '../demo/demoSeed.js';
```

with:

```ts
import {
  DEMO_MEETING_CODE,
  DEMO_PAST_MEETING_CODE,
  DEMO_SLUG,
  DemoSeedError,
  seedDemo,
} from '../demo/demoSeed.js';
```

and replace:

```ts
expect(org).toMatchObject({ eligibleVoters: 142, quorumPercent: 20, quorumCount: null });
```

with:

```ts
expect(org).toMatchObject({
  eligibleVoters: 142,
  quorumPercent: 20,
  quorumCount: null,
  timeZone: 'America/Chicago',
});
```

and insert after `expect(packet.chairUserId).toBe(dana?.userId);`:

```ts
expect(packet.location).toBe('Maple Grove Clubhouse, 400 Maple Grove Drive');

// Last year's annual meeting, adjourned, with the minutes Pat published for this year's
// meeting to approve
const lastYear = await prisma.meetingPacket.findUniqueOrThrow({
  where: { robbieCode: DEMO_PAST_MEETING_CODE },
  include: { minutes: true },
});
expect(lastYear).toMatchObject({
  organizationId: org.id,
  title: '2025 Annual Meeting',
  chairUserId: dana?.userId,
});
expect(lastYear.endedAt).not.toBeNull();
const pat = members.find((m) => m.user.email === 'pat@maplegrove.example');
expect(lastYear.minutes).toMatchObject({
  status: 'published',
  publishedById: pat?.userId,
});
expect(lastYear.minutes?.body).toContain('## Minutes of the 2025 Annual Meeting');
expect(await prisma.meetingPacket.count({ where: { organizationId: org.id } })).toBe(2);
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/demoSeed.test.ts`
Expected: FAIL: `DEMO_PAST_MEETING_CODE` is not exported, and the packet has no place.

- [ ] **Step 3: The seed, in `backend-node/src/demo/demoSeed.ts`**

Replace:

```ts
export const DEMO_MEETING_CODE = 'MAPLE1';
```

with:

```ts
export const DEMO_MEETING_CODE = 'MAPLE1';
/** Last year's annual meeting, whose minutes this year's approves */
export const DEMO_PAST_MEETING_CODE = 'MAPLE25';

const CLUBHOUSE = 'Maple Grove Clubhouse, 400 Maple Grove Drive';

/** The 2025 annual meeting's minutes, as Pat published them */
const MINUTES_2025 = [
  '# Maple Grove HOA',
  '',
  '## Minutes of the 2025 Annual Meeting',
  '',
  `Thursday, March 20, 2025, at ${CLUBHOUSE}.`,
  '',
  'Dana Okafor presided. The meeting was called to order at 7:04 PM.',
  '',
  '## Attendance',
  '',
  '**Members present:** 21, and 6 more by proxy.',
  '',
  'A quorum of 29 was not present at the call to order.',
  '',
  '## Proceedings',
  '',
  '### 1. Reports',
  '',
  'The treasurer reported $48,200 in the operating account and $112,000 in the reserve fund. The pool committee reported that the pool needs resurfacing within two years.',
  '',
  '### 2. Business',
  '',
  'Without a quorum, no business was taken up.',
  '',
  '## Adjournment',
  '',
  'The meeting adjourned at 8:15 PM.',
  '',
].join('\n');
```

Replace:

```ts
const codeTaken = await prisma.meetingPacket.findUnique({
  where: { robbieCode: DEMO_MEETING_CODE },
  select: { id: true },
});
if (codeTaken) {
  throw new DemoSeedError(
    `Another organization has the meeting code ${DEMO_MEETING_CODE}. Delete its packet first.`,
  );
}
```

with:

```ts
const codeTaken = await prisma.meetingPacket.findFirst({
  where: { robbieCode: { in: [DEMO_MEETING_CODE, DEMO_PAST_MEETING_CODE] } },
  select: { robbieCode: true },
});
if (codeTaken) {
  throw new DemoSeedError(
    `Another organization has the meeting code ${codeTaken.robbieCode}. Delete its packet first.`,
  );
}
```

In `create`, replace:

```ts
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
```

with:

```ts
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
      // The clubhouse is in Chicago's time zone; the minutes give their times there
      timeZone: 'America/Chicago',
```

Replace:

```ts
  // This year's annual meeting, scheduled with its agenda
  await tx.meetingPacket.create({
    data: {
      organizationId: organization.id,
      robbieCode: DEMO_MEETING_CODE,
      title: '2026 Annual Meeting',
      description: 'Maple Grove Clubhouse, 400 Maple Grove Drive',
```

with:

```ts
  // Last year's annual meeting as a scheduled meeting, adjourned, with the minutes Pat
  // published: this year's meeting approves them
  const lastYear = await tx.meetingPacket.create({
    data: {
      organizationId: organization.id,
      robbieCode: DEMO_PAST_MEETING_CODE,
      title: '2025 Annual Meeting',
      location: CLUBHOUSE,
      scheduledFor: new Date('2025-03-20T19:00:00-05:00'),
      startedAt: new Date('2025-03-20T19:04:00-05:00'),
      endedAt: new Date('2025-03-20T20:15:00-05:00'),
      chairUserId: idOf('dana@maplegrove.example'),
    },
  });
  await tx.minutes.create({
    data: {
      organizationId: organization.id,
      packetId: lastYear.id,
      status: 'published',
      body: MINUTES_2025,
      updatedById: idOf('pat@maplegrove.example'),
      publishedAt: new Date('2025-04-02T15:00:00Z'),
      publishedById: idOf('pat@maplegrove.example'),
    },
  });

  // This year's annual meeting, scheduled with its agenda
  await tx.meetingPacket.create({
    data: {
      organizationId: organization.id,
      robbieCode: DEMO_MEETING_CODE,
      title: '2026 Annual Meeting',
      description:
        'The annual meeting of the members: reports, the pool contract, the quorum amendment and the election of two directors.',
      location: CLUBHOUSE,
```

Change the comment at the top of the file to:

```ts
/**
 * The Maple Grove HOA demo from docs/mvp-roadmap.md: an organization with its people, bylaws, a
 * draft amendment, last year's meeting record and published minutes, and the packet for this
 * year's annual meeting
 */
```

In `backend-node/src/scripts/seedDemo.ts`, replace:

```ts
    `Created Maple Grove HOA (${DEMO_SLUG}): ${summary.people} people, bylaws version 1 with ${summary.sections} sections, a draft amendment, the 2025 annual meeting record, and the packet for meeting ${DEMO_MEETING_CODE} with ${summary.agendaItems} agenda items.`,
```

with:

```ts
    `Created Maple Grove HOA (${DEMO_SLUG}): ${summary.people} people, bylaws version 1 with ${summary.sections} sections, a draft amendment, the 2025 annual meeting with its published minutes (${DEMO_PAST_MEETING_CODE}), and the packet for meeting ${DEMO_MEETING_CODE} with ${summary.agendaItems} agenda items.`,
```

and its import:

```ts
import { DEMO_MEETING_CODE, DEMO_PEOPLE, DEMO_SLUG, seedDemo } from '../demo/demoSeed.js';
```

with:

```ts
import {
  DEMO_MEETING_CODE,
  DEMO_PAST_MEETING_CODE,
  DEMO_PEOPLE,
  DEMO_SLUG,
  seedDemo,
} from '../demo/demoSeed.js';
```

- [ ] **Step 4: Run it to see it pass, and run everything**

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/demoSeed.test.ts && npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration`
Expected: 3 passed in `demoSeed.test.ts`; type-check clean; all pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write backend-node/src/demo/demoSeed.ts backend-node/src/scripts/seedDemo.ts backend-node/src/__integration__/demoSeed.test.ts
git add backend-node/src/demo/demoSeed.ts backend-node/src/scripts/seedDemo.ts backend-node/src/__integration__/demoSeed.test.ts
git commit -m "feat(demo): the 2025 annual meeting's published minutes, the place and the time zone

The demo gains last year's annual meeting as an adjourned packet (MAPLE25)
with the minutes Pat published, so this year's meeting has minutes to
approve. The 2026 meeting is held at the clubhouse, and Maple Grove keeps
Chicago's time."
```

---

### Task 10: Documentation, the full check and a live check

**Files:**

- Modify: `spec.md`, `CLAUDE.md`

The mobile app needs no change: after every task above, `npx tsc --noEmit -p mobile/tsconfig.json` and its tests pass. It never sends `APPROVE_MINUTES` or `SET_PREVIOUS_MINUTES`, and the record fields it receives are all optional or new.

- [ ] **Step 1: Record the milestones in `spec.md`**

Under `### M8. Minutes`, replace:

```markdown
- Quorum at each vote, not only when minutes are generated.
- Flow: generate draft, secretary edits, approve at the next meeting (`MinutesApprovalPanel`), then publish to Bylawyer as a versioned document linked to the meeting. Wire up `minutesService.ts` (currently dead code) for the publish step.
- Export as Markdown and PDF.
```

with:

```markdown
- **Done 2026-10-07 (server, the secretary's desk):** the meeting record holds every disposition: motions on a vote, by unanimous consent, withdrawn, or dead for want of a second, each with its mover, seconder, agenda item, the quorum at the time and the server's clock (`at`, stamped on the seven deciding actions); the chair's rulings; each ballot of an election; who attended (also those who left early); the quorum at the call to order; and the approval of the previous minutes with any corrections. `generateMeetingMinutes` and `formatMinutesAsMarkdown(minutes, context)` write the minutes from that record in the organization's time zone (`Organization.timeZone`), grouped under the agenda items, with ballots as counts only. Minutes are a `Minutes` row per packet (draft, published, approved): drafted when the meeting adjourns, edited and published by a secretary (`/api/minutes/...`), put before the next meeting until it is called to order, and marked approved, with the corrections, when that meeting approves them. `minutesService.ts` is gone: minutes are their own record, not a versioned document.
- Quorum at each vote: **done 2026-10-07** (`quorumPresent` on each decided motion).
- Export: Markdown and print to PDF in the browser (the client plan).
```

and under `### M9. Web client completion`, in "API mismatches", replace:

```markdown
- Header search calls `/search`, which doesn't exist, and the error is swallowed.
```

with:

```markdown
- Header search calls `/search`, which doesn't exist, and the error is swallowed. **Server done 2026-10-07:** `GET /api/organizations/:orgId/search` searches the current version of each of the organization's documents; the header moves to it in the client plan.
```

and in "Other work", replace:

```markdown
- Draft amendment editor: create, move, renumber, delete sections, with a rendered preview of the resulting version. Expose `amendments/:id/preview` (backend exists, no UI).
```

with:

```markdown
- Draft amendment editor: create, move, renumber, delete sections, with a rendered preview of the resulting version. Expose `amendments/:id/preview` (backend exists, no UI; since 2026-10-07 it gives each modified section its text from before, as `previous`).
```

- [ ] **Step 2: Update `CLAUDE.md`**

In "**Database:**", replace:

```markdown
- Bylawyer tables (Prisma): `Organization`, `OrganizationMember`, `OrganizationInvite`, `Document`, `Version`, `Section`, `Amendment`, `MeetingPacket`, etc.
```

with:

```markdown
- Bylawyer tables (Prisma): `Organization`, `OrganizationMember`, `OrganizationInvite`, `Document`, `Version`, `Section`, `Amendment`, `MeetingPacket`, `Minutes`, etc.
```

In the "API Endpoints" list, replace:

```markdown
- `GET/POST /api/documents/{id}/versions` - Versions of document
```

with:

```markdown
- `GET/POST /api/documents/{id}/versions` - Versions of document
- `POST /api/documents/{id}/import/docx` - A Word document (raw body, at most 5 MB, never stored) as text with `#` heading lines, for the bylaws parser (secretary)
- `POST /api/documents/{id}/versions/import` - A new current version from parsed sections (`parseBylaws` in shared), in one transaction (secretary)
- `GET /api/organizations/{id}/search?q=` - Sections of the current version of each of the organization's documents, at most 20, with a snippet
- `GET /api/organizations/{id}/minutes`, `GET/PUT /api/minutes/{id}`, `POST /api/minutes/{id}/publish`, `POST /api/minutes/{id}/regenerate` - Meeting minutes: drafts are a secretary's (404 below), published and approved minutes are every member's; approved minutes don't change
```

and replace:

```markdown
- `PUT /api/organizations/{id}` - Name, description, and attendance settings: `eligibleVoters`, and `quorumPercent` or `quorumCount` (admin)
```

with:

```markdown
- `PUT /api/organizations/{id}` - Name, description, time zone (`timeZone`, an IANA name; the minutes give times there), and attendance settings: `eligibleVoters`, and `quorumPercent` or `quorumCount` (admin)
```

Under "## Key Conventions", add after item 11:

```markdown
12. **Minutes:** a `Minutes` row per packet holds the minutes as Markdown (draft, published, approved). The server drafts them when `END_MEETING` is applied (`draftMinutesOnAdjournment`, once per packet), puts the organization's latest published minutes before a meeting not yet called to order (`SET_PREVIOUS_MINUTES`, server-only), and marks them approved after `APPROVE_MINUTES` (`backend-node/src/bylawyer/services/meetingMinutes.ts`). The minutes are written from the meeting record, never from log strings: every disposition is a `completedMotions` record (with `disposition`, `seconder`, `agendaItemId`, `quorumPresent`, `decidedAt`), and the enricher stamps `at` (the server's clock, ISO) on the actions in `CLOCKED_ACTIONS`. A new kind of decision needs a record and a line in `formatMinutesAsMarkdown`.
```

and renumber the two items after it (Design brief, Design tokens) to 13 and 14.

- [ ] **Step 3: Full check**

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration
```

Expected: all pass. Lint reports warnings only, no more than before this plan, and ends with the palette check passing.

- [ ] **Step 4: Live check**

Reseed the throwaway database, then start the server on a spare port with test sign-in (from `backend-node/`, the server in the background, recording its PID):

```bash
cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx tsx src/scripts/seedDemo.ts --reset && psql postgresql://postgres:postgres@localhost:55432/robbie -c 'DELETE FROM meetings'
PORT=3101 DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie ENABLE_TEST_AUTH=true NODE_ENV=test RESEND_API_KEY= npx tsx src/index.ts
```

Then, as Pat (the owner), search the bylaws, list the minutes, and import a small text as a new version of a new document:

```bash
curl -s -c /tmp/robbie-pat -H 'Content-Type: application/json' -d '{"email":"pat@maplegrove.example","code":"000000"}' localhost:3101/api/auth/verify >/dev/null
ORG=$(curl -s -b /tmp/robbie-pat localhost:3101/api/organizations | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')
curl -s -b /tmp/robbie-pat "localhost:3101/api/organizations/$ORG/search?q=quorum" | node -pe 'const r=JSON.parse(require("fs").readFileSync(0)); r.results.map(h=>h.numberLabel+": "+h.snippet.slice(0,40)).join("\n")'
curl -s -b /tmp/robbie-pat "localhost:3101/api/organizations/$ORG/minutes" | node -pe 'JSON.parse(require("fs").readFileSync(0)).map(m=>m.status+" "+m.packet.title).join("\n")'
DOC=$(curl -s -b /tmp/robbie-pat -H 'Content-Type: application/json' -d '{"title":"Pool Rules","docType":"policy"}' localhost:3101/api/organizations/$ORG/documents | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -b /tmp/robbie-pat -H 'Content-Type: application/json' -d '{"sections":[{"numberLabel":"Section 1","title":"Hours","content":"The pool opens at 9.","children":[]}]}' localhost:3101/api/documents/$DOC/versions/import | node -pe 'const v=JSON.parse(require("fs").readFileSync(0)); "version "+v.versionNumber+", "+v.sectionCount+" section"'
```

Expected, in order: two or more lines starting `Section 4.2:` and others whose text mentions a quorum (Section 4.2 among them); `published 2025 Annual Meeting`; no output for the document; `version 1, 1 section`.

Then run the annual meeting far enough to adjourn it, and read the draft (from the repository root, where `socket.io-client` is installed):

```bash
TOKEN=$(awk '$6=="session"{print $7}' /tmp/robbie-pat) node --input-type=module -e "
import { io } from 'socket.io-client';
const socket = io('http://localhost:3101', { extraHeaders: { Cookie: 'session=' + process.env.TOKEN } });
const join = (payload) => new Promise((resolve) => socket.emit('JOIN_MEETING', payload, resolve));
const act = (action) => new Promise((resolve) => socket.emit('DISPATCH_ACTION', { action: { timestamp: '', ...action }, clientSequence: 1 }, resolve));
socket.on('connect', async () => {
  const res = await join({ meetingCode: 'MAPLE1' });
  console.log(JSON.stringify({ previous: res.state.minutesFromPreviousMeeting.split('\n')[2], id: !!res.state.previousMinutesId }));
  console.log(JSON.stringify(await act({ type: 'START_MEETING' })));
  console.log(JSON.stringify(await act({ type: 'APPROVE_MINUTES', corrections: 'Twenty-two members were present, not 21' })));
  console.log(JSON.stringify(await act({ type: 'END_MEETING' })));
  socket.disconnect();
});
"
curl -s -b /tmp/robbie-pat "localhost:3101/api/organizations/$ORG/minutes" | node -pe 'JSON.parse(require("fs").readFileSync(0)).map(m=>m.status+" "+m.packet.title).join("\n")'
```

Expected: `{"previous":"## Minutes of the 2025 Annual Meeting","id":true}`, three `{"success":true,...}` lines, then `draft 2026 Annual Meeting` and `approved 2025 Annual Meeting`. Read the draft with `curl -s -b /tmp/robbie-pat localhost:3101/api/minutes/<its id>` and check by eye: the heading with "Tuesday, October 20, 2026, at Maple Grove Clubhouse, 400 Maple Grove Drive.", Pat present, the absent members listed, "### 2. Approval of the minutes of the 2025 annual meeting" with the corrections under it only if Pat called that item (here the approval came outside any item, so it is under "Other business"), and the adjournment time in Chicago's time. Stop the server by its PID.

- [ ] **Step 5: Commit**

```bash
npx prettier --write spec.md CLAUDE.md
git add spec.md CLAUDE.md
git commit -m "docs: record the secretary's desk server work"
```

---

## Self-review notes

- **Design coverage (design section to task):**
  - Decisions: minutes as their own record (Task 1's `Minutes`, Task 7's routes; `minutesService.ts` deleted in Task 6); the draft written at adjournment from the final state (Task 8); published minutes put before the next meeting and approved there (Tasks 5 and 8); PDF from the browser (the client plan; no server engine here); one parser for every source (Tasks 2 and 3).
  - Bylaws import: parsing with every listed shape, nesting, preamble, Markdown fallback and table tests (Task 2: 15 shapes); `.docx` through mammoth, secretary, 5 MB, raw body after sign-in, never stored (Task 3); `POST /api/documents/:id/versions/import` in one transaction, made current (Task 3). The paste, `.txt` and `.md` sources and the review screen are the client plan's.
  - Export and print: the client plan (no server routes; the HTML and PDF client functions go there).
  - Amendment preview: the route existed; the old text of a modified section, which the toggle needs, is Task 4. The tab is the client plan's.
  - Search: `GET /api/organizations/:orgId/search` with the roles, the 2-character minimum, 20 results, the snippet and isolation (Task 4). The header and the scroll to the section are the client plan's.
  - Minutes, data model: Task 1 (with the user relations and the approving packet as relations; see below).
  - The draft: Task 8, built from `generateMeetingMinutes` and `formatMinutesAsMarkdown(minutes, context)` (Task 6) on the record (Task 5): the header with organization, title, date and place, presiding officer, called to order and adjourned in the organization's time zone (`Organization.timeZone`, Task 1); attendance with marked members, the headcount and names, guests, absent members and the quorum at the call to order and at each vote; each agenda item in order with every disposition (motions with mover and seconder, both parts of the vote, unanimous consent, withdrawn, no second, amendments, rulings and appeals, elections with each ballot, the approval with corrections); the adjournment time; ballots as totals only. `CompletedMotion` gains `seconder`, `decidedAt` and `disposition` with the design's five values (Task 5).
  - The secretary's flow: the routes with `requireRole` rules, the route coverage test, draft visibility, publish and regenerate (Task 7). The pages are the client plan's.
  - Approval at the next meeting: `minutesFromPreviousMeeting` and `previousMinutesId` (Tasks 5 and 8), `APPROVE_MINUTES { corrections }` (Task 5), marking approved with `approvedAtPacketId` and the corrections, best effort (Task 8). The chair console, phone and display are the client plan's.
  - Testing, server and shared: the parser table (Task 2), the generator and formatter against a full scenario (Task 6: attendance with headcount, a hybrid vote, a ballot, unanimous consent, an election, approval with corrections), the import routes with a Word fixture and the size limit (Task 3), versions/import's transaction and roles (Task 3), search's roles, snippet and isolation (Task 4), the minutes routes' matrix, draft visibility (404), publish and regenerate (Task 7), the draft at adjournment once per packet, loading the previous minutes and approval marking them (Task 8).
  - Out of scope, kept out: no `.docx` export, no collaborative editing (last save wins, and the record names who saved last), no PDF import.
- **Where the code and the design differ, and what this plan does:**
  - **Times.** The design reads the call to order and adjournment "from the log's timestamps"; those are clock times without a date in the server's zone (`generateTimestamp()` is `toLocaleTimeString()`), which is why the old generator printed "Invalid Date". The minutes take those two times from the packet's `startedAt` and `endedAt` (recorded by `recordMeetingTimes`, which runs before the draft), and each disposition's `decidedAt` from a new ISO `at` the enricher stamps on the seven deciding actions (`CLOCKED_ACTIONS`). `timestamp` and the log are unchanged: the web app parses their clock format. `CompletedMotion.timestamp` stays as it was beside the new `decidedAt`.
  - **Facts the design's three fields don't cover.** Grouping dispositions under agenda items needs the item under way (`agendaItemId`, on records, rulings, officers and the approval). The quorum at each vote needs `quorumPresent`, and at the call to order `quorumAtCallToOrder`. Rulings needed a list (`chairRulings`; `lastChairRuling` is overwritten). Each ballot of an election needed keeping (`Election.ballots`, copied to the officer). Members who left before adjournment are `present: false` by then, so `attendedIds` lists everyone who was present. All are new optional record fields or state fields with defaults.
  - **Amendments "and how they changed the motion".** The reducer doesn't rewrite a main motion's text when an amendment carries, so the minutes record the amendment's own text and its result, in order before the vote on the main motion; the secretary can write the amended wording in.
  - **Place.** The design takes the place "from the packet", which had no such field (the scheduler asked for it in the description). Task 1 adds `MeetingPacket.location`; the client plan adds a Place field to the scheduler.
  - **The `Minutes` model** is the design's, with relations added for `updatedById`, `publishedById` (to users, set null on delete) and `approvedAtPacketId` (to the approving packet, set null on delete), so the minutes page can name who saved last and the meeting that approved them.
  - **When the previous minutes are loaded.** The design loads them when a meeting's live state is created. Task 8 also loads them into an existing state that hasn't been called to order and has none, so minutes published after someone opened the display still reach the meeting; once called to order, nothing changes.
  - **`SET_PREVIOUS_MINUTES`** was an admin action; it becomes server-only, since `previousMinutesId` is what approval marks, and a typed text would have no minutes to mark.
  - **Regenerate** works on drafts only (published minutes are what members have read), and answers 409 when the meeting has no live record (the rule test expects 409 for that reason). **Publish** is idempotent. **Approved minutes** can't be edited or republished (409).
  - **The JSON limit.** The app parses JSON up to 100 KB; the import and the minutes body can be larger, so those two paths get a 2 MB parser, read after sign-in like uploads.
  - **`itemsDecided`** (the display's count) read unanimous consents from the log; with consents recorded it would count them twice, so Task 5 changes it, and the motion history leaves out motions never decided.
  - **The design's "draft at adjournment... in the action handler, after the broadcast"**: it also waits for `recordMeetingTimes`, so the adjournment time is on the packet when the draft is written.
  - **Phase B was still landing** while this plan was written (floor motions and seconds, items that complete themselves). The snippets match the tree as of commit `de04b63`; motions from the floor need nothing more (their mover and seconder are names on the motion), and a question the chair puts ("Put by the chair") is written "The chair put the question".
- **Known limits added:** the Word import reads only what mammoth reads (heading styles become `#` lines; numbering Word generates is not text, so a document whose labels are automatic list numbers parses as Markdown headings or plain text), and any file mammoth can't read is answered as not a Word document; a large one takes a few seconds. Two secretaries editing the same minutes: the last save wins. Minutes published after a meeting is called to order are not put before it. A ruling's minutes line quotes the point as the chair saw it.
- **Names used across tasks (and by the client plan):** `isTimeZone`, `timeZoneName`; `Organization.timeZone`, `MeetingPacket.location`, `Minutes`, `MinutesStatus`; `ParsedSection`, `parseBylaws`, `describeParsedBylaws`; `DOCX_TYPES`, `DOCX_LIMIT`, `NO_FILE`, `NOT_A_DOCX`, `docxToText`, `htmlToImportText`, `ImportedSection`, `importVersionBody`, `MAX_IMPORTED_SECTIONS`, `MAX_IMPORT_DEPTH`, `LARGE_JSON_PATHS`; `SEARCH_LIMIT`, `SearchHit`, `snippetAround`, `searchOrganization`, `searchQuery`; the preview's `previous`; `Disposition`, `CompletedMotion.seconder`, `.disposition`, `.decidedAt`, `.agendaItemId`, `.quorumPresent`, `ChairRulingRecord`, `MinutesApprovalRecord`, `Election.ballots`, `Officer.ballots`, `MeetingState.previousMinutesId`, `.minutesApproval`, `.quorumAtCallToOrder`, `.chairRulings`, `.attendedIds`, `APPROVE_MINUTES.corrections`, `SET_PREVIOUS_MINUTES.minutesId`, the actions' `at`; `decisionContext`, `quorumNow`, `unvotedRecord`, `withAttended`; `logMinutesApprovedWithCorrections`; `CLOCKED_ACTIONS`, `MAX_CORRECTIONS_LENGTH`; `MinutesEntry`, `MinutesItem`, `MeetingMinutes`, `MinutesContext`, `generateMeetingMinutes`, `formatMinutesAsMarkdown`; `minutesContext`, `writeMinutes`, `draftMinutesOnAdjournment`, `previousMinutesFor`, `markPreviousMinutesApproved`; `MAX_MINUTES_LENGTH`, `updateMinutesBody`, `minutesRouter`, `MINUTES_APPROVED`, `ONLY_DRAFTS_REGENERATE`, `NO_MEETING_RECORD`, `orgOfMinutes`; `MeetingPacketInfo.id`, `withPreviousMinutes`; fixture `minutes`, `draftMinutes`, `makeDocx`, `DOCX_HEADERS`; `DEMO_PAST_MEETING_CODE` (`MAPLE25`).
- **Response shapes the client plan must handle:** organizations carry `timeZone`; packets and schedule rows carry `location`; `GET /api/organizations/:orgId/search` answers `{ query, results: SearchHit[] }`; the preview's sections carry `previous`; minutes answer `MinutesSummary[]` (list) and `MinutesRecord` (one; see the API table); the import routes answer `{ text }` and a version with `sectionCount`; the live state's new fields and `APPROVE_MINUTES { corrections }`; the 2025 demo minutes are before any demo meeting not yet called to order.
- **Placeholder scan:** no "TBD" and no "similar to"; every new file is given whole; every change is shown before and after, or anchored to an exact line, apart from Task 1's expected migration, described clause by clause because Prisma writes it. `<timestamp>` in the migration's directory name is Prisma's, and `<its id>` in the live check is the draft's id, read from the list just before.
