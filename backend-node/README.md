# Robbie Backend

Express + Socket.io server for real-time parliamentary procedure meetings.

## Quick Start

```bash
# From project root
npm install
npm run dev:backend    # Start on port 3001
```

## Architecture

```
backend/src/
├── index.ts              # Express server setup, Socket.io init
├── auth/
│   ├── authController.ts # JWT auth, email verification
│   └── emailService.ts   # Email sending (SendGrid)
├── db/
│   └── meetingStorage.ts # live meetings in PostgreSQL
├── socket/
│   ├── socketHandler.ts  # Main Socket.io orchestrator
│   ├── joinHandler.ts    # JOIN_MEETING event
│   ├── actionHandler.ts  # DISPATCH_ACTION event
│   ├── disconnectHandler.ts
│   ├── stateRequestHandler.ts
│   ├── stateManager.ts   # State persistence
│   ├── permissionGuard.ts # Role-based access control
│   ├── rateLimiter.ts    # Token bucket rate limiting
│   ├── actionValidator.ts # Pre-dispatch validation
│   ├── actionEnricher.ts # Server-side action enrichment
│   ├── roleChangeHandler.ts
│   └── roomManager.ts    # Socket room management
└── meeting/
    └── meetingController.ts # REST endpoints
```

## Environment Variables

| Variable        | Required                            | Default         | Description                                                                                                  |
| --------------- | ----------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `PORT`          | No                                  | 3001            | Server port                                                                                                  |
| `CLIENT_ORIGIN` | When the web app is cross-origin    | -               | Frontend URL for CORS. In production without it, only the server's own origin is allowed                     |
| `APP_URL`       | In production without CLIENT_ORIGIN | `CLIENT_ORIGIN` | The web app's address, for links in emails. Production refuses to start without `APP_URL` or `CLIENT_ORIGIN` |
| `DATABASE_URL`  | No                                  | -               | PostgreSQL connection string                                                                                 |

## API Endpoints

### Health Check

```
GET /api/health
Response: { status: 'ok', timestamp: string }
```

### Authentication

#### Request Verification Code

```
POST /api/auth/request-verification
Body: { email: string, name: string, meetingCode: string }
Response: { success: boolean, message?: string }
```

#### Verify Code

```
POST /api/auth/verify
Body: { email: string, code: string, meetingCode: string }
Response: { success: boolean, token?: string, user?: { id, email, name } }
```

#### Development Only - Get Code

```
GET /api/auth/dev-code
Response: { code: string } (only in development mode)
```

## Socket.io Events

### Client → Server Events

#### JOIN_MEETING

Join a meeting room after authentication.

```typescript
socket.emit('JOIN_MEETING', {
  meetingCode: string,
  token: string  // JWT from verification
}, (response: {
  success: boolean,
  state?: MeetingState,
  stateVersion?: number,
  members?: Member[],
  error?: string
}) => void);
```

#### LEAVE_MEETING

Leave the current meeting.

```typescript
socket.emit('LEAVE_MEETING');
```

#### DISPATCH_ACTION

Dispatch a meeting action (motion, vote, etc).

```typescript
socket.emit('DISPATCH_ACTION', {
  action: MeetingAction,
  clientSequence: number  // For optimistic update tracking
}, (response: {
  success: boolean,
  stateVersion?: number,
  error?: string,
  errorCode?: ActionErrorCode
}) => void);
```

#### REQUEST_STATE

Request current meeting state (for reconnection).

```typescript
socket.emit('REQUEST_STATE', (response: {
  success: boolean,
  state?: MeetingState,
  stateVersion?: number,
  error?: string
}) => void);
```

### Server → Client Events

#### STATE_UPDATE

Broadcast when meeting state changes.

```typescript
socket.on('STATE_UPDATE', (data: {
  state: MeetingState,
  stateVersion: number,
  triggeredBy?: { actionType: string, userId: number }
}) => void);
```

#### ACTION_REJECTED

Sent when a dispatched action is rejected.

```typescript
socket.on('ACTION_REJECTED', (data: {
  clientSequence: number,
  reason: string,
  errorCode: ActionErrorCode
}) => void);
```

#### MEMBER_JOINED / MEMBER_LEFT

```typescript
socket.on('MEMBER_JOINED', (data: {
  member: Member,
  timestamp: string
}) => void);

socket.on('MEMBER_LEFT', (data: {
  member: Member,
  timestamp: string
}) => void);
```

#### ERROR

General error notification.

```typescript
socket.on('ERROR', (data: {
  message: string,
  code: string
}) => void);
```

## Permission Model

Actions are restricted by role:

| Role   | Permissions                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chair  | All actions                                                                                                                                                                  |
| member | RAISE_HAND, LOWER_HAND, CAST_VOTE, CAST_BALLOT, MAKE_MOTION, SECOND_MOTION, WITHDRAW_MOTION, OBJECT_TO_CONSENT, NOMINATE, DECLINE_NOMINATION, ASK_INQUIRY, RESPOND_ROLL_CALL |

See [permissionGuard.ts](src/socket/permissionGuard.ts) for full permission matrix.

## Rate Limiting

- **Actions:** 30 tokens, refill 2/sec (burst of 30, sustained 2/sec)
- **Joins:** 5 tokens, refill 0.1/sec (5 attempts, then 10 sec cooldown)

## Error Codes

Common error codes returned by `DISPATCH_ACTION`:

| Code                | Description                         |
| ------------------- | ----------------------------------- |
| `PERMISSION_DENIED` | Role cannot perform action          |
| `NOT_AUTHENTICATED` | No valid session                    |
| `RATE_LIMITED`      | Too many requests                   |
| `MEETING_NOT_FOUND` | Invalid meeting code                |
| `INVALID_ACTION`    | Action failed validation            |
| `VOTING_CLOSED`     | Cannot vote when voting is not open |
| `ALREADY_VOTED`     | Duplicate vote attempt              |

See [socket.ts](../shared/types/socket.ts) for full error code list.

## Database

The backend supports two storage modes:

1. **In-memory** (default): No DATABASE_URL, data lost on restart
2. **PostgreSQL**: Set DATABASE_URL, data persisted

Schema is auto-created on first connection.

## Testing

```bash
npm run test -w backend      # Run tests
npm run test:run -w backend  # Run once
npm run test:coverage -w backend
```

Current test coverage:

- permissionGuard.ts: 168 tests
- rateLimiter.ts: 20 tests

## Development

```bash
npm run dev:backend  # tsx watch mode with hot reload
```

The server binds to `0.0.0.0:3001` for container compatibility.
