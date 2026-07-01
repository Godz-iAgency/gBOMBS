-- ===========================================================================
-- Step 11.7 — Consume queued trainer adjustments at plan generation
-- ===========================================================================
-- When a client generates a new meal plan, any adjustments their trainer queued
-- (queue_meal_adjustment → status 'pending_next_cycle') are folded into the
-- prompt and then marked 'applied' so they don't apply twice. The client has no
-- UPDATE policy on professional_edits (writes go through RPCs), so this
-- security-definer function lets the CLIENT mark THEIR OWN pending adjustments
-- applied — scoped to the ids the app actually consumed this cycle.
--
-- Idempotent: CREATE OR REPLACE.
-- ===========================================================================

begin;

create or replace function public.consume_professional_adjustments(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := auth.uid();
begin
  if v_client is null then
    raise exception 'Not authenticated';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return;  -- nothing to consume
  end if;

  update public.professional_edits
     set status = 'applied', applied_at = now()
   where id = any(p_ids)
     and client_id = v_client
     and edit_type = 'suggested_meal_adjustment'
     and status = 'pending_next_cycle';
end;
$$;

grant execute on function public.consume_professional_adjustments(uuid[]) to authenticated;

commit;
