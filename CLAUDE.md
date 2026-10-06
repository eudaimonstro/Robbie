# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Robbie-Bylawyer is a combined monorepo containing two related applications for organizational governance:

1. **Robbie** - Real-time collaborative parliamentary procedure application following Robert's Rules of Order
2. **Bylawyer** - Organizational bylaws version control system for managing, versioning, and amending governing documents

Both applications now run from a **single unified backend** (backend-node) on port 3001.

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
│               ├── views/      # AuthScreen, MeetingApp, ChairView, ParticipantView
│               ├── components/ # chair/, participant/, mobile/, scheduling/
│               ├── hooks/      # useQuorumStatus, useSortedSpeakerQueue, useVoteResults
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
npm run lint             # ESLint
npm run format:check     # Prettier
```

### Database

```bash
# In backend-node directory:
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Create/apply migrations in development (prisma migrate dev)
npm run db:deploy        # Apply migrations without prompting (CI, production)
npm run db:studio        # Open Prisma Studio
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
- Meeting storage (PostgreSQL or in-memory fallback)
- Parliamentary procedure state management

**Bylawyer Features:**

- Prisma ORM for document/amendment data
- REST API for document management
- Amendment lifecycle management
- Version control for bylaws

**Database:**

- Single PostgreSQL database (`robbie`) contains both:
  - Robbie tables: `users`, `meetings`, `meeting_participants`, `meeting_actions`
  - Bylawyer tables (Prisma): `Organization`, `OrganizationMember`, `OrganizationInvite`, `Document`, `Version`, `Section`, `Amendment`, `MeetingPacket`, etc.

### Unified Frontend (frontend-unified)

The unified frontend combines both Robbie and Bylawyer into a single React application with:

**Routing Structure:**

- `/` - Dashboard/Home (documents)
- `/documents/*` - Document management (Bylawyer)
- `/amendments/*` - Amendment tracking (Bylawyer)
- `/meetings` - Join/create live meeting (Robbie)
- `/meetings/:code` - Active meeting with Socket.io (Robbie)
- `/settings` - App settings
- `/sign-in` - Sign in by emailed code (public, as is `/share/:shareToken`)

**State Management:**

- `ThemeContext` - Global dark mode
- `ToastContext` - Global notifications
- `OrganizationContext` - Current organization
- `SessionContext` - signed-in user (cookie session); `RequireSession` guards every route except `/sign-in` and `/share`
- `SocketContext` - Socket.io connection (meetings module only, wraps meeting routes)

### Robbie Meetings Module (modules/meetings)

**State Management Pattern:**

- **SocketContext** (`frontend-unified/src/modules/meetings/context/SocketContext.tsx`) is the single source of truth
- Manages WebSocket connection, meeting state synced across all users
- The **meetingReducer** is intentionally pure (no side effects)
- Generate IDs/timestamps BEFORE dispatch using `idGenerators` module

**Socket.io Events:**

- Client → Server: `JOIN_MEETING`, `LEAVE_MEETING`, `DISPATCH_ACTION`, `REQUEST_STATE`
- Server → Client: `STATE_UPDATE`, `ACTION_REJECTED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `ERROR`

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
- `POST /api/organizations/{id}/packets` - Create a meeting packet (claims a meeting code); `DELETE /api/packets/{id}` also deletes its uploaded files
- `GET/POST/DELETE /api/documents/{id}/share`, `POST .../share/regenerate` - Share link (admin; the only responses that carry the token)
- `POST /api/auth/accept-terms` - Accept the current terms
- `GET /api/robbie/sync-status/:meetingCode/:motionId` - Check sync status

Meeting codes (packets, link-meeting, sync-status) are trimmed and uppercased, and must match the live meeting code format `^[A-Z0-9]{4,8}$`. Malformed JSON gets 400 and an oversized body 413.

### Integration: Robbie ↔ Bylawyer

When a bylaw amendment motion passes in Robbie:

1. `bylawSyncService` detects the CLOSE_VOTING action
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
APP_URL=http://localhost:5173   # links in emails; falls back to CLIENT_ORIGIN, then http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/robbie
```

### Frontend Unified

Uses Vite proxy to backend on port 3001 (no env var needed for dev). The REST client always calls same-origin `/api`, so production must serve the API on the app's origin (or behind a reverse proxy).

```
VITE_SERVER_URL=  # Leave unset; only the meeting socket reads it, to connect to a different origin
```

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
