# Robbie

Robbie runs a homeowners' association meeting in the room and keeps the association's governing documents.

- **In the meeting:** the chair runs it from a laptop, homeowners join on their phones by link or QR code (no app to install), a TV shows the room the question, the speakers, the votes and the results, and people without a phone or an account still count: the chair marks them present and enters the room's show of hands. Motions, amendments, elections and quorum follow Robert's Rules ([what is supported](docs/RONR_IMPLEMENTATION_STATUS.md)).
- **Before and after:** the secretary schedules the meeting with its agenda and files and sends the notice; the bylaws are kept in versions, with amendments from draft to adoption; the minutes are drafted from the meeting when it adjourns, then edited, published and approved at the next meeting. A bylaw amendment adopted in the meeting becomes the next version of the bylaws.

## Try it

You need Docker and Node 24 (`.nvmrc`), and `npm install` done once.

```bash
npm run demo
```

It starts its own Postgres in Docker, builds the app, seeds the Maple Grove HOA demo and serves it at http://localhost:3301. Sign in with the code `000000`, each person in a separate browser profile or private window: Dana (`dana@maplegrove.example`) chairs from **Live Meetings**, **Start**; Alice and Ben (`alice@`, `ben@maplegrove.example`) are homeowners on phones; Morgan (`morgan@maplegrove.example`) opens the TV at http://localhost:3301/meetings/MAPLE1/display; Pat (`pat@maplegrove.example`) publishes the minutes afterward. [docs/demo.md](docs/demo.md) walks through the meeting. `npm run demo -- --stop` stops it, `-- --reset` starts over, `-- --remove` deletes its data.

## Development

```bash
npm install
docker compose up -d                              # a development Postgres
cp backend-node/.env.example backend-node/.env    # then set DATABASE_URL and the rest
npm run db:migrate
npm run dev                                       # the server on 3001, the web app on http://localhost:5173
```

The monorepo has three npm workspaces: `shared/` (types, the meeting reducer, rules both sides use), `backend-node/` (Express, Socket.io, Prisma and Postgres) and `frontend-unified/` (React, Vite, Tailwind on the design tokens of [docs/design-brief.md](docs/design-brief.md)), plus the Playwright harness in `e2e/` and the production files in `deploy/`. [CLAUDE.md](CLAUDE.md) is the guide to the code: its layout, architecture, API and conventions.

## Tests

```bash
npm run test             # unit tests of the three packages (npm run test:coverage for coverage)
npm run lint             # ESLint (no warnings allowed) and the design-token check
npm run format:check     # Prettier
INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w backend-node   # a throwaway database
npm run e2e              # Playwright: the meeting scenarios in real browsers
```

`npm run e2e` needs a throwaway Postgres on port 55432 and Chromium; CLAUDE.md has the two commands. It migrates that database and reseeds the demo on every run.

## Deploying

Robbie runs on one server with Docker Compose: the app (one image, built by CI), Postgres, nightly backups and Caddy for HTTPS. The runbook, from preparing the host to the night of a meeting, is [docs/deploy.md](docs/deploy.md).

## Docs

- [docs/mvp-roadmap.md](docs/mvp-roadmap.md): the plan, what was built, and the known gaps
- [docs/decisions.md](docs/decisions.md): the product and hosting decisions
- [docs/design/](docs/design/README.md): the design of each part, in the order it was built
- [docs/RONR_IMPLEMENTATION_STATUS.md](docs/RONR_IMPLEMENTATION_STATUS.md): the motions and rules Robbie supports
- [docs/design-brief.md](docs/design-brief.md): the visual language
- [docs/deploy.md](docs/deploy.md), [docs/demo.md](docs/demo.md), [docs/security/dependency-audit.md](docs/security/dependency-audit.md)

## License

Private. All rights reserved.
