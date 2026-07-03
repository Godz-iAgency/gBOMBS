-- ===========================================================================
-- Schedule Autopilot weekly plan generation (run ONCE in the Supabase SQL editor).
-- ===========================================================================
-- Wires pg_cron to call the autopilot-generate Edge Function every hour. The
-- function itself decides who to generate for (opted-in users whose local time
-- is 6pm–11pm on their chosen day and who haven't had a plan generated in the
-- last 20 hours), so the schedule just fires hourly.
--
-- BEFORE RUNNING: replace YOUR_SERVICE_ROLE_KEY below with the project's
-- service_role key (Supabase Dashboard → Project Settings → API → service_role).
-- Keep that key secret — it is stored only inside your own database here.
--
-- ALSO REQUIRED once: give the Edge Function a Gemini key —
--   npx supabase secrets set GEMINI_API_KEY=your_key
-- ===========================================================================

-- 1. Extensions (no-ops if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Remove any previous version of this job so re-running is safe.
select cron.unschedule('autopilot-weekly-generation')
where exists (
  select 1 from cron.job where jobname = 'autopilot-weekly-generation'
);

-- 3. Schedule: every hour at :10 (offset from the reminder job at :00).
select cron.schedule(
  'autopilot-weekly-generation',
  '10 * * * *',
  $$
  select net.http_post(
    url     := 'https://oknnbvtjcjpfzzgfhxza.supabase.co/functions/v1/autopilot-generate',
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
--   select * from cron.job_run_details
--     order by start_time desc limit 10;          -- see recent runs
--
-- To TEST the whole pipeline right now for one user (bypasses the day/hour
-- gate, but still requires autopilot_enabled + an active subscription):
--   select net.http_post(
--     url     := 'https://oknnbvtjcjpfzzgfhxza.supabase.co/functions/v1/autopilot-generate',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--     ),
--     body    := jsonb_build_object('force_user_id', 'THE-USER-UUID')
--   );
-- ---------------------------------------------------------------------------
