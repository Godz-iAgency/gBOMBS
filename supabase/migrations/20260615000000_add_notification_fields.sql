-- Push-notification fields on users.
-- push_token already exists; add the timezone (so reminders fire at the user's
-- local evening) and an opt-out flag (defaults on).
alter table public.users
  add column if not exists timezone text,
  add column if not exists notifications_enabled boolean not null default true;
