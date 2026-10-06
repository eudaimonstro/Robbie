-- Initialize database for Robbie-Bylawyer monorepo
-- Both Robbie and Bylawyer share a single "robbie" database
CREATE DATABASE robbie;
GRANT ALL PRIVILEGES ON DATABASE robbie TO postgres;
