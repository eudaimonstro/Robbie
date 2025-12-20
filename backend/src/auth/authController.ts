import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { sendVerificationEmail, getLastCode } from './emailService.js';

export const authRouter = Router();

// Environment checks
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (isProduction) {
    console.error('FATAL: JWT_SECRET environment variable is required in production');
    process.exit(1);
  } else {
    console.warn('WARNING: Using insecure default JWT_SECRET. Set JWT_SECRET env var for production.');
  }
}

const jwtSecret = JWT_SECRET || 'dev-secret-change-in-production';
const VERIFICATION_EXPIRY_MINUTES = 15;

// Rate limiting for verification requests (prevent email spam)
const requestVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: { error: 'Too many verification requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for verification attempts (prevent brute force)
const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window per IP
  message: { error: 'Too many verification attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory storage for development (when PostgreSQL is not available)
interface VerificationRecord {
  email: string;
  name: string;
  meetingCode: string;
  token: string;
  expiresAt: Date;
  verified: boolean;
}

interface UserRecord {
  id: number;
  email: string;
  name: string;
}

const verifications = new Map<string, VerificationRecord>();
const users = new Map<string, UserRecord>();
let nextUserId = 1;

// Request email verification
authRouter.post('/request-verification', requestVerificationLimiter, async (req, res) => {
  try {
    const { email, name, meetingCode } = req.body;

    if (!email || !name || !meetingCode) {
      return res.status(400).json({ error: 'Missing required fields: email, name, meetingCode' });
    }

    // Generate 6-digit verification code
    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

    // Store verification token in memory
    const key = `${email}:${meetingCode}`;
    verifications.set(key, {
      email,
      name,
      meetingCode,
      token,
      expiresAt,
      verified: false
    });

    // Send verification email (logs to console in dev)
    await sendVerificationEmail(email, token, meetingCode);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('Error requesting verification:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Verify email code and return JWT
authRouter.post('/verify', verifyCodeLimiter, async (req, res) => {
  try {
    const { email, code, meetingCode } = req.body;

    if (!email || !code || !meetingCode) {
      return res.status(400).json({ error: 'Missing required fields: email, code, meetingCode' });
    }

    // Find and validate verification token
    const key = `${email}:${meetingCode}`;
    const verification = verifications.get(key);

    if (!verification ||
        verification.token !== code ||
        verification.verified ||
        verification.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Mark as verified
    verification.verified = true;

    // Create or find user
    let user = users.get(email);
    if (!user) {
      user = {
        id: nextUserId++,
        email,
        name: verification.name
      };
      users.set(email, user);
    } else {
      user.name = verification.name;
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        meetingCode
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// DEV ONLY: Get last verification code (for testing without email)
// Disabled in production for security
if (!isProduction) {
  authRouter.get('/dev-code', (_req, res) => {
    const code = getLastCode();
    if (code) {
      res.json({ code });
    } else {
      res.status(404).json({ error: 'No code generated yet' });
    }
  });
}

// Verify JWT token (for socket connection)
export function verifyToken(token: string): { userId: number; email: string; name: string; meetingCode: string } | null {
  try {
    const decoded = jwt.verify(token, jwtSecret) as {
      userId: number;
      email: string;
      name: string;
      meetingCode: string;
    };
    return decoded;
  } catch {
    return null;
  }
}
