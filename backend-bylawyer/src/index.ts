import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { organizationsRouter } from './routes/organizations.js';
import { documentsRouter } from './routes/documents.js';
import { versionsRouter } from './routes/versions.js';
import { sectionsRouter } from './routes/sections.js';
import { amendmentsRouter } from './routes/amendments.js';
import { meetingsRouter } from './routes/meetings.js';
import { publicRouter } from './routes/public.js';
import { robbieRouter } from './routes/robbie.js';

const PORT = process.env.PORT || 8000;

export const prisma = new PrismaClient();

const app = express();

// Middleware
// Allow both Bylawyer frontend and Robbie backend for cross-service communication
const allowedOrigins = [
  process.env.CLIENT_ORIGIN || 'http://localhost:5174',
  process.env.ROBBIE_API_URL || 'http://localhost:3001'
];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'bylawyer' });
});

// API Routes
app.use('/api/organizations', organizationsRouter);
app.use('/api', documentsRouter);
app.use('/api', versionsRouter);
app.use('/api', sectionsRouter);
app.use('/api', amendmentsRouter);
app.use('/api', meetingsRouter);
app.use('/api/public', publicRouter);
app.use('/api/robbie', robbieRouter);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
async function start() {
  try {
    await prisma.$connect();
    console.log('Connected to database');

    app.listen(PORT, () => {
      console.log(`Bylawyer API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
