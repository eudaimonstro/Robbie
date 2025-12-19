import type { MeetingState } from '@robbie/shared/types';
import { initialState } from '@robbie/shared/reducer';
import { pool } from './client.js';

// Embedded schema for PostgreSQL initialization
const SCHEMA_SQL = `
-- Robbie Parliamentary Procedure App - Database Schema

-- Users (registered via email verification)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meetings with denormalized state
CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  code VARCHAR(8) UNIQUE NOT NULL,
  current_state JSONB NOT NULL,
  state_version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster meeting code lookups
CREATE INDEX IF NOT EXISTS idx_meetings_code ON meetings(code);

-- Participants (role per meeting)
CREATE TABLE IF NOT EXISTS meeting_participants (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('member', 'chair', 'admin')),
  present BOOLEAN DEFAULT true,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

-- Index for faster participant lookups
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON meeting_participants(user_id);

-- Action log (audit trail)
CREATE TABLE IF NOT EXISTS meeting_actions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  action_payload JSONB NOT NULL,
  user_id INTEGER REFERENCES users(id),
  sequence_number INTEGER NOT NULL,
  server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster action retrieval
CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting ON meeting_actions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_sequence ON meeting_actions(meeting_id, sequence_number);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  meeting_code VARCHAR(8) NOT NULL,
  name VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
`;

export interface MeetingRecord {
  id: number;
  code: string;
  state: MeetingState;
  stateVersion: number;
}

export interface StorageProvider {
  mode: 'in-memory' | 'postgresql';
  initialize(): Promise<void>;
  getOrCreateMeeting(code: string): Promise<MeetingRecord>;
  updateMeetingState(code: string, state: MeetingState, newVersion: number): Promise<void>;
  getMeeting(code: string): Promise<MeetingRecord | null>;
  getParticipantRole(meetingCode: string, odUserId: string): Promise<'member' | 'chair' | 'admin' | null>;
  setParticipantRole(meetingCode: string, odUserId: string, role: 'member' | 'chair' | 'admin'): Promise<void>;
}

// In-memory implementation
class InMemoryStorage implements StorageProvider {
  mode: 'in-memory' = 'in-memory';
  private meetings = new Map<string, MeetingRecord>();
  private participantRoles = new Map<string, 'member' | 'chair' | 'admin'>();
  private nextMeetingId = 1;

  async initialize(): Promise<void> {
    console.log('Using in-memory storage (no DATABASE_URL configured)');
  }

  async getOrCreateMeeting(code: string): Promise<MeetingRecord> {
    let meeting = this.meetings.get(code);
    if (!meeting) {
      meeting = {
        id: this.nextMeetingId++,
        code,
        state: { ...initialState, meetingCode: code },
        stateVersion: 1
      };
      this.meetings.set(code, meeting);
      console.log(`Created new meeting: ${code}`);
    }
    return meeting;
  }

  async updateMeetingState(code: string, state: MeetingState, newVersion: number): Promise<void> {
    const meeting = this.meetings.get(code);
    if (meeting) {
      meeting.state = state;
      meeting.stateVersion = newVersion;
    }
  }

  async getMeeting(code: string): Promise<MeetingRecord | null> {
    return this.meetings.get(code) || null;
  }

  async getParticipantRole(meetingCode: string, odUserId: string): Promise<'member' | 'chair' | 'admin' | null> {
    const key = `${meetingCode}:${odUserId}`;
    return this.participantRoles.get(key) || null;
  }

  async setParticipantRole(meetingCode: string, odUserId: string, role: 'member' | 'chair' | 'admin'): Promise<void> {
    const key = `${meetingCode}:${odUserId}`;
    this.participantRoles.set(key, role);
  }
}

// PostgreSQL implementation
class PostgresStorage implements StorageProvider {
  mode: 'postgresql' = 'postgresql';

  async initialize(): Promise<void> {
    console.log('Initializing PostgreSQL storage...');

    try {
      await pool.query(SCHEMA_SQL);
      console.log('Database schema initialized');
    } catch (error) {
      console.error('Error initializing schema:', error);
      throw error;
    }
  }

  async getOrCreateMeeting(code: string): Promise<MeetingRecord> {
    // Try to get existing meeting
    const existing = await this.getMeeting(code);
    if (existing) {
      return existing;
    }

    // Create new meeting
    const newState = { ...initialState, meetingCode: code };
    const result = await pool.query(
      `INSERT INTO meetings (code, current_state, state_version)
       VALUES ($1, $2, 1)
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
       RETURNING id, code, current_state, state_version`,
      [code, JSON.stringify(newState)]
    );

    console.log(`Created new meeting: ${code}`);
    return {
      id: result.rows[0].id,
      code: result.rows[0].code,
      state: result.rows[0].current_state,
      stateVersion: result.rows[0].state_version
    };
  }

  async updateMeetingState(code: string, state: MeetingState, newVersion: number): Promise<void> {
    await pool.query(
      `UPDATE meetings SET current_state = $1, state_version = $2 WHERE code = $3`,
      [JSON.stringify(state), newVersion, code]
    );
  }

  async getMeeting(code: string): Promise<MeetingRecord | null> {
    const result = await pool.query(
      `SELECT id, code, current_state, state_version FROM meetings WHERE code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      code: result.rows[0].code,
      state: result.rows[0].current_state,
      stateVersion: result.rows[0].state_version
    };
  }

  async getParticipantRole(meetingCode: string, odUserId: string): Promise<'member' | 'chair' | 'admin' | null> {
    // Note: odUserId is an on-demand generated ID, not from users table
    // We'll store it in a separate runtime map for now since the schema uses user_id references
    // For full integration, we'd need to modify the schema or add a lookup table
    const result = await pool.query(
      `SELECT mp.role FROM meeting_participants mp
       JOIN meetings m ON mp.meeting_id = m.id
       WHERE m.code = $1 AND mp.user_id = $2`,
      [meetingCode, parseInt(odUserId) || 0]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].role;
  }

  async setParticipantRole(meetingCode: string, odUserId: string, role: 'member' | 'chair' | 'admin'): Promise<void> {
    // Get meeting id
    const meetingResult = await pool.query(
      `SELECT id FROM meetings WHERE code = $1`,
      [meetingCode]
    );

    if (meetingResult.rows.length === 0) {
      return;
    }

    const meetingId = meetingResult.rows[0].id;
    const userId = parseInt(odUserId) || 0;

    // Upsert participant role
    await pool.query(
      `INSERT INTO meeting_participants (meeting_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (meeting_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [meetingId, userId, role]
    );
  }
}

// Factory function
let storageInstance: StorageProvider | null = null;

export async function initializeStorage(): Promise<StorageProvider> {
  if (storageInstance) {
    return storageInstance;
  }

  if (process.env.DATABASE_URL) {
    storageInstance = new PostgresStorage();
  } else {
    storageInstance = new InMemoryStorage();
  }

  await storageInstance.initialize();
  return storageInstance;
}

export function getStorage(): StorageProvider {
  if (!storageInstance) {
    throw new Error('Storage not initialized. Call initializeStorage() first.');
  }
  return storageInstance;
}
