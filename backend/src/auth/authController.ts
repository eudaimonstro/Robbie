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

// Input validation patterns (matching frontend)
const MEETING_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

function validateInput(email: string, name: string, meetingCode: string): string | null {
  // Validate email
  const trimmedEmail = email?.trim()?.toLowerCase();
  if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
    return 'Invalid email address';
  }

  // Validate name
  const trimmedName = name?.trim();
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
    return 'Name must be between 2 and 100 characters';
  }

  // Validate meeting code
  const trimmedCode = meetingCode?.trim()?.toUpperCase();
  if (!trimmedCode || !MEETING_CODE_PATTERN.test(trimmedCode)) {
    return 'Meeting code must be 4-8 alphanumeric characters';
  }

  return null;
}

function sanitizeInputs(email: string, name: string, meetingCode: string) {
  return {
    email: email.trim().toLowerCase(),
    name: name.trim(),
    meetingCode: meetingCode.trim().toUpperCase()
  };
}

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

// Cleanup expired verification records every 15 minutes
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function cleanupExpiredVerifications(): number {
  const now = new Date();
  let removedCount = 0;

  for (const [key, record] of verifications.entries()) {
    if (record.expiresAt < now) {
      verifications.delete(key);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} expired verification records`);
  }

  return removedCount;
}

// Start cleanup interval
const cleanupInterval = setInterval(cleanupExpiredVerifications, CLEANUP_INTERVAL_MS);

// Ensure cleanup interval doesn't prevent process from exiting
cleanupInterval.unref();

// Export for testing
export { cleanupExpiredVerifications };

// Request email verification
authRouter.post('/request-verification', requestVerificationLimiter, async (req, res) => {
  try {
    const { email, name, meetingCode } = req.body;

    if (!email || !name || !meetingCode) {
      return res.status(400).json({ error: 'Missing required fields: email, name, meetingCode' });
    }

    // Validate inputs
    const validationError = validateInput(email, name, meetingCode);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Sanitize inputs
    const sanitized = sanitizeInputs(email, name, meetingCode);

    // Generate 6-digit verification code
    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

    // Store verification token in memory
    const key = `${sanitized.email}:${sanitized.meetingCode}`;
    verifications.set(key, {
      email: sanitized.email,
      name: sanitized.name,
      meetingCode: sanitized.meetingCode,
      token,
      expiresAt,
      verified: false
    });

    // Send verification email (logs to console in dev)
    await sendVerificationEmail(sanitized.email, token, sanitized.meetingCode);

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

    // Validate verification code format
    const trimmedCode = code?.trim();
    if (!trimmedCode || !VERIFICATION_CODE_PATTERN.test(trimmedCode)) {
      return res.status(400).json({ error: 'Verification code must be 6 digits' });
    }

    // Sanitize email and meeting code for lookup
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedMeetingCode = meetingCode.trim().toUpperCase();

    // Find and validate verification token
    const key = `${sanitizedEmail}:${sanitizedMeetingCode}`;
    const verification = verifications.get(key);

    if (!verification ||
        verification.token !== trimmedCode ||
        verification.verified ||
        verification.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Mark as verified
    verification.verified = true;

    // Create or find user
    let user = users.get(sanitizedEmail);
    if (!user) {
      user = {
        id: nextUserId++,
        email: sanitizedEmail,
        name: verification.name
      };
      users.set(sanitizedEmail, user);
    } else {
      user.name = verification.name;
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        meetingCode: sanitizedMeetingCode
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Set HttpOnly cookie with the token
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction, // Only send over HTTPS in production
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    });

    res.json({
      success: true,
      token, // Still return token for Socket.io (will be removed once cookie auth works)
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

// Logout - clear the auth cookie
authRouter.post('/logout', (_req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/'
  });
  res.json({ success: true });
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
