import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendVerificationEmail, getLastCode } from './emailService.js';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const VERIFICATION_EXPIRY_MINUTES = 15;

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
authRouter.post('/request-verification', async (req, res) => {
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
authRouter.post('/verify', async (req, res) => {
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
      JWT_SECRET,
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
authRouter.get('/dev-code', (_req, res) => {
  const code = getLastCode();
  if (code) {
    res.json({ code });
  } else {
    res.status(404).json({ error: 'No code generated yet' });
  }
});

// Verify JWT token (for socket connection)
export function verifyToken(token: string): { userId: number; email: string; name: string; meetingCode: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
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
