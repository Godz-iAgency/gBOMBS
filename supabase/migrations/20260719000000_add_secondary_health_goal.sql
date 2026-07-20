-- ---------------------------------------------------------------------------
-- Secondary health goal — user feedback: onboarding only let a client pick ONE
-- health goal, but many people want two (e.g. Gut Health AND Energy). This adds
-- an OPTIONAL second goal alongside the existing `health_goal` column rather
-- than turning it into an array, so every existing single-goal consumer
-- (AI prompts, profile UI, professional dashboards) keeps working unchanged;
-- they just also get access to the new column when they want it.
-- ---------------------------------------------------------------------------
begin;

alter table public.users
  add column if not exists health_goal_secondary text null;

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so guard it manually —
-- this column/constraint pair may already exist from an earlier apply.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_health_goal_secondary_check'
  ) then
    alter table public.users
      add constraint users_health_goal_secondary_check
      check (health_goal_secondary is null or health_goal_secondary in (
        'weight_loss', 'gut_health', 'energy', 'anti_inflammatory', 'general_wellness'
      ));
  end if;
end $$;

-- Let a connected professional see the client's secondary goal too.
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
    'id',                    id,
    'full_name',             full_name,
    'avatar_url',            avatar_url,
    'diet_mode',             diet_mode,
    'health_goal',           health_goal,
    'health_goal_secondary', health_goal_secondary,
    'cooking_style',         cooking_style
  ) into v_result
  from public.users where id = p_client_id;
  return v_result;
end;
$$;

commit;
