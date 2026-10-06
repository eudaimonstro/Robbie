import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@robbie-bylawyer/shared/types/socket';
import { app, allowedOrigins } from './app.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { initializeStorage, getStorage, shutdownStorage } from './db/meetingStorage.js';
import { setIoInstance } from './socket/ioInstance.js';
import { connectPrisma, disconnectPrisma } from './db/prisma.js';
import { initializeStorage as initializeFileStorage } from './bylawyer/services/fileStorage.js';
import { logger } from './middleware/logger.js';
import { deleteExpiredSessionsAndCodes } from './auth/sessionService.js';
import { getEmailProvider } from './auth/emailService.js';
import { signInStartupCheck } from './auth/signInStartupCheck.js';

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
});

// Store io instance for access from other modules (e.g., sessionSockets)
setIoInstance(io);

// Initialize storage and start server
async function start() {
  // Refuse to start production without a way to send sign-in codes or an address for email
  // links, and flag test sign-in
  const signInCheck = signInStartupCheck(process.env, getEmailProvider());
  for (const warning of signInCheck.warnings) logger.warn(warning);
  if (signInCheck.error) {
    logger.error(signInCheck.error);
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

    // Start server - bind to 0.0.0.0 for Railway
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
