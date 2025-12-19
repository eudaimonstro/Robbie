import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@robbie/shared/types/socket';
import { authRouter } from './auth/authController.js';
import { setupSocketHandlers } from './socket/socketHandler.js';

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
  res.json({ status: 'healthy', mode: 'in-memory' });
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Mode: in-memory (no database required)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
