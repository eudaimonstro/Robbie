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
- **Frontend:** React, TypeScript, Vite, Tailwind CSS (on the design tokens in `docs/design-brief.md`)
- **Backend:** Express, Socket.io, Prisma, PostgreSQL
- **Mobile:** React Native, Expo
- **Testing:** Vitest, Jest (mobile), Playwright (end to end)
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

| Command                             | Description                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run dev`                       | Start the backend and the web app                                                                           |
| `npm run build`                     | Build all packages                                                                                          |
| `npm run test`                      | Run tests                                                                                                   |
| `npm run lint`                      | ESLint, then the palette check (`scripts/check-palette.sh`)                                                 |
| `npm run e2e`                       | Playwright: build, start the API and the web build, reseed the demo, run the smoke test and the screenshots |
| `npm run db:studio`                 | Open Prisma Studio                                                                                          |
| `npm run seed:demo -w backend-node` | Create the Maple Grove HOA demo (`-- --reset` replaces it)                                                  |

The demo's people sign in with the code `000000` when the server runs with `ENABLE_TEST_AUTH=true`; the seed prints their emails and roles.

### End-to-end tests

`npm run e2e` runs the Playwright harness in `e2e/`. It starts its own API on port 3101 and the production web build on port 4173, on the database in `E2E_DATABASE_URL`, which defaults to a throwaway Postgres on port 55432 (it never uses `DATABASE_URL`). Every run migrates that database, clears its live meetings and reseeds the Maple Grove HOA demo, so don't point it at data you want to keep. To run it locally:

```bash
# Once: the throwaway Postgres and Chromium
docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
npx playwright install chromium

npm run e2e
```

Screenshots of the main pages in both palettes land in `e2e/test-results/`. Locally the harness reuses a server already listening on 3101 or 4173, so stop stale ones first.

### Design

`docs/design-brief.md` is the visual language: the paper, ink and gavel tokens in a day and an evening palette, Fraunces and Public Sans, and the brief's components. The style guide at `/style-guide` (signed in) shows the tokens and components in both palettes. `npm run lint` fails on a raw Tailwind palette class, `white` or `black`, or an emoji icon in the web app.

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
