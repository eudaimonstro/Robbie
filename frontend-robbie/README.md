# Robbie

A real-time collaborative parliamentary procedure application following Robert's Rules of Order.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/eudaimonstro/Robbie)

## Features

- **Complete Motion Engine**: All 43 motion types with proper precedence, debatability, and voting requirements
- **Real-Time Collaboration**: Multiple users join the same meeting and see updates instantly via WebSocket
- **Role-Based Access**: Chair, Admin, and Member roles with appropriate permissions
- **Email Verification Auth**: Secure login with 6-digit verification codes
- **Three Views**: Member, Chair, and Admin interfaces with context-sensitive controls

### Parliamentary Features

- Motions with proper precedence and voting thresholds
- Unanimous consent procedures
- Speaker queue with alternating for/against
- Elections and nominations
- Committee reports
- Rule suspension system
- Agenda management with drag-and-drop reordering

## Architecture

```
/server          - Express + Socket.io backend (port 3001)
/shared          - Shared types, reducer, constants
/src             - React + TypeScript + Vite frontend
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Development

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/eudaimonstro/Robbie.git
   cd Robbie
   npm install
   cd server && npm install && cd ..
   ```

2. **Start the server:**
   ```bash
   cd server
   npm run dev
   ```

3. **Start the client (in a new terminal):**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:5173** and join a meeting!

### Testing Multi-User

1. Open two browser tabs
2. Enter the same meeting code in both
3. Use different emails for each user
4. The first user becomes Chair, subsequent users are Members
5. Actions sync in real-time between all users

## Deployment

### Deploy to Railway

Railway is recommended for this app because it supports WebSockets natively.

#### Option 1: One-Click Deploy (Recommended)

Click the button above, or:

1. Go to [Railway](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select this repository

#### Option 2: Manual Setup

**Backend Service:**
1. Add a service from GitHub repo
2. Set Root Directory: `server`
3. Add environment variables:
   - `CLIENT_ORIGIN`: Your frontend URL
   - `JWT_SECRET`: A secure random string

**Frontend Service:**
1. Add another service from same repo
2. Root Directory: (leave empty)
3. Add environment variable:
   - `VITE_SERVER_URL`: Your backend URL

## Environment Variables

### Server (`/server`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `CLIENT_ORIGIN` | Frontend URL for CORS | `http://localhost:5173` |
| `JWT_SECRET` | Secret for JWT signing | `dev-secret-change-in-production` |

### Client

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SERVER_URL` | Backend server URL | `http://localhost:3001` |

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Express, Socket.io, JWT
- **State**: Custom reducer with real-time sync
- **Testing**: Vitest (167 tests, 94% coverage)

## Running Tests

```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage report
```

## License

MIT
