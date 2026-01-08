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

-- Clean up expired verification tokens (run periodically)
-- DELETE FROM email_verifications WHERE expires_at < NOW() AND verified_at IS NULL;
