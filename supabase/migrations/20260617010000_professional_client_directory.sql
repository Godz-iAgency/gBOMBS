-- ===========================================================================
-- Step 11 — Professional Dashboards: client directory
-- ===========================================================================
-- Adds list_my_clients() — one round-trip to get every active client of the
-- calling professional, with their name, role, and plan/grocery freshness.
-- Recreates create_professional_invite() (no behaviour change; same signature).
-- Idempotent: CREATE OR REPLACE throughout.
-- ===========================================================================

begin;

-- Every active client of the calling professional, in one round-trip.
-- security definer so the plan/grocery joins bypass those tables' RLS
-- (scoped strictly to the caller's own active connections — no leakage).
create or replace function public.list_my_clients()
returns table (
  connection_id      uuid,
  client_id          uuid,
  client_name        text,
  role               text,
  accepted_at        timestamptz,
  plan_updated_at    timestamptz,
  grocery_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id,
    pc.client_id,
    u.full_name,
    pc.role,
    pc.accepted_at,
    mp.updated_at,
    gl.updated_at
  from public.professional_connections pc
  join public.users u                  on u.id       = pc.client_id
  left join public.meal_plans    mp    on mp.user_id  = pc.client_id
  left join public.grocery_lists gl   on gl.user_id  = pc.client_id
  where pc.professional_id = auth.uid()
    and pc.status = 'active'
  order by pc.accepted_at desc nulls last;
$$;

grant execute on function public.list_my_clients() to authenticated;

commit;
