# Robbie-Bylawyer

A combined organizational governance platform featuring real-time parliamentary procedure management and bylaws version control.

## Applications

### Robbie - Parliamentary Procedure

Real-time collaborative application for conducting meetings following Robert's Rules of Order.

- Live meeting management with role-based views (Chair, Participant, Admin)
- Motion tracking with proper parliamentary precedence
- Speaker queue management
- Voting with quorum enforcement
- Mobile app for participants

### Bylawyer - Bylaws Version Control

Document management system for organizational governing documents.

- Version-controlled bylaws, standing rules, and policies
- Amendment workflow with state machine (draft → proposed → passed/failed)
- Section-level diffs between versions
- Meeting and vote record keeping
- Historical document retrieval by date

## Quick Start

```bash
# Install dependencies
npm install

# Start the backend and the unified frontend
npm run dev
```

## Project Structure

```
robbie-bylawyer/
├── shared/              # Shared TypeScript types, meeting reducer and utilities
├── backend-node/        # Unified Express + Socket.io + Prisma backend (port 3001)
├── frontend-unified/    # Unified React frontend for meetings and documents (port 5173)
├── mobile/              # React Native + Expo mobile app (participant)
└── features/            # Feature specifications
```

## Tech Stack

- **Runtime:** Node.js 24 (LTS)
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Express, Socket.io, Prisma, PostgreSQL
- **Mobile:** React Native, Expo
- **Package Manager:** npm with workspaces

## Development

### Prerequisites

- Node.js 24 (see `.nvmrc`)
- npm 11 or higher

### Setup

```bash
# Clone and install
git clone <repository-url>
cd robbie-bylawyer
npm install

# Start PostgreSQL and apply database migrations
docker compose up -d
npm run db:migrate

# Start development servers
npm run dev
```

### Available Scripts

| Command                             | Description                                                |
| ----------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                       | Start the backend and the web app                          |
| `npm run build`                     | Build all packages                                         |
| `npm run test`                      | Run tests                                                  |
| `npm run db:studio`                 | Open Prisma Studio                                         |
| `npm run seed:demo -w backend-node` | Create the Maple Grove HOA demo (`-- --reset` replaces it) |

The demo's people sign in with the code `000000` when the server runs with `ENABLE_TEST_AUTH=true`; the seed prints their emails and roles.

## Environment Variables

Copy `backend-node/.env.example` to `backend-node/.env` and configure:

### backend-node/.env

```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://...
```

## License

Private - All rights reserved
