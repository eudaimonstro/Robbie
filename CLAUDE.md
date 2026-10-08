# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Robbie-Bylawyer is a combined monorepo containing two related applications for organizational governance:

1. **Robbie** - Real-time collaborative parliamentary procedure application following Robert's Rules of Order
2. **Bylawyer** - Organizational bylaws version control system for managing, versioning, and amending governing documents

Both applications now run from a **single unified backend** (backend-node) on port 3001.

The product is called **Robbie** (`docs/mvp-roadmap.md`): the app says Robbie everywhere (the header, the page title, Settings' "About Robbie"), and "Bylawyer" names only the documents side in code. Packages and folders keep their names.

## Monorepo Structure

```
robbie-bylawyer/
├── shared/              # @robbie-bylawyer/shared - Types, reducer, utilities
├── backend-node/        # @robbie-bylawyer/backend-robbie - Unified Express + Socket.io + Prisma (port 3001)
│   ├── src/
│   │   ├── auth/        # Robbie auth (email verification)
│   │   ├── bylawyer/    # Bylawyer routes and services
│   │   │   ├── routes/  # All Bylawyer API routes
│   │   │   └── services/# Amendment service, sync service
│   │   ├── db/          # Database (Prisma + pg pool)
│   │   ├── orgs/        # Organization roles, requireRole, membership
│   │   └── socket/      # Socket.io handlers for real-time
│   └── prisma/          # Prisma schema for Bylawyer data
├── frontend-unified/    # @robbie-bylawyer/frontend-unified - Unified React + Vite (port 5173)
│   └── src/
│       ├── api/         # REST client
│       ├── components/  # Shared UI components and layout
│       ├── context/     # Theme, Toast, Organization contexts
│       └── modules/
│           ├── documents/  # Bylawyer functionality (document management)
│           └── meetings/   # Robbie functionality (real-time meetings)
│               ├── views/      # LiveMeetingsPage, MeetingApp, ChairConsole, PhoneView, DisplayView
│               ├── components/ # console/, phone/, attendance/, chair/, participant/, scheduling/
│               ├── hooks/      # useQuorumStatus, useRoster, usePacket, useSortedSpeakerQueue, useVoteResults
│               └── context/    # SocketContext for real-time
├── mobile/              # @robbie-bylawyer/mobile - React Native + Expo
├── deploy/              # Production: compose.yaml (app, db, backup, caddy), Caddyfile, settings, backup/restore, smoke.sh
└── features/            # Feature specifications for Bylawyer
```

## Commands

### Development

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start backend + unified frontend
npm run dev:backend      # Backend only
npm run dev:frontend     # Unified frontend only
npm run demo             # The Maple Grove HOA demo on http://localhost:3301 with its own Postgres (Docker, port 55433), test sign-in code 000000; -- --reset, --stop, --remove (scripts/demo.sh, docs/demo.md)
```

### Building

```bash
npm run build            # Build all workspaces
npm run build:shared     # Build shared package (required first if changed)
npm run build:backend    # Build backend-node
npm run build:frontend   # Build frontend-unified
```

### Testing

```bash
npm run test             # Run shared, backend-node and frontend-unified tests
npm run test:coverage    # Run tests with coverage report
npm run test:integration -w backend-node  # Integration tests; needs INTEGRATION_DATABASE_URL pointing at a throwaway Postgres, never DATABASE_URL
npm run lint             # ESLint, then the palette check
npm run lint:palette     # The design-token check alone (npm run lint runs it): no raw palette classes, and no emoji in frontend-unified/src or shared's constants, reducer and utils
npm run e2e              # Playwright: builds, starts the API (3101), which serves the web build as production does, on E2E_DATABASE_URL (default: the throwaway Postgres on 55432), reseeds the demo, and runs the smoke tests (with a CSP check), the header tests, screenshots in both palettes, axe (`@axe-core/playwright`, WCAG 2.1 AA) over the main pages in both palettes failing on a serious or critical violation (`e2e/tests/accessibility.spec.ts`), the bylaws import, the meeting scenarios and the whole annual meeting
npm run format:check     # Prettier
```

`npm run e2e` locally: start the throwaway Postgres once (`docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine`) and install Chromium (`npx playwright install chromium`). The harness defaults to port 55432 and never reads `DATABASE_URL`; it migrates that database, clears its live meetings and reseeds the Maple Grove HOA demo on every run. Locally it reuses a server already listening on 3101, so stop a stale one first. Screenshots land in `e2e/test-results/`. The meeting scenario (`e2e/tests/meeting.spec.ts`) schedules a meeting and runs a vote with Dana chairing, Alice and Ben on phones, Pat's display and Sam as a guest, each in a browser context of their own (`personPage` in `e2e/helpers.ts`), all closed in a `finally`. The annual meeting (`e2e/tests/annual-meeting.spec.ts`) runs the demo's own `MAPLE1` and reseeds the demo before and after itself (`resetDemo` in `e2e/demo.ts`).

The web tokens test (`frontend-unified/src/styles/__tests__/tokens.test.ts`) imports `index.css?raw`; that works because `vitest.config.ts` sets `test.css.include` to that one stylesheet (every other CSS import stays an empty module).

### Database

```bash
# In backend-node directory:
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Create/apply migrations in development (prisma migrate dev)
npm run db:deploy        # Apply migrations without prompting (CI, production)
npm run db:studio        # Open Prisma Studio
npm run seed:demo        # Create the Maple Grove HOA demo (-- --reset replaces it); its people sign in with code 000000 when ENABLE_TEST_AUTH=true. It has this year's annual meeting (MAPLE1, at the clubhouse) and last year's (MAPLE25, adjourned, with the minutes Pat published), so MAPLE1 has minutes to approve; Maple Grove keeps America/Chicago time, is set up (142 voting members, a 20% quorum), and has two homeowners added by email who haven't signed in (Harold Becker, Rosa Alvarez) for the chair's roster
npm run report -- --attachment <id> --kind <csam|copyright|other> --note <text>   # handleReport (src/scripts/handleReport.ts; in the image, node dist/scripts/handleReport.js): preserve a reported file in PRESERVE_DIR with a manifest, then remove it (--missing-ok for a file already gone); --record-report <folder> --reported-at <date> --report-id <n> records the CyberTipline report (kept a year from it); --restore <folder> --note <text> puts a copyright removal back (never CSAM); --suspend/--unsuspend <email>; --dry-run for each (docs/deploy.md, "Handling a report")
```

### Docker

```bash
docker compose up -d     # Development: start PostgreSQL (docker-compose.yml)
docker compose down      # Development: stop it
docker build -t robbie:local . && SMOKE_PORT=3201 bash deploy/smoke.sh robbie:local   # The production image: start it from deploy/compose.yaml and check serving, refusals, backup and restore
```

Production is `docs/deploy.md`: one server, `deploy/compose.yaml` run from `deploy/`, images from CI (`ghcr.io/eudaimonstro/robbie:main` and `:sha-<7 hex>`, published from green `main`). The image keeps the monorepo layout, migrates on start (`deploy/app-start.sh`) and runs as `node` with `NODE_ENV=production`; `dotenv` and `prisma` are runtime dependencies of backend-node for that reason.

## Architecture

### Unified Backend (backend-node, port 3001)

The backend serves both Robbie and Bylawyer from a single Express server:

**Robbie Features:**

- Socket.io for real-time meeting state synchronization
- Email-code sign-in for the whole app, with server-side sessions (`session` cookie for web, bearer token for mobile). A suspended user (`User.suspendedAt`, set by `handleReport --suspend`) is refused quietly: a code request answers as usual but sends nothing (it waits about as long as a send, and fails as a send would when sending is failing), verify answers as for a wrong code, and `findSession`/`findSessionById` refuse their sessions (so `authenticate`, the socket handshake and a recovered socket do). Every minute the server closes sockets whose session ended elsewhere (`disconnectSocketsWithoutSession`, `socket/sessionSockets.ts`), since the script runs in its own process
- Organization membership with roles (viewer, member, secretary, admin, owner); acceptance of the current Terms of Service (`TERMS_VERSION` in shared) before using the API or socket
- Meeting storage in PostgreSQL: the `meetings` table (the `LiveMeeting` model; `db/meetingStorage.ts` reads and writes it with SQL). The server doesn't start without `DATABASE_URL`, in development either. A live meeting is created from its packet (its scheduled meeting). A meeting in use is kept in memory (one server process) and written through: at once, except votes, hands and presence (`DEFERRED_WRITES` in `socket/stateManager.ts`), which wait at most 250 ms and go with the next write; shutdown writes them. A read that may follow a change made outside the process (a join, a REST route, a test clearing the table) checks the row's id and version first. Storage and Prisma share one pool (`db/client.ts`, 10 connections, 10-second query timeout). Since the meetings live in one process's memory, the server holds a Postgres advisory lock (`db/serverLock.ts`) for its lifetime: a second server on the same database waits 20 seconds for it, then refuses to start.
- Meeting roles from the organization at every join: the packet's presiding officer is the chair, secretaries and above are admins, members are members, everyone else is a non-voting guest. A guest (signed in, outside the organization, with the code) can join only until the meeting adjourns (`packet.endedAt`); members come back to an adjourned meeting's record
- Attendance as members on a device, members marked present by the chair, a headcount of people without an account (with names for the minutes), and the paper proxies and absentee ballots held (`proxiesHeld`, an optional field of `SET_HEADCOUNT`), all counted toward quorum (`attendanceSummary` in shared); votes as device votes plus the chair's floor tally. People added by email who haven't signed in have no account: the chair's roster lists them ("Added, not yet signed in") and Mark present adds their name to the headcount
- A meeting opens only once its organization has set its voting members and quorum (`isQuorumSet` in shared): the first join is refused with `QUORUM_NOT_SET` until then (`openMeeting`, `socket/joinHandler.ts`); one already open goes on. `Organization.quorumCount` has no default
- Parliamentary procedure state management

**Bylawyer Features:**

- Prisma ORM for document/amendment data
- REST API for document management
- Amendment lifecycle management
- Version control for bylaws

**Database:**

- Single PostgreSQL database (`robbie`) contains both:
  - Robbie: `meetings` (each live meeting's state, by code; the `LiveMeeting` model)
  - Bylawyer and accounts (Prisma): `Organization`, `OrganizationMember`, `OrganizationInvite`, `Document`, `Version`, `Section`, `Amendment`, `MeetingPacket`, `Minutes`, `MinutesRevision`, `AuditEntry`, `User`, `Session`, `SignInCode`, etc.
  - Every table is the migrations' (`backend-node/prisma/migrations`): nothing is created at startup

### Unified Frontend (frontend-unified)

The unified frontend combines both Robbie and Bylawyer into a single React application with:

**Routing Structure:**

- `/` - Home: for secretaries and above, the setup checklist (`SetupChecklist`: voting members and quorum, the bylaws, members, the first meeting; each ticks itself off, gone once all are done), then the next meeting (no Start or Join while the quorum isn't set: `QuorumNotSet`), documents and pending amendments
- `/documents/*` - Document management (Bylawyer)
- `/amendments/*` - Amendment tracking (Bylawyer)
- `/meetings` - Live Meetings: the organization's schedule (Join, and Start for the presiding officer; Change for secretaries and above until the call to order, which reopens the scheduler on that meeting, with Cancel the meeting) and the code box (Robbie)
- `/meetings/:code` - The live meeting with that code, over Socket.io; the link (or its QR code) joins after sign-in. Focus mode: the app's sidebar folds into the drawer, opened from the header's menu button at every width (`components/layout/focusMode.ts`) (Robbie)
- `/meetings/:code/display` - The meeting on a TV or projector: always dark, nothing to click, outside the app's layout; joins as a display, not a member, for the organization's viewers and above (Robbie)
- `/style-guide` - The design language: the tokens and components in both palettes
- `/documents/:id/import` - Import the bylaws from pasted text or a `.txt`, `.md` or `.docx` file into a new version (secretary)
- `/minutes`, `/minutes/:id` - The organization's minutes; the editor for secretaries, read-only for members
- `/documents/:id/print`, `/minutes/:id/print` (signed in) and `/share/:token/print` (public) - Print pages outside the app's chrome; `?print=1` opens the print dialog, which saves a PDF
- `/settings` - App settings: the Time zone card (`TimeZoneCard`) sits beside Attendance; a new organization takes the browser's time zone. `/settings#attendance` and `/settings#members` bring those cards into view. The voting members and quorum are one component (`QuorumFields`, `components/organizations`) in the New organization dialog, the Attendance card and the checklist. Members has Add several people (`BulkAddMembers`: a pasted list read by `readPastedPeople`, a preview of each line)
- `/sign-in` - Sign in by emailed code (public, as are `/share/:shareToken`, `/terms` and `/privacy`)

**State Management:**

- `ThemeContext` - Global dark mode
- `ToastContext` - Global notifications
- `OrganizationContext` - the user's organizations (each with their `role`), the current one, and the user's `role` in it; `useCan(minRole)` hides actions the role can't take (the server still decides; role order in `utils/roles.ts` mirrors `backend-node/src/orgs/roles.ts`). The saved selection belongs to the user who made it; a record page (document, amendment, recorded meeting) selects the record's own organization with `useSelectRecordOrganization`
- `SessionContext` - signed-in user (cookie session) and `termsAccepted`/`acceptTerms()`; `RequireSession` guards every route except `/sign-in`, `/share`, `/terms` and `/privacy`, and shows the terms step until the current terms (`TERMS_VERSION`) are accepted. A 403 `TERMS_NOT_ACCEPTED` from the API or the socket brings the step back, unless the refused request started before the acceptance
- `SocketContext` - Socket.io connection (meetings module only, wraps meeting routes)

### Robbie Meetings Module (modules/meetings)

**State Management Pattern:**

- **SocketContext** (`frontend-unified/src/modules/meetings/context/SocketContext.tsx`) is the single source of truth
- Manages WebSocket connection, meeting state synced across all users
- The **meetingReducer** is intentionally pure (no side effects)
- Generate IDs/timestamps BEFORE dispatch using `idGenerators` module

**Socket.io Events:**

- Client → Server: `JOIN_MEETING` (`{ meetingCode, display? }`; a display receives the state without becoming a member), `LEAVE_MEETING`, `DISPATCH_ACTION`, `REQUEST_STATE`
- Server → Client: `STATE_UPDATE`, `ACTION_REJECTED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `ERROR` (code `MEETING_CANCELED` when the meeting is canceled while open: the client closes the connection for good)
- `STATE_UPDATE`s are coalesced per meeting (`emitState`: at most one per 250 ms, the latest state; the chair's actions and decisions go at once) and slim: the meeting log and the decided motions as what was added since the room's last update (`tails`, from `baseVersion`), and the previous minutes left out while unchanged (`unchanged`). `useSocketConnection` rebuilds the whole state (`hooks/stateUpdates.ts`) and asks for it (`REQUEST_STATE`) when it can't. There is no connection state recovery: a reconnecting socket joins again, which changes nothing for a member still present and answers with the state once. Joins that find no meeting are rate limited; joins of a meeting are not.

**Screens** (`docs/design-brief.md`): `MeetingApp` shows the chair console (`views/ChairConsole.tsx`) to the chair and admins and the phone view (`views/PhoneView.tsx`) to members and guests, by `myRole` from `SocketContext` (the role the server derived and put in the state; never assume one). `/meetings/:code/display` (`display.tsx`, `views/DisplayView.tsx`) joins with `display: true`. The question card, the stamp and the attendance block are shared by all three, fed by `describeQuestion`, `currentResult` and `parseVoteResult` (`utils/question.ts`, `hooks/useVoteResults.ts`) and `attendanceSummary` (shared); the console's toolbar shows only `chairActions(state)`, its first button the chair's real next step (Recognize the first person waiting, Approve as read, Close nominations, Close the ballot, Declare X elected, Resume the meeting, Declare the meeting adjourned), and the phone's one action block follows `phoneMoment(state)`. Phones vote Yes, No or Abstain (the console keeps the book's Yea and Nay); the vote timer is the chair's guide only. The display stamps ELECTED when the chair declares it (`DECLARE_ELECTED`), showing the count and who has the vote required until then. Put a question asks the chair for the question's words (a report needs no vote). A motion to adjourn that carries leaves one thing in order, the chair's Declare the meeting adjourned (`END_MEETING`, which drafts the minutes and records what is unfinished); with nothing pending the chair adjourns without a motion. Counts the chair enters (`SET_HEADCOUNT`, `SET_FLOOR_TALLY`, `SET_FLOOR_BALLOTS`) replace the last entry, so their forms reset with a `key` on the meeting's value. Names come from accounts: there is no Rename in the console (a rejoin restores the account name), only Hand over the chair. The console's join card folds to one line after the call to order. Adjourn is the primary action at the last agenda item, and `END_MEETING` completes the item in progress. The floor tally goes in before the chair's deciding vote, a voice vote can't close without one, and an election's totals stay hidden until the ballot closes.

**Shared Package Exports:**

```typescript
import { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { initialState, meetingReducer } from '@robbie-bylawyer/shared/reducer';
import { motionDefinitions } from '@robbie-bylawyer/shared/constants';
```

### Bylawyer (Document Version Control)

**Data Model:**

- **Organization**: Top-level entity that owns documents
- **Document**: A bylaws document (bylaws, standing rules, policy)
- **Version**: A snapshot of a document at a point in time, numbered per document (unique `documentId`, `versionNumber`; numbered under the document's row lock). Only the current version changes; earlier ones are the record (Key Convention 2)
- **Section**: Hierarchical content within a version (nested via parent_id)
- **Amendment**: Proposed change with lifecycle (draft → proposed → passed/failed, or tabled or withdrawn); it keeps its own decision (`decidedAt`, `robbieVoteData` from a live meeting, `resultingVersionId`)
- **Minutes**: One meeting's minutes (one per packet) as Markdown: draft, published, approved; who saved and published them last, and the meeting that approved them with its corrections
- **MinutesRevision**: Published minutes' text before a change (who changed it, when); the secretary sees them on the minutes page
- **AuditEntry**: Append-only record of a deleted document, version or organization (who, when, and what it held); no foreign key to the organization, so it outlasts it
- **AmendmentChange**: Specific change within an amendment (add/modify/delete/renumber)

**Amendment Workflow:**

1. Create amendment (status: draft)
2. Add changes to the amendment (edits to a draft and its changes are atomic with the draft check)
3. Propose the amendment (status: proposed)
4. Decide it: by a live meeting's vote (the bylaw sync), or by the secretary (`POST /api/amendments/{id}/pass` or `/fail`) for one decided outside the app
5. If passed, apply to create new version

**Import, search and minutes (web):** the import screen parses with `parseBylaws` from shared (the same rules for pasted text, `.txt`, `.md` and the server's text of a `.docx`), lets the secretary rename and merge sections, and saves through `POST /api/documents/:id/versions/import`. The header search calls the organization search and opens `/documents/:id#section-<sectionId>`, where `useSectionFromHash` selects and scrolls to the section. An amendment's Preview tab shows the document as it would read. Minutes are Markdown (`/minutes/:id`), drafted by the server at adjournment, autosaved two seconds after typing stops; the approval at the next meeting is `MinutesApprovalCard` in the chair console while `minutesItemUnderWay(state)` (`modules/meetings/utils/minutesApproval.ts`). The scheduler's Place is the packet's `location`, which heads the minutes.

**API Endpoints (all on port 3001):**

- `GET /api/health` - Health check: 200 when the database answers, 503 otherwise
- `GET/POST /api/organizations` - The user's organizations (each with their `role`) / create one (creator is owner, recorded as `createdById`; takes `timeZone`, an IANA name, default `America/Chicago`, and `eligibleVoters` with `quorumPercent` or `quorumCount`, which the web always sends). A user can create at most 3 (that still exist); organizations someone else made them an owner of don't count. `DELETE /api/organizations/{id}` (owner) closes its live meetings as a canceled one closes, deletes its uploaded files and leaves an `AuditEntry`
- `GET/POST/PUT/DELETE /api/organizations/{id}/members[/{userId}]` - Members by name and role; emails only for admins (and each person their own); add by email with an optional `name` (kept on the `OrganizationInvite`, shown until they sign in, and the start of their name step: `suggestedName` on `POST /api/auth/verify` and `GET /api/auth/me`); the plain-text email names the adder by name and email, quotes the organization's name (one line of at most 60 characters), says what Robbie is and how to sign in; 20 emailed additions a day; change role; remove or leave
- `POST /api/organizations/{id}/members/bulk` - `{ people: [{ email, name? }], role }`, at most 500, one transaction (admin, a heavy write): `{ results: [{ email, status: added|invited|updated|member }] }`. Emails nobody (`OrganizationInvite.emailed` false), so it doesn't count toward the 20 emailed additions a day; 1,000 bulk additions a day
- `DELETE /api/organizations/{id}/invites/{inviteId}` - Cancel a pending addition
- `GET/POST /api/organizations/{id}/documents` - Documents for org
- `GET/POST /api/documents/{id}/versions` - Versions of document / a new current version copied from the current one, in one transaction under the document's lock; the document's draft and proposed amendments follow their sections to the copy (`remapOpenAmendments`, `amendmentService.ts`, as applying an amendment does)
- `PUT /api/versions/{id}`, the section writes (`POST/PUT /api/versions/{id}/sections[/reorder]`, `PUT/DELETE /api/sections/{id}`, `POST /api/sections/{id}/children`) - The current version only: an earlier version is 409 (`currentVersionOnly`, `bylawyer/services/versionRules.ts`)
- `DELETE /api/versions/{id}` - An earlier version (admin): never the current one, nor one an adopted amendment made (409); leaves an `AuditEntry`. `DELETE /api/documents/{id}` (admin) deletes a document with its versions and amendments and leaves an `AuditEntry`
- `POST /api/documents/{id}/import/docx` - A Word document (raw body, at most 5 MB, never stored) as text with `#` heading lines, for the bylaws parser (secretary). 400 for no body or a file mammoth can't read, and 400 `DOCX_TOO_LARGE` for one that would unpack too large (more than 2,000 parts, 50 MB in all, or a `word/document.xml` over 20 MB, by the zip's declared sizes and again while unpacking, capped at them); 413 over 5 MB
- `POST /api/documents/{id}/versions/import` - A new current version from parsed sections (`parseBylaws` in shared; at most 2,000 sections, 6 levels, JSON up to 2 MB), in one transaction (secretary). Open amendments are pointed at the imported sections that match theirs (`matchSections`, `bylawyer/services/sectionMatch.ts`: number label, then title, then position under a matched parent); a change whose section is gone keeps its id and gets its `targetLabel`, and the amendment page and `GET /api/amendments/{id}/preview` (`missing`) say it is no longer in the bylaws
- `GET /api/organizations/{id}/search?q=` - Sections of the current version of each of the organization's documents whose label, title or content contains `q` (2 to 200 characters, any case; `%` and `_` match only themselves), at most 20, with a snippet
- `GET /api/organizations/{id}/minutes`, `GET/PUT /api/minutes/{id}`, `POST /api/minutes/{id}/publish`, `POST /api/minutes/{id}/regenerate`, `GET /api/minutes/{id}/revisions` - Meeting minutes: drafts are a secretary's (404 below), published and approved minutes are every member's. Publishing twice changes nothing; only drafts regenerate (409 otherwise, and 409 when the meeting has no live record); approved minutes don't change (409), nor do published minutes before a meeting that hasn't adjourned (409; `GET`, `PUT` and the other answers with one meeting's minutes say so as `beforeMeeting`, and the editor opens them read-only). The body is Markdown, at most 200,000 characters, and the last save wins. A change to published minutes keeps the text it replaced as a `MinutesRevision`, one per run of saves: only when the latest revision is older than 10 minutes or another editor's, at most 50 (the oldest go). `revisions` lists who and when, the latest first, and `GET /api/minutes/{id}/revisions/{revisionId}` gives one's text (secretary)
- `GET /api/versions/{id}/tree` - Section tree structure
- `GET /api/versions/{id}/diff/{other_id}` - Diff between versions of one document
- `GET/POST /api/documents/{id}/amendments` - Amendments for document
- `GET /api/organizations/{id}/amendments?status=draft,proposed` - The amendments to all of the organization's documents, newest first, with their changes (the statuses a comma list; all when left out); Home and Amendments read it
- `POST /api/amendments/{id}/propose` - Move to proposed status
- `PUT /api/organizations/{id}` - Name, description, time zone (`timeZone`, an IANA name; the minutes give times there), and attendance settings: `eligibleVoters` (a number once set, never unset), and `quorumPercent` or `quorumCount` (admin)
- `GET/POST /api/organizations/{id}/packets` - The schedule (meetings not yet adjourned first) / schedule a meeting (claims a meeting code: `robbieCode`, or a random six-character one when left out, as the scheduler leaves it unless the secretary types one; a taken code is 409 "That meeting code can't be used. Choose another." without saying whose; `chairUserId` defaults to the creator; `location`, at most 500 characters, is the place, also on `PUT /api/packets/{id}`, where `null` clears it, the `description` or the date (`scheduledFor`); a title is required in the scheduler, though the server still accepts a packet without one); `DELETE /api/packets/{id}` (canceling the meeting) also deletes its uploaded files, refuses (409) a meeting already called to order, whose minutes would go with it, and closes one already open (`closeCanceledMeeting`, `socket/meetingLifecycle.ts`): the room is sent `ERROR` with code `MEETING_CANCELED`, its sockets leave it (still signed in), and its live state is deleted, so the screens say "This meeting was canceled." with the way back to Live Meetings
- `POST /api/attachments/upload?packetId=|agendaItemId=` - An uploaded file (raw body: PDF, DOC, DOCX, TXT or RTF, at most 10 MB, read only after the secretary check) on a packet or agenda item (secretary), recording who uploaded it (`uploadedBy`, which no response carries, nor `storagePath`: `HIDDEN_ATTACHMENT_FIELDS`); deleting an agenda item or a packet deletes its files; 413 when the organization's files would pass `ORG_STORAGE_LIMIT_MB` (checked under a per-organization advisory lock)
- `GET /api/packets/{code}/roster` - The meeting's organization's members, for marking people present (emails for admins only), and the pending additions that would vote (`{ id, name, role }`, for secretaries and above and the presiding officer), whom the chair counts in the room by name
- `POST /api/packets/{code}/reload-agenda` - Replace the live agenda with the packet's before the meeting starts (secretary, or the presiding officer)
- `GET/POST/DELETE /api/documents/{id}/share`, `POST .../share/regenerate` - Share link (admin; the only responses that carry the token)
- `POST /api/auth/accept-terms` - Accept the current terms
- `GET /api/bylawyer/meeting/{code}/organization`, `GET /api/bylawyer/organizations/{id}/documents`, `GET /api/bylawyer/documents/{id}/sections` - What the live meeting's bylaw amendment form reads (the only `/api/bylawyer` routes; `/api/robbie` is gone)
- `GET /api/share/{token}[/versions/{versionId}|/search?q=]` - A shared document (public; params and query validated, 400 when malformed)

Meeting codes (packets, the meeting's organization) are trimmed and uppercased, and must match the live meeting code format `^[A-Z0-9]{4,8}$`. Malformed JSON gets 400 and an oversized body 413.

Every `/api` answer has `Cache-Control: no-store`. A POST, PUT, PATCH or DELETE under `/api`, and the Socket.io handshake, that carry an `Origin` get 403 (`middleware/originCheck.ts`) unless it is the request's own host (a page the server served, at whatever address: the demo's phones on the laptop's LAN address, 127.0.0.1), the app's (`APP_URL`'s origin) or an allowed development origin; a sibling subdomain or another port is refused, and without an `Origin` (mobile, curl) they pass. Each user's state-changing requests are limited (`middleware/userLimits.ts`: 600 per 15 minutes; imports, uploads, new versions and new organizations 60 an hour; scheduling meetings 20 an hour; off under `NODE_ENV=test`, as the sign-in limits are), and two Word documents are read at once (a third is 503 before its body is read). A route answers an error by throwing `ApiError` (`middleware/apiError.ts`), which the error handler sends as `{ error, code? }`, the shape the handlers send.

### Integration: Robbie ↔ Bylawyer

A bylaw amendment motion carries its change (`BylawAmendment` in shared): the member moves one of the document's proposed amendments as drafted (`amendmentId`), or writes a change on the phone starting from the section's current text. `prepareBylawMotion` (`socket/bylawMotion.ts`) checks it against the document's current version and fills in the section's label, title and current text and the motion's words (`bylawMotionText`), so the question card on the console, the phones and the display shows exactly what is voted on (`bylawChangeView`), and the minutes quote it. Its words can't be changed with `MODIFY_MOTION`, nor amended in the meeting (withdraw it and move it again).

When it is decided:

1. `bylawSyncService` reads the decided record (which keeps the change) from the state `CLOSE_VOTING` or `UNANIMOUS_CONSENT_PASSED` produced, with the state it was applied to. It acts only on a bylaw amendment carried, failed or adopted by unanimous consent: one postponed, referred, withdrawn or ruled out of order stays proposed
2. A moved proposed amendment is marked passed or failed, its change replaced with the text adopted; otherwise a new Amendment is created, titled with the motion's words. Each change keeps the section's label (`AmendmentChange.targetLabel`), which outlives the section's id
3. If it carried, the amendment is applied as a new document version (an added section goes under its parent)

**Linking Flow:**

1. A meeting belongs to the organization that scheduled it: its packet is the only record of the link (there is no separate linking). The console's More shows the meeting's organization, and a meeting is canceled from Live Meetings.
2. The motion is refused for a document outside the meeting's organization, a section outside the document's current version, or an amendment that isn't proposed (or has more than one change)
3. After the motion is decided, it's synced. A motion whose section is no longer in the current version is recorded passed but not applied, with the reason, for a secretary.

## Environment Variables

### Backend (backend-node)

```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
APP_URL=http://localhost:5173   # links in emails; falls back to CLIENT_ORIGIN, then http://localhost:5173 (production refuses to start without one of the two)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/robbie
UPLOAD_DIR=./uploads            # meeting attachments (/data/uploads in the image)
PRESERVE_DIR=                   # where handleReport preserves reported files; default: "preserved" beside UPLOAD_DIR (/data/preserved in the image). Never served, never backed up, never inside UPLOAD_DIR
ORG_STORAGE_LIMIT_MB=500        # each organization's uploaded files together; an upload past it is 413 "This organization has used its 500 MB of storage for files. Remove some files to add more."
```

The server refuses to start without `DATABASE_URL` in any environment. In production (`NODE_ENV=production`) it also refuses to start without an email provider, `EMAIL_FROM`, or `APP_URL`/`CLIENT_ORIGIN`, or `TRUST_PROXY`, or `SERVER_SECRET` of at least 32 characters (the key of the hashes of sign-in addresses; `openssl rand -hex 32`), or with `ENABLE_TEST_AUTH=true` or an `ORG_STORAGE_LIMIT_MB` that isn't a whole number above 0 (`startupCheck` in `backend-node/src/startupCheck.ts`). `deploy/.env.production.example` documents every variable. `GET /api/health` is 200 only when the database answers `SELECT 1` within 2 seconds, else 503. The per-IP sign-in limits are 300 code requests and 600 verifications per 15 minutes (a room on one Wi-Fi). A code is bound to the browser that asked for it: `POST /api/auth/request-code` answers `{ success, challenge }`, the web keeps the challenge (`SessionContext`, by email) and sends it with "send a new code" and with `POST /api/auth/verify`. Verify checks only the newest live code of that challenge and spends only its 5 attempts, and a new request replaces only the codes of the same challenge, so nobody else can spend a person's guesses or cancel the code they are about to type (`signInService`; only the challenge's SHA-256 is stored, `challengeHash`; the test code needs none). `signInService` limits codes per hour: 5 for an email from one address and 50 for an email from all (filling it takes ten networks; it caps guessing at 250 an hour), and 200 sign-in emails from one address. Addresses are counted by IPv4 address or IPv6 /64 and stored as an HMAC under `SERVER_SECRET` (`requestedFrom`); codes are kept an hour. Emails are logged by domain only (`emailForLog`), and a client's `X-Request-Id` is used only when it is a plain id. The sign-in email's subject leads with the code ("482913 is your Robbie code", `signInCodeEmail`), its page in the brand's paper, ink and gavel. A sign-in from a meeting's link names the meeting ("Sign in to join meeting MAPLE1"), offers Send a new code, and puts a wrong code's message under the field.

No variable sets meeting roles: the chair, admins, members and guests of a live meeting come from the organization at every join (see Key Conventions, Live meetings).

### Frontend Unified

Uses Vite proxy to backend on port 3001 (no env var needed for dev). The REST client always calls same-origin `/api`, so production must serve the API on the app's origin (or behind a reverse proxy).

```
VITE_SERVER_URL=  # Leave unset; only the meeting socket reads it, to connect to a different origin
```

`vite.config.ts` proxies `/api` and `/socket.io` to `API_PROXY_TARGET` (default `http://localhost:3001`) in both `vite` and `vite preview`. In production and in the Playwright harness the API serves the built web app itself (`serveWebApp` in `backend-node/src/webApp.ts`: hashed bundles cached for a year, `index.html` never cached, 404 for a missing file), under Helmet's CSP without `upgrade-insecure-requests` (`middleware/securityHeaders.ts`).

## Key Conventions

1. **Pure Reducer (Robbie):** Never add Date.now(), Math.random(), or side effects to the reducer. Use `idGenerators` before dispatch.

2. **Versions are the record (Bylawyer):** a document's current version is the one that changes (its sections and details, by a secretary); earlier versions stay as they were adopted (409 on any change, `versionRules.ts`, and the web shows them read-only). A new version copies the current sections; an amendment applied makes one. An admin may delete an earlier version that no adopted amendment made, and a document; each deletion (and an organization's) leaves an `AuditEntry` (`bylawyer/services/audit.ts`).

3. **TypeScript:** Actions use discriminated unions. TypeScript ensures exhaustive checking.

4. **React Patterns:** Functional components, React.memo() for performance-critical components, useCallback/useMemo for optimization.

5. **Shared Package Changes:** Run `npm run build:shared` after modifying shared/ for changes to propagate.

6. **UUID Primary Keys (Bylawyer):** For future distribution/sync capabilities.

7. **Single Database:** Both Robbie and Bylawyer share the same PostgreSQL database (`robbie`).

8. **Prisma Client:** Prisma 7 generates the client into `backend-node/src/generated/prisma` (gitignored; `npm run db:generate`). Import from there, e.g. `import { Prisma } from '../generated/prisma/client.js'`, not from `@prisma/client`. CLI connection settings live in `backend-node/prisma.config.ts`. Use migrations, not `db:push`. Every table is in `schema.prisma` (the live `meetings` table as `LiveMeeting`, though it is written with SQL), so the migrations and the schema have no drift; `20261008161647_live_meetings_table` is the one migration written partly by hand (it creates `meetings` if a database the old server ran on lacks it, and drops the four unused tables the startup SQL made).

9. **Root-level pins:** the root `package.json` declares `typescript`, `vite`, `react`, `react-dom` and `@types/node` as devDependencies only so that one copy is installed at the root, where ESLint, CI's `npx tsc`, Vitest and root-installed React and React Native libraries resolve them. React must be the exact version Expo pins for mobile (React Native's renderer requires it), so web, mobile and root move together. Update `@types/react` with Expo's template version, and keep `@types/node` on the runtime's major (Node 24, see `.nvmrc`).

10. **Organizations and roles:** roles, lowest first: viewer (reads everything in the organization, lists members), member (drafts amendments and edits or deletes their own drafts), secretary (edits the current version of documents, decides and applies amendments, manages packets, agenda items and attachments, edits and publishes minutes and sees their revisions), admin (name and description, share links, members' emails, adds, changes and removes members up to admin, deletes documents and earlier versions), owner (manages owners, deletes the organization). An organization keeps at least one owner. Every `/api` route outside `/api/auth`, `/api/share` and `/api/health` runs `requireRole(minRole, resolver)` from `backend-node/src/orgs` (or `signedInOnly()` for the user's own organizations) after `validate(...)`; outsiders get 404, roles too low 403. `src/__integration__/routeCoverage.test.ts` fails on a route without a rule. A handler that takes a second resource checks it against `req.org.id` and answers 404 if it is elsewhere. For development data, `npm run org:add-member -w backend-node -- --org <slug> --email <email> --role <role>`.

11. **Live meetings:** a meeting code is a `MeetingPacket`; `JOIN_MEETING` refuses a code without one and creates the live state from it (`backend-node/src/socket/meetingPacket.ts`). Meeting roles come from `deriveMeetingRole` (`socket/meetingRoles.ts`) at every join, never from memory. A guest can't join once the meeting has adjourned. A join never reuses a stored live state whose `organizationId` isn't the packet's: it is deleted and the meeting starts from the packet (a deleted organization's code carries nothing to its next owner; deleting an organization closes its live meetings too). Every action a client sends is checked first against its zod schema (`ACTION_SCHEMAS` in `socket/actionSchemas.ts`: strict objects, bounded strings and arrays, enums, no prototype keys; Socket.io messages are capped at 100 KB), then goes through `permissionGuard`, `actionEnricher`, `actionValidator` and the reducer, and all five are exhaustive over the action union: a new action needs a schema (`serverOnly` for server-only actions), a case in the reducer and the validator, an entry in `PERMISSIONS` (empty for server-only actions) and an entry in `ACTOR_FIELDS`. Whether a motion is in order is one rule for the screens and the server, `motionOutOfOrder` (`shared/utils/motionRules.ts`; `getValidMotions` offers what it allows): Robbie offers main motions, the agenda's, amend, close debate, postpone, postpone indefinitely, refer, recess, adjourn, a point of order and an appeal (`OFFERED_MOTIONS`, `docs/RONR_IMPLEMENTATION_STATUS.md`), and refuses the rest with `MOTION_NOT_OFFERED` and what to do instead. `TAKE_UP_POSTPONED` brings back a question postponed to later in the meeting, `RESUME_MEETING` ends a recess, and `REQUEST_DIVISION` counts the open voice vote (on devices and in the room) for that vote only (`divisionCalled`, `votingMethodNow` in shared; the meeting's `votingMethod` is unchanged). While a ballot is open only a point of order is in order. Without a quorum, opening a vote, adopting by unanimous consent, adopting the agenda and opening a ballot (except on adjourning or a recess) need `confirmedWithoutQuorum`, which the console asks the chair for; the server refuses them otherwise with `NO_QUORUM`. Rule suspensions are gone: one in a live state saved earlier is ignored. Every state sent to clients goes through `publicState` (`socket/statePublisher.ts`), which strips secret ballot choices. A dropped connection gets `PRESENCE_GRACE_MS` (90 seconds) before its member is marked absent; only device presence (`presentBy: 'device'`) is cleared automatically.

12. **Minutes:** a `Minutes` row per packet holds the minutes as Markdown (draft, published, approved). The server drafts them when `END_MEETING` is applied (`draftMinutesOnAdjournment`, once per packet: a meeting adjourned again keeps the text, and a secretary can regenerate a draft), puts the organization's latest published minutes before a meeting not yet called to order (`SET_PREVIOUS_MINUTES`, server-only, with `previousMinutesId`), and marks them approved, with the approving meeting and any corrections, after `APPROVE_MINUTES` (`backend-node/src/bylawyer/services/meetingMinutes.ts`; all three best effort, like the bylaw sync). The minutes are written from the meeting record, never from log strings (`generateMeetingMinutes` and `formatMinutesAsMarkdown(minutes, context)` in shared, the context giving the organization's time zone, the packet's title, place and times, and the voting members): motions decided or disposed of are `completedMotions` records (with `disposition`, `seconder`, `agendaItemId`, `quorumPresent`, `decidedAt`), rulings are `chairRulings`, elections `electedOfficers` (with `ballots` and `requiredVotes`) and `electionsSetAside`, business pending at the last adjournment `unfinishedAtAdjournment`, questions postponed to later in the meeting `postponedMotions` (unfinished if never taken up; those postponed to the next meeting are listed for its agenda), recesses `recesses`, how the agenda was adopted `agendaAdoption`, plus `attendedIds`, `quorumAtCallToOrder` and `minutesApproval`. The enricher stamps `at` (the server's clock, ISO) on the actions in `CLOCKED_ACTIONS` (ten: `CLOSE_VOTING`, `UNANIMOUS_CONSENT_PASSED`, `DECLINE_SECOND`, `WITHDRAW_MOTION`, `CHAIR_RULING`, `DECLARE_ELECTED`, `SET_ASIDE_ELECTION`, `APPROVE_MINUTES`, `RESUME_MEETING`, `ADOPT_AGENDA`). Motions are named by `plainMotionName` (`shared/constants/motionWords.ts`, the words the meeting screens use). Ballots are counts only, never who voted which way. A new kind of decision needs a record, a clocked action if it is timed, and a line in `formatMinutesAsMarkdown`.

13. **Design brief:** UI follows `docs/design-brief.md` (adopted for Phase B of `docs/mvp-roadmap.md` and everything after); the whole web app is on it.

14. **Design tokens (web):** `docs/design-brief.md` is authoritative for look and feel. Use the tokens from `frontend-unified/src/styles/index.css` (`bg-paper`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-muted`, `border-rule`, `bg-gavel`, `text-carried`, `text-caution-ink` for caution text, and the `-tint`s) and its utilities (`btn-primary`/`btn-secondary`/`btn-ghost`, `card`, `badge-*`, `input`, `label-caps`, `page-title`, `card-title`, `meeting-code`, `animate-reveal`/`-stamp`/`-count-pulse`/`-crossfade`); they flip with `.dark` on any element, so a subtree can be forced into the evening palette. Text links are `text-gavel hover:underline`; native checkboxes and radios use `accent-gavel`. Tailwind's own palette is switched off (`--color-*: initial`) and the old `primary-`, `secondary-`, `accent-`, `success-`, `danger-` and `meeting-` scales are gone: the only colors are the tokens and the fixed numbered shades around them (`gavel-*`, `ink-*`, `carried-*`, `caution-*`, the same in both palettes, for overlays and hovers). Never raw Tailwind palette classes, `white` or `black`, or emoji icons (lucide only): `scripts/check-palette.sh` fails `npm run lint` on them. Its allowlist (`scripts/palette-allowlist.txt`) is empty and only shrinks; never add a file to it. `/style-guide` shows everything.

## Feature Specifications

Features for Bylawyer are stored in `features/` directory:

```
features/
├── manifest.json           # Index of all feature files
├── api_organizations.json  # Organization CRUD
├── api_documents.json      # Document CRUD
├── api_versions.json       # Version management & diffs
├── api_sections.json       # Section hierarchy
├── api_amendments.json     # Amendment workflow
├── api_meetings.json       # Meetings & votes
├── ui_forms.json           # Form components
├── ui_navigation.json      # Navigation/routing
├── styles.json             # Visual styling
└── e2e_workflows.json      # End-to-end tests
```

Each feature has: `category`, `description`, `steps[]`, `passes` (boolean)
