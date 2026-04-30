-- =============================================================================
-- Supabase default role grants
-- =============================================================================
-- When the public schema is dropped+recreated (e.g. on dev reset, or when the
-- hosted-tier provisioner applies migrations to a fresh project via the
-- Management API SQL endpoint), Supabase's default grants to `anon`,
-- `authenticated`, and `service_role` are lost. PostgREST then returns
-- `42501: permission denied for table` on every query.
--
-- This migration restores those grants and sets ALTER DEFAULT PRIVILEGES so
-- any future-created tables inherit them too.
--
-- Idempotent: GRANT statements are idempotent in Postgres.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
