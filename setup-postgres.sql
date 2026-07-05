-- TaskFlow PostgreSQL setup
-- Run as superuser (postgres): psql -U postgres -f setup-postgres.sql

-- Create application user (ignore error if already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'taskuser') THEN
    CREATE ROLE taskuser WITH LOGIN PASSWORD 'taskpass';
  ELSE
    ALTER ROLE taskuser WITH LOGIN PASSWORD 'taskpass';
  END IF;
END
$$;

-- Create database (skip if exists)
SELECT 'CREATE DATABASE taskdb OWNER taskuser'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'taskdb')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE taskdb TO taskuser;

\c taskdb

GRANT ALL ON SCHEMA public TO taskuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO taskuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO taskuser;
