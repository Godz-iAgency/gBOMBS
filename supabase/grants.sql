-- ============================================================================
-- gBOMBS — Role Grants (RUN THIS ONCE in Supabase SQL Editor)
-- ============================================================================
-- WHY: The project was created with "Automatically expose new tables" OFF, so
-- the anon / authenticated / service_role roles never received table privileges.
-- Result: every app query silently fails with "permission denied for table ...".
--
-- Row Level Security still protects every row (users only ever see their own
-- data). These grants only let the roles ATTEMPT access; RLS decides which rows.
-- This is the standard Supabase default — safe to run.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Apply the same grants automatically to any tables/sequences created later.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
