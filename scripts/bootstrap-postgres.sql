-- Run as a PostgreSQL administrator after replacing the psql variables.
-- Example: psql "$ADMIN_DATABASE_URL" -v dentflow_password="'GENERATED_SECRET'" -f scripts/bootstrap-postgres.sql
\set ON_ERROR_STOP on
\if :{?dentflow_password}
\else
\echo 'dentflow_password psql variable is required'
\quit
\endif
SELECT format('CREATE ROLE dentflow LOGIN PASSWORD %s', :dentflow_password)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dentflow') \gexec
SELECT 'CREATE DATABASE dentflow OWNER dentflow'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='dentflow') \gexec
REVOKE ALL ON DATABASE dentflow FROM PUBLIC;
GRANT CONNECT,TEMPORARY ON DATABASE dentflow TO dentflow;
