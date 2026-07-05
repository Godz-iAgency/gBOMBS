-- ===========================================================================
-- Schedule the orphaned-professional cleanup (run ONCE in the Supabase SQL editor).
-- ===========================================================================
-- Wires pg_cron to call the delete-orphaned-professionals Edge Function every
-- hour. The function warns queued accounts, cancels the clock for any that
-- reconnected/subscribed, and permanently deletes those still client-less past
-- their 48-hour window.
--
-- BEFORE RUNNING: replace YOUR_SERVICE_ROLE_KEY with the project's key
-- (Supabase Dashboard → Settings → API → "Secret keys" → default `sb_secret_...`).
-- pg_net's default timeout is 5s — deleting a handful of accounts is fast, but
-- we pass a generous timeout to be safe.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('delete-orphaned-professionals')
where exists (
  select 1 from cron.job where jobname = 'delete-orphaned-professionals'
);

-- Every hour at :20 (staggered from the reminder :00 and autopilot :10 jobs).
select cron.schedule(
  'delete-orphaned-professionals',
  '20 * * * *',
  $$
  select net.http_post(
    url                  := 'https://oknnbvtjcjpfzzgfhxza.supabase.co/functions/v1/delete-orphaned-professionals',
    headers              := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- TEST right now (bypasses the hourly wait — the 48h gate still applies inside
-- the function, so to force a real delete during testing, first set the clock
-- into the past for your test professional:
--   update public.users set pending_deletion_at = now() - interval '1 minute'
--    where id = 'THE-PROFESSIONAL-UUID';
-- then fire the function):
--   select net.http_post(
--     url                  := 'https://oknnbvtjcjpfzzgfhxza.supabase.co/functions/v1/delete-orphaned-professionals',
--     headers              := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--     ),
--     body                 := '{}'::jsonb,
--     timeout_milliseconds := 60000
--   );
-- Then read the result:  select status_code, content from net._http_response order by id desc limit 1;
-- ---------------------------------------------------------------------------
