import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { sendVerificationEmail, getLastCode } from './emailService.js';

export const authRouter = Router();

// Environment checks
const isProduction = process.env.NODE_ENV === 'production';

// JWT_SECRET must be set in production - fail fast with clear error
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (isProduction) {
    if (!secret) {
      console.error('FATAL: JWT_SECRET environment variable is required in production');
      process.exit(1);
    }
    if (secret.length < 32) {
      console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    return secret;
  }

  // Development mode
  if (!secret) {
    console.warn('WARNING: Using insecure default JWT_SECRET. Set JWT_SECRET env var for production.');
    return 'dev-secret-do-not-use-in-production';
  }

  return secret;
}

const jwtSecret = getJwtSecret();
const VERIFICATION_EXPIRY_MINUTES = 15;

// Test mode configuration - allows bypassing email verification for testing
// Enable with ENABLE_TEST_AUTH=true environment variable
// SAFETY: Disabled in production even if env var is set
const TEST_AUTH_ENABLED = process.env.ENABLE_TEST_AUTH === 'true' && !isProduction;
const TEST_MEETING_CODE = process.env.TEST_MEETING_CODE || 'DEMO';
const TEST_VERIFICATION_CODE = process.env.TEST_VERIFICATION_CODE || '000000';

if (process.env.ENABLE_TEST_AUTH === 'true' && isProduction) {
  console.warn('⚠️ WARNING: ENABLE_TEST_AUTH is set but ignored in production for security');
}

if (TEST_AUTH_ENABLED) {
  console.log(`🧪 TEST AUTH ENABLED - Meeting code: ${TEST_MEETING_CODE}, Verification code: ${TEST_VERIFICATION_CODE}`);
}

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
const requestVerificationLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: { error: 'Too many verification requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

// Stricter rate limiting for verification attempts (prevent brute force)
const verifyCodeLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window per IP
  message: { error: 'Too many verification attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
}) as unknown as RequestHandler;

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
    const { email, code, meetingCode, name } = req.body;

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

    // Check for test auth bypass
    const isTestAuth = TEST_AUTH_ENABLED &&
                       sanitizedMeetingCode === TEST_MEETING_CODE &&
                       trimmedCode === TEST_VERIFICATION_CODE;

    // Find verification record (may not exist for test auth)
    const key = `${sanitizedEmail}:${sanitizedMeetingCode}`;
    const verification = verifications.get(key);

    if (!isTestAuth) {
      // Validate verification token
      if (!verification ||
          verification.token !== trimmedCode ||
          verification.verified ||
          verification.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Invalid or expired verification code' });
      }

      // Mark as verified
      verification.verified = true;
    }

    // Determine user name from verification record, request body, or derive from email
    const derivedName = sanitizedEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const userName = verification?.name || name?.trim() || derivedName || 'Participant';

    // Create or find user
    let user = users.get(sanitizedEmail);
    if (!user) {
      user = {
        id: nextUserId++,
        email: sanitizedEmail,
        name: userName
      };
      users.set(sanitizedEmail, user);
    } else {
      user.name = userName;
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

// TEST ONLY: Change user role for testing different views
// Only available when ENABLE_TEST_AUTH=true
if (TEST_AUTH_ENABLED) {
  authRouter.post('/test-role', async (req, res) => {
    try {
      const { email, meetingCode, role } = req.body;

      if (!email || !meetingCode || !role) {
        return res.status(400).json({ error: 'Missing required fields: email, meetingCode, role' });
      }

      const validRoles = ['member', 'chair', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be: member, chair, or admin' });
      }

      const sanitizedEmail = email.trim().toLowerCase();
      const sanitizedMeetingCode = meetingCode.trim().toUpperCase();

      // Find user
      const user = users.get(sanitizedEmail);
      if (!user) {
        return res.status(404).json({ error: 'User not found. Verify first.' });
      }

      // Import modules dynamically to avoid circular dependency
      const { getStorage } = await import('../db/meetingStorage.js');
      const { applyAction } = await import('../socket/stateManager.js');
      const storage = getStorage();

      // Update role in storage (for permission checks)
      const odUserId = `${user.id}:${user.email}`;
      await storage.setParticipantRole(sanitizedMeetingCode, odUserId, role);

      // Also update the member's role in the meeting state
      const meeting = await storage.getMeeting(sanitizedMeetingCode);
      if (meeting) {
        const member = meeting.state.members.find(m => m.id === user.id);
        if (member) {
          // Find current chair if we're making someone else chair
          let previousChairId: number | undefined;
          if (role === 'chair') {
            const currentChair = meeting.state.members.find(m => m.role === 'chair');
            if (currentChair && currentChair.id !== user.id) {
              previousChairId = currentChair.id;
            }
          }

          // Apply SET_MEMBER_ROLE action to update the state
          const result = await applyAction(sanitizedMeetingCode, {
            type: 'SET_MEMBER_ROLE',
            targetMemberId: user.id,
            newRole: role,
            previousChairId,
            changedBy: 'Test Mode',
            changedById: 0,
            timestamp: new Date().toISOString()
          });

          // Broadcast state update to all connected clients in the meeting room
          if (result.success) {
            const { getIoInstance } = await import('../socket/ioInstance.js');
            const io = getIoInstance();
            if (io) {
              const roomName = `meeting:${sanitizedMeetingCode}`;
              io.to(roomName).emit('STATE_UPDATE', {
                state: result.state,
                stateVersion: result.stateVersion,
                triggeredBy: { actionType: 'SET_MEMBER_ROLE', userId: user.id }
              });
            }
          }
        }
      }

      // Generate new JWT with role hint (for debugging)
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          name: user.name,
          meetingCode: sanitizedMeetingCode,
          testRole: role // Hint for debugging, not used for auth
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      console.log(`🧪 TEST: Changed role for ${user.email} in ${sanitizedMeetingCode} to ${role}`);

      res.json({
        success: true,
        message: `Role changed to ${role}. Refresh the page to see the new view.`,
        token,
        role
      });
    } catch (error) {
      console.error('Error changing test role:', error);
      res.status(500).json({ error: 'Failed to change role' });
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
