-- Initialize databases for Robbie-Bylawyer monorepo

-- Create database for Robbie (parliamentary procedure app)
CREATE DATABASE robbie;

-- Create database for Bylawyer (bylaws version control)
CREATE DATABASE bylawyer;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE robbie TO postgres;
GRANT ALL PRIVILEGES ON DATABASE bylawyer TO postgres;
