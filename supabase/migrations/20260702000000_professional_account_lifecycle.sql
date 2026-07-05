-- ===========================================================================
-- Phase B (Chunk 1) — Pure-professional account lifecycle
-- ===========================================================================
-- A "pure professional" exists on the platform ONLY because a paying client
-- invited them (there's no self-serve professional signup). Model decision:
-- when a professional loses their LAST client and has no personal subscription,
-- their account is permanently deleted after a 48-hour grace period — this is a
-- paid platform, so there's no free tier to host a client-less account.
--
-- This migration:
--   1. Preserves the CLIENT's history when a professional is deleted — the
--      professional_edits.professional_id FK is changed from CASCADE to SET NULL
--      (the notes carry professional_name as text, so attribution survives).
--   2. Adds users.pending_deletion_at + users.deletion_warned (the 48h clock).
--   3. revoke_professional_connection now starts the clock when the professional
--      is orphaned (no other active/pending client) AND has no paid access.
--   4. accept_professional_invite clears the clock (re-invited in time → safe).
--   5. preview_revoke(connection) tells the client's UI whether removing this
--      connection will DELETE the professional, so it can show the hard warning.
--   6. has_paid_access(user) — shared "is this a paying/trialing subscriber?"
--
-- The actual deletion runs server-side (delete-orphaned-professionals Edge
-- Function + hourly pg_cron) because deleting an auth account needs admin rights.
--
-- Idempotent: CREATE OR REPLACE + IF EXISTS/NOT EXISTS guards.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Preserve client-side history on professional deletion.
--    professional_edits.professional_id: CASCADE → SET NULL.
-- ---------------------------------------------------------------------------
alter table public.professional_edits
  drop constraint if exists professional_edits_professional_id_fkey;
alter table public.professional_edits
  alter column professional_id drop not null;
alter table public.professional_edits
  add constraint professional_edits_professional_id_fkey
    foreign key (professional_id) references public.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. The 48-hour deletion clock.
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists pending_deletion_at timestamptz,
  add column if not exists deletion_warned boolean not null default false;

create index if not exists users_pending_deletion_idx
  on public.users (pending_deletion_at)
  where pending_deletion_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Shared access check — a real paying/trialing subscriber (mirrors the
--    client's hasActiveSubscription in src/lib/access.ts).
-- ---------------------------------------------------------------------------
create or replace function public.has_paid_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = p_user
      and subscription_id is not null
      and subscription_status in ('active','trialing')
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Revoke — now starts the deletion clock for an orphaned pure professional.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_professional_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_pro    uuid;
  v_others integer;
begin
  update public.professional_connections
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = p_connection_id and client_id = v_client
     and status in ('pending','active')
   returning professional_id into v_pro;

  if not found then
    raise exception 'Connection not found or not yours to revoke';
  end if;

  -- Pending invites never got accepted (no professional_id) — nothing to orphan.
  if v_pro is null then
    return;
  end if;

  -- Does the professional still serve anyone else?
  select count(*) into v_others
    from public.professional_connections
   where professional_id = v_pro
     and status in ('pending','active');

  -- Orphaned AND not a paying member of their own → start the 48h clock.
  if v_others = 0 and not public.has_paid_access(v_pro) then
    update public.users
       set pending_deletion_at = now() + interval '48 hours',
           deletion_warned = false
     where id = v_pro;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Accept — clears any pending deletion (re-invited in time, or a new client).
--    (This is a copy of the existing function with the clock-clear appended.)
-- ---------------------------------------------------------------------------
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

  -- Reconnected → cancel any scheduled deletion of the professional's account.
  update public.users
     set pending_deletion_at = null,
         deletion_warned = false
   where id = v_pro
     and pending_deletion_at is not null;

  return jsonb_build_object(
    'connection_id', v_conn.id,
    'client_id',     v_conn.client_id,
    'role',          v_conn.role
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Preview — will removing this connection DELETE the professional? Lets the
--    client UI show the hard "erases their account + data" warning only when
--    it's actually true (their last client + no personal subscription).
-- ---------------------------------------------------------------------------
create or replace function public.preview_revoke(p_connection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_pro    uuid;
  v_name   text;
  v_others integer;
begin
  select professional_id, professional_name
    into v_pro, v_name
    from public.professional_connections
   where id = p_connection_id and client_id = v_client
     and status in ('pending','active');

  if not found then
    raise exception 'Connection not found or not yours';
  end if;

  -- Not yet accepted → no account exists to delete.
  if v_pro is null then
    return jsonb_build_object('will_delete', false, 'professional_name', v_name);
  end if;

  select count(*) into v_others
    from public.professional_connections
   where professional_id = v_pro
     and id <> p_connection_id
     and status in ('pending','active');

  return jsonb_build_object(
    'will_delete', (v_others = 0 and not public.has_paid_access(v_pro)),
    'professional_name', v_name
  );
end;
$$;

grant execute on function public.has_paid_access(uuid) to authenticated;
grant execute on function public.preview_revoke(uuid)  to authenticated;

commit;
