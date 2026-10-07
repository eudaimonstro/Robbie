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
└── features/            # Feature specifications for Bylawyer
```

## Commands

### Development

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start backend + unified frontend
npm run dev:backend      # Backend only
npm run dev:frontend     # Unified frontend only
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
npm run e2e              # Playwright: builds, starts the API (3101) and the web build (4173) on E2E_DATABASE_URL (default: the throwaway Postgres on 55432), reseeds the demo, and runs the smoke and header tests, screenshots in both palettes and a four-browser meeting scenario
npm run format:check     # Prettier
```

`npm run e2e` locally: start the throwaway Postgres once (`docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine`) and install Chromium (`npx playwright install chromium`). The harness defaults to port 55432 and never reads `DATABASE_URL`; it migrates that database, clears its live meetings and reseeds the Maple Grove HOA demo on every run. Locally it reuses a server already listening on 3101 or 4173, so stop stale ones first. Screenshots land in `e2e/test-results/`. The meeting scenario (`e2e/tests/meeting.spec.ts`) schedules a meeting and runs a vote with Dana chairing, Alice and Ben on phones, Pat's display and Sam as a guest, each in a browser context of their own (`personPage` in `e2e/helpers.ts`), all closed in a `finally`.

The web tokens test (`frontend-unified/src/styles/__tests__/tokens.test.ts`) imports `index.css?raw`; that works because `vitest.config.ts` sets `test.css.include` to that one stylesheet (every other CSS import stays an empty module).

### Database

```bash
# In backend-node directory:
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Create/apply migrations in development (prisma migrate dev)
npm run db:deploy        # Apply migrations without prompting (CI, production)
npm run db:studio        # Open Prisma Studio
npm run seed:demo        # Create the Maple Grove HOA demo (-- --reset replaces it); its people sign in with code 000000 when ENABLE_TEST_AUTH=true. It has this year's annual meeting (MAPLE1, at the clubhouse) and last year's (MAPLE25, adjourned, with the minutes Pat published), so MAPLE1 has minutes to approve; Maple Grove keeps America/Chicago time
```

### Docker

```bash
docker compose up -d     # Start PostgreSQL database
docker compose down      # Stop database
```

## Architecture

### Unified Backend (backend-node, port 3001)

The backend serves both Robbie and Bylawyer from a single Express server:

**Robbie Features:**

- Socket.io for real-time meeting state synchronization
- Email-code sign-in for the whole app, with server-side sessions (`session` cookie for web, bearer token for mobile)
- Organization membership with roles (viewer, member, secretary, admin, owner); acceptance of the current Terms of Service (`TERMS_VERSION` in shared) before using the API or socket
- Meeting storage in PostgreSQL. A live meeting is created from its packet (its scheduled meeting), so meetings need the database; the in-memory storage mode can't run one.
- Meeting roles from the organization at every join: the packet's presiding officer is the chair, secretaries and above are admins, members are members, everyone else is a non-voting guest
- Attendance as members on a device, members marked present by the chair, and a headcount of people without an account (`attendanceSummary` in shared); votes as device votes plus the chair's floor tally
- Parliamentary procedure state management

**Bylawyer Features:**

- Prisma ORM for document/amendment data
- REST API for document management
- Amendment lifecycle management
- Version control for bylaws

**Database:**

- Single PostgreSQL database (`robbie`) contains both:
  - Robbie tables: `users`, `meetings`, `meeting_participants`, `meeting_actions`
  - Bylawyer tables (Prisma): `Organization`, `OrganizationMember`, `OrganizationInvite`, `Document`, `Version`, `Section`, `Amendment`, `MeetingPacket`, `Minutes`, etc.

### Unified Frontend (frontend-unified)

The unified frontend combines both Robbie and Bylawyer into a single React application with:

**Routing Structure:**

- `/` - Dashboard/Home (documents)
- `/documents/*` - Document management (Bylawyer)
- `/amendments/*` - Amendment tracking (Bylawyer)
- `/meetings` - Live Meetings: the organization's schedule (Join, and Start for the presiding officer) and the code box (Robbie)
- `/meetings/:code` - The live meeting with that code, over Socket.io; the link (or its QR code) joins after sign-in. Focus mode: the app's sidebar folds into the drawer, opened from the header's menu button at every width (`components/layout/focusMode.ts`) (Robbie)
- `/meetings/:code/display` - The meeting on a TV or projector: always dark, nothing to click, outside the app's layout; joins as a display, not a member, for the organization's viewers and above (Robbie)
- `/style-guide` - The design language: the tokens and components in both palettes
- `/settings` - App settings
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
- Server → Client: `STATE_UPDATE`, `ACTION_REJECTED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `ERROR`

**Screens** (`docs/design-brief.md`): `MeetingApp` shows the chair console (`views/ChairConsole.tsx`) to the chair and admins and the phone view (`views/PhoneView.tsx`) to members and guests, by `myRole` from `SocketContext` (the role the server derived and put in the state; never assume one). `/meetings/:code/display` (`display.tsx`, `views/DisplayView.tsx`) joins with `display: true`. The question card, the stamp and the attendance block are shared by all three, fed by `describeQuestion`, `currentResult` and `parseVoteResult` (`utils/question.ts`, `hooks/useVoteResults.ts`) and `attendanceSummary` (shared); the console's toolbar shows only `chairActions(state)`, and the phone's one action block follows `phoneMoment(state)`. Counts the chair enters (`SET_HEADCOUNT`, `SET_FLOOR_TALLY`, `SET_FLOOR_BALLOTS`) replace the last entry, so their forms reset with a `key` on the meeting's value. Names come from accounts: there is no Rename in the console (a rejoin restores the account name), only Hand over the chair. The console's join card folds to one line after the call to order. Adjourn is the primary action at the last agenda item, and `END_MEETING` completes the item in progress. The floor tally goes in before the chair's deciding vote, a voice vote can't close without one, and an election's totals stay hidden until the ballot closes.

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
- **Version**: Immutable snapshot of a document at a point in time
- **Section**: Hierarchical content within a version (nested via parent_id)
- **Amendment**: Proposed change with lifecycle (draft → proposed → passed/failed)
- **Minutes**: One meeting's minutes (one per packet) as Markdown: draft, published, approved; who saved and published them last, and the meeting that approved them with its corrections
- **AmendmentChange**: Specific change within an amendment (add/modify/delete/renumber)
- **Meeting**: Records of meetings where votes occur
- **Vote**: Tally of votes on an amendment

**Amendment Workflow:**

1. Create amendment (status: draft)
2. Add changes to the amendment (edits to a draft and its changes are atomic with the draft check)
3. Propose the amendment (status: proposed)
4. Record vote at a meeting
5. If passed, apply to create new version

**API Endpoints (all on port 3001):**

- `GET /api/health` - Health check
- `GET/POST /api/organizations` - The user's organizations (each with their `role`) / create one (creator is owner; takes `timeZone`, an IANA name, default `America/Chicago`)
- `GET/POST/PUT/DELETE /api/organizations/{id}/members[/{userId}]` - Members; add by email; change role; remove or leave
- `DELETE /api/organizations/{id}/invites/{inviteId}` - Cancel a pending addition
- `GET/POST /api/organizations/{id}/documents` - Documents for org
- `GET/POST /api/documents/{id}/versions` - Versions of document
- `POST /api/documents/{id}/import/docx` - A Word document (raw body, at most 5 MB, never stored) as text with `#` heading lines, for the bylaws parser (secretary). 400 for no body or a file mammoth can't read, and 400 `DOCX_TOO_LARGE` for one that would unpack too large (more than 2,000 parts, 50 MB in all, or a `word/document.xml` over 20 MB, by the zip's declared sizes and again while unpacking, capped at them); 413 over 5 MB
- `POST /api/documents/{id}/versions/import` - A new current version from parsed sections (`parseBylaws` in shared; at most 2,000 sections, 6 levels, JSON up to 2 MB), in one transaction (secretary)
- `GET /api/organizations/{id}/search?q=` - Sections of the current version of each of the organization's documents whose label, title or content contains `q` (2 to 200 characters, any case; `%` and `_` match only themselves), at most 20, with a snippet
- `GET /api/organizations/{id}/minutes`, `GET/PUT /api/minutes/{id}`, `POST /api/minutes/{id}/publish`, `POST /api/minutes/{id}/regenerate` - Meeting minutes: drafts are a secretary's (404 below), published and approved minutes are every member's. Publishing twice changes nothing; only drafts regenerate (409 otherwise, and 409 when the meeting has no live record); approved minutes don't change (409). The body is Markdown, at most 200,000 characters, and the last save wins
- `GET /api/versions/{id}/tree` - Section tree structure
- `GET /api/versions/{id}/diff/{other_id}` - Diff between versions of one document
- `GET/POST /api/documents/{id}/amendments` - Amendments for document
- `POST /api/amendments/{id}/propose` - Move to proposed status
- `POST /api/meetings/{id}/votes` - Record a vote
- `PUT /api/organizations/{id}` - Name, description, time zone (`timeZone`, an IANA name; the minutes give times there), and attendance settings: `eligibleVoters`, and `quorumPercent` or `quorumCount` (admin)
- `GET/POST /api/organizations/{id}/packets` - The schedule (meetings not yet adjourned first) / schedule a meeting (claims a meeting code; `chairUserId` defaults to the creator; `location`, at most 500 characters, is the place, also on `PUT /api/packets/{id}`, where `null` clears it); `DELETE /api/packets/{id}` also deletes its uploaded files
- `GET /api/packets/{code}/roster` - The meeting's organization's members, for marking people present (emails and pending additions for admins only)
- `POST /api/packets/{code}/reload-agenda` - Replace the live agenda with the packet's before the meeting starts (secretary, or the presiding officer)
- `GET/POST/DELETE /api/documents/{id}/share`, `POST .../share/regenerate` - Share link (admin; the only responses that carry the token)
- `POST /api/auth/accept-terms` - Accept the current terms
- `GET /api/robbie/sync-status/:meetingCode/:motionId` - Check sync status

Meeting codes (packets, link-meeting, sync-status) are trimmed and uppercased, and must match the live meeting code format `^[A-Z0-9]{4,8}$`. Malformed JSON gets 400 and an oversized body 413.

### Integration: Robbie ↔ Bylawyer

When a bylaw amendment motion passes in Robbie:

1. `bylawSyncService` detects the decision: `CLOSE_VOTING`, or `UNANIMOUS_CONSENT_PASSED` (a bylaw amendment adopted by unanimous consent is applied too, its vote data recording the method)
2. Creates an Amendment in Bylawyer with status 'passed'
3. Automatically applies the amendment to create a new document version

**Linking Flow:**

1. Link a Robbie meeting to a Bylawyer organization via `POST /api/bylawyer/link-meeting` (secretary). This gives the meeting code a packet in the organization (or uses the one it has there; 409 if the code is another organization's), the only record of the link.
2. When creating a bylawAmendment motion in Robbie, select the document and section
3. After the motion passes, it's automatically synced to Bylawyer. The sync skips a document outside the meeting's organization and a target section outside the document's current version.

## Environment Variables

### Backend (backend-node)

```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
APP_URL=http://localhost:5173   # links in emails; falls back to CLIENT_ORIGIN, then http://localhost:5173 (production refuses to start without one of the two)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/robbie
```

No variable sets meeting roles: the chair, admins, members and guests of a live meeting come from the organization at every join (see Key Conventions, Live meetings).

### Frontend Unified

Uses Vite proxy to backend on port 3001 (no env var needed for dev). The REST client always calls same-origin `/api`, so production must serve the API on the app's origin (or behind a reverse proxy).

```
VITE_SERVER_URL=  # Leave unset; only the meeting socket reads it, to connect to a different origin
```

`vite.config.ts` proxies `/api` and `/socket.io` to `API_PROXY_TARGET` (default `http://localhost:3001`) in both `vite` and `vite preview`; the Playwright harness points it at its own API.

## Key Conventions

1. **Pure Reducer (Robbie):** Never add Date.now(), Math.random(), or side effects to the reducer. Use `idGenerators` before dispatch.

2. **Immutable Versions (Bylawyer):** Each change creates a new version, preserving history. Sections are duplicated per-version.

3. **TypeScript:** Actions use discriminated unions. TypeScript ensures exhaustive checking.

4. **React Patterns:** Functional components, React.memo() for performance-critical components, useCallback/useMemo for optimization.

5. **Shared Package Changes:** Run `npm run build:shared` after modifying shared/ for changes to propagate.

6. **UUID Primary Keys (Bylawyer):** For future distribution/sync capabilities.

7. **Single Database:** Both Robbie and Bylawyer share the same PostgreSQL database (`robbie`).

8. **Prisma Client:** Prisma 7 generates the client into `backend-node/src/generated/prisma` (gitignored; `npm run db:generate`). Import from there, e.g. `import { Prisma } from '../generated/prisma/client.js'`, not from `@prisma/client`. CLI connection settings live in `backend-node/prisma.config.ts`. Use migrations, not `db:push`.

9. **Root-level pins:** the root `package.json` declares `typescript`, `vite`, `react`, `react-dom` and `@types/node` as devDependencies only so that one copy is installed at the root, where ESLint, CI's `npx tsc`, Vitest and root-installed React and React Native libraries resolve them. React must be the exact version Expo pins for mobile (React Native's renderer requires it), so web, mobile and root move together. Update `@types/react` with Expo's template version, and keep `@types/node` on the runtime's major (Node 24, see `.nvmrc`).

10. **Organizations and roles:** roles, lowest first: viewer (reads everything in the organization, lists members), member (drafts amendments and edits or deletes their own drafts), secretary (edits documents, decides and applies amendments, records meetings and votes, manages packets, agenda items and attachments, links live meetings), admin (name and description, share links, adds, changes and removes members up to admin), owner (manages owners, deletes the organization). An organization keeps at least one owner. Every `/api` route outside `/api/auth`, `/api/share` and `/api/health` runs `requireRole(minRole, resolver)` from `backend-node/src/orgs` (or `signedInOnly()` for the user's own organizations) after `validate(...)`; outsiders get 404, roles too low 403. `src/__integration__/routeCoverage.test.ts` fails on a route without a rule. A handler that takes a second resource checks it against `req.org.id` and answers 404 if it is elsewhere. For development data, `npm run org:add-member -w backend-node -- --org <slug> --email <email> --role <role>`.

11. **Live meetings:** a meeting code is a `MeetingPacket`; `JOIN_MEETING` refuses a code without one and creates the live state from it (`backend-node/src/socket/meetingPacket.ts`). Meeting roles come from `deriveMeetingRole` (`socket/meetingRoles.ts`) at every join, never from memory. Every action goes through the reducer, `actionValidator`, `permissionGuard` and `actionEnricher`, and all four are exhaustive over the action union: a new action needs a case in the reducer and the validator, an entry in `PERMISSIONS` (empty for server-only actions) and an entry in `ACTOR_FIELDS`. Every state sent to clients goes through `publicState` (`socket/statePublisher.ts`), which strips secret ballot choices. A dropped connection gets `PRESENCE_GRACE_MS` (90 seconds) before its member is marked absent; only device presence (`presentBy: 'device'`) is cleared automatically.

12. **Minutes:** a `Minutes` row per packet holds the minutes as Markdown (draft, published, approved). The server drafts them when `END_MEETING` is applied (`draftMinutesOnAdjournment`, once per packet: a meeting adjourned again keeps the text, and a secretary can regenerate a draft), puts the organization's latest published minutes before a meeting not yet called to order (`SET_PREVIOUS_MINUTES`, server-only, with `previousMinutesId`), and marks them approved, with the approving meeting and any corrections, after `APPROVE_MINUTES` (`backend-node/src/bylawyer/services/meetingMinutes.ts`; all three best effort, like the bylaw sync). The minutes are written from the meeting record, never from log strings (`generateMeetingMinutes` and `formatMinutesAsMarkdown(minutes, context)` in shared, the context giving the organization's time zone, the packet's title, place and times, and the voting members): motions decided or disposed of are `completedMotions` records (with `disposition`, `seconder`, `agendaItemId`, `quorumPresent`, `decidedAt`), rulings are `chairRulings`, elections `electedOfficers` (with `ballots` and `requiredVotes`) and `electionsSetAside`, business pending at the last adjournment `unfinishedAtAdjournment`, plus `attendedIds`, `quorumAtCallToOrder` and `minutesApproval`. The enricher stamps `at` (the server's clock, ISO) on the actions in `CLOCKED_ACTIONS` (eight: `CLOSE_VOTING`, `UNANIMOUS_CONSENT_PASSED`, `DECLINE_SECOND`, `WITHDRAW_MOTION`, `CHAIR_RULING`, `DECLARE_ELECTED`, `SET_ASIDE_ELECTION`, `APPROVE_MINUTES`). Motions are named by `plainMotionName` (`shared/constants/motionWords.ts`, the words the meeting screens use). Ballots are counts only, never who voted which way. A new kind of decision needs a record, a clocked action if it is timed, and a line in `formatMinutesAsMarkdown`.

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
