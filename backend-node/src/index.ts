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
  // comes from the app's own pages (or from no page: the mobile app)
  allowRequest: (req, callback) =>
    callback(null, requestOriginAllowed(req.headers.origin, req.headers.host, trustedOrigins)),
  // A phone that loses signal for a moment resumes the same session: its meeting, and the
  // state updates it missed. Recovered sockets skip the session check (socketAuth), which they
  // passed when they connected; a socket closed by signing out is not recovered.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  // The largest action a client sends (a bylaw amendment motion with a section's text) is well
  // under this; the default (1 MB) let one message carry a megabyte into the meeting's state
  maxHttpBufferSize: 100 * 1024,
});

// Store io instance for access from other modules (e.g., sessionSockets)
setIoInstance(io);

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

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);

  // Close HTTP server (stop accepting new connections)
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    // Close database connections
    try {
      await shutdownStorage();
      await disconnectPrisma();
    } catch (error) {
      logger.error({ err: error }, 'Error during storage shutdown');
    }

    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Backstop: log a stray rejected promise instead of letting Node exit on it
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
