-- ===========================================================================
-- Schedule the daily check-in reminder (run ONCE in the Supabase SQL editor).
-- ===========================================================================
-- This wires pg_cron to call the send-daily-reminders Edge Function every hour.
-- The function itself decides who to remind (users for whom it's 7pm local and
-- who haven't logged today), so the schedule just needs to fire hourly.
--
-- BEFORE RUNNING: replace YOUR_SERVICE_ROLE_KEY below with the project's
-- service_role key (Supabase Dashboard → Project Settings → API → service_role).
-- Keep that key secret — it is stored only inside your own database here.
-- ===========================================================================

-- 1. Extensions (no-ops if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Remove any previous version of this job so re-running is safe.
select cron.unschedule('daily-checkin-reminder')
where exists (
  select 1 from cron.job where jobname = 'daily-checkin-reminder'
);

-- 3. Schedule: every hour, on the hour (UTC).
select cron.schedule(
  'daily-checkin-reminder',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://oknnbvtjcjpfzzgfhxza.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Handy checks:
--   select * from cron.job;                       -- confirm the job exists
--   select * from cron.job_run_details            -- see recent runs
--     order by start_time desc limit 10;
-- To send a test right now (bypass the 7pm gate by temporarily lowering
-- REMINDER_HOUR in the function), just invoke the function directly.
-- ---------------------------------------------------------------------------
