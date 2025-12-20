# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Robbie is a real-time collaborative parliamentary procedure application following Robert's Rules of Order. It's a monorepo using NPM workspaces with three packages:

- **frontend/** - React 18 + TypeScript + Vite (port 5173)
- **backend/** - Express + Socket.io + PostgreSQL (port 3001)
- **shared/** - Published npm package (@eudaimonstro/robbie-shared)

## Commands

### Development
```bash
npm install              # Install all workspace dependencies
npm run dev              # Start both frontend and backend
npm run dev:frontend     # Start frontend only (Vite at localhost:5173)
npm run dev:backend      # Start backend only (Express at localhost:3001)
```

### Building
```bash
npm run build            # Build all workspaces
npm run build:shared     # Build shared package (required before others if changed)
npm run build:frontend   # Build frontend only
npm run build:backend    # Build backend only
```

### Testing (Frontend)
```bash
npm run test:frontend    # Run all tests in watch mode
npm run test -w frontend -- --run  # Run tests once
npm run test:coverage -w frontend  # Generate coverage report
```

### Running Single Test
```bash
npm run test -w frontend -- --run src/__tests__/reducer/meetingReducer.test.ts
```

## Architecture

### State Management Pattern

The **SocketContext** (`frontend/src/context/SocketContext.tsx`) is the single source of truth:
- Manages WebSocket connection to backend
- Holds meeting state synced across all connected users
- Provides `useSocket()` hook for components
- Handles authentication (email verification with 6-digit codes)

The **meetingReducer** is intentionally pure (no side effects):
- Located in `shared/src/reducer/meetingReducer.ts`
- 40+ action types as discriminated union
- Generate IDs/timestamps BEFORE dispatch using `idGenerators` module

### Frontend Structure
```
frontend/src/
├── components/     # 13 reusable UI components (some memoized)
├── context/        # SocketContext (state + WebSocket)
├── hooks/          # useQuorumStatus, useSortedSpeakerQueue, useVoteResults
├── views/          # AdminView, AuthScreen, ChairView, ParticipantView
├── utils/          # Helper functions (chairScript, motions, voting)
└── __tests__/      # Vitest tests (167 tests, 94% coverage)
```

### Backend Structure
```
backend/src/
├── index.ts        # Express + Socket.io server setup
├── auth/           # JWT + email verification
├── socket/         # Event handlers, permission guard, room management
└── db/             # PostgreSQL client + in-memory storage
```

### Socket.io Events

**Client → Server:** `JOIN_MEETING`, `LEAVE_MEETING`, `DISPATCH_ACTION`, `REQUEST_STATE`

**Server → Client:** `STATE_UPDATE`, `ACTION_REJECTED`, `MEMBER_JOINED`, `MEMBER_LEFT`, `ERROR`

### Shared Package Exports
```typescript
import { MeetingState, Member } from '@eudaimonstro/robbie-shared/types'
import { initialState, meetingReducer } from '@eudaimonstro/robbie-shared/reducer'
import { motionDefinitions } from '@eudaimonstro/robbie-shared/constants'
```

## Environment Variables

### Frontend
```
VITE_SERVER_URL=http://localhost:3001
```

### Backend
```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=dev-secret-change-in-prod
DATABASE_URL=postgresql://...  # Optional, falls back to in-memory
```

## Deployment

Uses Railway.app with two services:
- **Frontend:** RAILPACK builder, auto-serves Vite dist/
- **Backend:** RAILPACK builder, health check at `/api/health`

## Key Conventions

1. **Pure Reducer:** Never add Date.now(), Math.random(), or side effects to the reducer. Use `idGenerators` before dispatch.

2. **TypeScript:** Actions use discriminated unions in `MeetingAction`. TypeScript ensures exhaustive checking.

3. **React Patterns:** Functional components, React.memo() for performance-critical components, useCallback/useMemo for optimization.

4. **Shared Package Changes:** Run `npm run build:shared` after modifying shared/ for changes to propagate.

5. **Testing:** Run `npm run test:frontend` before committing. Tests use Vitest with jsdom.
