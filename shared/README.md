# @robbie/shared

Shared TypeScript types, constants, reducer, and utilities for the Robbie parliamentary procedure application.

## Installation

This is a local workspace package. It's automatically linked via npm workspaces.

```json
// In package.json
"dependencies": {
  "@robbie/shared": "file:../shared"
}
```

## Exports

### Types
```typescript
import type {
  MeetingState,
  MeetingAction,
  Member,
  Motion,
  AgendaItem,
  Vote,
  MeetingLogEntry,
  // ... and more
} from '@robbie/shared/types';
```

### Socket Types
```typescript
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  JoinMeetingPayload,
  ActionResponse,
  // ... and more
} from '@robbie/shared/types/socket';
```

### Reducer
```typescript
import {
  meetingReducer,
  initialState
} from '@robbie/shared/reducer';
```

### Constants
```typescript
import {
  motionDefinitions,
  MOTION_CATEGORIES,
  MEETING_STAGES,
  SUSPENDABLE_RULES
} from '@robbie/shared/constants';
```

### Utilities
```typescript
import {
  generateId,
  generateTimestamp,
  calculateVoteResult,
  getMotionDefinition,
  canMakeMotion,
  determineMotionOutcome,
  // ... and more
} from '@robbie/shared/utils';
```

## Package Structure

```
shared/
├── types/
│   ├── index.ts      # Core types (MeetingState, Member, Motion, etc.)
│   └── socket.ts     # Socket.io event types
├── reducer/
│   ├── index.ts      # Export barrel
│   ├── initialState.ts
│   ├── meetingReducer.ts
│   └── handlers/     # Domain-specific action handlers
│       ├── agendaHandlers.ts
│       ├── committeeHandlers.ts
│       ├── consentHandlers.ts
│       ├── electionHandlers.ts
│       ├── inquiryHandlers.ts
│       ├── meetingLifecycleHandlers.ts
│       ├── memberHandlers.ts
│       ├── motionHandlers.ts
│       ├── rollCallHandlers.ts
│       ├── ruleSuspensionHandlers.ts
│       ├── settingsHandlers.ts
│       ├── speakerHandlers.ts
│       └── votingHandlers.ts
├── constants/
│   ├── index.ts      # Motion definitions, categories
│   ├── logMessages.ts
│   ├── meetingStages.ts
│   └── motions.ts
└── utils/
    ├── index.ts      # Export barrel
    ├── idGenerators.ts
    ├── minutesGenerator.ts
    ├── motionHelpers.ts
    ├── motionHistoryHelper.ts
    ├── motionOutcomeHelper.ts
    ├── ruleSuspensionHelper.ts
    ├── speakerQueueHelper.ts
    └── voteCalculator.ts
```

## Key Types

### MeetingState
The complete state of a meeting:

```typescript
interface MeetingState {
  meetingCode: string;
  meetingActive: boolean;
  currentStage: MeetingStage;
  members: Member[];
  motionStack: Motion[];
  speakerQueue: SpeakerQueueEntry[];
  votingOpen: boolean;
  votes: Vote[];
  agenda: AgendaItem[];
  quorum: number;
  // ... and more
}
```

### MeetingAction
Discriminated union of 40+ action types:

```typescript
type MeetingAction =
  | { type: 'START_MEETING'; meetingCode: string; timestamp: string }
  | { type: 'MAKE_MOTION'; motion: Motion; timestamp: string }
  | { type: 'CAST_VOTE'; memberId: number; vote: VoteValue; timestamp: string }
  // ... etc
```

### Member
```typescript
interface Member {
  id: number;
  name: string;
  role: 'chair' | 'member' | 'admin';
  present: boolean;
}
```

### Motion
```typescript
interface Motion {
  id: number;
  type: MotionType;
  text: string;
  mover: number;
  seconder?: number;
  status: MotionStatus;
  timestamp: string;
}
```

## Building

```bash
npm run build:shared  # Compile TypeScript
```

**Important:** Run `npm run build:shared` after modifying shared/ for changes to propagate to frontend and backend.

## Key Conventions

1. **Pure Reducer:** The meetingReducer is pure - no Date.now(), Math.random(), or side effects
2. **Generate Before Dispatch:** Use `generateId()` and `generateTimestamp()` before dispatching actions
3. **Type-safe Actions:** TypeScript ensures exhaustive action handling via discriminated unions
