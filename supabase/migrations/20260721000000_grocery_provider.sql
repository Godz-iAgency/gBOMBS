-- ---------------------------------------------------------------------------
-- Grocery provider — two-tier checkout (Kroger primary, Instacart fallback).
--
-- Phase 1 of the Kroger migration (see KROGER_MIGRATION_PLAN.md):
--   • users gains location (state/city/zip_code) captured in onboarding, plus
--     the resolved provider (provider_type/banner_name/kroger_store_id) written
--     by the detect-grocery-provider Edge Function.
--   • kroger_tokens holds each user's OAuth2 tokens. Kept in a SEPARATE table,
--     NOT on users, and with NO client RLS policies — only the service role
--     (Edge Functions) can read/write it, so a user's "read own profile" grant
--     can never expose their Kroger access token to the browser.
-- ---------------------------------------------------------------------------
begin;

alter table public.users
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists zip_code text,
  add column if not exists provider_type text,
  add column if not exists banner_name text,
  add column if not exists kroger_store_id text;

-- Guarded separately: "add constraint if not exists" isn't valid SQL, so only
-- add the provider_type check when it isn't already present (safe to re-run).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_provider_type_check'
  ) then
    alter table public.users
      add constraint users_provider_type_check
      check (provider_type is null or provider_type in ('kroger', 'instacart'));
  end if;
end $$;

-- Per-user Kroger OAuth2 tokens. Service-role only (no RLS policies added on
-- purpose — Edge Functions use the service key; the client must never read this).
create table if not exists public.kroger_tokens (
  user_id       uuid primary key references public.users(id) on delete cascade,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz default now()
);

alter table public.kroger_tokens enable row level security;
-- Intentionally NO policies: with RLS enabled and no policy, anon/authenticated
-- callers get zero rows. Only the service role (which bypasses RLS) can touch it.

commit;
