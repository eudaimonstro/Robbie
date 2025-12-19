import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@robbie/shared/types/socket';
import { authRouter } from './auth/authController.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { initializeStorage, getStorage } from './db/meetingStorage.js';

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

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);

// Health check
app.get('/api/health', (_req, res) => {
  try {
    const storage = getStorage();
    res.json({ status: 'healthy', mode: storage.mode });
  } catch {
    res.json({ status: 'healthy', mode: 'initializing' });
  }
});

// Initialize storage and start server
async function start() {
  try {
    await initializeStorage();
    const storage = getStorage();

    // Setup Socket.io handlers
    setupSocketHandlers(io);

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Storage mode: ${storage.mode}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
