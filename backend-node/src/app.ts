import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import cookieParser from 'cookie-parser';
import { authRouter } from './auth/authRoutes.js';
import { authenticate } from './auth/authenticate.js';
import { requireTerms } from './auth/terms.js';
import { bylawyerRouter } from './bylawyer/bylawyerRouter.js';
import { getStorage } from './db/meetingStorage.js';
import { prisma } from './db/prisma.js';
import { healthCheck } from './health.js';
import {
  organizationsRouter,
  documentsRouter,
  versionsRouter,
  sectionsRouter,
  amendmentsRouter,
  meetingsRouter as bylawyerMeetingsRouter,
  publicRouter,
  robbieRouter,
  packetsRouter,
  attachmentsRouter,
  agendaItemsRouter,
  minutesRouter,
} from './bylawyer/routes/index.js';
import { httpLogger } from './middleware/logger.js';
import { trustProxyHops } from './middleware/trustProxy.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { serveWebApp } from './webApp.js';
import { errorHandler } from './middleware/errorHandler.js';
import { membersRouter } from './orgs/memberRoutes.js';

export const app = express();

// The per-IP rate limits need the client's address: behind a reverse proxy, trust that many hops
// of X-Forwarded-For (TRUST_PROXY=1 behind Caddy). By default trust none.
app.set('trust proxy', trustProxyHops(process.env.TRUST_PROXY));

// Prisma returns BIGINT columns (Amendment.robbieMotionId) as BigInt, which JSON.stringify
// cannot serialize. Motion IDs stay below Number.MAX_SAFE_INTEGER, so send them as numbers.
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value,
);
// Cross-origin requests: the configured web app origin, or in development any localhost port.
// In production the server serves the web app itself (same origin), so without CLIENT_ORIGIN
// no other origin is allowed.
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? [process.env.CLIENT_ORIGIN]
  : process.env.NODE_ENV === 'production'
    ? []
    : [/^http:\/\/localhost:\d+$/];

/** Origins allowed to make cross-origin requests (Socket.io uses the same list) */
export { allowedOrigins };

// Security headers, with the Content Security Policy the web app is served under
app.use(securityHeaders());

// Request logging
app.use(httpLogger);

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(cookieParser() as unknown as express.RequestHandler);

// Raw body parser for file uploads (before JSON parser). Check the session and the terms
// first, so nobody can make the server read 10 MB without signing in.
app.use(
  '/api/attachments/upload',
  authenticate,
  requireTerms,
  express.raw({
    type: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/rtf',
      'application/rtf',
      'application/octet-stream',
    ],
    limit: '10mb',
  }),
);

// The Word document for the bylaws import is read in its route (versions.ts), after the role
// check, since express.json below leaves its types alone.

/**
 * The JSON bodies that can be larger than the 100 KB default (a whole set of bylaws, a
 * meeting's minutes): each is read in its route with a 2 MB limit, after the role check, so
 * nobody below a secretary can make the server read 2 MB. The parser for every other request
 * leaves exactly these alone (method and path, matched as Express matches them: any case, an
 * optional trailing slash).
 */
export const LARGE_JSON_ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/api\/documents\/[^/]+\/versions\/import\/?$/i },
  { method: 'PUT', path: /^\/api\/minutes\/[^/]+\/?$/i },
];

const jsonParser = express.json();
app.use(function jsonBodies(req, res, next) {
  const large = LARGE_JSON_ROUTES.some(
    (route) => route.method === req.method && route.path.test(req.path),
  );
  if (large) return next();
  jsonParser(req, res, next);
});

// Health check (before other routes to avoid conflicts): healthy only when the database answers
app.get(
  '/api/health',
  healthCheck({
    // Without DATABASE_URL (development only) the meetings live in memory: no database to ask
    ping: () => (process.env.DATABASE_URL ? prisma.$queryRaw`SELECT 1` : Promise.resolve()),
    mode: () => {
      try {
        return getStorage().mode;
      } catch {
        return 'initializing';
      }
    },
  }),
);

// Public: sign-in, and read-only share links
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);

// Everything else under /api needs a signed-in user who has accepted the current terms
app.use('/api', authenticate, requireTerms);

app.use('/api/bylawyer', bylawyerRouter);
app.use('/api', organizationsRouter);
app.use('/api', documentsRouter);
app.use('/api', versionsRouter);
app.use('/api', sectionsRouter);
app.use('/api', amendmentsRouter);
app.use('/api', bylawyerMeetingsRouter);
app.use('/api/robbie', robbieRouter);
app.use('/api', packetsRouter);
app.use('/api', attachmentsRouter);
app.use('/api', agendaItemsRouter);
app.use('/api', membersRouter);
app.use('/api', minutesRouter);

// An unknown API path is a JSON 404, not the web app's index.html (with status 200) from the
// catch-all below
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// The built web app on the API's origin (production and the e2e harness; development uses
// Vite). From src/ under tsx and from dist/ under node alike, it is the monorepo's
// frontend-unified/dist, and the image keeps that layout.
serveWebApp(app, path.join(__dirname, '../../frontend-unified/dist'));

// Global error handler (must be after all routes, the web app's included)
app.use(errorHandler);
