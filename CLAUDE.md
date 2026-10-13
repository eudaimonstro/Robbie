# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Robbie** runs in-person HOA meetings under Robert's Rules and keeps the association's governing documents. In the room the chair runs the meeting from a laptop (the console), homeowners take part on their phones in the browser (by link or QR code), a TV shows the display, and people without a phone or an account are counted by the chair. The documents side keeps the bylaws in versions, amendments from draft to adoption, and the minutes, which the server drafts when a meeting adjourns. A bylaw amendment adopted in a meeting becomes a new version of the bylaws.

It is one product with one server and one web app. "Bylawyer" (the documents side's old name) survives only in code: `backend-node/src/bylawyer/`, the `@robbie-bylawyer/*` package names. Plans and decisions: `docs/mvp-roadmap.md` (what is built, known gaps), `docs/decisions.md`, `docs/design/` (each part's design, history), `docs/RONR_IMPLEMENTATION_STATUS.md` (which motions and rules), `docs/design-brief.md` (the look), `docs/deploy.md` (production runbook), `docs/demo.md`.

## Layout

```
shared/            @robbie-bylawyer/shared: types, the meeting reducer, constants, utils (minutes, attendance, elections, bylaws parser, roles)
backend-node/      Express + Socket.io + Prisma, port 3001 (dev); serves the built web app in production
  src/auth/        sign-in by emailed code, sessions, email
  src/orgs/        roles, requireRole, members
  src/bylawyer/    documents side: routes/, services/, bylawSyncService.ts (meeting -> amendment -> version)
  src/socket/      live meetings: join, actions (schemas, permissions, enricher, validator), state publishing
  src/db/          Prisma + pg pool, live meeting storage, server lock
  src/middleware/  validate, apiError, origin check, limits, security headers, logger
  src/abuse/       report handling (handleReport); src/scripts/: CLI entry points; src/demo/: the demo seed
  src/__tests__/, src/__integration__/   unit and integration tests
  prisma/          schema.prisma and migrations
frontend-unified/  React + Vite, port 5173 (dev)
  src/modules/documents/   pages: home, documents, amendments, minutes, settings, print and share pages
  src/modules/meetings/    views: LiveMeetingsPage, MeetingApp, ChairConsole, PhoneView, DisplayView;
                           components: console/, phone/, attendance/, scheduling/, chair/; context/SocketContext
  src/context/     Session, Organization, Theme, Toast;  src/styles/index.css: the design tokens
e2e/               Playwright harness and scenarios (not a workspace)
deploy/            production: compose.yaml (app, db, backup, caddy), Caddyfile, .env.production.example, backup/restore, smoke.sh
scripts/           demo.sh, check-palette.sh
docs/              see above
```

## Commands

```bash
npm install
npm run dev              # backend (3001) and web (5173, proxies /api and /socket.io to API_PROXY_TARGET, default 3001)
npm run demo             # Maple Grove HOA demo at http://localhost:3301 with its own Postgres (Docker, port 55433), sign-in code 000000; -- --reset | --stop | --remove
npm run build            # shared, then backend, then web (build:shared first whenever shared changes)
npm run test             # shared, backend unit and web tests (Vitest)
npm run test:coverage    # the same with coverage and its thresholds
npm run test:integration -w backend-node            # needs INTEGRATION_DATABASE_URL: a throwaway Postgres, never DATABASE_URL's
npm run test:integration:coverage -w backend-node   # the same with coverage (coverage/integration)
npm run lint             # ESLint with --max-warnings 0, then the palette check (lint:palette)
npm run format:check     # Prettier, Markdown included
npm run e2e              # Playwright (below)
```

In `backend-node`: `db:generate` (Prisma client), `db:migrate` (`prisma migrate dev`), `db:deploy` (CI, production), `db:studio`, `seed:demo` (`-- --reset` replaces it), `org:add-member -- --org <slug> --email <email> --role <role>`, `email:test -- <email>`, `report` (`handleReport`: preserve and remove a reported file, record a CyberTipline report, restore a copyright removal, suspend or unsuspend; `--dry-run`; `docs/deploy.md`, "Handling a report").

**The demo seed** (`src/demo/demoSeed.ts`): Maple Grove HOA, America/Chicago, 142 voting members and a 20% quorum, 17 people (Pat owner, Dana admin and presiding officer, Ray secretary, Alice and Ben members, Morgan and Sam viewers, others), two homeowners added by email who haven't signed in (Harold Becker, Rosa Alvarez), a board of three (Dana, Pat, Alice), bylaws version 1 with a proposed amendment to Section 4.2, this year's annual meeting `MAPLE1`, last year's `MAPLE25` (adjourned, minutes published) and the board's November meeting `MAPLEB`. Its people sign in with `000000` when `ENABLE_TEST_AUTH=true`.

**e2e:** start the throwaway Postgres once (`docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine`) and `npx playwright install chromium`. `npm run e2e` builds, starts the API on 3101 (serving the web build with production's headers) on `E2E_DATABASE_URL` (default that Postgres; never `DATABASE_URL`), migrates it, clears its live meetings and reseeds the demo, then runs the smoke, header, visual (both palettes), accessibility (axe, WCAG 2.1 AA), import, meeting, annual meeting, thresholds and board scenarios, one at a time. Locally it reuses a server already on 3101 (stop a stale one). Each person is a browser context of their own (`personPage`); read text with `shown(page, text)` (the main landmark, never a toast or a hidden live region) or `region(page, name)` ("The question", "Your part", "Vote in progress"), not a bare `getByText`. Screenshots land in `e2e/test-results/`. In CI a test that passes only on its retry fails the job.

**Test databases:** integration tests and e2e run on a throwaway Postgres (such as the one on 55432 above; a `robbie_integration` database for integration tests), never on `DATABASE_URL`'s database: they clear and reseed what they use.

**Docker:** `docker compose up -d` starts a development Postgres on port 55434 (`docker-compose.yml`; `backend-node/.env.example` points there). The production image: `docker build -t robbie:local . && SMOKE_PORT=3201 bash deploy/smoke.sh robbie:local` (serving, refusals, backup and restore). Production is `docs/deploy.md`: one server, `deploy/compose.yaml`, images from CI (`ghcr.io/eudaimonstro/robbie:main` and `:sha-<7 hex>`); the image migrates on start (`deploy/app-start.sh`) and runs as `node` with `NODE_ENV=production`, so `dotenv` and `prisma` are runtime dependencies.

**CI** (`.github/workflows/ci.yml`): `checks` (audit at high, format, lint, tsc of shared, backend, web and e2e, build), `unit` (the three packages with coverage), `integration` (Postgres: the migration drift check, `prisma migrate diff --from-migrations ... --to-schema ... --exit-code` on a shadow database from `SHADOW_DATABASE_URL`, then the integration tests with coverage), `e2e`, `image` (build and `smoke.sh`), and `publish` (main only, after all five). Node comes from `.nvmrc`.

## Architecture

### Server (backend-node)

- **Sign-in:** an emailed six-digit code, then a server-side session in an httpOnly `session` cookie (the only credential). `POST /api/auth/request-code` answers a `challenge` the browser sends back with `verify`: a code is bound to the browser that asked for it, and only its 5 attempts are spent. Limits: per IP 300 code requests and 600 verifications per 15 minutes; per hour 5 codes for an email from one address, 50 from all, 200 sign-in emails from one address (addresses counted per IPv4 address or IPv6 /64 and stored as an HMAC under `SERVER_SECRET`). Only a challenge's SHA-256 is stored, and codes are kept an hour. Emails are logged by domain only (`emailForLog`), and a client's `X-Request-Id` is used only when it is a plain id. A suspended user (`User.suspendedAt`) is refused quietly, and every minute the server closes sockets whose session ended (`socket/sessionSockets.ts`). Users accept the current terms (`TERMS_VERSION`) before using the API or the socket (403 `TERMS_NOT_ACCEPTED`).
- **Requests:** every `/api` route outside `/api/auth`, `/api/share` and `/api/health` runs `authenticate`, the terms check and the per-user write limit (600 per 15 minutes; imports, uploads, new versions, new organizations, bulk member adds and sending a notice 60 an hour; scheduling 20 an hour; limits are off under `NODE_ENV=test`), then `validate(...)` and `requireRole` (Convention 10). A state-changing request or socket handshake with an `Origin` other than the request's own host, `APP_URL`'s or an allowed dev origin is 403 (`middleware/originCheck.ts`). Every `/api` answer is `Cache-Control: no-store`. Malformed JSON is 400, an oversized body 413. Routes answer errors by throwing `ApiError` (`{ error, code? }`); validation, Prisma and unexpected errors still answer `{ error: { code, message } }`.
- **Live meetings:** state in the `meetings` table (`LiveMeeting`, read and written with SQL by `db/meetingStorage.ts`), kept in memory while in use and written through (votes, hands and presence wait at most 250 ms, `DEFERRED_WRITES`; shutdown flushes). One server per database: it holds a Postgres advisory lock (`db/serverLock.ts`). Storage and Prisma share one pool (`db/client.ts`).
- **Database:** one Postgres (`robbie`); every table comes from the migrations, none from startup code. The server refuses to start without `DATABASE_URL`, in development too.
- **Web app:** in production and e2e the API serves the build (`webApp.ts`: hashed bundles cached a year, `index.html` never), under Helmet's CSP (`middleware/securityHeaders.ts`).

### Live meetings (socket and screens)

- **Events:** client to server `JOIN_MEETING` (`{ meetingCode, display? }`; a display gets the state without becoming a member), `LEAVE_MEETING`, `DISPATCH_ACTION`, `REQUEST_STATE`; server to client `STATE_UPDATE`, `ACTION_REJECTED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `ERROR` (`MEETING_CANCELED`: the client closes for good).
- **Updates** are coalesced per meeting (`emitState`, at most one per 250 ms for votes, ballots, hands and presence, `DEFERRED_WRITES`; every other action goes out at once) and slim: the log and decided motions as what was added since the room's last update (`tails`, from `baseVersion`), and the members, the agenda, `attendedIds` and the previous minutes left out while unchanged (`unchanged`). The web rebuilds the state (`hooks/stateUpdates.ts`) or asks for it. No connection state recovery: a reconnecting socket joins again.
- **Roles** come from the organization at every join (`deriveMeetingSeat`, `socket/meetingRoles.ts`): the packet's presiding officer chairs, secretaries and above are admins, members are members, other signed-in people with the code are guests (until the meeting adjourns). In a board meeting (`MeetingPacket.kind = board`) the directors (`OrganizationMember.isDirector`) vote, a secretary or presiding officer who isn't one keeps the console with `nonVoting`, other members and viewers are observers, and nobody is counted in the room or by proxy.
- **Attendance** (`attendanceSummary` in shared): members on a device, members marked present by the chair, a headcount of people without an account (with names, and people added by email but not signed in counted by their addition), and the paper proxies and absentee ballots held, over the voting members. A meeting opens only once its organization has set its voting members and quorum (`QUORUM_NOT_SET`). Without a quorum, opening a vote, unanimous consent, adopting the agenda, opening a ballot and electing by acclamation need the chair's confirmation (`confirmedWithoutQuorum`, else `NO_QUORUM`); adjourning and a recess don't. Votes are device votes plus the chair's count of the room; counts the chair enters replace the last entry.
- **Screens** (`docs/design-brief.md`): `MeetingApp` shows the chair console to the chair and admins and the phone view to everyone else, by `myRole` from `SocketContext` (never assumed); `/meetings/:code/display` joins with `display: true`. The question card, the stamp and the attendance block are shared, fed by `describeQuestion` and `currentResult` (`utils/question.ts`) and `attendanceSummary`. The console's toolbar shows `chairActions(state)`, its first button the chair's real next step; the phone's one action block follows `phoneMoment(state)`. Phones vote Yes, No or Abstain (the console keeps Yea and Nay).
- **Motions:** what is in order is one rule for the screens and the server, `motionOutOfOrder` (`shared/utils/motionRules.ts`; `OFFERED_MOTIONS`): main motions, the agenda's, amend, close debate, postpone, postpone indefinitely, refer, recess, adjourn, point of order, appeal; the rest are refused with `MOTION_NOT_OFFERED`. Voice votes may be declared ("The ayes have it"), and a division counts them.
- **Elections** (`shared/utils/elections.ts`; the design is `docs/design/2026-10-08-elections-and-thresholds-design.md`): one office at a time for one or several seats on one ballot, device ballots plus the tellers' paper count, `countBallot` decides, the chair declares each winner (`DECLARE_ELECTED`) or elects by acclamation. While a ballot is open its device count goes to nobody, the chair included (only who has voted), and the tellers' paper count only to the chair and admins (`publicState`).

### Documents side

- **Model:** `Organization` (voting members, quorum, `boardQuorum`, time zone, `bylawAmendmentVote`), `OrganizationMember` (role, `isDirector`), `OrganizationInvite` (a pending addition by email), `Document`, `Version` (numbered per document under the document's row lock), `Section` (a tree by `parentId`), `Amendment` (draft, proposed, passed, failed, tabled, withdrawn; keeps `decidedAt`, `robbieVoteData`, `resultingVersionId`) and `AmendmentChange` (add, modify, delete, renumber, with `targetLabel`), `MeetingPacket` (a scheduled meeting: code, `kind`, presiding officer, place, agenda items, attachments, notice), `MeetingNotice`, `Minutes` and `MinutesRevision`, `AuditEntry` (each deleted document, version or organization; no foreign key, so it outlasts them), `User`, `Session`, `SignInCode`.
- **Amendments:** a member drafts; a secretary proposes, then the amendment is decided by a meeting's vote (the bylaw sync) or by a secretary (`/pass`, `/fail`) for one decided elsewhere, and a passed one is applied as a new version. A new version, whether copied (`POST .../versions`), imported or made by an amendment, carries the open amendments to its sections (`remapOpenAmendments`; an import matches sections with `matchSections`).
- **Meeting to bylaws:** a bylaw amendment motion carries its change (`BylawAmendment` in shared): a proposed amendment moved as drafted (`amendmentId`) or a change written on the phone. `prepareBylawMotion` (`socket/bylawMotion.ts`) checks it against the current version, fills in the section's text and the motion's words, and stamps the vote it needs from `bylawAmendmentVote` (`motionThreshold` reads it everywhere). Its words can't be amended in the meeting. When it is decided (`CLOSE_VOTING` or `UNANIMOUS_CONSENT_PASSED`), `bylawSyncService` marks the moved amendment passed or failed (or creates one) and applies a carried one as a new version. A section no longer in the current version is recorded passed but not applied, with the reason, for a secretary. A board meeting can't move a bylaw amendment.
- **Import, search, minutes (web):** the import screen parses with `parseBylaws` (shared; pasted text, `.txt`, `.md`, or a `.docx` the server turns into text) and saves through `versions/import`. The header search opens `/documents/:id#section-<sectionId>`. Minutes are Markdown, autosaved two seconds after typing stops; the next meeting approves them from the console (`MinutesApprovalCard` while `minutesItemUnderWay(state)`).

### API

All under `/api`; the minimum role in brackets (outsiders get 404, too low a role 403). Paths name `:id`s of the resource the role is checked on.

- **Public:** `GET /health` (200 when the database answers `SELECT 1` within 2 s, else 503); `GET /share/:token`, `/share/:token/versions/:versionId`, `/share/:token/search?q=` (a shared document; never annotations or files).
- **Auth** (`/auth`): `POST /request-code`, `POST /verify`, `GET /me`, `PATCH /me` (name), `POST /accept-terms`, `POST /sign-out`, `POST /sign-out-everywhere`.
- **Organizations:** `GET`, `POST /organizations` (signed in; at most 3 created per user; takes `timeZone`, `eligibleVoters`, `quorumPercent` or `quorumCount`); `GET /organizations/:id`, `/organizations/by-slug/:slug` [viewer]; `PUT /organizations/:id` (name, description, time zone, voting members, quorum, `boardQuorum`) [admin]; `PUT /organizations/:id/vote-rules` (`bylawAmendmentVote`: `twoThirdsCast` default, `majorityCast`, `majorityMembers`, `twoThirdsMembers`) [admin]; `DELETE /organizations/:id` (closes its live meetings, deletes its files, leaves an `AuditEntry`) [owner].
- **Members:** `GET /organizations/:id/members` [viewer; emails for admins and each person their own]; `POST .../members` (by email, optional name; 20 emailed additions a day) [admin]; `POST .../members/bulk` (up to 500, emails nobody) [admin]; `PUT .../members/:userId` (role) [admin]; `PUT .../members/:userId/director` [admin]; `DELETE .../members/:userId` (an admin removes, anyone leaves) [viewer]; `DELETE /organizations/:id/invites/:inviteId` [admin]. An organization keeps at least one owner.
- **Documents:** `GET`, `POST /organizations/:orgId/documents` [viewer, secretary]; `GET /organizations/:orgId/search?q=` (current versions' sections, 2 to 200 characters, at most 20) [viewer]; `GET`, `PUT`, `DELETE /documents/:id` [viewer, secretary, admin]; `GET /documents/:id/at-date` [viewer]; `GET`, `POST`, `DELETE /documents/:id/share`, `POST .../share/regenerate` (the only answers with the token) [admin].
- **Versions:** `GET`, `POST /documents/:docId/versions` [viewer, secretary]; `POST /documents/:docId/import/docx` (raw body, 5 MB, never stored; 400 "That Word document is too large to read" for one that would unpack too large, `DOCX_TOO_LARGE` in `docxText.ts`) [secretary]; `POST /documents/:docId/versions/import` (at most 2,000 sections, 6 levels, 2 MB) [secretary]; `GET /versions/:id`, `/tree`, `/text`, `/diff/:otherId`, `/export/markdown` [viewer]; `PUT /versions/:id` [secretary]; `DELETE /versions/:id` (an earlier version no adopted amendment made) [admin].
- **Sections:** `GET /versions/:versionId/sections`, `GET /sections/:id`, `/sections/:id/path` [viewer]; `POST /versions/:versionId/sections`, `PUT .../sections/reorder`, `PUT`, `DELETE /sections/:id`, `POST /sections/:id/children` [secretary]. Section and version writes touch the current version only (409 otherwise, `versionRules.ts`).
- **Amendments:** `GET /organizations/:orgId/amendments?status=` [viewer]; `GET`, `POST /documents/:docId/amendments` [viewer, member]; `GET /amendments/:id`, `/changes`, `/preview` [viewer]; `PUT`, `DELETE /amendments/:id`, `POST .../changes`, `DELETE /amendment-changes/:id` (a member's own drafts) [member]; `POST /amendments/:id/propose`, `/withdraw`, `/pass`, `/fail`, `/table`, `/untable`, `/apply` [secretary].
- **Meetings (packets):** `GET`, `POST /organizations/:orgId/packets` (the schedule; scheduling claims a code, random when left out, 409 for a taken one) [viewer, secretary]; `GET /packets/:robbieCode`, `/packets/:id/summary` [viewer]; `PUT`, `DELETE /packets/:id` (canceling refuses a meeting called to order and closes an open one) [secretary]; `GET /packets/:robbieCode/roster` [viewer]; `POST /packets/:robbieCode/reload-agenda` (a secretary or the presiding officer, before the call to order) [member]; `GET`, `POST /packets/:robbieCode/notice` (emails every member and pending addition; 3 a day per organization) [secretary].
- **Agenda and files:** `GET /packets/:packetId/agenda`, `GET /agenda-items/:id` [viewer]; `POST /packets/:packetId/agenda`, `PUT /agenda-items/reorder`, `PUT`, `DELETE /agenda-items/:id`, `POST /agenda-items/bulk` [secretary]; `POST /attachments/upload?packetId=|agendaItemId=` (raw body: PDF, DOC, DOCX, TXT, RTF, 10 MB; 413 past `ORG_STORAGE_LIMIT_MB`), `POST /attachments/link-document`, `PUT /attachments/reorder`, `PUT`, `DELETE /attachments/:id` [secretary]; `GET /attachments/:id`, `/download` [viewer]. Who uploaded a file is recorded but never sent (`HIDDEN_ATTACHMENT_FIELDS`).
- **Minutes:** `GET /organizations/:orgId/minutes`, `GET /minutes/:id` [viewer; drafts are a secretary's]; `PUT /minutes/:id` (Markdown, 200,000 characters; approved minutes, and published ones before an unadjourned meeting, are 409), `POST .../publish`, `/regenerate` (drafts only), `GET .../revisions[/:revisionId]` [secretary].
- **The meeting's bylaw form:** `GET /bylawyer/meeting/:meetingCode/organization`, `/bylawyer/organizations/:orgId/documents`, `/bylawyer/documents/:docId/sections` [viewer].

Meeting codes are trimmed, uppercased and must match `MEETING_CODE_PATTERN` (`^[A-Z0-9]{4,8}$`, shared). Attachment types and size are shared's `ATTACHMENT_TYPES` and `MAX_ATTACHMENT_BYTES`; emails are compared as `normalizeEmail` (shared) makes them.

### Web app (frontend-unified)

- **Routes:** `/` home (the setup checklist for secretaries and above, the next meeting, documents, pending amendments); `/documents/:id` (with `/diff`, `/import`, `/amendments`, `/print`); `/amendments`, `/amendments/:id`; `/minutes`, `/minutes/:id` (`/print`); `/meetings` (Live Meetings: the schedule with Join, Start for the presiding officer, Change and Send notice for secretaries, and the code box); `/meetings/:code` (the live meeting, joined after sign-in; focus mode folds the sidebar into a drawer); `/meetings/:code/display` (the TV: always dark, nothing to click, outside the layout; viewers and above); `/meetings/:code/notice` (the printable notice, secretaries); `/settings` (time zone, attendance, bylaw amendments, members with Add several people and the board, `#attendance` and `#members` scroll there); `/style-guide`. Public: `/sign-in`, `/share/:token` (`/print`), `/terms`, `/privacy`. `?print=1` on a print page opens the print dialog.
- **State:** `SessionContext` (the user, `termsAccepted`/`acceptTerms`; `RequireSession` guards every route but the public ones and shows the terms step), `OrganizationContext` (the user's organizations with their `role`, the current one; `useCan(minRole)` hides what the role can't do, with shared's role order; a record page selects its own organization with `useSelectRecordOrganization`), `ThemeContext`, `ToastContext`, and `SocketContext` for the meetings module. The REST client calls same-origin `/api`; only the meeting socket reads `VITE_SERVER_URL` (leave it unset).

## Environment (backend-node)

`backend-node/.env` in development; `deploy/.env.production.example` documents production's.

```
PORT=3001
DATABASE_URL=postgresql://...       # required everywhere; DIRECT_URL (CLI, bypassing a pooler), SHADOW_DATABASE_URL (drift check) optional
DATABASE_SSL=                       # TLS for a remote database: verify to check its certificate
CLIENT_ORIGIN=http://localhost:5173 # a cross-origin web app (development); unset in production
APP_URL=                            # links in emails; falls back to CLIENT_ORIGIN, then http://localhost:5173
EMAIL_FROM=                         # with one provider: RESEND_API_KEY, SENDGRID_API_KEY or SMTP_HOST/PORT/SECURE/USER/PASS
SERVER_SECRET=                      # 32+ characters (openssl rand -hex 32): the key of the sign-in address hashes
TRUST_PROXY=                        # 1 behind Caddy
UPLOAD_DIR=./uploads                # meeting attachments (/data/uploads in the image)
PRESERVE_DIR=                       # handleReport's preserved files; default "preserved" beside UPLOAD_DIR; never served or backed up
ORG_STORAGE_LIMIT_MB=500            # each organization's files together
ENABLE_TEST_AUTH=                   # true: the code 000000 (TEST_VERIFICATION_CODE) signs anyone in; refused in production
EMAIL_OUTBOX_DIR=                   # tests: emails written here as JSON instead of sent
LOG_LEVEL=
```

In production (`NODE_ENV=production`) the server refuses to start without an email provider, `EMAIL_FROM`, `APP_URL` or `CLIENT_ORIGIN`, `TRUST_PROXY`, or `SERVER_SECRET`, or with `ENABLE_TEST_AUTH=true` or a bad `ORG_STORAGE_LIMIT_MB` (`startupCheck.ts`). No variable sets meeting roles.

## Key conventions

1. **Pure reducer.** Never add `Date.now()`, `Math.random()` or side effects to the meeting reducer. Generate ids and timestamps before dispatch (`idGenerators`); the server's clock goes on actions through the enricher.

2. **Versions are the record.** Only a document's current version changes (its sections and details, by a secretary); earlier versions are 409 on any change (`versionRules.ts`) and read-only on the web. An admin may delete an earlier version that no adopted amendment made, and a document; each deletion, and an organization's, leaves an `AuditEntry` (`bylawyer/services/audit.ts`).

3. **TypeScript.** Actions are a discriminated union, checked exhaustively. Strict mode everywhere.

4. **React.** Function components. Reset local state from props with a `key` or by adjusting it while rendering, not with an effect; keep a load's answer with what it was for (or drop a late one) so switching quickly never shows the previous one's data. A data-loading effect that marks itself loading before its request says why on its `eslint-disable` line.

5. **Shared changes:** `npm run build:shared` before the server or web sees them. Rules both sides apply live in shared (roles, meeting code, attachment limits, motion rules, thresholds).

6. **UUID primary keys** for the documents side's records; one Postgres database for everything.

7. **Prisma 7** generates into `backend-node/src/generated/prisma` (gitignored): import from there (`../generated/prisma/client.js`), not `@prisma/client`. CLI settings are in `prisma.config.ts`. Use migrations, never `db push`; every table is in `schema.prisma` (the live `meetings` table as `LiveMeeting`), and CI fails on drift between them. `20261008161647_live_meetings_table` is the one migration partly written by hand.

8. **Root pins.** The root `package.json` declares `typescript`, `vite`, `react`, `react-dom` and `@types/node` so one copy sits at the root for ESLint, `npx tsc`, Vitest and the web. Keep `react` and `react-dom` on the web's exact version, and `@types/node` on Node 24 (`.nvmrc`). Declare every package a workspace imports in that workspace's `package.json` (the e2e harness's in the root's).

9. **Organizations and roles,** lowest first: viewer (reads everything, lists members), member (drafts amendments and edits or deletes their own drafts), secretary (edits the current version, decides and applies amendments, schedules meetings with their agendas, files and notice, edits and publishes minutes), admin (organization settings, share links, members' emails, members up to admin, the board, deletes documents and earlier versions), owner (owners, deleting the organization). Every `/api` route outside auth, share and health runs `requireRole(minRole, resolver)` from `src/orgs` (or `signedInOnly()`) after `validate(...)`; `src/__integration__/routeCoverage.test.ts` fails on a route without a rule. A handler that takes a second resource checks it against `req.org.id` (404 if elsewhere).

10. **Live meeting actions.** A meeting code is a `MeetingPacket`; `JOIN_MEETING` refuses a code without one and creates the live state from it (`socket/meetingPacket.ts`), and never reuses a stored state whose `organizationId` isn't the packet's. Every client action is checked against its zod schema (`ACTION_SCHEMAS`, `socket/actionSchemas.ts`: strict, bounded; messages capped at 100 KB), then `permissionGuard`, `actionEnricher` (overwrites every actor field from the socket, `ACTOR_FIELDS`), `actionValidator` and the reducer. All five are exhaustive over the action union: a new action needs a schema (`serverOnly` for the server's own), a reducer case, a validator case, a `PERMISSIONS` entry and an `ACTOR_FIELDS` entry. Every state sent goes through `publicState` (`socket/statePublisher.ts`), which strips secret ballot choices, an open election's counts and a declared voice vote's undo. A dropped connection keeps its member present for `PRESENCE_GRACE_MS` (90 s); only device presence clears itself. A stored state loads with current defaults and without retired fields (`withDefaults`, `RETIRED_STATE_KEYS`).

11. **Minutes** are a `Minutes` row per packet (draft, published, approved), drafted by the server when `END_MEETING` is applied (`draftMinutesOnAdjournment`, once per packet), put before the next meeting of the same kind (`SET_PREVIOUS_MINUTES`) and marked approved after `APPROVE_MINUTES` (`bylawyer/services/meetingMinutes.ts`; best effort, like the bylaw sync). They are written from the meeting's records, never from log strings: `generateMeetingMinutes` and `formatMinutesAsMarkdown(minutes, context)` in shared, from `completedMotions` (with `disposition`, `seconder`, `quorumPresent`), `chairRulings`, `electedOfficers`, `electionsSetAside`, `unfinishedAtAdjournment`, `postponedMotions`, `recesses`, `agendaAdoption`, `attendedIds`, `quorumAtCallToOrder` and `minutesApproval`. The enricher stamps the server's time (`at`) on the actions in `CLOCKED_ACTIONS`. Motions are named by `plainMotionName` (`shared/constants/motionWords.ts`). Ballots are counts only. A change to published minutes keeps the text it replaced as a `MinutesRevision`, one per run of saves: a new one only when the latest is older than 10 minutes or another editor's, at most 50 (the oldest go). Minutes before a meeting that hasn't adjourned (`beforeMeeting`) open read-only in the editor. A new kind of decision needs a record, a clocked action if it is timed, and a line in `formatMinutesAsMarkdown`.

12. **Design tokens (web).** `docs/design-brief.md` rules the look. Use the tokens of `frontend-unified/src/styles/index.css` (`bg-paper`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-muted`, `border-rule`, `bg-gavel`, `text-carried`, `text-caution-ink`, the `-tint`s, and the fixed shades `gavel-*`, `ink-*`, `carried-*`, `caution-*`) and its utilities (`btn-primary`/`-secondary`/`-ghost`, `card`, `badge-*`, `input`, `label-caps`, `page-title`, `card-title`, `meeting-code`, `animate-*`); they flip with `.dark` on any element. Links are `text-gavel hover:underline`; checkboxes and radios `accent-gavel`. Tailwind's palette is off: never its palette classes, `white` or `black`, or emoji icons (lucide only); `scripts/check-palette.sh` fails `npm run lint` on them, and its allowlist stays empty. `/style-guide` shows everything. The web tokens test imports `index.css?raw`, which works because `vitest.config.ts` processes that one stylesheet.

13. **Tests.** Coverage counts every source file, with thresholds just under today's levels (each package's `vitest.config.ts`, and `vitest.integration.config.ts`): raise them as coverage grows, never lower them to pass. Integration tests run one file at a time against `INTEGRATION_DATABASE_URL`. ESLint runs with `--max-warnings 0`: fix a warning, or disable it on its line with the reason.
