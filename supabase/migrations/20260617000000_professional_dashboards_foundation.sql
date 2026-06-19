-- ===========================================================================
-- Step 11 — Professional Dashboards: foundation
-- ===========================================================================
-- Safe to run in the Supabase SQL editor (idempotent: IF NOT EXISTS + CREATE OR
-- REPLACE + DROP POLICY IF EXISTS guards, so re-running causes no errors).
--
-- Adds:
--   • meal_plans / grocery_lists  — persist the CURRENT plan + list to the DB
--     (Phase 0). They previously lived only in device AsyncStorage, which a
--     connected professional (on their own device) and the autopilot cron job
--     cannot read. Local cache stays as a fast layer; the DB is now the shared
--     source of truth.
--   • professional_connections    — two fixed slots per Premium client
--     (chef + trainer_nutritionist), enforced by a partial unique index.
--   • professional_edits          — one polymorphic table for chef notes,
--     trainer goal edits, and queued meal-plan adjustments.
--   • RLS so a professional can READ a connected client's data (scoped by
--     role: chef gets plan/grocery/prefs; trainer also gets scores/streak).
--   • security-definer RPCs for the connection lifecycle (create/accept/revoke)
--     and a column-safe client-profile read that never exposes billing fields.
-- ===========================================================================

begin;

-- gen_random_uuid() + gen_random_bytes() for ids and invite codes.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Plan + grocery persistence (Phase 0). One CURRENT row per user; the
--    client write-through upserts on each generation, overwriting the prior.
-- ---------------------------------------------------------------------------
create table if not exists public.meal_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  plan         jsonb not null,                 -- full WeeklyMealPlan object
  generated_at timestamptz not null,
  tier_used    text,
  model_used   text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create unique index if not exists meal_plans_user_unique
  on public.meal_plans (user_id);

create table if not exists public.grocery_lists (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  list              jsonb not null,            -- full GroceryList object
  plan_generated_at timestamptz,               -- detect staleness vs the plan
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create unique index if not exists grocery_lists_user_unique
  on public.grocery_lists (user_id);

-- ---------------------------------------------------------------------------
-- 2. Professional connections — two fixed slots per client.
-- ---------------------------------------------------------------------------
create table if not exists public.professional_connections (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.users(id) on delete cascade,
  professional_id   uuid references public.users(id) on delete set null,
  role              text not null check (role in ('chef','trainer_nutritionist')),
  status            text not null default 'pending'
                      check (status in ('pending','active','revoked')),
  invite_code       text unique,
  professional_name text,
  invite_created_at timestamptz not null default now(),
  invite_expires_at timestamptz,
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The two-slot maximum, enforced at the DATA layer (not just UI): at most ONE
-- pending-or-active connection per (client, role). Revoked rows are excluded,
-- so a client can revoke and re-invite into the same slot.
create unique index if not exists professional_connections_one_active_slot
  on public.professional_connections (client_id, role)
  where status in ('pending','active');

create index if not exists professional_connections_professional_idx
  on public.professional_connections (professional_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Professional edits — ONE polymorphic table for all professional actions.
--    edit_type:
--      'note'                      chef recipe note (status always 'applied')
--      'goal_edit'                 trainer health-goal/allergy edit (immediate,
--                                  status 'applied')
--      'suggested_meal_adjustment' trainer plan adjustment queued for next
--                                  generation ('pending_next_cycle' → 'applied'
--                                  when consumed, or 'reverted' if the user undoes)
-- ---------------------------------------------------------------------------
create table if not exists public.professional_edits (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid references public.professional_connections(id) on delete set null,
  client_id         uuid not null references public.users(id) on delete cascade,
  professional_id   uuid not null references public.users(id) on delete cascade,
  professional_role text not null check (professional_role in ('chef','trainer_nutritionist')),
  professional_name text,
  edit_type         text not null
                      check (edit_type in ('note','goal_edit','suggested_meal_adjustment')),
  target_reference  text,           -- recipe/meal id (note), field name (goal_edit), or adjustment target
  previous_value    text,
  new_value         text,
  status            text not null default 'applied'
                      check (status in ('applied','pending_next_cycle','reverted')),
  created_at        timestamptz not null default now(),
  applied_at        timestamptz,
  reverted_at       timestamptz
);
create index if not exists professional_edits_client_idx
  on public.professional_edits (client_id, created_at desc);
create index if not exists professional_edits_pending_idx
  on public.professional_edits (client_id)
  where status = 'pending_next_cycle';
create index if not exists professional_edits_note_idx
  on public.professional_edits (client_id, target_reference)
  where edit_type = 'note' and status = 'applied';

-- ---------------------------------------------------------------------------
-- 4. Authorization helpers. security definer so they read
--    professional_connections without tripping that table's own RLS (which
--    would otherwise recurse during policy evaluation).
-- ---------------------------------------------------------------------------
create or replace function public.is_active_professional_for(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.professional_connections pc
    where pc.client_id = target_client
      and pc.professional_id = auth.uid()
      and pc.status = 'active'
  );
$$;

create or replace function public.is_active_professional_for_role(
  target_client uuid, target_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.professional_connections pc
    where pc.client_id = target_client
      and pc.professional_id = auth.uid()
      and pc.role = target_role
      and pc.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS — new tables.
-- ---------------------------------------------------------------------------
alter table public.meal_plans               enable row level security;
alter table public.grocery_lists            enable row level security;
alter table public.professional_connections enable row level security;
alter table public.professional_edits       enable row level security;

drop policy if exists "owner manages own meal plan"        on public.meal_plans;
drop policy if exists "professional reads client meal plan" on public.meal_plans;
create policy "owner manages own meal plan"
  on public.meal_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "professional reads client meal plan"
  on public.meal_plans for select
  using (public.is_active_professional_for(user_id));

drop policy if exists "owner manages own grocery list"        on public.grocery_lists;
drop policy if exists "professional reads client grocery list" on public.grocery_lists;
create policy "owner manages own grocery list"
  on public.grocery_lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "professional reads client grocery list"
  on public.grocery_lists for select
  using (public.is_active_professional_for(user_id));

-- Connections: client sees their own slots; professional sees rows where they
-- are the professional. All WRITES go through the RPCs in section 7 (so slot
-- enforcement + validation stay server-side) — no INSERT/UPDATE policy here.
drop policy if exists "client reads own connections"       on public.professional_connections;
drop policy if exists "professional reads own connections" on public.professional_connections;
create policy "client reads own connections"
  on public.professional_connections for select
  using (auth.uid() = client_id);
create policy "professional reads own connections"
  on public.professional_connections for select
  using (auth.uid() = professional_id);

-- Edits: client reads every edit made on them; professional reads what they
-- authored. Writes go through RPCs (attribution + validation).
drop policy if exists "client reads edits on them"   on public.professional_edits;
drop policy if exists "professional reads own edits"  on public.professional_edits;
create policy "client reads edits on them"
  on public.professional_edits for select
  using (auth.uid() = client_id);
create policy "professional reads own edits"
  on public.professional_edits for select
  using (auth.uid() = professional_id);

-- ---------------------------------------------------------------------------
-- 6. RLS — let professionals READ a connected client's EXISTING data.
--    Additive SELECT policies; existing owner policies are untouched (Postgres
--    OR-combines permissive policies). NOTE: the client's `users` row is NOT
--    exposed here (it carries billing columns) — professionals read a column-
--    safe subset via get_client_profile() in section 7.
-- ---------------------------------------------------------------------------
drop policy if exists "professional reads client food prefs" on public.food_preferences;
create policy "professional reads client food prefs"
  on public.food_preferences for select
  using (public.is_active_professional_for(user_id));

-- Scores + streaks: trainer/nutritionist ONLY (the chef must not see these).
drop policy if exists "trainer reads client daily scores" on public.daily_scores;
create policy "trainer reads client daily scores"
  on public.daily_scores for select
  using (public.is_active_professional_for_role(user_id, 'trainer_nutritionist'));

drop policy if exists "trainer reads client streaks" on public.streaks;
create policy "trainer reads client streaks"
  on public.streaks for select
  using (public.is_active_professional_for_role(user_id, 'trainer_nutritionist'));

-- ---------------------------------------------------------------------------
-- 7. Connection-lifecycle RPCs (security definer; validation lives here).
-- ---------------------------------------------------------------------------

-- Create an invite for one slot. Requires active Premium; rejects if the slot
-- is already pending/active. Returns the invite code (encoded in the QR).
-- NOTE: search_path includes `extensions` because gen_random_bytes() (pgcrypto,
-- used for the invite code below) lives there on Supabase, not in `public`.
-- Without it the function raises 42883 "function gen_random_bytes does not exist".
create or replace function public.create_professional_invite(p_role text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client     uuid := auth.uid();
  v_code       text;
  v_is_premium boolean;
begin
  if v_client is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('chef','trainer_nutritionist') then
    raise exception 'Invalid role';
  end if;

  select (subscription_tier = 'wellness_pro'
          and subscription_id is not null
          and subscription_status in ('active','trialing'))
    into v_is_premium
    from public.users where id = v_client;

  if not coalesce(v_is_premium, false) then
    raise exception 'Professional access requires an active Premium subscription';
  end if;

  if exists (
    select 1 from public.professional_connections
    where client_id = v_client and role = p_role
      and status in ('pending','active')
  ) then
    raise exception 'This slot already has an active or pending connection';
  end if;

  -- URL-safe short code.
  v_code := replace(replace(replace(encode(gen_random_bytes(9), 'base64'),
                                    '/', '_'), '+', '-'), '=', '');

  insert into public.professional_connections
    (client_id, role, status, invite_code, invite_expires_at)
  values
    (v_client, p_role, 'pending', v_code, now() + interval '14 days');

  return v_code;
end;
$$;

-- Accept an invite as the professional. Links the caller, flips to active.
create or replace function public.accept_professional_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro      uuid := auth.uid();
  v_conn     public.professional_connections;
  v_pro_name text;
begin
  if v_pro is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_conn
    from public.professional_connections
   where invite_code = p_code and status = 'pending'
   for update;

  if not found then
    raise exception 'Invalid or already-used invite code';
  end if;
  if v_conn.invite_expires_at is not null and v_conn.invite_expires_at < now() then
    raise exception 'This invite has expired';
  end if;
  if v_conn.client_id = v_pro then
    raise exception 'You cannot connect to your own account';
  end if;

  select full_name into v_pro_name from public.users where id = v_pro;

  update public.professional_connections
     set professional_id   = v_pro,
         professional_name  = v_pro_name,
         status             = 'active',
         accepted_at        = now(),
         updated_at         = now()
   where id = v_conn.id;

  return jsonb_build_object(
    'connection_id', v_conn.id,
    'client_id',     v_conn.client_id,
    'role',          v_conn.role
  );
end;
$$;

-- Revoke a slot (client only). Frees it for re-invite.
create or replace function public.revoke_professional_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := auth.uid();
begin
  update public.professional_connections
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = p_connection_id and client_id = v_client
     and status in ('pending','active');
  if not found then
    raise exception 'Connection not found or not yours to revoke';
  end if;
end;
$$;

-- Column-safe client profile for a professional (NO billing/subscription cols).
create or replace function public.get_client_profile(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_professional_for(p_client_id) then
    raise exception 'Not authorized for this client';
  end if;
  select jsonb_build_object(
    'id',            id,
    'full_name',     full_name,
    'avatar_url',    avatar_url,
    'diet_mode',     diet_mode,
    'health_goal',   health_goal,
    'cooking_style', cooking_style
  ) into v_result
  from public.users where id = p_client_id;
  return v_result;
end;
$$;

grant execute on function public.is_active_professional_for(uuid)              to authenticated;
grant execute on function public.is_active_professional_for_role(uuid, text)   to authenticated;
grant execute on function public.create_professional_invite(text)             to authenticated;
grant execute on function public.accept_professional_invite(text)             to authenticated;
grant execute on function public.revoke_professional_connection(uuid)         to authenticated;
grant execute on function public.get_client_profile(uuid)                     to authenticated;

commit;
