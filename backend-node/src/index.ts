import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@robbie-bylawyer/shared/types/socket';
import { authRouter } from './auth/authController.js';
import { bylawyerRouter } from './bylawyer/bylawyerRouter.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { initializeStorage, getStorage, shutdownStorage } from './db/meetingStorage.js';
import { setIoInstance } from './socket/ioInstance.js';
import { connectPrisma, disconnectPrisma } from './db/prisma.js';
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
  agendaItemsRouter
} from './bylawyer/routes/index.js';
import { initializeStorage as initializeFileStorage } from './bylawyer/services/fileStorage.js';

const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);

// Allow any localhost port in development
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? [process.env.CLIENT_ORIGIN]
  : [/^http:\/\/localhost:\d+$/];

// Socket.io server with typed events
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Store io instance for access from other modules (e.g., authController)
setIoInstance(io);

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(cookieParser() as unknown as express.RequestHandler);

// Raw body parser for file uploads (before JSON parser)
app.use('/api/attachments/upload', express.raw({
  type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/rtf', 'application/rtf', 'application/octet-stream'],
  limit: '10mb'
}));

app.use(express.json());

// Health check (before other routes to avoid conflicts)
app.get('/api/health', (_req, res) => {
  try {
    const storage = getStorage();
    res.json({ status: 'healthy', mode: storage.mode });
  } catch {
    res.json({ status: 'healthy', mode: 'initializing' });
  }
});

// Routes - Robbie
app.use('/api/auth', authRouter);
app.use('/api/bylawyer', bylawyerRouter);

// Routes - Bylawyer API (direct access)
app.use('/api', organizationsRouter);
app.use('/api', documentsRouter);
app.use('/api', versionsRouter);
app.use('/api', sectionsRouter);
app.use('/api', amendmentsRouter);
app.use('/api', bylawyerMeetingsRouter);
app.use('/api', publicRouter);
app.use('/api/robbie', robbieRouter);

// Routes - Meeting Packets & Attachments
app.use('/api', packetsRouter);
app.use('/api', attachmentsRouter);
app.use('/api', agendaItemsRouter);

// Static file serving for production builds
const unifiedDist = path.join(__dirname, '../../frontend-unified/dist');

// Legacy paths for backward compatibility during transition
const robbieDist = path.join(__dirname, '../../frontend-robbie/dist');
const bylawyerDist = path.join(__dirname, '../../frontend-bylawyer/dist');

// Serve legacy Bylawyer frontend at /bylawyer-legacy (for transition)
app.use('/bylawyer-legacy', express.static(bylawyerDist));
app.get('/bylawyer-legacy/*', (_req, res) => {
  res.sendFile(path.join(bylawyerDist, 'index.html'));
});

// Serve legacy Robbie frontend at /robbie-legacy (for transition)
app.use('/robbie-legacy', express.static(robbieDist));
app.get('/robbie-legacy/*', (_req, res) => {
  res.sendFile(path.join(robbieDist, 'index.html'));
});

// Serve unified frontend at root (must be last)
app.use(express.static(unifiedDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(unifiedDist, 'index.html'));
});

// Initialize storage and start server
async function start() {
  try {
    // Connect to databases
    await initializeStorage();
    await connectPrisma();
    await initializeFileStorage();
    const storage = getStorage();

    // Setup Socket.io handlers
    setupSocketHandlers(io);

    // Start server - bind to 0.0.0.0 for Railway
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Storage mode: ${storage.mode}`);
      console.log(`Frontend: unified (legacy available at /robbie-legacy and /bylawyer-legacy)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);

  // Close HTTP server (stop accepting new connections)
  httpServer.close(async () => {
    console.log('HTTP server closed');

    // Close database connections
    try {
      await shutdownStorage();
      await disconnectPrisma();
    } catch (error) {
      console.error('Error during storage shutdown:', error);
    }

    console.log('Shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
