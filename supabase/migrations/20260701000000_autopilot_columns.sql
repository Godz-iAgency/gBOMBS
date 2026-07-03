-- ===========================================================================
-- Step 11.8 — Autopilot Mode 2: weekly auto-generation columns
-- ===========================================================================
-- Adds the two user-level settings the autopilot-generate Edge Function reads:
--   • autopilot_enabled — opt-in toggle (OFF by default; the user must enable).
--   • autopilot_day     — day of week to regenerate, 0=Sunday … 6=Saturday
--                         (matches JS Date.getDay() on the client, which
--                         defaults it to the day the user flipped the toggle).
-- The generation itself runs server-side (Edge Function called hourly by
-- pg_cron — see supabase/schedule_autopilot_generation.sql).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ===========================================================================

begin;

alter table public.users
  add column if not exists autopilot_enabled boolean not null default false,
  add column if not exists autopilot_day smallint
    check (autopilot_day between 0 and 6);

-- The hourly job only ever scans opted-in users.
create index if not exists users_autopilot_enabled_idx
  on public.users (id)
  where autopilot_enabled = true;

commit;
