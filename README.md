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

# Start all services
npm run dev

# Or start individual apps
npm run dev:robbie      # Parliamentary procedure app
npm run dev:bylawyer    # Bylaws management app
```

## Project Structure

```
robbie-bylawyer/
├── shared/              # Shared TypeScript types and utilities
├── backend-node/        # Robbie Express + Socket.io backend (port 3001)
├── backend-bylawyer/    # Bylawyer Express + Prisma backend (port 3002)
├── frontend-robbie/     # Robbie React frontend (port 5173)
├── frontend-bylawyer/   # Bylawyer React frontend (port 5174)
├── mobile/              # React Native + Expo mobile app
└── features/            # Feature specifications
```

## Tech Stack

- **Runtime:** Node.js 18+
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend (Robbie):** Express, Socket.io, PostgreSQL
- **Backend (Bylawyer):** Express, Prisma, SQLite
- **Mobile:** React Native, Expo
- **Package Manager:** npm with workspaces

## Development

### Prerequisites
- Node.js 18 or higher
- npm 9 or higher

### Setup
```bash
# Clone and install
git clone <repository-url>
cd robbie-bylawyer
npm install

# Setup Bylawyer database
npm run db:push

# Start development servers
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all backends and frontends |
| `npm run dev:robbie` | Start Robbie only |
| `npm run dev:bylawyer` | Start Bylawyer only |
| `npm run build` | Build all packages |
| `npm run test` | Run tests |
| `npm run db:studio` | Open Prisma Studio |

## Environment Variables

Copy `.env.example` files in each backend to `.env` and configure:

### backend-node/.env
```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://...
```

### backend-bylawyer/.env
```
PORT=3002
DATABASE_URL=file:./dev.db
```

## License

Private - All rights reserved
