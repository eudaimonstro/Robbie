import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { app, allowedOrigins, trustedOrigins } from './app.js';
import { requestOriginAllowed } from './middleware/originCheck.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { initializeStorage, getStorage, shutdownStorage } from './db/meetingStorage.js';
import { pool } from './db/client.js';
import { acquireServerLock } from './db/serverLock.js';
import { flushBroadcasts } from './socket/statePublisher.js';
import { setIoInstance } from './socket/ioInstance.js';
import {
  SOCKET_SESSION_CHECK_MS,
  disconnectSocketsWithoutSession,
} from './socket/sessionSockets.js';
import { connectPrisma, disconnectPrisma } from './db/prisma.js';
import { initializeStorage as initializeFileStorage } from './bylawyer/services/fileStorage.js';
import { logger } from './middleware/logger.js';
import { deleteExpiredSessionsAndCodes } from './auth/sessionService.js';
import { getEmailProvider } from './auth/emailService.js';
import { startupCheck } from './startupCheck.js';

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

// Socket.io server with typed events
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // CORS doesn't stop a WebSocket from another site's page: its handshake is refused unless it
  // comes from the app's own pages (or from no page: curl, a server)
  allowRequest: (req, callback) =>
    callback(null, requestOriginAllowed(req.headers.origin, req.headers.host, trustedOrigins)),
  // No connection state recovery: it kept every update for two minutes and replayed them all to
  // a phone that came back (15 MB for 20 seconds asleep during a vote). A phone back after a
  // moment without signal connects and joins again, which changes nothing for a member still
  // present (PRESENCE_GRACE_MS) and answers with the current state, once.
  //
  // A dead connection (a phone out of range, a Wi-Fi that stopped passing traffic) is noticed
  // within pingInterval + pingTimeout: 20 seconds rather than the default 45, so its member's
  // 90-second grace period (roomManager) starts sooner and quorum stops counting them sooner.
  // A ping every 10 seconds is 15 small frames a second from 150 phones. A phone the browser
  // puts to sleep is dropped after 20 seconds, keeps its presence for the grace period, and
  // joins again when it wakes.
  pingInterval: 10_000,
  pingTimeout: 10_000,
  // Updates are JSON with the meeting's members and the latest history in them: compressed per
  // connection, they are a fraction of the size over the clubhouse Wi-Fi. Level 3 keeps the
  // cost on one vCPU low; messages under 1 KB (acks, small events) go as they are.
  perMessageDeflate: {
    threshold: 1024,
    zlibDeflateOptions: { level: 3 },
  },
  // The largest action a client sends (a bylaw amendment motion with a section's text) is well
  // under this; the default (1 MB) let one message carry a megabyte into the meeting's state
  maxHttpBufferSize: 100 * 1024,
});

// Store io instance for access from other modules (e.g., sessionSockets)
setIoInstance(io);

/** The connection holding the database's server lock (db/serverLock.ts) */
let serverLock: Awaited<ReturnType<typeof acquireServerLock>> = null;

// Initialize storage and start server
async function start() {
  // Refuse to start production misconfigured (no database, no way to send sign-in codes, no
  // sender or address for emails, test sign-in), and flag what is merely risky
  const check = startupCheck(process.env, getEmailProvider());
  for (const warning of check.warnings) logger.warn(warning);
  if (check.error) {
    logger.error(check.error);
    process.exit(1);
  }

  try {
    // One server per database: the live meetings are kept in this process's memory
    serverLock = await acquireServerLock(process.env.DATABASE_URL!);
    if (!serverLock) {
      logger.error(
        'Another Robbie server is running on this database: stop it first (one process runs the live meetings)',
      );
      process.exit(1);
    }

    // Connect to databases
    await initializeStorage();
    await connectPrisma();
    await initializeFileStorage();
    const storage = getStorage();

    // Setup Socket.io handlers
    setupSocketHandlers(io);

    // Remove expired sessions and sign-in codes every hour
    const cleanup = setInterval(
      () => {
        deleteExpiredSessionsAndCodes()
          .then((removed) => removed && logger.info({ removed }, 'Removed expired sessions'))
          .catch((err) => logger.error({ err }, 'Failed to remove expired sessions'));
      },
      60 * 60 * 1000,
    );
    cleanup.unref();

    // Close sockets whose session ended in another process (handleReport suspends users there)
    const socketCheck = setInterval(() => {
      disconnectSocketsWithoutSession()
        .then((closed) => closed && logger.info({ closed }, 'Closed sockets without a session'))
        .catch((err) => logger.error({ err }, 'Failed to check socket sessions'));
    }, SOCKET_SESSION_CHECK_MS);
    socketCheck.unref();

    // Every interface: in a container, Caddy reaches the server over the compose network
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Storage mode: ${storage.mode}`);
      logger.info('Frontend: unified');
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

// Graceful shutdown: close the sockets and the HTTP server, write the live meetings' deferred
// changes, then close the database. Docker stops the container 15 seconds after SIGTERM
// (deploy/compose.yaml); this takes a second or two, with a 10-second backstop.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully...`);

  const backstop = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  backstop.unref();

  // The last state each room is owed goes out before the sockets close
  flushBroadcasts();
  // io.close() disconnects every socket and closes the HTTP server, which waits for requests
  // still running; after two seconds those are cut off too
  const cutOff = setTimeout(() => httpServer.closeAllConnections(), 2000);
  cutOff.unref();
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
  clearTimeout(cutOff);
  logger.info('Sockets and HTTP server closed');

  try {
    await shutdownStorage();
    await disconnectPrisma();
    await pool.end();
    await serverLock?.end();
  } catch (error) {
    logger.error({ err: error }, 'Error during storage shutdown');
  }

  logger.info('Shutdown complete');
  process.exit(0);
}

// Backstop: log a stray rejected promise instead of letting Node exit on it
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
